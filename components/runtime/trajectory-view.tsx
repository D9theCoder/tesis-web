"use client";

import { Fragment, useId, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  MessageSquare,
  Route,
  Rows3,
  Search,
} from "lucide-react";
import type {
  TrajectoryCell,
  TrajectoryKind,
  TrajectoryModel,
  TrajectoryOverview,
  TrajectoryScale,
  TrajectoryStatus,
  TrajectoryTurn,
  TrajectoryUsage,
} from "@/lib/trajectory";
import { Badge, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { filterTrajectoryTurns, projectOverview } from "@/lib/trajectory";
import { fmtClock, fmtDuration, fmtNumber, prettyJson } from "@/lib/formatters";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const KIND_STYLE: Record<TrajectoryKind, { label: string; variant: BadgeVariant }> = {
  system: { label: "System", variant: "violet" },
  user: { label: "User", variant: "cyan" },
  context: { label: "Context", variant: "default" },
  model: { label: "Model", variant: "lime" },
  tool: { label: "Tool", variant: "amber" },
  safety: { label: "Safety", variant: "red" },
};

const STATUS_STYLE: Record<TrajectoryStatus, { label: string; variant: BadgeVariant }> = {
  completed: { label: "Completed", variant: "lime" },
  failed: { label: "Failed", variant: "red" },
  pending: { label: "Pending", variant: "outline" },
  observed: { label: "Observed", variant: "default" },
};

const LANES = [
  { id: "input", label: "Input" },
  { id: "model", label: "Model" },
  { id: "tools", label: "Tools" },
] as const;

/** A turn names at most this many settled nodes before the rest fold into a count. */
const NODE_CHIP_LIMIT = 4;

/** The conversation kinds the ledger filter keeps: the model's own exchange. */
const CONVERSATION_KINDS: readonly TrajectoryKind[] = ["system", "user", "model"];

function usageLine(usage: TrajectoryUsage): string {
  const parts: string[] = [];
  if (usage.input != null) parts.push(`in ${fmtNumber(usage.input)}`);
  if (usage.output != null) parts.push(`out ${fmtNumber(usage.output)}`);
  if (usage.reasoning != null) parts.push(`think ${fmtNumber(usage.reasoning)}`);
  if (usage.cached != null) parts.push(`cached ${fmtNumber(usage.cached)}`);
  if (parts.length === 0 && usage.total != null) parts.push(`${fmtNumber(usage.total)} tok`);
  return parts.join(" · ");
}

function tokenSummary(usage: TrajectoryUsage): string {
  if (usage.input == null && usage.output == null && usage.reasoning == null) return "—";
  const part = (value: number | null) => (value == null ? "—" : fmtNumber(value));
  return `${part(usage.input)}/${part(usage.output)}/${part(usage.reasoning)}`;
}

/** Explain a compact token cell, including a total the journal never split. */
function usageTitle(usage: TrajectoryUsage): string {
  const parts: string[] = [];
  if (usage.input != null) parts.push(`input ${fmtNumber(usage.input)}`);
  if (usage.output != null) parts.push(`output ${fmtNumber(usage.output)}`);
  if (usage.reasoning != null) parts.push(`reasoning ${fmtNumber(usage.reasoning)}`);
  if (usage.cached != null) parts.push(`cached ${fmtNumber(usage.cached)}`);
  if (parts.length > 0) return parts.join(", ");
  if (usage.total != null) {
    return `total ${fmtNumber(usage.total)} tok reported without a split`;
  }
  return "No token usage reported";
}

/** Wording for a timing fact the journal never carried. */
const NOT_RECORDED = "not recorded";

/** Wording for a measurement that cannot exist for this record kind. */
const NOT_APPLICABLE = "n/a";

const STREAM_GAP =
  "The journal carried no streamed chunk records, so this call has no first token to measure from.";

const SOURCE_GAP =
  "The journal carried this reasoning text without naming the metadata field it came from.";

interface TrajectoryFact {
  label: string;
  value: string;
  title?: string;
}

/**
 * Timing, token, and reasoning facts for one record.
 *
 * This is the per-record inspector a harness trajectory shows: every
 * measurement gets its own labelled row, and a row the journal never filled
 * says so instead of disappearing into one comma-separated sentence. Latency
 * rows only apply to model calls, so other records read `n/a` rather than
 * "not recorded" — the difference between "the journal was silent" and "this
 * call has no such phase" matters when judging a run.
 *
 * Reasoning keeps its two representations apart: a provider trace and a
 * provider summary each get a presence row and a row naming the metadata field
 * they arrived in. Neither is inferred from the answer or the token counts.
 */
function TrajectoryFacts({ cell }: { cell: TrajectoryCell }) {
  const { timing, usage, reasoning } = cell;
  const isModel = cell.kind === "model";

  const clock = (value: number | null) => (value == null ? NOT_RECORDED : fmtClock(value));
  const count = (value: number | null) => (value == null ? NOT_RECORDED : fmtNumber(value));
  const latency = (value: number | null) =>
    value == null ? (isModel ? NOT_RECORDED : NOT_APPLICABLE) : fmtDuration(value);

  const total =
    cell.durationMs == null
      ? cell.pending
        ? "still running"
        : NOT_RECORDED
      : fmtDuration(cell.durationMs);
  const streamGap = isModel && timing.firstTokenAt == null ? STREAM_GAP : undefined;

  const timingFacts: TrajectoryFact[] = [
    { label: "Started", value: clock(timing.startedAt) },
    { label: "Total duration", value: total },
    { label: "TTFT", value: latency(timing.ttftMs), title: streamGap },
    { label: "Generation", value: latency(timing.decodeMs), title: streamGap },
    {
      label: "Throughput",
      value:
        timing.tokensPerSecond == null
          ? isModel
            ? NOT_RECORDED
            : NOT_APPLICABLE
          : `${timing.tokensPerSecond.toFixed(1)} tok/s`,
      title: streamGap,
    },
    {
      label: "Source",
      value:
        timing.startedAt == null && timing.completedAt == null
          ? "no timestamps recorded"
          : "journal event timestamps",
    },
  ];

  const usageFacts: TrajectoryFact[] = [
    { label: "Input", value: count(usage.input) },
    { label: "Cached", value: count(usage.cached) },
    { label: "Output", value: count(usage.output) },
    { label: "Reasoning", value: count(usage.reasoning) },
    { label: "Total tokens", value: count(usage.total) },
  ];

  // A record that carries reasoning always reports it, even when its event type
  // is not a plain model call; only an empty row falls back to `n/a`.
  const traceSize = (text: string | null) =>
    text != null
      ? `${fmtNumber(text.length)} chars`
      : isModel
        ? NOT_RECORDED
        : NOT_APPLICABLE;
  const traceSource = (source: string | null, text: string | null) => {
    if (text == null) return isModel ? NOT_RECORDED : NOT_APPLICABLE;
    return source ?? NOT_RECORDED;
  };
  const sourceGap = (source: string | null, text: string | null) =>
    text != null && source == null ? SOURCE_GAP : undefined;

  const reasoningFacts: TrajectoryFact[] = [
    { label: "Trace", value: traceSize(reasoning.trace) },
    {
      label: "Trace source",
      value: traceSource(reasoning.traceSource, reasoning.trace),
      title: sourceGap(reasoning.traceSource, reasoning.trace),
    },
    { label: "Summary", value: traceSize(reasoning.summary) },
    {
      label: "Summary source",
      value: traceSource(reasoning.summarySource, reasoning.summary),
      title: sourceGap(reasoning.summarySource, reasoning.summary),
    },
  ];

  return (
    <div className="trajectory-facts">
      <dl className="trajectory-fact-list" aria-label="Record timing">
        {timingFacts.map((fact) => (
          <div className="trajectory-fact" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd title={fact.title}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="trajectory-fact-list" aria-label="Token usage">
        {usageFacts.map((fact) => (
          <div className="trajectory-fact" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="trajectory-fact-list" aria-label="Reasoning evidence">
        {reasoningFacts.map((fact) => (
          <div className="trajectory-fact" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd title={fact.title}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TrajectoryView({ model }: { model: TrajectoryModel }) {
  const [query, setQuery] = useState("");
  const [conversationOnly, setConversationOnly] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useState<boolean | null>(null);
  const [scale, setScale] = useState<TrajectoryScale>("duration");
  const [collapsedTurns, setCollapsedTurns] = useState<Record<number, boolean>>({});
  const [turnsBulk, setTurnsBulk] = useState<boolean | null>(null);
  const baseId = useId();

  const overview = useMemo(
    () => (scale === model.overview.scale ? model.overview : projectOverview(model.turns, scale)),
    [model.turns, model.overview, scale],
  );

  const turns = useMemo(
    () =>
      filterTrajectoryTurns(model.turns, query, conversationOnly ? CONVERSATION_KINDS : undefined),
    [model.turns, query, conversationOnly],
  );
  const visible = useMemo(
    () => turns.flatMap((turn) => turn.cells.map((cell) => cell.id)),
    [turns],
  );
  const isOpen = (id: string) => overrides[id] ?? bulk ?? false;
  const allExpanded = visible.length > 0 && visible.every(isOpen);

  const toggle = (id: string) =>
    setOverrides((previous) => ({ ...previous, [id]: !(previous[id] ?? bulk ?? false) }));

  const toggleAll = () => {
    setBulk(!allExpanded);
    setOverrides({});
  };

  const isTurnCollapsed = (turn: number) => collapsedTurns[turn] ?? turnsBulk ?? false;
  const allTurnsCollapsed =
    turns.length > 0 && turns.every((turn) => isTurnCollapsed(turn.turn));

  const toggleTurn = (turn: number) =>
    setCollapsedTurns((previous) => ({
      ...previous,
      [turn]: !(previous[turn] ?? turnsBulk ?? false),
    }));

  const toggleAllTurns = () => {
    setTurnsBulk(!allTurnsCollapsed);
    setCollapsedTurns({});
  };

  return (
    <div className="trajectory">
      <div className="trajectory-toolbar">
        <label className="search-control trajectory-search">
          <Search aria-hidden="true" size={15} />
          <input
            className="form-control"
            type="search"
            value={query}
            placeholder="Filter records…"
            aria-label="Filter trajectory records"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="trajectory-controls">
          <Button
            type="button"
            variant="ghost"
            className="trajectory-filter"
            aria-pressed={conversationOnly}
            aria-label="Show conversation records only"
            title={
              conversationOnly
                ? "Showing system, user, and model records only"
                : "Hide tool, graph, and safety records"
            }
            onClick={() => setConversationOnly((current) => !current)}
          >
            Conversation
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="trajectory-fold ui-button-icon"
            aria-pressed={scale === "duration"}
            aria-label={scale === "duration" ? "Use equal-width operations" : "Use actual duration"}
            title={scale === "duration" ? "Use equal-width operations" : "Use actual duration"}
            onClick={() => setScale((current) => (current === "duration" ? "equal" : "duration"))}
          >
            <Clock aria-hidden="true" size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="trajectory-fold ui-button-icon"
            aria-pressed={allTurnsCollapsed}
            aria-label={allTurnsCollapsed ? "Expand turns" : "Collapse turns"}
            title={allTurnsCollapsed ? "Expand every turn" : "Collapse every turn"}
            disabled={turns.length === 0}
            onClick={toggleAllTurns}
          >
            <Rows3 aria-hidden="true" size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="trajectory-fold ui-button-icon"
            aria-pressed={allExpanded}
            aria-label={allExpanded ? "Collapse all" : "Expand all"}
            title={allExpanded ? "Collapse all records" : "Expand all records"}
            disabled={visible.length === 0}
            onClick={toggleAll}
          >
            {allExpanded ? (
              <ChevronsDownUp aria-hidden="true" size={15} />
            ) : (
              <ChevronsUpDown aria-hidden="true" size={15} />
            )}
          </Button>
        </div>
      </div>

      <TrajectoryTiming model={model} overview={overview} shown={visible.length} />

      {model.turns.length === 0 ? (
        <div className="empty-state trajectory-empty-state" role="status">
          <Route aria-hidden="true" size={18} />
          <p>No trajectory records yet</p>
          <span>Turn structure appears here as the run journal grows.</span>
        </div>
      ) : turns.length === 0 && conversationOnly ? (
        <div className="empty-state trajectory-empty-state" role="status">
          <MessageSquare aria-hidden="true" size={18} />
          <p>No conversation records</p>
          <span>Tool, graph, and safety records are hidden by the conversation filter.</span>
        </div>
      ) : turns.length === 0 ? (
        <div className="empty-state trajectory-empty-state" role="status">
          <Search aria-hidden="true" size={18} />
          <p>No records match “{query}”</p>
          <span>Clear the filter to see all {model.stats.cells} records.</span>
        </div>
      ) : (
        <div className="trajectory-ledger" role="group" aria-label="Trajectory records">
          {turns.map((turn) => (
            <TrajectoryTurnBlock
              key={turn.id}
              turn={turn}
              baseId={baseId}
              isOpen={isOpen}
              onToggle={toggle}
              collapsed={isTurnCollapsed(turn.turn)}
              onToggleCollapsed={() => toggleTurn(turn.turn)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrajectoryTiming({
  model,
  overview,
  shown,
}: {
  model: TrajectoryModel;
  overview: TrajectoryOverview;
  shown: number;
}) {
  const { stats } = model;
  const span = overview.durationAvailable ? fmtDuration(overview.spanSeconds * 1000) : "";
  const label = [
    `${stats.turns} ${stats.turns === 1 ? "turn" : "turns"}`,
    shown === stats.cells ? `${stats.cells} records` : `${shown} of ${stats.cells} records`,
    span && `${span} observed`,
    stats.errors > 0 && `${stats.errors} failed`,
  ]
    .filter(Boolean)
    .join(" · ");
  const segments = overview.boundaries.map((boundary, index) => {
    const next = overview.boundaries[index + 1]?.start ?? 1;
    return { turn: boundary.turn, start: boundary.start, width: Math.max(0, next - boundary.start) };
  });
  const axisMiddle =
    overview.resolution === "duration" ? `${span} observed` : overview.durationAvailable
      ? "equal width"
      : "emission order";

  return (
    <details className="trajectory-timing">
      <summary className="trajectory-timing-summary">
        <ChevronRight className="trajectory-timing-chevron" aria-hidden="true" size={13} />
        <span className="trajectory-timing-meta">{label}</span>
      </summary>
      <div className="trajectory-timing-body">
        {!overview.durationAvailable && (
          <p className="trajectory-timing-note">
            Timestamps are missing from these records, so the overview is ordered rather than timed.
          </p>
        )}
        <div className="trajectory-lanes" aria-hidden="true">
          <div className="trajectory-lane-labels">
            {LANES.map((lane) => (
              <span className="trajectory-lane-label" key={lane.id}>
                {lane.label}
              </span>
            ))}
          </div>
          <div className="trajectory-lane-tracks">
            {overview.boundaries
              .filter((boundary) => boundary.turn > 1)
              .map((boundary) => (
                <span
                  key={`boundary-${boundary.turn}`}
                  className="trajectory-turn-line"
                  style={{ left: `${boundary.start * 100}%` }}
                />
              ))}
            {LANES.map((lane) => (
              <div className="trajectory-lane-track" key={lane.id} data-lane={lane.id}>
                {overview.lanes[lane.id].map((span) => (
                  <span
                    key={span.cellId}
                    className={cn(
                      "trajectory-span",
                      span.isError && "is-error",
                      span.pending && "is-pending",
                    )}
                    data-kind={span.kind}
                    data-turn={span.turn}
                    style={{ left: `${span.start * 100}%`, width: `${span.width * 100}%` }}
                    title={span.title}
                  />
                ))}
              </div>
            ))}
            <div className="trajectory-turn-strip">
              {segments.map((segment) => (
                <span
                  className="trajectory-turn-segment"
                  key={`segment-${segment.turn}`}
                  data-turn={segment.turn}
                  style={{ left: `${segment.start * 100}%`, width: `${segment.width * 100}%` }}
                >
                  T{segment.turn}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="trajectory-axis">
          <span>{overview.startedAt != null ? fmtClock(overview.startedAt) : "—"}</span>
          <span>{axisMiddle}</span>
          <span>{overview.endedAt != null ? fmtClock(overview.endedAt) : "—"}</span>
        </p>
        <table className="trajectory-timing-table">
          <caption className="trajectory-timing-caption">Turn timing and token usage</caption>
          <thead>
            <tr>
              <th scope="col">Turn</th>
              <th scope="col">Started</th>
              <th scope="col">Time</th>
              <th scope="col">In/Out/Think</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {model.turns.map((turn) => (
              <tr key={turn.id} data-status={turn.status}>
                <th scope="row">T{turn.turn}</th>
                <td>{turn.startedAt != null ? fmtClock(turn.startedAt) : "—"}</td>
                <td>{turn.pending ? "running" : fmtDuration(turn.durationMs)}</td>
                <td title={usageTitle(turn.usage)}>{tokenSummary(turn.usage)}</td>
                <td>{STATUS_STYLE[turn.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function TrajectoryTurnBlock({
  turn,
  baseId,
  isOpen,
  onToggle,
  collapsed,
  onToggleCollapsed,
}: {
  turn: TrajectoryTurn;
  baseId: string;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const headingId = `${baseId}-turn-${turn.turn}`;
  const bodyId = `${baseId}-turn-body-${turn.turn}`;
  const settled = turn.nodes.filter((node) => node.status !== "observed");
  const chips = settled.slice(0, NODE_CHIP_LIMIT);
  const hiddenNodes = settled.length - chips.length;
  const usage = usageLine(turn.usage);

  return (
    <section className="trajectory-turn" aria-labelledby={headingId}>
      <header className="trajectory-turn-header">
        <button
          type="button"
          className="trajectory-turn-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={`${collapsed ? "Expand" : "Collapse"} turn ${turn.turn}`}
          title={collapsed ? `Expand turn ${turn.turn}` : `Collapse turn ${turn.turn}`}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" size={14} />
          ) : (
            <ChevronDown aria-hidden="true" size={14} />
          )}
        </button>
        <h3 id={headingId}>Turn {turn.turn}</h3>
        {turn.label && <span className="trajectory-turn-label">{turn.label}</span>}
        <span className={cn("trajectory-turn-duration", turn.pending && "is-pending")}>
          {turn.pending ? "in flight" : fmtDuration(turn.durationMs)}
        </span>
      </header>
      <p className="trajectory-turn-meta">
        <span className="trajectory-status" data-status={turn.status}>
          {STATUS_STYLE[turn.status].label}
        </span>
        {turn.model && <span className="trajectory-turn-fact">{turn.model}</span>}
        {usage && <span className="trajectory-turn-fact">{usage}</span>}
        <span className="trajectory-turn-fact">
          {turn.cells.length} {turn.cells.length === 1 ? "record" : "records"}
        </span>
      </p>
      {!collapsed && chips.length > 0 && (
        <p className="trajectory-turn-nodes">
          {chips.map((node) => (
            <span className="trajectory-node" data-status={node.status} key={node.node}>
              <span className="trajectory-node-name">{node.node}</span>
              <span className="trajectory-node-state">{STATUS_STYLE[node.status].label}</span>
            </span>
          ))}
          {hiddenNodes > 0 && <span className="trajectory-node is-rest">+{hiddenNodes} more</span>}
        </p>
      )}
      {!collapsed && turn.akgPath.length > 0 && (
        <p className="trajectory-path" title={turn.akgPath.join(" → ")}>
          <span className="trajectory-path-label">AKG</span>
          <PathTrail path={turn.akgPath} />
        </p>
      )}
      <ol className="trajectory-cells" id={bodyId} hidden={collapsed}>
        {turn.cells.map((cell) => (
          <TrajectoryCellRow
            key={cell.id}
            cell={cell}
            open={isOpen(cell.id)}
            detailId={`${baseId}-cell-${cell.index}`}
            onToggle={() => onToggle(cell.id)}
          />
        ))}
      </ol>
    </section>
  );
}

function PathTrail({ path }: { path: string[] }) {
  return (
    <span className="trajectory-path-trail">
      {path.map((step, index) => (
        <Fragment key={`${step}-${index}`}>
          {index > 0 && (
            <span className="trajectory-path-separator" aria-hidden="true">
              →
            </span>
          )}
          <span className="trajectory-path-step">{step}</span>
        </Fragment>
      ))}
    </span>
  );
}

function TrajectoryCellRow({
  cell,
  open,
  detailId,
  onToggle,
}: {
  cell: TrajectoryCell;
  open: boolean;
  detailId: string;
  onToggle: () => void;
}) {
  const style = KIND_STYLE[cell.kind];
  // Paired calls usually carry payload on the opening record, so show the
  // latest record that actually has one instead of assuming the last does.
  const payload = [...cell.records]
    .reverse()
    .find((record) => Object.keys(record.data).length > 0);

  return (
    <li
      className={cn("trajectory-cell", cell.isError && "is-error", cell.pending && "is-pending")}
    >
      <button
        type="button"
        className="trajectory-cell-toggle"
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        onClick={onToggle}
      >
        <span className="trajectory-cell-disclosure">
          {open ? (
            <ChevronDown aria-hidden="true" size={14} />
          ) : (
            <ChevronRight aria-hidden="true" size={14} />
          )}
        </span>
        <span className="trajectory-cell-index">#{cell.index}</span>
        <Badge variant={style.variant} className="trajectory-cell-kind">
          {style.label}
        </Badge>
        <span className="trajectory-cell-body">
          <span className="trajectory-cell-type">{cell.eventType}</span>
          {cell.args && <span className="trajectory-cell-args">{cell.args}</span>}
        </span>
        <span className="trajectory-cell-duration">
          {cell.pending ? "running" : fmtDuration(cell.durationMs)}
        </span>
      </button>
      {open && (
        <div id={detailId} className="trajectory-cell-detail">
          <p className="trajectory-cell-meta">
            <span className="trajectory-status" data-status={cell.status}>
              {STATUS_STYLE[cell.status].label}
            </span>
            {cell.outcome && <span>Result: {cell.outcome}</span>}
            {cell.node && <span title={cell.node}>Node: {cell.node}</span>}
            {cell.method && <span title={cell.method}>Method: {cell.method}</span>}
            {cell.toolName && <span>Tool: {cell.toolName}</span>}
            {cell.model && <span>Model: {cell.model}</span>}
          </p>
          <TrajectoryFacts cell={cell} />
          {cell.akgPath.length > 0 && (
            <p className="trajectory-path" title={cell.akgPath.join(" → ")}>
              <span className="trajectory-path-label">AKG</span>
              <PathTrail path={cell.akgPath} />
            </p>
          )}
          {cell.inputText && <DetailBlock label="Request" text={cell.inputText} />}
          {cell.reasoning.trace && (
            <DetailBlock label="Reasoning trace" text={cell.reasoning.trace} tone="thinking" />
          )}
          {cell.reasoning.summary && (
            <DetailBlock label="Reasoning summary" text={cell.reasoning.summary} tone="thinking" />
          )}
          {cell.outputText && <DetailBlock label="Response" text={cell.outputText} />}
          <ol className="trajectory-record-list">
            {cell.records.map((record) => {
              const date = record.timestamp != null ? new Date(record.timestamp * 1000) : null;
              return (
                <li className="trajectory-record" key={record.index}>
                  <span className="trajectory-record-index">#{record.index}</span>
                  <time
                    className="trajectory-record-time"
                    dateTime={
                      date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined
                    }
                  >
                    {fmtClock(record.timestamp)}
                  </time>
                  <span className="trajectory-record-type">{record.eventType}</span>
                  {record.message && (
                    <span className="trajectory-record-message">{record.message}</span>
                  )}
                </li>
              );
            })}
          </ol>
          {payload && <DetailBlock label="Raw JSON" text={prettyJson(payload.data)} />}
        </div>
      )}
    </li>
  );
}

function DetailBlock({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone?: "thinking";
}) {
  return (
    <details className={cn("trajectory-block", tone === "thinking" && "is-thinking")}>
      <summary className="trajectory-block-summary">
        <ChevronRight className="trajectory-block-chevron" aria-hidden="true" size={12} />
        <span className="trajectory-block-label">{label}</span>
        <span className="trajectory-block-size">{fmtNumber(text.length)} chars</span>
      </summary>
      <pre className="trajectory-block-body">{text}</pre>
    </details>
  );
}
