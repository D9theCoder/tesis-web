"use client";

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
  if (!result.isMatrix) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5")}>
      {result.coordinates.map((c) => {
        const active = selected === (c.runId ?? c.executionId);
        return (
          <button
            key={c.executionId}
            onClick={() => onSelect(c)}
            className={cn(
              "group flex items-center gap-1.5 rounded-sm border px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50",
              active
                ? "border-ember-500/50 bg-ember-500/10"
                : "border-graphite-700/60 bg-graphite-900/50 hover:border-graphite-500",
            )}
          >
            <span className="font-mono text-[10px] text-graphite-300">#{c.index + 1}</span>
            <StatusDot status={c.status} />
            <span className="font-mono text-[9px] uppercase text-graphite-500">
              {c.surface ?? "?"} · {c.securityLevel ?? "?"}
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
    s === "success" ? "bg-confirm-400" :
    s === "error" || s === "failed" ? "bg-danger-500" :
    s === "cancelled" ? "bg-ember-400" : "bg-graphite-500";
  return <span className={cn("h-1.5 w-1.5 rounded-full", cls)} />;
}

export { Badge };
