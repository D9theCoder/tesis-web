"use client";

import { useMemo, useState } from "react";
import { Bot, ChevronDown, ChevronRight, Cpu, MessageSquare, ShieldAlert } from "lucide-react";
import type { ConversationEntry, LiveRunState } from "@/lib/schemas";
import { Badge, Button, ScrollArea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { coalesceConversation } from "@/lib/event-reducer";
import { fmtClock, prettyJson } from "@/lib/formatters";

const ROLE_STYLE: Record<ConversationEntry["role"], { label: string; cls: string }> = {
  system: { label: "system", cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  user: { label: "user", cls: "border-signal-500/40 bg-signal-500/10 text-signal-300" },
  assistant: { label: "model", cls: "border-confirm-500/40 bg-confirm-500/10 text-confirm-400" },
  tool: { label: "tool", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  trace: { label: "trace", cls: "border-graphite-600 bg-graphite-800 text-graphite-400" },
};

export function ConversationPanel({ state }: { state: LiveRunState }) {
  const [traceMode, setTraceMode] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const chatEntries = useMemo(() => coalesceConversation(state.conversation), [state.conversation]);

  const traceEntries = useMemo<ConversationEntry[]>(
    () =>
      state.events.map((e, i) => ({
        id: `evt-${i}`,
        role: "trace" as const,
        eventType: e.event_type,
        node: e.node ?? null,
        method: e.method ?? null,
        message: e.message ?? "",
        timestamp: e.timestamp ?? 0,
        data: e.data ?? {},
      })),
    [state.events],
  );

  const visible = traceMode ? traceEntries : chatEntries.filter((e) => e.role !== "trace" && e.eventType !== "graph.state");

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const bufUsed = state.metrics.generationBudget > 0
    ? state.metrics.generatedCandidates
    : state.metrics.attempts;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-graphite-700/70 px-3 py-2">
        <div className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-cyan-300">
          <MessageSquare size={13} /> LLM Conversation &amp; Trace
        </div>
        <div className="flex items-center gap-1">
          <Button variant={traceMode ? "amber" : "ghost"} onClick={() => setTraceMode((t) => !t)} className="px-2 py-0.5 text-[10px]">
            {traceMode ? "Trace" : "Chat"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-graphite-700/50 px-3 py-1">
        <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
          <Cpu size={10} className="text-signal-400" />
          {traceMode ? `${state.events.length} events` : `${chatEntries.length} entries`}
          <span className="ml-1 text-graphite-600">·</span>
          <span className="text-graphite-500">{state.metrics.tokenCount.toLocaleString()} tokens</span>
          <Badge variant="cyan" className="ml-1">{bufUsed}/{state.metrics.generationBudget || "∞"}</Badge>
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-2">
          {visible.length === 0 && (
            <div className="flex h-24 items-center justify-center gap-2 rounded-sm border border-dashed border-graphite-700 p-3 text-center font-mono text-[10px] text-graphite-500">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-ember-400" />
              awaiting model activity…
            </div>
          )}
          {visible.slice(-300).map((entry, i) => (
            <TraceItem
              key={traceMode ? `evt-${i}` : entry.id}
              entry={entry}
              isEvent={traceMode}
              open={!!open[entry.id]}
              onToggle={() => toggle(entry.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TraceItem({
  entry,
  isEvent,
  open,
  onToggle,
}: {
  entry: ConversationEntry;
  isEvent: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const style = ROLE_STYLE[entry.role] ?? ROLE_STYLE.trace;
  const hasData = entry.data && Object.keys(entry.data).length > 0;
  const isSafety = /containment|guardrail|blocked|invalid_json|fallback/i.test(entry.eventType);
  return (
    <div className={cn("rounded-sm border border-graphite-700/60 bg-graphite-900/50", isSafety && "border-danger-500/40")}>
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-2 p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50"
      >
        <div>
          {open ? <ChevronDown size={12} className="mt-0.5 text-graphite-500" /> : <ChevronRight size={12} className="mt-0.5 text-graphite-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isSafety ? <ShieldAlert size={11} className="text-danger-400" /> : <Bot size={11} className="text-graphite-500" />}
            <span className={cn("rounded-sm border px-1 py-px font-mono text-[9px] uppercase", style.cls)}>
              {entry.role}
            </span>
            <span className="font-mono text-[10px] text-graphite-400">{entry.eventType}</span>
            {entry.tokens != null && (
              <Badge variant="violet" className="ml-auto">{entry.tokens} tok</Badge>
            )}
          </div>
          {entry.message ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-graphite-200">
              {entry.message}
            </p>
          ) : (
            <p className="mt-1 font-mono text-[11px] text-graphite-400">
              {entry.node ?? entry.method ?? entry.eventType}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-graphite-500">
            <span>{fmtClock(entry.timestamp)}</span>
            {entry.node && <span>· node {entry.node}</span>}
            {entry.method && <span>· {entry.method}</span>}
          </div>
        </div>
      </button>
      {open && hasData && (
        <pre className="max-h-64 overflow-auto border-t border-graphite-700/50 p-2 font-mono text-[10px] leading-snug text-graphite-300">
          {prettyJson(entry.data)}
        </pre>
      )}
    </div>
  );
}
