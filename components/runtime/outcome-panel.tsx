"use client";

import {
  Ban,
  CheckCircle2,
  ChevronRight,
  FileWarning,
  Repeat,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { LiveRunState } from "@/lib/schemas";
import { Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { fmtCost, fmtNumber, fmtPercent } from "@/lib/formatters";

function MetricCard({
  label,
  value,
  denom,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  denom?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const tones = {
    neutral: "text-graphite-200",
    good: "text-confirm-400",
    bad: "text-danger-400",
    warn: "text-ember-300",
  };
  return (
    <div className="rounded-sm border border-graphite-700/60 bg-graphite-900/50 px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
          {icon}
          {label}
        </span>
        {denom && <span className="font-mono text-[9px] text-graphite-600">{denom}</span>}
      </div>
      <div className={cn("mt-0.5 font-mono text-[15px] font-semibold leading-none", tones[tone])}>
        {typeof value === "number" ? fmtNumber(value) : value}
      </div>
    </div>
  );
}

export function OutcomePanel({ state }: { state: LiveRunState }) {
  const m = state.metrics;
  const guardrailRate = m.iterationCount > 0 ? m.guardrailCount / m.iterationCount : 0;
  const budgetTotal = m.generationBudget || m.maxIterations || 1;
  const budgetUsed = Math.min(budgetTotal, m.generatedCandidates || m.attempts);
  const iterationsTotal = m.maxIterations || 1;
  const iterationsUsed = Math.min(iterationsTotal, m.iterationCount);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-graphite-700/70 px-3 py-2">
        <div className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-confirm-400">
          <Sparkles size={13} /> Outcomes &amp; Budget
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* Safety strip */}
        <div className={cn("flex items-center gap-2 rounded-sm border px-2 py-1.5", m.containmentCount > 0 ? "border-danger-500/50 bg-danger-500/10" : "border-graphite-700/60 bg-graphite-900/50")}>
          <ShieldAlert size={14} className={m.containmentCount > 0 ? "text-danger-400" : "text-graphite-500"} />
          <span className="flex-1 font-mono text-[10px] uppercase tracking-wider text-graphite-300">
            containment events
          </span>
          <span className={cn("font-mono text-[13px] font-bold", m.containmentCount > 0 ? "text-danger-400" : "text-graphite-300")}>
            {m.containmentCount}
          </span>
        </div>
        {m.containmentViolations > 0 && (
          <div className="flex items-center gap-2 rounded-sm border border-danger-500/50 bg-danger-500/10 px-2 py-1.5">
            <Ban size={13} className="text-danger-400" />
            <span className="flex-1 font-mono text-[10px] uppercase tracking-wider text-danger-400">
              external-target violations (blocked)
            </span>
            <span className="font-mono text-[13px] font-bold text-danger-400">{m.containmentViolations}</span>
          </div>
        )}

        {/* Success / failure / signal */}
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="successes" value={m.successes} icon={<CheckCircle2 size={10} className="text-confirm-400" />} tone="good" />
          <MetricCard label="failures" value={m.failures} icon={<XCircle size={10} className="text-danger-400" />} tone="bad" />
          <MetricCard label="guardrails" value={m.guardrailCount} icon={<ShieldAlert size={10} className="text-ember-300" />} tone="warn" />
          <MetricCard label="invalid json" value={m.invalidJson} icon={<FileWarning size={10} className="text-ember-300" />} tone="warn" />
          <MetricCard label="fallbacks" value={m.fallbacks} icon={<Repeat size={10} className="text-graphite-400" />} />
          <MetricCard label="attempts" value={m.attempts} icon={<Sparkles size={10} className="text-graphite-400" />} />
        </div>

        {/* Budget */}
        <div className="space-y-2 rounded-sm border border-graphite-700/60 bg-graphite-900/50 p-2">
          <div className="flex items-center justify-between text-label">
            <span>candidate budget</span>
            <span className="font-mono text-[10px] text-graphite-400">{budgetUsed}/{budgetTotal}</span>
          </div>
          <Progress value={budgetUsed} max={budgetTotal} color="signal" />
          <div className="flex items-center justify-between text-label">
            <span>iterations</span>
            <span className="font-mono text-[10px] text-graphite-400">{iterationsUsed}/{iterationsTotal}</span>
          </div>
          <Progress value={iterationsUsed} max={iterationsTotal} color="amber" />
          <div className="flex items-center justify-between text-label">
            <span>guardrail rate</span>
            <span className="font-mono text-[10px] text-graphite-400">{fmtPercent(guardrailRate, 1)}</span>
          </div>
          <Progress value={m.guardrailCount} max={Math.max(1, m.iterationCount || 1)} color="red" />
        </div>

        {/* Tokens */}
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="tokens" value={m.tokenCount.toLocaleString()} icon={<Sparkles size={10} className="text-signal-400" />} />
          <MetricCard label="cost" value={fmtCost(m.tokenCost)} icon={<Sparkles size={10} className="text-graphite-400" />} />
        </div>

        {/* Findings */}
        <div className="rounded-sm border border-confirm-500/20 bg-confirm-500/5 p-2">
          <div className="pb-1 text-label">confirmed findings</div>
          {state.confirmedVulns.length ? (
            state.confirmedVulns.map((v) => (
              <div key={v} className="flex items-center gap-1 font-mono text-[11px] text-confirm-400">
                <ChevronRight size={10} /> {v.replace(/_/g, " ")}
              </div>
            ))
          ) : (
            <span className="font-mono text-[10px] text-graphite-500">none yet</span>
          )}
          <div className="pb-1 pt-2 text-label">achieved outcomes</div>
          {state.achievedOutcomes.length ? (
            state.achievedOutcomes.map((v) => (
              <div key={v} className="flex items-center gap-1 font-mono text-[11px] text-signal-300">
                <ChevronRight size={10} /> {v.replace(/_/g, " ")}
              </div>
            ))
          ) : (
            <span className="font-mono text-[10px] text-graphite-500">none yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
