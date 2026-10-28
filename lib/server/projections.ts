import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { executionStatusSchema, securityOutcomeSchema, reasonSchema, workflowProgressSchema } from "@/lib/schemas";
import { record } from "@/lib/artifact-contract";
import { artifactRoots, reviewRoots, containedPath, readSource, type Root } from "@/lib/server/fs-util";
import type { Catalog } from "@/lib/server/resolve-run";
export const projectionBindingSchema = z.object({ root_id: z.string(), path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), pointer: z.string().optional() }).passthrough();
export const observerProjectionSchema = z.object({
  schema_version: z.literal("observer-projection.v1"), artifact_type: z.literal("observer_projection"),
  generated_at: z.string().datetime({ offset: true }), code_epoch: z.record(z.string().regex(/^[a-f0-9]{64}$/)),
  sources: z.array(projectionBindingSchema), roots: z.array(z.object({ id: z.string(), kind: z.enum(["source","review"]) }).passthrough()),
  runs: z.array(z.object({ identity: z.object({ execution_id: z.string().nullable(), matrix_execution_id: z.string().nullable(), coordinate_index: z.number().int().nonnegative().nullable() }).passthrough(),
    source: projectionBindingSchema, execution: z.object({ status: executionStatusSchema.nullable(), reason: reasonSchema.nullable() }).passthrough(),
    security: z.object({ outcome: securityOutcomeSchema.nullable(), reason: reasonSchema.nullable(), historical_analysis: z.record(z.unknown()).nullable().optional() }),
    workflow: workflowProgressSchema.nullable().optional(),
    runtime_scores: z.record(z.unknown()), thesis_review: z.record(z.unknown()), metrics: z.record(z.unknown()),
    diagnostics: z.array(z.record(z.unknown())), ambiguous: z.boolean(), detail: z.record(z.unknown()),
  })),
  matrices: z.array(z.object({ identity: z.object({ execution_id: z.string().nullable() }).passthrough(), source: projectionBindingSchema,
    execution: z.object({ status: executionStatusSchema.nullable(), reason: reasonSchema.nullable() }).passthrough(),
    security: z.object({ outcome: securityOutcomeSchema.nullable(), reason: reasonSchema.nullable() }).passthrough(),
    ambiguous: z.boolean().optional(),
    coverage: z.record(z.unknown()), stored_legacy_totals: z.record(z.unknown()).nullable(), groups: z.record(z.unknown()), detail: z.record(z.unknown()),
  }).passthrough()), diagnostics: z.array(z.record(z.unknown())),
}).passthrough();
export async function boundProjectionPath(binding: Record<string, unknown>, roots: Root[]): Promise<string | null> {
  const root = roots.find(r => r.id === binding.root_id);
  if (!root || typeof binding.path !== "string" || path.isAbsolute(binding.path)) return null;
  const candidate = path.basename(root.path) === binding.path && (await fs.stat(root.path).catch(()=>null))?.isFile() ? root.path : path.resolve(root.path,binding.path);
  const safe = await containedPath(candidate,[root]);
  if (!safe) return null;
  const hash = createHash("sha256").update(await fs.readFile(safe.path)).digest("hex");
  return hash === binding.sha256 ? safe.path : null;
}
export async function applyProjections(catalog: Catalog) {
  const filenames: unknown = process.env.TESIS_PROJECTION_FILES ? JSON.parse(process.env.TESIS_PROJECTION_FILES) : [];
  if (!Array.isArray(filenames) || filenames.some(file => typeof file !== "string")) throw new Error("TESIS_PROJECTION_FILES must be a JSON array");
  const roots = [...artifactRoots(), ...reviewRoots()];
  for (const filename of filenames as string[]) {
    const backups = [...catalog.runs.values()].flat().map(run => ({ run, raw: run.raw, reviews: run.projectedReviews, historical: run.historicalAnalysis, diagnostics: [...run.diagnostics] }));
    try {
      const source = await readSource(filename,[{ id: "projection", path: path.dirname(filename) }]);
      const p = observerProjectionSchema.parse(source.raw);
      for (const binding of p.sources) if (!await boundProjectionPath(binding,roots)) throw new Error("projection_source_hash_or_root_mismatch");
      const epoch = JSON.stringify(p.code_epoch);
      const matched = new Set<string>();
      for (const row of p.runs) {
        const id = row.identity.execution_id;
        const matches = id ? catalog.runs.get(id) ?? [] : [];
        const primary = await boundProjectionPath(row.source,artifactRoots());
        const candidates = matches.filter(run => run.primaryPath === primary && run.sha256 === row.source.sha256 && !!run.embedded === !!row.source.pointer);
        if (row.ambiguous || candidates.length !== 1) { catalog.diagnostics.push(`projection_identity_ambiguous:${id ?? "missing"}`); continue; }
        const run = candidates[0];
        if (matched.has(run.executionId)) throw new Error("projection_duplicate_identity");
        matched.add(run.executionId);
        if (run.matrixExecutionId !== row.identity.matrix_execution_id || run.coordinateIndex !== row.identity.coordinate_index) throw new Error("projection_membership_mismatch");
        run.raw = { ...run.raw!, ...(row.workflow !== undefined ? { workflow: row.workflow } : {}), execution_status: row.execution.status, execution_reason: row.execution.reason,
          security_outcome: row.security.outcome, security_outcome_reason: row.security.reason,
          observer_projection: { path: filename, sha256: source.sha256, epoch }, observer_runtime_scores: row.runtime_scores,
          observer_metrics: row.metrics };
        run.projectedReviews = row.thesis_review;
        if (row.security.historical_analysis) {
          const history = row.security.historical_analysis, binding = record(history.source);
          run.historicalAnalysis = { classification: String(history.classification), source: `${binding.root_id}/${binding.path}`,
            sha256: String(binding.sha256), epoch: String(history.source_epoch ?? history.generated_at ?? p.generated_at) };
        }
        for (const diagnostic of row.diagnostics) run.diagnostics.push(`projection:${String(diagnostic.code ?? "diagnostic")}`);
      }
      for (const row of p.matrices) {
        const matches = row.identity.execution_id ? catalog.runs.get(row.identity.execution_id) ?? [] : [];
        const primary = await boundProjectionPath(row.source,artifactRoots());
        if (row.ambiguous || matches.length !== 1 || matches[0].primaryPath !== primary || matches[0].sha256 !== row.source.sha256) { catalog.diagnostics.push("projection_matrix_binding_mismatch"); continue; }
        const run = matches[0];
        if (matched.has(run.executionId)) throw new Error("projection_duplicate_identity");
        matched.add(run.executionId);
        run.raw = { ...run.raw!, totals: row.coverage, observer_legacy_totals: row.stored_legacy_totals,
          execution_status: row.execution.status, execution_reason: row.execution.reason,
          security_outcome: row.security.outcome, security_outcome_reason: row.security.reason,
          observer_groups: row.groups, observer_projection: { path: filename, sha256: source.sha256, epoch } };
      }
    } catch {
      for (const backup of backups) { backup.run.raw = backup.raw; backup.run.projectedReviews = backup.reviews; backup.run.historicalAnalysis = backup.historical; backup.run.diagnostics = backup.diagnostics; }
      catalog.diagnostics.push(`projection_rejected:${path.basename(filename)}; schema, root, identity or original-byte hash mismatch`); }
  }
}
