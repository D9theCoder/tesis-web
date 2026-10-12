import type { NormalizedResult, StatusReason } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { prettyJson } from "@/lib/formatters";
export function StatusDetails({ result, onEvidenceRef }: { result: NormalizedResult; onEvidenceRef?: (ref: string) => void }) {
  const c = result.coverage;
  return <div className="space-y-2 border-t border-graphite-700/40 p-2 text-xs">
    <div className="flex flex-wrap gap-3"><Badge variant="outline">Execution: {result.executionStatus ?? "unknown"}</Badge>
      <Badge variant={result.securityOutcome === "confirmed" ? "lime" : "outline"}>Security outcome: {result.securityOutcome ?? "unknown"}</Badge>
      <span>Legacy status: {result.status}</span>{result.repeatIndex !== null && <span>Repeat: {result.repeatIndex}</span>}</div>
    <Reason label="Execution reason" reason={result.executionReason} onEvidenceRef={onEvidenceRef} />
    <Reason label="Security reason" reason={result.securityOutcomeReason} onEvidenceRef={onEvidenceRef} />
    {result.historicalAnalysis && <details><summary>Historical analysis: {result.historicalAnalysis.classification}</summary>
      <p className="break-all">Source {result.historicalAnalysis.source} · epoch {result.historicalAnalysis.epoch} · SHA-256 {result.historicalAnalysis.sha256}</p></details>}
    {c && <><div className="flex flex-wrap gap-x-4 gap-y-1">
      <span>Planned: {c.planned ?? "unknown"}</span><span>Represented/collected: {c.represented}</span><span>Unstarted: {c.unstarted ?? "unknown"}</span>
      <span>Completed: {c.completed}</span><span>Failed: {c.failed}</span><span>Interrupted: {c.interrupted}</span><span>Unknown: {c.unknown}</span><span>Skipped: {c.skipped}</span>
    </div><div className="flex flex-wrap gap-x-4">{Object.entries(c.outcomeCounts).map(([key,n]) => <span key={key}>{key.replace(/_/g," ")}: {n}</span>)}</div>
      {Object.keys(result.groupCoverages).length > 0 && <details><summary>Provider/group coverage</summary><div className="overflow-x-auto"><table className="w-full text-left">
        <thead><tr><th>Group</th><th>Represented</th><th>Completed</th><th>Failed</th><th>Interrupted</th><th>Confirmed</th><th>Unknown</th><th>Skipped</th></tr></thead>
        <tbody>{Object.entries(result.groupCoverages).map(([key,group]) => <tr key={key}><td>{key}</td><td>{group.represented}</td><td>{group.completed}</td><td>{group.failed}</td><td>{group.interrupted}</td><td>{group.confirmed}</td><td>{group.unknown}</td><td>{group.skipped}</td></tr>)}</tbody>
      </table></div></details>}
      {c.legacyTotals && <details><summary>Preserved legacy matrix totals</summary><pre className="max-h-40 overflow-auto">{prettyJson(c.legacyTotals)}</pre></details>}
    </>}
    {result.source && <details><summary>Source binding</summary><p className="break-all">{result.source.rootId}/{result.source.path} · SHA-256 {result.source.sha256}</p>
      {result.source.projection && <p className="break-all">Compatibility view: {result.source.projection.path} · {result.source.projection.epoch} · {result.source.projection.sha256}</p>}</details>}
    {result.diagnostics.length > 0 && <details><summary>Retrieval diagnostics ({result.diagnostics.length})</summary>{result.diagnostics.map((d,i) => <p key={i}>{d}</p>)}</details>}
  </div>;
}
export function Reason({ label, reason, onEvidenceRef }: { label: string; reason: StatusReason | null; onEvidenceRef?: (ref: string)=>void }) {
  if (!reason) return null;
  return <p>{label}: <code>{reason.code}</code> · {reason.detail} {reason.evidence_refs.map(ref => <button key={ref} className="ml-2 text-signal-300 underline" onClick={() => onEvidenceRef?.(ref)}>{ref}</button>)}</p>;
}
