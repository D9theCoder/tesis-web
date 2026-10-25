"use client";

import { useId, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Route,
  Search,
} from "lucide-react";
import type { TrajectoryCell, TrajectoryKind, TrajectoryModel, TrajectoryTurn } from "@/lib/trajectory";
import { Badge, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { filterTrajectoryTurns } from "@/lib/trajectory";
import { fmtClock, fmtDuration, prettyJson } from "@/lib/formatters";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const KIND_STYLE: Record<TrajectoryKind, { label: string; variant: BadgeVariant }> = {
  system: { label: "System", variant: "violet" },
  user: { label: "User", variant: "cyan" },
  context: { label: "Context", variant: "default" },
  model: { label: "Model", variant: "lime" },
  tool: { label: "Tool", variant: "amber" },
  safety: { label: "Safety", variant: "red" },
};

const LANES = [
  { id: "input", label: "Input" },
  { id: "model", label: "Model" },
  { id: "tools", label: "Tools" },
] as const;

export function TrajectoryView({ model }: { model: TrajectoryModel }) {
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useState<boolean | null>(null);
  const baseId = useId();

  const turns = useMemo(() => filterTrajectoryTurns(model.turns, query), [model.turns, query]);
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

  return (
    <div className="trajectory">
      <div className="trajectory-toolbar">
        <label className="search-control trajectory-search">
          <Search aria-hidden="true" size={15} />
          <input
            className="form-control"
            type="search"
            value={query}
            placeholder="Filter events, nodes, methods…"
            aria-label="Filter trajectory records"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
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

      <TrajectoryTiming model={model} shown={visible.length} />

      {model.turns.length === 0 ? (
        <div className="empty-state conversation-empty-state" role="status">
          <Route aria-hidden="true" size={18} />
          <p>No trajectory records yet</p>
          <span>Turn structure appears here as the run journal grows.</span>
        </div>
      ) : turns.length === 0 ? (
        <div className="empty-state conversation-empty-state" role="status">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrajectoryTiming({ model, shown }: { model: TrajectoryModel; shown: number }) {
  const { overview, stats } = model;
  const span = overview.durationAvailable ? fmtDuration(overview.spanSeconds * 1000) : "";
  const label = [
    `${stats.turns} ${stats.turns === 1 ? "turn" : "turns"}`,
    shown === stats.cells ? `${stats.cells} records` : `${shown} of ${stats.cells} records`,
    span && `${span} observed`,
    stats.errors > 0 && `${stats.errors} failed`,
  ]
    .filter(Boolean)
    .join(" · ");

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
          {LANES.map((lane) => {
            const spans = overview.lanes[lane.id];
            return (
              <div className="trajectory-lane" key={lane.id}>
                <span className="trajectory-lane-label">{lane.label}</span>
                <span
                  className={cn("trajectory-lane-track", spans.length === 0 && "is-empty")}
                  data-resolution={overview.resolution}
                >
                  {spans.map((span) => (
                    <span
                      key={span.cellId}
                      className={cn(
                        "trajectory-span",
                        span.isError && "is-error",
                        span.pending && "is-pending",
                      )}
                      style={{ left: `${span.start * 100}%`, width: `${span.width * 100}%` }}
                      title={span.title}
                    />
                  ))}
                  {overview.boundaries
                    .filter((boundary) => boundary.turn > 1)
                    .map((boundary) => (
                      <span
                        key={`boundary-${boundary.turn}`}
                        className="trajectory-boundary"
                        style={{ left: `${boundary.start * 100}%` }}
                      />
                    ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function TrajectoryTurnBlock({
  turn,
  baseId,
  isOpen,
  onToggle,
}: {
  turn: TrajectoryTurn;
  baseId: string;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  const headingId = `${baseId}-turn-${turn.turn}`;
  return (
    <section className="trajectory-turn" aria-labelledby={headingId}>
      <header className="trajectory-turn-header">
        <h3 id={headingId}>Turn {turn.turn}</h3>
        {turn.label && <span className="trajectory-turn-label">{turn.label}</span>}
        <span className={cn("trajectory-turn-duration", turn.pending && "is-pending")}>
          {turn.pending ? "in flight" : fmtDuration(turn.durationMs)}
        </span>
      </header>
      <ol className="trajectory-cells">
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
  const last = cell.records[cell.records.length - 1];
  const hasData = Boolean(last && Object.keys(last.data).length > 0);

  return (
    <li className={cn("trajectory-cell", cell.isError && "is-error", cell.pending && "is-pending")}>
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
            {cell.outcome && <span>Result: {cell.outcome}</span>}
            {cell.node && <span title={cell.node}>Node: {cell.node}</span>}
            {cell.method && <span title={cell.method}>Method: {cell.method}</span>}
          </p>
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
          {hasData && <pre className="conversation-entry-data">{prettyJson(last.data)}</pre>}
        </div>
      )}
    </li>
  );
}
