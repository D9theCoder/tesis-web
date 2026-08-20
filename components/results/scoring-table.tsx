"use client";

import type { NormalizedResult, ScoreRow } from "@/lib/schemas";
import { Badge, Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  compositeFormula,
} from "@/lib/result-normalizer";
import { fmtCost, fmtNumber, fmtPercent, fmtScore } from "@/lib/formatters";

function DimensionTone(value: number) {
  if (value >= 4) return "text-confirm-400";
  if (value >= 2) return "text-ember-300";
  if (value > 0) return "text-graphite-300";
  return "text-graphite-600";
}

export function ScoringTable({
  result,
  coordinateMode = false,
  onPickCoordinate,
}: {
  result: NormalizedResult;
  coordinateMode?: boolean;
  onPickCoordinate?: (executionId: string, runId: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      {coordinateMode ? (
        <CoordinateScoring result={result} onPick={onPickCoordinate} />
      ) : (
        <DimensionScoring rows={result.scoringRows} />
      )}
    </div>
  );
}

function DimensionScoring({ rows }: { rows: ScoreRow[] }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <div className="space-y-0 border-b border-graphite-700/70 p-2">
        <div className="flex items-center gap-2">
          <span className="text-label">Composite formula</span>
          <code className="rounded-sm bg-graphite-900 px-2 py-0.5 font-mono text-[10px] text-ember-300">
            {compositeFormula()}
          </code>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-graphite-850">
            <tr className="text-label">
              <th className="px-3 py-2">Dimension</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Max</th>
              <th className="hidden px-3 py-2 lg:table-cell">Evidence basis</th>
              <th className="hidden px-3 py-2 xl:table-cell">Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dimension} className="border-t border-graphite-700/40">
                <td className="px-3 py-2 font-display text-[13px] font-semibold tracking-wider text-graphite-100">
                  {row.dimension}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("font-mono text-[15px] font-bold", DimensionTone(row.score))}>
                    {fmtScore(row.score, row.dimension === "Srun" ? 2 : 0)}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[12px] text-graphite-500">/ {row.max}</td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  <span className="font-mono text-[10px] text-graphite-400">{row.evidenceBasis}</span>
                </td>
                <td className="hidden px-3 py-2 xl:table-cell">
                  <span className="text-[11px] leading-snug text-graphite-400">{row.interpretation}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoordinateScoring({
  result,
  onPick,
}: {
  result: NormalizedResult;
  onPick?: (executionId: string, runId: string) => void;
}) {
  const dims = ["Smethod", "Spayload", "Sexploit", "Schain", "Soutput", "Srun"] as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-graphite-700/70 p-2">
        <span className="text-label">Matrix coordinates · {result.coordinates.length} runs</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-graphite-850">
            <tr className="text-label">
              <th className="px-2 py-1.5">Run</th>
              <th className="px-2 py-1.5">Status</th>
              {dims.map((d) => (
                <th key={d} className="px-2 py-1.5 text-right">{d}</th>
              ))}
              <th className="hidden px-2 py-1.5 xl:table-cell">Method</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {result.coordinates.map((c) => (
              <tr
                key={c.executionId}
                className="cursor-pointer border-t border-graphite-700/40 transition-colors hover:bg-graphite-800/50"
                onClick={() => onPick?.(result.executionId, c.runId ?? c.executionId)}
              >
                <td className="px-2 py-1.5 font-mono text-[10px] text-graphite-200">#{c.index + 1}</td>
                <td className="px-2 py-1.5">
                  <StatusBadge status={c.status} />
                </td>
                {dims.map((d) => {
                  const v = c.scores[d];
                  return (
                    <td key={d} className={cn("px-2 py-1.5 text-right font-mono text-[11px]", v != null ? DimensionTone(v) : "text-graphite-600")}>
                      {v != null ? fmtScore(v, d === "Srun" ? 2 : 0) : "—"}
                    </td>
                  );
                })}
                <td className="hidden max-w-[140px] truncate px-2 py-1.5 font-mono text-[10px] text-graphite-400 xl:table-cell">
                  {c.selectedMethod ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-signal-400">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success") return <Badge variant="lime">{status}</Badge>;
  if (s === "error" || s === "failed") return <Badge variant="red">{status}</Badge>;
  if (s === "cancelled") return <Badge variant="amber">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function MetricsSummary({ result }: { result: NormalizedResult }) {
  const m = result.metrics;
  const items: Array<[string, string]> = [
    ["Payload validity rate", fmtPercent(m.payloadValidityRate)],
    ["Payload execution rate", fmtPercent(m.payloadExecutionSuccessRate)],
    ["Payload improvement rate", fmtPercent(m.payloadImprovementRate)],
    ["Method selection accuracy", fmtPercent(m.methodSelectionAccuracy)],
    ["Adaptation rate", fmtPercent(m.adaptationRate)],
    ["Guardrail activation rate", fmtPercent(m.guardrailActivationRate)],
    ["Containment events", fmtNumber(m.containmentCount)],
    ["Invalid JSON events", fmtNumber(m.invalidJson)],
    ["Fallback events", fmtNumber(m.fallbacks)],
    ["Attempts to success", fmtNumber(m.attemptsToSuccess)],
    ["Token cost", fmtCost(m.tokenCost)],
    ["LLM calls", fmtNumber(m.llmCalls)],
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-sm border border-graphite-700/60 bg-graphite-900/50 px-2 py-1.5">
          <div className="text-[9px] font-mono uppercase tracking-wider text-graphite-500">{label}</div>
          <div className="mt-0.5 font-mono text-[13px] font-semibold text-graphite-200">{value}</div>
        </div>
      ))}
      <Gauge label="Containment pressure" value={m.containmentCount ?? 0} max={12} color="red" />
      <Gauge label="Guardrail rate" value={m.guardrailActivationRate ?? 0} max={1} color="amber" />
    </div>
  );
}

function Gauge({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: "red" | "amber";
}) {
  return (
    <div className="rounded-sm border border-graphite-700/60 bg-graphite-900/50 px-2 py-1.5">
      <div className="mb-1 text-[9px] font-mono uppercase tracking-wider text-graphite-500">{label}</div>
      <Progress value={value} max={max} color={color} />
      <div className="mt-1 text-right font-mono text-[10px] text-graphite-400">
        {color === "red" ? `${value}/${max}` : fmtPercent(value, 1)}
      </div>
    </div>
  );
}
