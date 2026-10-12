"use client";

import { useState } from "react";
import type { CoordinateSummary, NormalizedResult } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { fmtScore } from "@/lib/formatters";

/**
 * Compact coordinate index for matrix results: select any coordinate to
 * inspect its detailed table and scoring without loading the full matrix into
 * one DOM tree.
 */
export function CoordinateIndex({
  result,
  selected,
  onSelect,
}: {
  result: NormalizedResult;
  selected: string | null;
  onSelect: (coord: CoordinateSummary) => void;
}) {
  const [execution, setExecution] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [historical, setHistorical] = useState("all");
  if (!result.isMatrix) return null;
  const filtered = result.coordinates.filter(c => (execution === "all" || (c.executionStatus ?? "unknown") === execution) &&
    (outcome === "all" || (c.securityOutcome ?? "unknown") === outcome) && (historical === "all" || c.historicalAnalysis?.classification === historical));
  return (
    <div className={cn("flex flex-wrap gap-1.5")}>
      <div className="flex w-full flex-wrap gap-2 text-xs">
        <label>Execution <select aria-label="Filter execution" className="max-w-[170px] bg-graphite-900" value={execution} onChange={e => setExecution(e.target.value)}>
          {["all", "completed", "failed", "interrupted", "unknown"].map(v => <option key={v}>{v}</option>)}
        </select></label>
        <label>Security outcome <select aria-label="Filter security outcome" className="max-w-[170px] bg-graphite-900" value={outcome} onChange={e => setOutcome(e.target.value)}>
          {["all", "confirmed", "no_finding", "unconfirmed", "fixture_limited", "unknown"].map(v => <option key={v}>{v}</option>)}
        </select></label>
        <label>Historical analysis <select aria-label="Filter historical analysis" className="max-w-[170px] bg-graphite-900" value={historical} onChange={e => setHistorical(e.target.value)}>
          {["all", ...new Set(result.coordinates.flatMap(c => c.historicalAnalysis ? [c.historicalAnalysis.classification] : []))].map(v => <option key={v}>{v}</option>)}
        </select></label><span>{filtered.length}/{result.coordinates.length} coordinates</span>
      </div>
      {filtered.map((c) => {
        const active = selected === c.executionId;
        return (
          <button
            key={c.executionId}
            onClick={() => onSelect(c)}
            aria-pressed={active}
            aria-label={`Coordinate ${c.index + 1}: ${c.executionStatus ?? "unknown"}, ${c.securityOutcome ?? "unknown"}, ${c.executionId}`}
            className={cn(
              "group flex items-center gap-1.5 rounded-sm border px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50",
              active
                ? "border-ember-500/50 bg-ember-500/10"
                : "border-graphite-700/60 bg-graphite-900/50 hover:border-graphite-500",
            )}
          >
            <span className="font-mono text-[10px] text-graphite-300">#{c.index + 1}</span>
            <StatusDot status={c.executionStatus ?? "unknown"} />
            <span className="font-mono text-[9px] uppercase text-graphite-500">
              {c.surface ?? "?"} · {c.securityLevel ?? "?"} · {c.securityOutcome ?? "unknown"} · repeat {c.repeatIndex ?? "?"}
            </span>
            {c.scores.Srun != null && (
              <span className={cn("font-mono text-[10px] font-semibold", (c.scores.Srun ?? 0) >= 4 ? "text-confirm-400" : (c.scores.Srun ?? 0) >= 2 ? "text-ember-300" : "text-graphite-500")}>
                {fmtScore(c.scores.Srun, 2)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "completed" ? "bg-confirm-400" :
    s === "error" || s === "failed" ? "bg-danger-500" :
    s === "interrupted" ? "bg-ember-400" : "bg-graphite-500";
  return <span className={cn("h-1.5 w-1.5 rounded-full", cls)} />;
}

export { Badge };
