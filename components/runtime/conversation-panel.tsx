"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Cpu,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import type { ConversationEntry, LiveRunState } from "@/lib/schemas";
import { Badge, Button, ScrollArea } from "@/components/ui/primitives";
import { TrajectoryView } from "@/components/runtime/trajectory-view";
import { cn } from "@/lib/utils";
import { coalesceConversation } from "@/lib/event-reducer";
import { deriveTrajectory } from "@/lib/trajectory";
import { fmtClock, fmtNumber, prettyJson } from "@/lib/formatters";

type ConversationView = "chat" | "trace" | "trajectory";

const VIEW_TABS: { id: ConversationView; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "trace", label: "Trace" },
  { id: "trajectory", label: "Trajectory" },
];

const ROLE_STYLE: Record<ConversationEntry["role"], { label: string; variant: "default" | "amber" | "cyan" | "lime" | "violet" }> = {
  system: { label: "System", variant: "violet" },
  user: { label: "User", variant: "cyan" },
  assistant: { label: "Model", variant: "lime" },
  tool: { label: "Tool", variant: "amber" },
  trace: { label: "Trace", variant: "default" },
};

export function ConversationPanel({ state }: { state: LiveRunState }) {
  const [view, setView] = useState<ConversationView>("chat");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const chatEntries = useMemo(
    () => coalesceConversation(state.conversation),
    [state.conversation],
  );
  const traceEntries = useMemo<ConversationEntry[]>(
    () =>
      state.events.map((event, index) => ({
        id: `evt-${index}`,
        role: "trace" as const,
        eventType: event.event_type,
        node: event.node ?? null,
        method: event.method ?? null,
        message: event.message ?? "",
        timestamp: event.timestamp ?? 0,
        data: event.data ?? {},
      })),
    [state.events],
  );

  const trajectory = useMemo(() => deriveTrajectory(state.events), [state.events]);
  const chatVisible = useMemo(
    () => chatEntries.filter((entry) => entry.role !== "trace" && entry.eventType !== "graph.state"),
    [chatEntries],
  );
  const visibleEntries = view === "trace" ? traceEntries : chatVisible;
  const countLabel =
    view === "chat"
      ? `${chatEntries.length} entries`
      : view === "trace"
        ? `${state.events.length} events`
        : `${trajectory.stats.cells} records`;
  const bufferUsed =
    state.metrics.generationBudget > 0
      ? state.metrics.generatedCandidates
      : state.metrics.attempts;

  const toggle = (id: string) => setOpen((previous) => ({ ...previous, [id]: !previous[id] }));

  return (
    <div className="runtime-panel">
      <header className="runtime-panel-header conversation-panel-header">
        <div className="runtime-panel-title">
          <MessageSquare aria-hidden="true" size={17} />
          <h2>Conversation</h2>
        </div>
        <div className="conversation-view-switch" role="group" aria-label="Conversation view">
          {VIEW_TABS.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant={view === tab.id ? "default" : "ghost"}
              aria-pressed={view === tab.id}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </header>

      <div className="conversation-activity-bar" aria-live="polite">
        <span className="conversation-entry-count">
          <Cpu aria-hidden="true" size={14} />
          {countLabel}
        </span>
        <span className="conversation-activity-separator" aria-hidden="true" />
        <span>{fmtNumber(state.metrics.tokenCount)} tokens</span>
        <Badge variant="outline" className="conversation-budget">
          {bufferUsed} / {state.metrics.generationBudget || "Unlimited"} generation budget
        </Badge>
      </div>

      {state.events.length >= 300 && <p className="helper-copy p-3">Recent activity preview. Use Experiment activity below for the complete paged journal.</p>}
      {view === "trajectory" ? (
        <div className="runtime-panel-body conversation-scroll is-trajectory">
          <TrajectoryView model={trajectory} />
        </div>
      ) : (
        <ScrollArea className="runtime-panel-body conversation-scroll">
          <div className="conversation-list">
            {visibleEntries.length === 0 && (
              <div className="empty-state conversation-empty-state" role="status">
                <MessageSquare aria-hidden="true" size={18} />
                <p>
                  {view === "trace" ? "No runtime events recorded" : "No conversation entries recorded"}
                </p>
                <span>
                  {view === "trace"
                    ? "Runtime events will appear in this trace when available."
                    : "Switch to Trace or Trajectory to inspect the run event journal."}
                </span>
              </div>
            )}
            {visibleEntries.slice(-300).map((entry) => (
              <TraceItem
                key={entry.id}
                entry={entry}
                open={!!open[entry.id]}
                onToggle={() => toggle(entry.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function TraceItem({
  entry,
  open,
  onToggle,
}: {
  entry: ConversationEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const style = ROLE_STYLE[entry.role] ?? ROLE_STYLE.trace;
  const hasData = Boolean(entry.data && Object.keys(entry.data).length > 0);
  const canExpand = hasData || Boolean(entry.message);
  const isSafety = /containment|guardrail|blocked|invalid_json|fallback/i.test(
    entry.eventType,
  );
  const date = Number.isFinite(entry.timestamp)
    ? new Date(entry.timestamp * 1000)
    : null;
  const dateTime = date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  const detailsId = `conversation-details-${encodeURIComponent(entry.id)}`;

  return (
    <article className={cn("conversation-entry", isSafety && "is-safety-event")}>
      <button
        type="button"
        onClick={onToggle}
        className="conversation-entry-toggle"
        aria-expanded={canExpand ? open : undefined}
        aria-controls={hasData ? detailsId : undefined}
        disabled={!canExpand}
      >
        <span className="conversation-entry-disclosure" aria-hidden="true">
          {canExpand && (open ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
        </span>
        <span className="conversation-entry-content">
          <span className="conversation-entry-heading">
            {isSafety ? (
              <ShieldAlert aria-hidden="true" size={15} className="conversation-safety-icon" />
            ) : (
              <Bot aria-hidden="true" size={15} className="conversation-role-icon" />
            )}
            <Badge variant={style.variant}>{style.label}</Badge>
            <span className="conversation-event-type" title={entry.eventType}>
              {entry.eventType}
            </span>
            {entry.tokens != null && (
              <Badge variant="outline" className="conversation-token-count">
                {fmtNumber(entry.tokens)} tokens
              </Badge>
            )}
          </span>
          {entry.message ? (
            <span className={cn("conversation-message", !open && "line-clamp-4")}>
              {entry.message}
            </span>
          ) : (
            <span className="conversation-message conversation-message-fallback">
              {entry.node ?? entry.method ?? entry.eventType}
            </span>
          )}
          <span className="conversation-entry-meta">
            <time dateTime={dateTime}>
              {fmtClock(entry.timestamp)}
            </time>
            {entry.node && (
              <span className="conversation-entry-detail" title={entry.node}>
                Node: {entry.node}
              </span>
            )}
            {entry.method && (
              <span className="conversation-entry-detail" title={entry.method}>
                Method: {entry.method}
              </span>
            )}
          </span>
        </span>
      </button>
      {open && hasData && (
        <pre id={detailsId} className="conversation-entry-data">
          {prettyJson(entry.data)}
        </pre>
      )}
    </article>
  );
}
