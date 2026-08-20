"use client";

import { Activity, Clock, Crosshair, Route, Target, TerminalSquare } from "lucide-react";
import type { LiveRunState, RunConnectionStatus } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  fmtClock,
  fmtDuration,
} from "@/lib/formatters";

const CONNECTION_STYLE: Record<RunConnectionStatus, { label: string; cls: string; dot: string }> = {
  waiting: { label: "waiting", cls: "border-graphite-600 bg-graphite-800 text-graphite-400", dot: "bg-graphite-500" },
  active: { label: "active", cls: "border-signal-500/50 bg-signal-500/10 text-signal-300", dot: "bg-signal-400 animate-pulse" },
  stale: { label: "stale", cls: "border-ember-500/50 bg-ember-500/10 text-ember-300", dot: "bg-ember-400" },
  completed: { label: "completed", cls: "border-confirm-500/50 bg-confirm-500/10 text-confirm-400", dot: "bg-confirm-400" },
  cancelled: { label: "cancelled", cls: "border-danger-500/50 bg-danger-500/10 text-danger-400", dot: "bg-danger-500" },
  error: { label: "error", cls: "border-danger-500/50 bg-danger-500/10 text-danger-400", dot: "bg-danger-500" },
};

function Field({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-graphite-700/40 py-0.5">
      <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
        {label}
      </span>
      <span className={cn("truncate text-right text-[11px] text-graphite-200", mono && "font-mono")}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export function CoordinatePanel({ state }: { state: LiveRunState }) {
  const conn = CONNECTION_STYLE[state.connection];
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-graphite-700/70 px-3 py-2">
        <div className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-signal-300">
          <Activity size={13} /> Runtime Coordinate
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", conn.cls)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", conn.dot)} />
          {conn.label}
        </span>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        <div className="flex items-center gap-2 pb-1">
          <span className="flex items-center gap-1 font-mono text-[10px] text-ember-300">
            <Clock size={11} /> ELAPSED
          </span>
          <span className="font-mono text-[13px] font-semibold text-graphite-100">
            {fmtDuration(state.elapsedMs)}
          </span>
        </div>
        <Field label="status" value={state.status} />
        <Field label="start" value={fmtClock(state.startedAt)} />
        <Field label="end" value={state.endedAt ? fmtClock(state.endedAt) : "—"} />
        <Field label="execution id" value={truncateId(state.executionId)} />
        <Field label="run id" value={truncateId(state.runId)} />
        <Field label="mode" value={state.mode} />
        <Field label="condition" value={state.experimentCondition} />
        <Field label="surface" value={state.surface} />
        <Field label="security level" value={state.securityLevel} />
        <Field label="provider" value={state.provider} />
        <Field label="model" value={state.model} />
        <Field label="payload mode" value={state.payloadMode} />
        <Field label="target method" value={state.targetMethod} />

        <div className="pt-2">
          <div className="pb-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">Traversal</div>
          <Field label="current node" value={<Badge variant="amber">{state.currentNode ?? "—"}</Badge>} mono={false} />
          <Field label="selected method" value={state.selectedMethod ?? "—"} />
          <Field label="viable" value={<span className="flex flex-wrap gap-1">{state.viableMethods.length ? state.viableMethods.map((m) => <Badge key={m} variant="cyan">{m}</Badge>) : "—"}</span>} mono={false} />
          <Field label="iteration" value={state.metrics.iterationCount} />
        </div>

        <div className="pt-2">
          <div className="flex items-center gap-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
            <Route size={10} /> Chain / Path
          </div>
          <PathCrumbs items={state.akgPath.length ? state.akgPath : state.chain} />
        </div>

        <div className="pt-2">
          <div className="flex items-center gap-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
            <Target size={10} /> Target scope (contained)
          </div>
          <div className="flex items-center gap-1.5 rounded-sm border border-graphite-700/70 bg-graphite-900/60 px-2 py-1">
            <TerminalSquare size={11} className="text-graphite-500" />
            <span className="truncate font-mono text-[11px] text-graphite-300">
              {state.targetUrl ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PathCrumbs({ items }: { items: string[] }) {
  if (!items.length) return <span className="font-mono text-[10px] text-graphite-500">no route yet</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((nodeId, i) => (
        <span key={`${nodeId}-${i}`} className="flex items-center gap-1">
          {i > 0 && <span className="text-graphite-600">→</span>}
          <span className={cn("rounded-sm px-1 py-0.5 font-mono text-[9px]", i === items.length - 1 ? "bg-ember-500/15 text-ember-300" : "text-signal-300")}>
            {nodeId.replace(/_/g, " ")}
          </span>
        </span>
      ))}
    </div>
  );
}

function truncateId(id: string | null, max = 26): string {
  if (!id) return "—";
  return id.length > max ? `${id.slice(0, 20)}…` : id;
}

export { Crosshair };
