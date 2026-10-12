import { boundProjectionPath } from "@/lib/server/projections";
import path from "node:path";
import { reviewReceiptSchema, reviewStatusSchema, reviewBundleSchema, type ReviewWorkflow, type SourceBinding } from "@/lib/schemas";
import { record, text, mergeArtifact } from "@/lib/artifact-contract";
import { containedPath, readSource, reviewRoots, artifactRoots, redact, type Root } from "@/lib/server/fs-util";
import { scanJson, type ResolvedRun } from "@/lib/server/resolve-run";

const WEIGHTS = { Smethod: .2, Spayload: .2, Sexploit: .3, Schain: .1, Soutput: .2 };
export function missingWorkflow(status: ReviewWorkflow["status"] = "missing", reason: string | null = "No bound review available"): ReviewWorkflow {
  return { status, reason, componentPendingReasons: {}, components: null, SpayloadFinal: null, SrunFinal: null,
    rubric: null, origin: null, source: null, numerator: null, denominator: null, candidateGrades: [], evidenceRefs: {} };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** Validation checks binding and arithmetic only; it never evaluates or rescores evidence. */
export async function receiptProblem(raw: Record<string, unknown>, run: ResolvedRun): Promise<string | null> {
  const parsed = reviewReceiptSchema.safeParse(raw);
  if (!parsed.success) return "receipt_schema_or_rubric_invalid";
  const r = parsed.data, m = mergeArtifact(run.raw ?? {});
  if (run.embedded) return "receipt_requires_standalone_source";
  if (r.execution_id !== run.executionId || (r.run_id != null && r.run_id !== m.run_id)) return "receipt_identity_mismatch";
  if (r.source_sha256 !== run.sha256) return "receipt_source_hash_mismatch";
  const safe = await containedPath(r.source_path, artifactRoots());
  if (!safe || safe.path !== run.primaryPath) return "receipt_source_path_mismatch";
  const selection = text(m.scoring_mode ?? record(m.config).scoring_mode);
  if (selection && selection !== "both" && selection !== r.scoring_mode) return "receipt_workflow_mismatch";
  if (r.method !== text(m.selected_method ?? m.target_method)) return "receipt_method_mismatch";
  if (stable(redact(r.config)) !== stable(redact(record(m.config)))) return "receipt_config_mismatch";
  const sourceRubric = text(record(m.config).scoring_rubric_version ?? record(m.config).rubric_version);
  if (sourceRubric && r.rubric_version !== sourceRubric) return "receipt_rubric_mismatch";
  const ids = r.candidate_grades.map(c => c.candidate_id);
  if (new Set(ids).size !== ids.length || r.denominator !== ids.length) return "receipt_candidate_denominator_mismatch";
  const numerator = r.candidate_grades.reduce((sum,c) => sum + c.score, 0);
  const approx = (a: number, b: number) => Math.abs(a-b) < 0.000051;
  if (!approx(numerator, r.numerator) || !approx(r.numerator / r.denominator, r.components.Spayload) ||
    !approx(r.Spayload_final, r.numerator / r.denominator)) return "receipt_payload_arithmetic_mismatch";
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const dim = key as keyof typeof WEIGHTS;
    if (r.formula[dim] !== weight) return "receipt_formula_mismatch";
    score += r.components[dim] * weight;
  }
  if (!approx(score, r.Srun_final)) return "receipt_composite_arithmetic_mismatch";
  return null;
}
type ReviewFile = { raw: Record<string, unknown>; path: string; root: Root; sha256: string };
let cache: { key: string; at: number; promise: Promise<ReviewFile[]> } | undefined;
export function clearReviewCache() { cache = undefined; }
async function discoverReviews(run: ResolvedRun, diagnostics: string[]) {
  const roots = [...reviewRoots()];
  // Source-local reviews are separately contained; external references still require declared review roots.
  roots.push({ id: `local_${run.root.id}`, path: path.join(run.dir, "reviews") });
  const present: Root[] = [];
  for (const root of roots) {
    if (await containedPath(root.path, [root])) present.push(root);
    else if (!root.id.startsWith("local_")) diagnostics.push(`review_root_unavailable:${root.id}`);
  }
  const key = JSON.stringify(present);
  if (cache?.key === key && Date.now() - cache.at < 5000) return { files: await cache.promise, roots };
  const promise = (async () => {
    const files: ReviewFile[] = [];
    // Absent default reviews are a workflow absence, not an unreadable configured root.
    const seen = new Set<string>();
    for (const entry of await scanJson(present, diagnostics)) {
      if (seen.has(entry.path)) continue; seen.add(entry.path);
      if (!/\.(?:human-verified|ai-verified|review-status|review-history)\.json$/.test(entry.path)) continue;
      try {
        const source = await readSource(entry.path, present), raw = record(source.raw);
        if (["thesis_score_receipt", "thesis_review_status"].includes(String(raw.artifact_type))) files.push({ raw, path: source.path, root: entry.root, sha256: source.sha256 });
      } catch { diagnostics.push(`review_unreadable:${entry.root.id}/${path.relative(entry.root.path, entry.path)}`); }
    }
    return files;
  })();
  cache = { key, at: Date.now(), promise };
  return { files: await promise, roots };
}
async function selectedLegacyStatuses(run: ResolvedRun, roots: Root[], diagnostics: string[], files: ReviewFile[]) {
  const selected = new Set<string>();
  const configured: unknown = process.env.TESIS_REVIEW_INDEX_FILES ? JSON.parse(process.env.TESIS_REVIEW_INDEX_FILES) : [];
  if (!Array.isArray(configured) || configured.some(v => typeof v !== "string")) throw new Error("TESIS_REVIEW_INDEX_FILES must be a JSON array");
  for (const filename of configured as string[]) {
    try {
      const index = await readSource(filename, [{ id: "review_index", path: path.dirname(filename) }]);
      const raw = record(index.raw);
      const rows = [...(Array.isArray(raw.sources) ? raw.sources : []), ...(Array.isArray(raw.results) ? raw.results : [])].map(record);
      for (const row of rows) {
        if (row.execution_id !== run.executionId || row.source_sha256 !== run.sha256) continue;
        const reference = text(row.review_status);
        if (!reference && text(row.review_output_epoch) && text(row.source_path)) {
          const sourceRef = String(row.source_path);
          const actual = await containedPath(path.resolve(path.dirname(filename), sourceRef));
          if (actual?.path !== run.primaryPath) continue;
          const epoch = await containedPath(path.resolve(path.dirname(filename), String(row.review_output_epoch)), roots);
          if (epoch) for (const file of files) {
            if (path.dirname(file.path) === epoch.path && file.raw.artifact_type === "thesis_review_status" && file.raw.source_sha256 === run.sha256) selected.add(file.path);
          }
          continue;
        }
        if (!reference) continue;
        const candidates = [path.resolve(path.dirname(filename), reference), path.resolve(process.env.TESIS_ROOT || "/home/kevin/coding/tesis", reference)];
        for (const candidate of candidates) {
          const safe = await containedPath(candidate, roots);
          if (safe) selected.add(safe.path);
        }
      }
    } catch { diagnostics.push(`review_index_unreadable:${path.basename(filename)}`); }
  }
  return selected;
}
export async function resolveReviews(run: ResolvedRun, diagnostics: string[]) {
  const { files, roots } = await discoverReviews(run, diagnostics);
  const selected = await selectedLegacyStatuses(run, roots, diagnostics, files);
  for (const mode of ["human", "ai"]) {
    const binding = record(record(run.projectedReviews?.[mode]).review_status);
    const selectedPath = await boundProjectionPath(binding, [...artifactRoots(), ...roots]);
    if (selectedPath && await containedPath(selectedPath, roots)) selected.add(selectedPath);
  }
  const bundle = { human: missingWorkflow(), ai: missingWorkflow(), history: [] as {
    path: string; sha256: string; workflow: string; accepted: boolean; reason: string | null; receipt: Record<string, unknown>
  }[] };
  for (const mode of ["human", "ai"] as const) {
    const sourceMode = text(mergeArtifact(run.raw ?? {}).scoring_mode ?? record(mergeArtifact(run.raw ?? {}).config).scoring_mode);
    if (sourceMode && sourceMode !== "both" && sourceMode !== mode) { bundle[mode] = missingWorkflow("unavailable", "workflow_not_selected"); continue; }
    const finals: ReviewFile[] = [];
    const historical = files.filter(file => file.raw.artifact_type === "thesis_score_receipt" && file.raw.scoring_mode === mode &&
      (file.raw.execution_id === run.executionId || file.raw.source_sha256 === run.sha256));
    for (const file of historical) {
      const reason = await receiptProblem(file.raw, run);
      bundle.history.push({ path: `${file.root.id}/${path.relative(file.root.path, file.path)}`, sha256: file.sha256, workflow: mode, accepted: reason === null, reason,
        receipt: file.raw });
      if (reason === null) finals.push(file);
    }
    // Valid current final wins over unrelated hashes, other workflows, and failed older epochs.
    finals.sort((a,b) => Date.parse(String(b.raw.generated_at)) - Date.parse(String(a.raw.generated_at)) || a.path.localeCompare(b.path));
    if (finals.length) {
      const file = finals[0], r = reviewReceiptSchema.parse(file.raw);
      const source: SourceBinding = { rootId: file.root.id, path: path.relative(file.root.path, file.path), sha256: file.sha256, schema: "thesis_score_receipt" };
      bundle[mode] = { status: "final", reason: null, componentPendingReasons: {}, components: r.components, SpayloadFinal: r.Spayload_final,
        SrunFinal: r.Srun_final, rubric: r.rubric_version, origin: `${mode} source-bound receipt`, source,
        numerator: r.numerator, denominator: r.denominator, candidateGrades: r.candidate_grades, evidenceRefs: r.component_evidence_refs };
      continue;
    }
    const statuses: ReviewFile[] = [];
    for (const file of files.filter(f => f.raw.artifact_type === "thesis_review_status" && f.raw.source_sha256 === run.sha256)) {
      const parsed = reviewStatusSchema.safeParse(file.raw); if (!parsed.success) continue;
      const r = parsed.data, m = mergeArtifact(run.raw ?? {});
      if (!r.workflows[mode] || r.rubric_version !== "scoring.v4" || r.method !== text(m.selected_method ?? m.target_method) ||
        stable(redact(r.config)) !== stable(redact(record(m.config)))) continue;
      if (r.execution_id) {
        if (r.execution_id !== run.executionId || !r.source_path || !r.generated_at || !Number.isFinite(Date.parse(r.generated_at))) continue;
        const safe = await containedPath(r.source_path);
        if (safe?.path !== run.primaryPath) continue;
      } else {
        if (!selected.has(file.path) || !r.decision_ledger_path) continue;
        const ledger = await containedPath(r.decision_ledger_path, roots);
        if (!ledger) continue;
        const source = await readSource(ledger.path, roots);
        if (!Array.isArray(source.raw) || source.raw.some(d => record(d).source_sha256 !== run.sha256 || record(d).run_id !== m.run_id)) continue;
      }
      statuses.push(file);
    }
    statuses.sort((a,b) => (Date.parse(String(b.raw.generated_at)) || 0) - (Date.parse(String(a.raw.generated_at)) || 0) || a.path.localeCompare(b.path));
    if (statuses.length > 1 && !statuses[0].raw.generated_at) {
      bundle[mode] = missingWorkflow("unavailable", "Ambiguous legacy review epoch; select one review index");
    } else if (statuses.length) {
      const file = statuses[0], workflow = record(record(file.raw.workflows)[mode]);
      bundle[mode] = { ...missingWorkflow(workflow.status === "pending" ? "pending" : "unavailable", text(workflow.reason) ?? "Final receipt unavailable"),
        componentPendingReasons: record(workflow.component_pending_reasons), rubric: text(file.raw.rubric_version),
        origin: `${mode} review status`, candidateGrades: Array.isArray(workflow.candidate_grades) ? workflow.candidate_grades.map(record) : [],
        denominator: Array.isArray(workflow.candidate_grades) ? workflow.candidate_grades.length : null,
        numerator: Array.isArray(workflow.candidate_grades) && workflow.candidate_grades.length > 0 && workflow.candidate_grades.every(grade => typeof record(grade).score === "number") ? workflow.candidate_grades.reduce((sum,grade) => sum + Number(record(grade).score),0) : null,
        source: { rootId: file.root.id, path: path.relative(file.root.path, file.path), sha256: file.sha256, schema: "thesis_review_status" } };
    } else if (historical.length) bundle[mode] = missingWorkflow("stale", "Saved receipts do not match the selected source/contract");
  }
  return reviewBundleSchema.parse(bundle);
}
