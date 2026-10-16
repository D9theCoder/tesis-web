import path from "node:path";
import { artifactSchema, resultBundleSchema, type SourceBinding } from "@/lib/schemas";
import { record, mergeArtifact, canonicalStatus } from "@/lib/artifact-contract";
import { readSource, artifactRoots, redact, collectSecrets } from "@/lib/server/fs-util";
import { getCatalog, uniqueRun, hasExactMatrixMembership, RetrievalError, clearCatalogCache, type ResolvedRun } from "@/lib/server/resolve-run";
import { normalizeResult } from "@/lib/result-normalizer";
import { resolveReviews } from "@/lib/server/reviews";

export async function resultBundle(run: ResolvedRun) {
  if (!run.raw || !run.primaryPath || !run.sha256) throw new RetrievalError("Primary result unavailable", 404);
  const source = await readSource(run.primaryPath, artifactRoots());
  if (source.sha256 !== run.sha256) { clearCatalogCache(); throw new RetrievalError("Artifact changed during retrieval; retry", 409); }
  const diagnostics = [...run.diagnostics];
  const binding: SourceBinding = { rootId: run.root.id, path: path.relative(run.root.path, run.primaryPath), sha256: run.sha256,
    schema: typeof run.raw.schema_version === "string" ? run.raw.schema_version : null,
    embeddedExecutionId: run.embedded ? run.executionId : null,
    projection: run.raw.observer_projection ? record(run.raw.observer_projection) as SourceBinding["projection"] : null };
  const artifact = { ...run.raw, mode: run.mode, matrix_execution_id: run.matrixExecutionId,
    coordinate_index: run.coordinateIndex, historical_analysis: run.historicalAnalysis ?? null };
  if (run.mode === "matrix" && Array.isArray(run.raw.runs)) {
    const catalog = await getCatalog();
    const declaredIds = new Set(run.raw.runs.map(child => record(child).execution_id).filter((id): id is string => typeof id === "string"));
    const rows = run.raw.runs.map(record).map((child,index) => {
      let resolved: ResolvedRun | null = null;
      try { resolved = uniqueRun(catalog, String(child.execution_id)); } catch { diagnostics.push(`ambiguous_child:${child.execution_id}`); }
      if (resolved && !hasExactMatrixMembership(run, resolved, declaredIds)) { diagnostics.push(`unresolved_child_membership:${child.execution_id}`); resolved = null; }
      const m = mergeArtifact(resolved?.raw ?? child);
      const config = record(m.config), canonical = canonicalStatus(m);
      // Summary responses contain coordinate metadata. Evidence is retrieved on exact child selection.
      const fields = ["execution_id", "run_id", "status", "selected_method", "provider", "model", "model_profile", "surface", "security_level", "payload_mode", "experiment_condition", "target_method", "repeat_index", "method_score", "payload_scores", "exploitation_score", "chain_score", "output_score", "composite_score", "confirmed_vulns", "achieved_outcomes"];
      return { ...Object.fromEntries(fields.map(key => [key, m[key] ?? config[key]])),
        observer_runtime_scores: m.observer_runtime_scores,
        execution_status: canonical.executionStatus, security_outcome: canonical.securityOutcome,
        execution_reason: canonical.executionReason, security_outcome_reason: canonical.securityOutcomeReason,
        matrix_execution_id: run.executionId, coordinate_index: resolved?.coordinateIndex ?? index,
        historical_analysis: resolved?.historicalAnalysis ?? null, has_artifact: !!resolved?.raw,
        source_sha256: resolved?.sha256 ?? null };
    });
    Object.assign(artifact, { runs: rows, observer_derived_counts: rows.some(c => c.execution_status !== null) && !(record(run.raw.totals).completed_runs !== undefined) });
  }
  // Matrix parents also expose independent absent workflows; child reviews load on selection.
  const reviewBundle = await resolveReviews(run, diagnostics);
  const payload = resultBundleSchema.parse({ schema_version: "observer-result.v1", artifact: artifactSchema.parse(artifact), source: binding,
    reviews: reviewBundle, diagnostics, historicalAnalysis: run.historicalAnalysis ?? null,
    matrixExecutionId: run.matrixExecutionId, coordinateIndex: run.coordinateIndex });
  const redacted = redact(payload, true, [...collectSecrets(source.raw)]);
  normalizeResult(redacted); // Validate the consumer contract before returning it.
  return redacted;
}
