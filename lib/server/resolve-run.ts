import { applyProjections } from "@/lib/server/projections";
import path from "node:path";
import { promises as fs } from "node:fs";
import { artifactSchema, runDescriptorSchema, type RunSummary, type HistoricalAnalysis } from "@/lib/schemas";
import { canonicalStatus, mergeArtifact, record, text, finite } from "@/lib/artifact-contract";
import { artifactRoots, realInside, readSource, containedPath, type Root } from "@/lib/server/fs-util";
import { normalizeRunStatus } from "@/lib/formatters";

export interface ResolvedRun {
  executionId: string; dir: string; root: Root; mode: "single-run" | "matrix";
  primaryPath?: string; sha256?: string; raw?: Record<string, unknown>;
  descriptorPath?: string; descriptor?: Record<string, unknown>; manifestPath?: string;
  metadata: Record<string, unknown>; journalPath?: string; snapshotPath?: string;
  matrixExecutionId: string | null; coordinateIndex: number | null;
  embedded?: boolean; projectedReviews?: Record<string, unknown>; journalOwnerExecutionId?: string; snapshotOwnerExecutionId?: string; diagnostics: string[]; historicalAnalysis?: HistoricalAnalysis;
}
export interface Catalog { runs: Map<string, ResolvedRun[]>; diagnostics: string[]; }
export class RetrievalError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const SIDECAR = /\.(rich|failure|events|decisions|review-status|human-verified|ai-verified|evaluator|review-history)\.json$/;
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".venv", "reviews"]);
export async function scanJson(roots: Root[], diagnostics: string[], skipReviewDirs = false) {
  const files: { path: string; root: Root }[] = [], visited = new Set<string>();
  async function walk(dir: string, root: Root, depth: number) {
    const safe = await realInside(root.path, dir);
    if (!safe) { diagnostics.push(`root_or_directory_unavailable:${root.id}/${path.relative(root.path, dir)}`); return; }
    if (visited.has(safe)) return;
    visited.add(safe);
    if (depth > 12 || files.length >= 20000) { diagnostics.push(`scan_limit:${root.id}`); return; }
    try {
      if ((await fs.stat(safe)).isFile()) { if (safe.endsWith(".json")) files.push({ path: safe, root }); return; }
      for (const e of (await fs.readdir(safe, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
        if (files.length >= 20000) { diagnostics.push(`scan_limit:${root.id}`); return; }
        const child = path.join(safe, e.name);
        if (e.isDirectory() && !EXCLUDED_DIRS.has(e.name) && !(skipReviewDirs && /review|^ai-|^human-/.test(e.name))) await walk(child, root, depth + 1);
        else if ((e.isFile() || e.isSymbolicLink()) && e.name.endsWith(".json")) {
          const full = await realInside(root.path, child);
          if (full) files.push({ path: full, root });
          else diagnostics.push(`path_rejected:${root.id}/${e.name}`);
        }
      }
    } catch { diagnostics.push(`directory_unreadable:${root.id}/${path.relative(root.path, dir)}`); }
  }
  for (const root of roots) await walk(root.path, root, 0);
  return files;
}
const CATALOG_TTL_MS = 2000;
let cache: { key: string; value?: Catalog; at: number; pending?: Promise<Catalog>; scheduled?: boolean } | undefined;
let generation = 0;
export function clearCatalogCache() { generation++; cache = undefined; }
function catalogKey() { return JSON.stringify([artifactRoots(), process.env.TESIS_COMPATIBILITY_FILES, process.env.TESIS_PROJECTION_FILES]); }
function refreshCatalog(key: string): Promise<Catalog> {
  const started = generation;
  const promise = buildCatalog(artifactRoots()).then(value => {
    if (started === generation && cache?.key === key) cache = { key, value, at: Date.now() };
    return value;
  }, error => {
    if (started === generation && cache?.key === key) { cache.pending = undefined; cache.at = Date.now(); }
    throw error;
  });
  if (cache?.key === key) cache.pending = promise;
  else if (!cache) cache = { key, at: 0, pending: promise };
  return promise;
}
/**
 * Discovery reads bounded local source roots, so a rebuild costs a filesystem walk.
 * Serve the last snapshot immediately once it is two seconds old and rebuild behind it;
 * an explicit refresh (`fresh`) waits for the scan so a user-requested reload is exact.
 */
export async function getCatalog(options: { fresh?: boolean } = {}): Promise<Catalog> {
  const key = catalogKey();
  if (cache?.key !== key) cache = undefined;
  const snapshot = cache;
  if (!options.fresh && snapshot?.value) {
    if (Date.now() - snapshot.at < CATALOG_TTL_MS) return snapshot.value;
    if (!snapshot.pending && !snapshot.scheduled) {
      // Let the current response flush before spending the event loop on a scan.
      snapshot.scheduled = true;
      setTimeout(() => {
        if (cache !== snapshot) return;
        snapshot.scheduled = false;
        if (snapshot.pending) return;
        void refreshCatalog(key).catch(() => {});
      }, 0);
    }
    return snapshot.value;
  }
  if (snapshot?.pending) return snapshot.pending;
  return refreshCatalog(key);
}
const parsedArtifacts = new WeakMap<object, Record<string, unknown>>();
/** Zod parsing clones the source; reuse that clone so per-source caches survive rescans. */
function cachedArtifact(raw: Record<string, unknown>) {
  let artifact = parsedArtifacts.get(raw);
  if (!artifact) {
    const parsed = artifactSchema.safeParse(raw);
    if (!parsed.success) return null;
    artifact = parsed.data;
    parsedArtifacts.set(raw, artifact);
  }
  return artifact;
}
async function buildCatalog(roots: Root[]): Promise<Catalog> {
  const catalog: Catalog = { runs: new Map(), diagnostics: [] };
  const manifests: { raw: Record<string, unknown>; path: string; root: Root }[] = [];
  const descriptors: { raw: Record<string, unknown>; path: string; root: Root }[] = [];
  const audits: { raw: Record<string, unknown>; path: string; sha256: string }[] = [];
  const put = (run: ResolvedRun) => {
    const matches = catalog.runs.get(run.executionId) ?? [];
    if (!matches.some(r => r.primaryPath === run.primaryPath && r.dir === run.dir && r.embedded === run.embedded)) matches.push(run);
    catalog.runs.set(run.executionId, matches);
  };
  for (const file of await scanJson(roots, catalog.diagnostics, true)) {
    if (SIDECAR.test(file.path)) continue;
    try {
      const source = await readSource(file.path, roots), raw = record(source.raw);
      if (raw.artifact_type === "experiment_manifest" || raw.schema_version === "artifact-manifest.v1") { manifests.push({ raw, path: file.path, root: file.root }); continue; }
      if (raw.schema_version === "runtime-descriptor.v1" || path.basename(file.path) === "runtime.json") {
        const parsed = runDescriptorSchema.safeParse(raw);
        if (parsed.success) descriptors.push({ raw: parsed.data, path: file.path, root: file.root });
        else catalog.diagnostics.push(`descriptor_schema_invalid:${file.root.id}/${path.relative(file.root.path, file.path)}`);
        continue;
      }
      if (Array.isArray(raw.rows) && raw.artifact_type !== "matrix_aggregate") { audits.push({ raw, path: file.path, sha256: source.sha256 }); continue; }
      // Explicit current and legacy primary discriminators. Sidecars never become runs.
      const recognized = raw.schema_version === "tui.v1" || raw.schema_version === "stage8.v1" || raw.artifact_type === "matrix_aggregate" ||
        (!raw.artifact_type && typeof raw.execution_id === "string" && (raw.final_state !== undefined || raw.execution_log !== undefined || (raw.config !== undefined && raw.status !== undefined)));
      if (!recognized) continue;
      const parsed = cachedArtifact(raw);
      if (!parsed) { catalog.diagnostics.push(`artifact_schema_invalid:${file.root.id}/${path.relative(file.root.path, file.path)}`); continue; }
      put({ executionId: text(parsed.execution_id)!, dir: path.dirname(source.path), root: file.root,
        primaryPath: source.path, sha256: source.sha256, raw: parsed,
        mode: Array.isArray(raw.runs) || raw.matrix === true ? "matrix" : "single-run", metadata: {},
        matrixExecutionId: text(raw.matrix_execution_id), coordinateIndex: finite(raw.coordinate_index), diagnostics: [] });
    } catch { catalog.diagnostics.push(`json_unreadable:${file.root.id}/${path.relative(file.root.path, file.path)}`); }
  }
  for (const manifest of manifests) {
    const dir = path.dirname(manifest.path), parentId = text(record(manifest.raw.aggregate).execution_id);
    const entries = [record(manifest.raw.aggregate), ...(Array.isArray(manifest.raw.runs) ? manifest.raw.runs.map(record) : [])];
    for (const m of entries) {
      const id = text(m.execution_id); if (!id) continue;
      const reference = text(m.artifact ?? m.artifact_path);
      const safePath = reference ? await realInside(manifest.root.path, path.resolve(dir, reference)) : null;
      if (reference && !safePath) catalog.diagnostics.push(`manifest_primary_unavailable:${id}`);
      let matches = catalog.runs.get(id)?.filter(r => safePath ? r.primaryPath === safePath : r.dir === dir) ?? [];
      if (!matches.length) {
        const declaredDir = text(m.directory);
        const safeDir = declaredDir ? await realInside(manifest.root.path, path.resolve(dir, declaredDir)) : null;
        const run: ResolvedRun = { executionId: id, dir: safePath ? path.dirname(safePath) : safeDir ?? dir, root: manifest.root,
          mode: id === parentId ? "matrix" : "single-run", metadata: {}, matrixExecutionId: null, coordinateIndex: null, diagnostics: ["primary_unavailable"] };
        put(run); matches = [run];
      }
      for (const run of matches) {
        run.manifestPath = manifest.path; run.metadata = { ...run.metadata, ...m, created_at: manifest.raw.created_at };
        const detail = record(m.detail ?? manifest.raw.detail);
        for (const key of ["journal", "snapshot", "trace"] as const) {
          const ref = text(detail[key]);
          if (!ref) continue;
          const full = await realInside(manifest.root.path, path.resolve(dir, ref));
          if (!full) { run.diagnostics.push(`manifest_${key}_unavailable`); continue; }
          if (key === "snapshot") { run.snapshotPath = full; run.snapshotOwnerExecutionId = text(detail.owner_execution_id) ?? parentId ?? id; }
          else if (!run.journalPath || key === "journal") { run.journalPath = full; run.journalOwnerExecutionId = key === "trace" ? id : text(detail.owner_execution_id) ?? parentId ?? id; }
        }
        if (parentId && id !== parentId) {
          if (run.matrixExecutionId && run.matrixExecutionId !== parentId) run.diagnostics.push("ambiguous_parent_membership");
          else run.matrixExecutionId = parentId;
        }
        run.coordinateIndex = finite(m.index) === null ? null : Math.max(0, Number(m.index) - 1);
      }
    }
  }
  for (const descriptor of descriptors) {
    const id = text(descriptor.raw.execution_id ?? descriptor.raw.exec_id); if (!id) continue;
    const dir = path.dirname(descriptor.path);
    let matches = catalog.runs.get(id)?.filter(r => r.dir === dir) ?? [];
    if (!matches.length) {
      const run: ResolvedRun = { executionId: id, dir, root: descriptor.root, mode: descriptor.raw.matrix === true || descriptor.raw.mode === "matrix" ? "matrix" : "single-run", metadata: {}, matrixExecutionId: null, coordinateIndex: null, diagnostics: ["primary_unavailable"] };
      put(run); matches = [run];
    }
    for (const run of matches) { run.descriptor = descriptor.raw; run.descriptorPath = descriptor.path; }
  }
  // Bind embedded children by exact execution ID. An embedded source hashes its owning aggregate.
  for (const parent of [...catalog.runs.values()].flat().filter(r => r.mode === "matrix" && r.raw)) {
    const children = Array.isArray(parent.raw!.runs) ? parent.raw!.runs.map(record) : [];
    for (const [index, child] of children.entries()) {
      const id = text(child.execution_id); if (!id) continue;
      const standalone = catalog.runs.get(id)?.filter(r => !r.embedded && (r.matrixExecutionId === parent.executionId || (r.root.id === parent.root.id && r.raw))) ?? [];
      if (standalone.length) for (const run of standalone) {
        if (run.matrixExecutionId && run.matrixExecutionId !== parent.executionId) run.diagnostics.push("ambiguous_parent_membership");
        else run.matrixExecutionId = parent.executionId;
        run.coordinateIndex ??= index;
      }
      else if (artifactSchema.safeParse(child).success && (child.final_state || child.execution_log || child.config)) {
        put({ executionId: id, dir: parent.dir, root: parent.root, mode: "single-run", raw: child,
          primaryPath: parent.primaryPath, sha256: parent.sha256, metadata: {}, matrixExecutionId: parent.executionId,
          coordinateIndex: index, embedded: true, diagnostics: ["embedded_child_source"] });
      } else if (!catalog.runs.has(id)) {
        put({ executionId: id, dir: parent.dir, root: parent.root, mode: "single-run", metadata: child,
          matrixExecutionId: parent.executionId, coordinateIndex: index, diagnostics: ["primary_unavailable"] });
      }
    }
  }
  const membershipIds = new Map<ResolvedRun, Set<string>>();
  for (const sources of catalog.runs.values()) for (const parent of sources) {
    if (parent.mode === "matrix") membershipIds.set(parent, new Set(Array.isArray(parent.raw?.runs)
      ? parent.raw.runs.map(row => text(record(row).execution_id)).filter((id): id is string => id !== null) : []));
  }
  for (const run of [...catalog.runs.values()].flat()) {
    const parent = run.matrixExecutionId ? catalog.runs.get(run.matrixExecutionId) : null;
    const owner = parent?.length === 1 && hasExactMatrixMembership(parent[0], run, membershipIds.get(parent[0])) ? parent[0] : null;
    const descriptor = run.descriptor ?? {};
    for (const [field, names] of [["journalPath", [text(descriptor.journal_path), "runtime.events.jsonl", run.primaryPath && `${path.basename(run.primaryPath, ".json")}.events.jsonl`]],
      ["snapshotPath", [text(descriptor.snapshot_path), "akg.snapshot.json", "akg_snapshot.json"]]] as const) {
      if (run[field]) continue;
      for (const name of names) {
        if (!name) continue;
        const safe = await realInside(run.root.path, path.resolve(run.dir, name));
        if (safe) {
          run[field] = safe;
          const parentShared = owner && path.dirname(safe) === owner.dir && (name === "runtime.events.jsonl" || name === "akg.snapshot.json" || name === "akg_snapshot.json");
          const ownerId = parentShared ? owner.executionId : run.executionId;
          if (field === "snapshotPath") run.snapshotOwnerExecutionId = ownerId; else run.journalOwnerExecutionId = ownerId;
          break;
        }
      }
      // Declared matrix membership grants parent journal/snapshot ownership.
      if (!run[field] && owner) {
        const name = field === "journalPath" ? "runtime.events.jsonl" : "akg.snapshot.json";
        run[field] = owner[field] ?? await realInside(owner.root.path, path.join(owner.dir, name)) ?? undefined;
        if (run[field]) { if (field === "snapshotPath") run.snapshotOwnerExecutionId = owner.executionId; else run.journalOwnerExecutionId = owner.executionId; }
      }
    }
  }
  // Optional verified compatibility views; source paths AND original-byte hashes must match.
  const compatibility: unknown = process.env.TESIS_COMPATIBILITY_FILES ? JSON.parse(process.env.TESIS_COMPATIBILITY_FILES) : [];
  if (!Array.isArray(compatibility) || compatibility.some(v => typeof v !== "string")) throw new RetrievalError("TESIS_COMPATIBILITY_FILES must be a JSON array", 422);
  for (const filename of compatibility as string[]) {
    try {
      // Configuration explicitly declares these read-only metadata files; references remain source-contained.
      const ownRoot = { id: "compatibility", path: path.dirname(path.resolve(filename)) };
      const projection = await readSource(filename, [ownRoot]);
      const view = record(projection.raw);
      if (view.all_source_hashes_preserved !== true || !Array.isArray(view.runs)) throw new Error("invalid compatibility view");
      for (const row of view.runs.map(record)) {
        const ref = text(row.path ?? row.source_path);
        if (!ref || typeof row.source_sha256 !== "string") continue;
        const candidates = path.isAbsolute(ref) ? [ref] : [path.resolve(process.env.TESIS_ROOT || "/home/kevin/coding/tesis", ref), path.resolve(path.dirname(filename), ref)];
        let safe: Awaited<ReturnType<typeof containedPath>> = null;
        for (const candidate of candidates) { safe = await containedPath(candidate, roots); if (safe) break; }
        if (!safe) { catalog.diagnostics.push("compatibility_source_unavailable"); continue; }
        const matches = [...catalog.runs.values()].flat().filter(r => !r.embedded && r.primaryPath === safe!.path && r.sha256 === row.source_sha256);
        if (matches.length !== 1) { catalog.diagnostics.push("compatibility_binding_mismatch"); continue; }
        const status = canonicalStatus(row);
        if (!status.executionStatus || !status.securityOutcome) continue;
        const run = matches[0];
        run.raw = { ...run.raw!, execution_status: status.executionStatus, security_outcome: status.securityOutcome,
          execution_reason: status.executionReason, security_outcome_reason: status.securityOutcomeReason,
          observer_projection: { path: filename, sha256: projection.sha256, epoch: text(view.validation_scope) ?? "historical-compatibility" } };
      }
    } catch { catalog.diagnostics.push(`compatibility_unreadable:${path.basename(filename)}`); }
  }
  for (const audit of audits) for (const row of (Array.isArray(audit.raw.rows) ? audit.raw.rows.map(record) : [])) {
    const id = text(row.execution_id), ref = text(row.source_path);
    if (!id || !ref || typeof row.classification !== "string") continue;
    const safe = await containedPath(path.resolve(path.dirname(audit.path), ref), roots);
    const matches = catalog.runs.get(id)?.filter(r => r.primaryPath === safe?.path && r.sha256 === row.source_sha256) ?? [];
    for (const run of matches) run.historicalAnalysis = { classification: row.classification, source: audit.path, sha256: audit.sha256, epoch: text(audit.raw.created_at_utc) ?? "unknown" };
  }
  await applyProjections(catalog);
  return catalog;
}
export function uniqueRun(catalog: Catalog, executionId: string): ResolvedRun | null {
  const matches = catalog.runs.get(executionId) ?? [];
  if (matches.length > 1) throw new RetrievalError("Ambiguous execution identity: multiple configured sources");
  if (matches[0]?.diagnostics.includes("ambiguous_parent_membership")) throw new RetrievalError("Ambiguous matrix membership");
  return matches[0] ?? null;
}
export async function resolveRun(executionId: string) { return uniqueRun(await getCatalog(), executionId); }
/** Identity alone never grants access to a matrix's coordinate or shared runtime source. */
export function hasExactMatrixMembership(parent: ResolvedRun | null | undefined, child: ResolvedRun, declaredIds?: ReadonlySet<string>) {
  if (!parent || parent.mode !== "matrix" || child.mode === "matrix" || child.matrixExecutionId !== parent.executionId) return false;
  if (child.manifestPath && child.manifestPath === parent.manifestPath) return true;
  if (child.root.id !== parent.root.id) return false;
  return declaredIds ? declaredIds.has(child.executionId) : Array.isArray(parent.raw?.runs) && parent.raw.runs.some(row => record(row).execution_id === child.executionId);
}
export async function resolveCoordinate(executionId: string, childExecutionId: string) {
  const catalog = await getCatalog(), parent = uniqueRun(catalog, executionId), child = uniqueRun(catalog, childExecutionId);
  return child && hasExactMatrixMembership(parent, child) ? child : null;
}
export function summariseRun(run: ResolvedRun): RunSummary {
  const descriptor = run.descriptor ?? {}, raw = run.raw ? mergeArtifact(run.raw) : {};
  const m = { ...record(descriptor.coordinate ?? descriptor.coordinates), ...descriptor, ...run.metadata, ...record(raw.config), ...raw };
  const status = text(raw.status) ?? text(descriptor.status) ?? text(run.metadata.status) ?? "unknown";
  const canonical = canonicalStatus(raw);
  const terminal = canonical.executionStatus === "completed" ? "completed" : canonical.executionStatus === "failed" ? "error" : canonical.executionStatus === "interrupted" ? "cancelled" : null;
  const observer = terminal ?? normalizeRunStatus(run.raw ? status : text(descriptor.status) ?? status);
  const heartbeat = finite(descriptor.heartbeat_at) ?? (typeof descriptor.heartbeat_at === "string" ? Date.parse(descriptor.heartbeat_at) / 1000 : NaN);
  const connection = observer === "active" ? (Number.isFinite(heartbeat) && Date.now() / 1000 - heartbeat < 90 ? "active" : "stale") :
    ["completed", "error", "cancelled", "stale"].includes(observer) ? observer as RunSummary["connection"] : "waiting";
  const timing = record(m.timing);
  const model = text(m.model) ?? text(record(m.model).model_name);
  return { executionId: run.executionId, runId: text(m.run_id), mode: run.mode, directory: `${run.root.id}/${path.relative(run.root.path, run.dir)}`,
    status, connection, ...canonicalStatus(m), provider: text(m.provider), model, surface: text(m.surface), securityLevel: text(m.security_level),
    payloadMode: text(m.payload_mode), experimentCondition: text(m.experiment_condition), targetMethod: text(m.target_method), targetUrl: text(m.target_url),
    candidateBudget: finite(m.candidate_budget) ?? undefined, maxIterations: finite(m.max_iterations) ?? undefined,
    startedAt: text(timing.started_at ?? m.started_at ?? m.generated_at ?? m.created_at), endedAt: text(timing.ended_at ?? m.ended_at),
    repeatIndex: finite(m.repeat_index), coordinateIndex: run.coordinateIndex, matrixExecutionId: run.matrixExecutionId,
    isMatrixAggregate: run.mode === "matrix", hasArtifact: !!run.raw, hasManifest: !!run.manifestPath, hasJournal: !!run.journalPath,
    sourceHash: run.sha256 ?? null, diagnostics: run.diagnostics };
}
