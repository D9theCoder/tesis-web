import { z } from "zod";
import { experimentLabel, experimentListSchema } from "@/lib/experiment-contract";
import { resultBundleSchema } from "@/lib/schemas";
import { chunksForText, type Chunk } from "@/lib/server/chat/retrieval";
import { ControlError } from "@/lib/server/control/errors";
import { listExperiments } from "@/lib/server/experiments";
import { redact } from "@/lib/server/fs-util";
import { resultBundle } from "@/lib/server/result-bundle";
import { resolveRun, summariseRun } from "@/lib/server/resolve-run";

export const runAttachmentSchema = z.object({ executionId: z.string().min(3).max(200).regex(/^[A-Za-z0-9._:-]+$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type RunAttachment = z.infer<typeof runAttachmentSchema>;

export async function recentRuns(cursor = 0, query = "") {
  const params = new URLSearchParams({ view: "executions", artifacts: "available", sort: "newest", cursor: String(cursor), limit: "50", q: query });
  const list = await listExperiments(params, { fresh: true }) as z.infer<typeof experimentListSchema>;
  return { runs: list.entries.filter((entry) => entry.kind !== "unresolved" && entry.run.hasArtifact && entry.run.sourceHash).map(({ run, kind }) => ({
    executionId: run.executionId, sha256: run.sourceHash, name: experimentLabel(run) === "Standalone execution" && run.runId ? run.runId : experimentLabel(run), kind,
    startedAt: run.startedAt ?? null, executionStatus: run.executionStatus ?? null, securityOutcome: run.securityOutcome ?? null,
    model: run.model ?? null, surface: run.surface ?? null, securityLevel: run.securityLevel ?? null,
  })), nextCursor: list.nextCursor, partial: list.partial };
}

/** Resolve the exact selected source and reject replacement or ambiguity. */
export async function attachedRunChunks(ref: RunAttachment, knownSecrets: string[]): Promise<Chunk[]> {
  const run = await resolveRun(ref.executionId);
  if (!run) throw new ControlError("The selected run is no longer available. Choose it again.", 404);
  const bundle = await resultBundle(run) as z.infer<typeof resultBundleSchema>;
  if (bundle.source.sha256 !== ref.sha256) throw new ControlError("The selected artifact changed. Choose the run again.", 409);
  const summary = summariseRun(run);
  const label = `result/${run.executionId} (${ref.sha256.slice(0, 12)})`;
  const overview = String(redact(JSON.stringify({ execution_id: run.executionId, mode: summary.mode, started_at: summary.startedAt ?? null,
    execution_status: summary.executionStatus ?? null, security_outcome: summary.securityOutcome ?? null,
    experiment_condition: summary.experimentCondition ?? null, target_method: summary.targetMethod ?? null,
    surface: summary.surface ?? null, security_level: summary.securityLevel ?? null, model: summary.model ?? null,
    source_sha256: ref.sha256, diagnostics: bundle.diagnostics }, null, 2), true, knownSecrets));
  const summaryChunk = chunksForText(`${label} summary`, overview)[0];
  summaryChunk.required = true;
  const allText = String(redact(JSON.stringify(bundle, (key, value) => {
    const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
    return normalized === "scoring_evaluator" || normalized === "resolved_scoring_evaluator" ? undefined : value;
  }, 2), true, knownSecrets));
  const limit = 1_000_000;
  const body = allText.length > limit ? `${allText.slice(0, limit)}\n[Artifact text truncated at 1,000,000 characters.]` : allText;
  return [summaryChunk, ...chunksForText(`${label} artifact`, body).map((chunk) => ({ ...chunk, attachment: true }))];
}
