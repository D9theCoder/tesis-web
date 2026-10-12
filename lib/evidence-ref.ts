import { record } from "@/lib/artifact-contract";
import type { EvidenceRow, NormalizedResult } from "@/lib/schemas";
export function evidenceForReference(result: NormalizedResult, ref: string): EvidenceRow | null {
  const row = result.evidenceRows.find(r => r.id === ref || r.details.sourceRef === ref || String(r.details.sourceRef).replace(/^#\//,"#/final_state/") === ref);
  if (row) return row;
  if (!ref.startsWith("#/")) return null;
  let value: unknown = record(result.raw.artifact ?? result.raw);
  for (const part of ref.slice(2).split("/")) {
    const key = part.replace(/~1/g,"/").replace(/~0/g,"~");
    if (!value || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[key];
  }
  if (value === undefined) return null;
  return { id: ref, phase: "source reference", timestamp: "", timestampEpoch: 0, node: null, method: null, route: null,
    action: ref, candidate: null, result: "Stored source evidence", status: "info", signal: null, safety: "low",
    details: { sourceRef: ref, value }, relatedEventIds: [] };
}
