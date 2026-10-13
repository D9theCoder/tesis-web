"use client";

import { useState } from "react";
import type { NormalizedResult, ScoreRow } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { buildScoreRows, compositeFormula } from "@/lib/result-normalizer";
import { fmtCost, fmtNumber, fmtPercent, fmtScore } from "@/lib/formatters";

export function ScoringTable({ result, coordinateMode = false, onPickCoordinate, onEvidenceRef }: {
  result: NormalizedResult; coordinateMode?: boolean; onPickCoordinate?: (executionId: string, runId: string) => void;
  onEvidenceRef?: (ref: string) => void;
}) {
  const [origin, setOrigin] = useState<"runtime" | "human" | "ai">("runtime");
  const workflow = origin === "runtime" ? null : result.reviews?.[origin];
  const scores = workflow?.components ? { ...workflow.components, Srun: workflow.SrunFinal ?? undefined } : {};
  const rows = origin === "runtime" ? result.scoringRows : buildScoreRows(scores, true, workflow?.evidenceRefs);
  if (coordinateMode) return (
    <div className="h-full overflow-auto">
      <p className="p-2 font-mono text-[10px] text-graphite-400">Provisional runtime scores. Select a coordinate to retrieve its final reviews and evidence.</p>
      <table className="w-full text-left text-xs">
        <thead><tr><th className="p-2">Coordinate</th><th>Execution</th><th>Security outcome</th><th>Repeat</th><th>Runtime Srun</th><th>Method</th></tr></thead>
        <tbody>{result.coordinates.map(c => <tr key={c.executionId} className="border-t border-graphite-700/40">
          <td className="p-2"><button className="text-signal-300 underline" onClick={() => onPickCoordinate?.(c.executionId,c.executionId)}>#{c.index+1} · {c.surface} · {c.securityLevel}</button></td>
          <td>{c.executionStatus ?? "unknown"}</td><td>{c.securityOutcome ?? "unknown"}</td><td>{c.repeatIndex ?? "—"}</td>
          <td>{fmtScore(c.scores.Srun,4)}</td><td>{c.selectedMethod ?? c.targetMethod ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
  return (
    <div className="h-full space-y-2 overflow-auto">
      <div className="flex flex-wrap gap-2 p-2" role="group" aria-label="Score origin">
        {(["runtime", "human", "ai"] as const).map(mode => <button key={mode} aria-pressed={origin===mode} onClick={() => setOrigin(mode)} className="rounded border border-graphite-600 px-2 py-1 text-xs">
          {mode === "runtime" ? "Provisional runtime" : `${mode === "human" ? "Human" : "AI"} review`}
        </button>)}
      </div>
      <div className="px-3 text-xs text-graphite-400">
        <Badge variant="outline">{origin === "runtime" ? result.scoreOrigin : `${workflow?.rubric ?? "scoring.v4"} · ${workflow?.status ?? "missing"}`}</Badge>
        {workflow?.reason && <p className="mt-2">{workflow.reason}</p>}
        {workflow && <><p>Candidate numerator / denominator: {fmtNumber(workflow.numerator,4)} / {fmtNumber(workflow.denominator)}</p>
          {Object.entries(workflow.componentPendingReasons).map(([key,reason]) => <p key={key}>{key}: {String(reason)}</p>)}
          {workflow.source && <p className="break-all">Receipt: {workflow.source.rootId}/{workflow.source.path} · SHA-256 {workflow.source.sha256}</p>}
        </>}
        <code className="block break-words py-2 text-[10px]">{compositeFormula()}</code>
      </div>
      <DimensionScoring rows={rows} refs={workflow?.evidenceRefs} onEvidenceRef={onEvidenceRef} />
      {workflow?.candidateGrades.length ? <details className="p-3 text-xs"><summary>Candidate grades and denominator</summary>
        <pre className="overflow-auto text-[10px]">{JSON.stringify(workflow.candidateGrades,null,2)}</pre></details> : null}
      {!!result.reviews?.history.length && <details className="p-3 text-xs"><summary>Saved review receipts ({result.reviews.history.length})</summary>
        {result.reviews.history.map(receipt => <details key={receipt.sha256+receipt.path} className="py-2"><summary>{receipt.workflow} · {receipt.accepted ? "eligible" : receipt.reason} · {receipt.path}</summary>
          <pre className="overflow-auto text-[10px]">{JSON.stringify(receipt.receipt,null,2)}</pre></details>)}
      </details>}
    </div>
  );
}
function DimensionScoring({ rows, refs, onEvidenceRef }: { rows: ScoreRow[]; refs?: Record<string,string[]>; onEvidenceRef?: (ref:string)=>void }) {
  return <table className="w-full text-left"><thead className="text-label"><tr><th className="p-3">Dimension</th><th>Score / 4</th><th className="hidden p-3 md:table-cell">Evidence / interpretation</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.dimension} className="border-t border-graphite-700/40">
      <td className="p-3 font-semibold">{row.dimension}</td><td className="font-mono">{fmtScore(row.score,4)}</td>
      <td className="hidden p-3 text-[10px] text-graphite-400 md:table-cell"><p>{row.interpretation}</p>
        {refs?.[row.dimension]?.length ? refs[row.dimension].map(ref => <button key={ref} className="mr-2 text-signal-300 underline" onClick={() => onEvidenceRef?.(ref)}>{ref}</button>) : <p>{row.evidenceBasis}</p>}
      </td></tr>)}</tbody></table>;
}
export function MetricsSummary({ result }: { result: NormalizedResult }) {
  const m = result.metrics;
  const items: [string,string][] = [["Payload validity",fmtPercent(m.payloadValidityRate)], ["Payload execution",fmtPercent(m.payloadExecutionSuccessRate)],
    ["Payload improvement",fmtPercent(m.payloadImprovementRate)],["Method selection",fmtPercent(m.methodSelectionAccuracy)],
    ["Adaptation",fmtPercent(m.adaptationRate)],["Guardrail rate",fmtPercent(m.guardrailActivationRate)],
    ["Containment events",fmtNumber(m.containmentCount)],["Invalid JSON",fmtNumber(m.invalidJson)],["Fallbacks",fmtNumber(m.fallbacks)],
    ["Attempts to success",fmtNumber(m.attemptsToSuccess)],["Tokens",fmtNumber(m.tokenCount)],["LLM calls",fmtNumber(m.llmCalls)]];
  return <div className="space-y-3 text-xs"><div className="grid grid-cols-2 gap-2">{items.map(([label,value]) => <div key={label} className="rounded border border-graphite-700 p-2"><p className="text-graphite-500">{label}</p><p>{value}</p></div>)}</div>
    {Object.entries(result.metricReadings).map(([key,reading]) => <div key={key} className="rounded border border-graphite-700 p-2">
      <p>{key.replace(/_/g," ")}</p><p>{reading.available ? key.includes("cost") ? fmtCost(reading.value) : fmtNumber(reading.value,4) : `N/A · ${reading.reason}`}</p>
      {reading.nAvailable !== undefined && <p>Available {reading.nAvailable} · unavailable {reading.nUnavailable ?? "—"}</p>}
      {Object.entries(reading.unavailableReasons ?? {}).map(([reason,n]) => <p key={reason}>{reason}: {n}</p>)}
    </div>)}
  </div>;
}
