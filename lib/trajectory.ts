import type { RunEvent } from "@/lib/schemas";
import { asNum, asStr, truncate } from "@/lib/formatters";

/**
 * Trajectory projection of the redacted runtime journal.
 *
 * The projection is pure and deterministic: the same event window always yields
 * the same turns, cells, and timing overview. Nothing here launches, cancels, or
 * mutates a TESIS run; it only re-shapes records the observer already received.
 *
 * Vocabulary (mirrors the shape of a harness trajectory view, not its code):
 * - record: one journal event, identified by its 1-based position in the window
 * - cell: one row of the ledger; start/finish records of the same call collapse
 *   into a single cell so the call keeps its measured duration
 * - turn: a slice of the ledger delimited by a planning marker
 * - span: a cell placed on the timing overview, either by measured duration or
 *   by emission order when timestamps are missing
 */

export type TrajectoryKind = "system" | "user" | "context" | "model" | "tool" | "safety";

export type TrajectoryLane = "input" | "model" | "tools";

export type TrajectoryResolution = "duration" | "sequence";

export interface TrajectoryRecord {
  /** 1-based position in the visible journal window. */
  index: number;
  eventType: string;
  timestamp: number | null;
  message: string | null;
  data: Record<string, unknown>;
}

export interface TrajectoryCell {
  id: string;
  /** 1-based position of the first record in the cell. */
  index: number;
  /** 1-based turn number; assigned during grouping. */
  turn: number;
  kind: TrajectoryKind;
  lane: TrajectoryLane;
  eventType: string;
  /** Event type that closed the call, when a matching finish record arrived. */
  outcome: string | null;
  /** Compact single-line argument preview. */
  args: string;
  node: string | null;
  method: string | null;
  startedAt: number | null;
  durationMs: number | null;
  /** True when a start record never received a matching finish record. */
  pending: boolean;
  isError: boolean;
  tokens: number | null;
  records: TrajectoryRecord[];
}

export interface TrajectoryTurn {
  id: string;
  turn: number;
  label: string;
  startedAt: number | null;
  durationMs: number | null;
  pending: boolean;
  cells: TrajectoryCell[];
}

export interface TrajectorySpan {
  cellId: string;
  turn: number;
  lane: TrajectoryLane;
  /** Fraction of the overview width, 0..1. */
  start: number;
  /** Fraction of the overview width, 0..1. Zero for point records. */
  width: number;
  isError: boolean;
  pending: boolean;
  title: string;
}

export interface TrajectoryBoundary {
  turn: number;
  /** Fraction of the overview width, 0..1. */
  start: number;
}

export interface TrajectoryOverview {
  resolution: TrajectoryResolution;
  /** False when records carry no usable timestamps; the overview then uses order. */
  durationAvailable: boolean;
  /** Seconds covered by the window, 0 when unavailable. */
  spanSeconds: number;
  lanes: Record<TrajectoryLane, TrajectorySpan[]>;
  boundaries: TrajectoryBoundary[];
}

export interface TrajectoryStats {
  turns: number;
  cells: number;
  modelCalls: number;
  toolCalls: number;
  safetyEvents: number;
  errors: number;
  tokens: number | null;
}

export interface TrajectoryModel {
  turns: TrajectoryTurn[];
  overview: TrajectoryOverview;
  stats: TrajectoryStats;
}

/* -------------------------------------------------------------------------- */
/* Classification                                                              */
/* -------------------------------------------------------------------------- */

const SAFETY_PATTERN =
  /containment|guardrail|blocked|violation|invalid_json|parse_error|refus|\bfallback\b/i;
const MODEL_PATTERN = /(^|\.)(llm|model)(\.|$)|chat\.(assistant|stream)/i;
const SYSTEM_PATTERN = /^run\.|(^|\.)system(\.|$)|(^|\.)prompt$/i;
const USER_PATTERN = /chat\.user|(^|\.)user(\.|$)/i;
const CONTEXT_PATTERN =
  /(^|\.)(graph\.state|chain\.transition|method\.selected|iteration|state\.(snapshot|change))/i;
const CHUNK_PATTERN = /(^|\.)(stream|token|delta|partial)$/i;
const START_PATTERN = /\.(started|start|attempt|request|queued)$/i;
const FINISH_PATTERN =
  /\.(completed|complete|finished|success|succeeded|failed|failure|error|confirmed|rejected|response|result|blocked)$/i;
const FAILURE_PATTERN = /error|fail|reject|blocked|invalid|violation|refus/i;
/** Event types that open a new turn. */
const TURN_PATTERN =
  /^(llm\.(started|request)|model\.request|method\.selected|iteration\.|turn\.)/i;

function classify(event: RunEvent): { kind: TrajectoryKind; lane: TrajectoryLane } {
  const type = event.event_type;
  if (SAFETY_PATTERN.test(type)) return { kind: "safety", lane: "tools" };
  if (MODEL_PATTERN.test(type)) return { kind: "model", lane: "model" };
  if (SYSTEM_PATTERN.test(type)) return { kind: "system", lane: "input" };
  const data = event.data ?? {};
  if (USER_PATTERN.test(type) || Array.isArray(data.prompts)) {
    return { kind: "user", lane: "input" };
  }
  if (CONTEXT_PATTERN.test(type)) return { kind: "context", lane: "input" };
  return { kind: "tool", lane: "tools" };
}

/** Calls whose start and finish records should collapse into one ledger row. */
function pairsRecords(kind: TrajectoryKind, eventType: string): boolean {
  if (eventType.toLowerCase().startsWith("run.")) return false;
  return kind === "model" || kind === "tool" || kind === "safety";
}

function namespaceOf(eventType: string): string {
  const dot = eventType.lastIndexOf(".");
  return (dot > 0 ? eventType.slice(0, dot) : eventType).toLowerCase();
}

function isFailure(event: RunEvent): boolean {
  if (FAILURE_PATTERN.test(event.event_type)) return true;
  const data = event.data ?? {};
  if (data.ok === false) return true;
  const status = asStr(data, "status");
  return status != null && /fail|error|reject|blocked|invalid/i.test(status);
}

/* -------------------------------------------------------------------------- */
/* Cell construction                                                           */
/* -------------------------------------------------------------------------- */

const ARG_KEY_PRIORITY = [
  "candidate",
  "method",
  "url",
  "payload",
  "status",
  "decision",
  "reason",
  "node",
  "error",
  "message",
];

function clip(value: unknown, max = 48): unknown {
  if (typeof value === "string") return truncate(value.replace(/\s+/g, " ").trim(), max);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

/** `read {"file_path": "..."}` style preview, capped and deterministic. */
function compactArgs(record: TrajectoryRecord): string {
  if (record.message) {
    const message = record.message.replace(/\s+/g, " ").trim();
    if (message) return truncate(message, 96);
  }
  const keys = Object.keys(record.data);
  const ordered = [
    ...ARG_KEY_PRIORITY.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !ARG_KEY_PRIORITY.includes(key)).sort(),
  ];
  const picked: Record<string, unknown> = {};
  for (const key of ordered) {
    if (Object.keys(picked).length >= 3) break;
    const value = clip(record.data[key]);
    if (value !== undefined && value !== "") picked[key] = value;
  }
  const json = JSON.stringify(picked);
  return json === "{}" ? "" : truncate(json, 96);
}

function toRecord(event: RunEvent, order: number): TrajectoryRecord {
  const timestamp =
    typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
      ? event.timestamp
      : null;
  return {
    index: order + 1,
    eventType: event.event_type,
    timestamp,
    message: event.message ?? null,
    data: event.data ?? {},
  };
}

function callIdOf(event: RunEvent): string | null {
  const fromData = asStr(event.data ?? {}, "call_id") ?? asStr(event.data ?? {}, "callId");
  if (fromData) return fromData;
  const raw = (event as { call_id?: unknown }).call_id;
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

interface OpenCall {
  cellIndex: number;
  namespace: string;
  callId: string | null;
  node: string | null;
  method: string | null;
  kind: TrajectoryKind;
}

function makeCell(event: RunEvent, record: TrajectoryRecord): TrajectoryCell {
  const { kind, lane } = classify(event);
  const data = event.data ?? {};
  return {
    id: `cell-${record.index}`,
    index: record.index,
    turn: 1,
    kind,
    lane,
    eventType: event.event_type,
    outcome: null,
    args: compactArgs(record),
    node: event.node ?? null,
    method: event.method ?? null,
    startedAt: record.timestamp,
    durationMs: null,
    pending: false,
    isError: isFailure(event),
    tokens: asNum(data, "total_tokens") ?? asNum(data, "tokens") ?? asNum(data, "completion_tokens"),
    records: [record],
  };
}

function buildCells(events: RunEvent[]): TrajectoryCell[] {
  const cells: TrajectoryCell[] = [];
  const open: OpenCall[] = [];

  events.forEach((event, order) => {
    const record = toRecord(event, order);
    const kind = classify(event).kind;
    const last = cells[cells.length - 1];

    // Streamed output continues the previous model row instead of adding rows.
    if (CHUNK_PATTERN.test(event.event_type) && last && last.kind === "model") {
      last.records.push(record);
      last.startedAt = last.startedAt ?? record.timestamp;
      return;
    }

    const namespace = namespaceOf(event.event_type);
    const callId = callIdOf(event);

    if (pairsRecords(kind, event.event_type) && START_PATTERN.test(event.event_type)) {
      cells.push(makeCell(event, record));
      open.push({
        cellIndex: cells.length - 1,
        namespace,
        callId,
        node: event.node ?? null,
        method: event.method ?? null,
        kind,
      });
      return;
    }

    if (pairsRecords(kind, event.event_type) && FINISH_PATTERN.test(event.event_type)) {
      // Most recent matching start wins, so parallel calls keep their own rows.
      for (let i = open.length - 1; i >= 0; i -= 1) {
        const candidate = open[i];
        const callsMatch = candidate.callId != null && callId != null
          ? candidate.callId === callId
          : true;
        const scopeMatches =
          (candidate.node == null || event.node == null || candidate.node === event.node) &&
          (candidate.method == null || event.method == null || candidate.method === event.method);
        if (
          candidate.namespace === namespace &&
          candidate.kind === kind &&
          callsMatch &&
          scopeMatches
        ) {
          const target = cells[candidate.cellIndex];
          target.records.push(record);
          target.outcome = event.event_type;
          target.pending = false;
          target.isError = target.isError || isFailure(event);
          if (target.startedAt != null && record.timestamp != null) {
            target.durationMs = Math.max(
              0,
              Math.round((record.timestamp - target.startedAt) * 1000),
            );
          }
          const finishTokens =
            asNum(event.data ?? {}, "total_tokens") ??
            asNum(event.data ?? {}, "tokens") ??
            asNum(event.data ?? {}, "completion_tokens");
          target.tokens = target.tokens ?? finishTokens;
          open.splice(i, 1);
          return;
        }
      }
    }

    cells.push(makeCell(event, record));
  });

  for (const call of open) cells[call.cellIndex].pending = true;
  return cells;
}

/* -------------------------------------------------------------------------- */
/* Turns                                                                       */
/* -------------------------------------------------------------------------- */

function timestampOf(cell: TrajectoryCell): number | null {
  return cell.startedAt;
}

function endOf(cell: TrajectoryCell): number | null {
  if (cell.startedAt == null) return null;
  return cell.startedAt + (cell.durationMs ?? 0) / 1000;
}

function observedSpan(cells: TrajectoryCell[]): number | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const cell of cells) {
    const from = timestampOf(cell);
    const to = endOf(cell);
    if (from != null && (start == null || from < start)) start = from;
    if (to != null && (end == null || to > end)) end = to;
  }
  if (start == null || end == null || end <= start) return null;
  return Math.round((end - start) * 1000);
}

function labelOf(cells: TrajectoryCell[]): string {
  for (const cell of cells) {
    if (cell.kind === "context" && (cell.method || cell.node)) {
      return cell.method ?? cell.node ?? "";
    }
  }
  for (const cell of cells) {
    if (cell.method) return cell.method;
  }
  for (const cell of cells) {
    if (cell.node) return cell.node;
  }
  return "";
}

function buildTurns(cells: TrajectoryCell[]): TrajectoryTurn[] {
  const groups: TrajectoryCell[][] = [];
  let hasBody = false;

  for (const cell of cells) {
    const current = groups[groups.length - 1];
    if (!current) {
      groups.push([cell]);
      hasBody = !TURN_PATTERN.test(cell.eventType);
      continue;
    }
    if (TURN_PATTERN.test(cell.eventType) && hasBody) {
      groups.push([cell]);
      hasBody = false;
    } else {
      current.push(cell);
      if (!TURN_PATTERN.test(cell.eventType)) hasBody = true;
    }
  }

  return groups.map((group, index) => {
    const turn = index + 1;
    for (const cell of group) cell.turn = turn;
    return {
      id: `turn-${turn}-${group[0].id}`,
      turn,
      label: labelOf(group),
      startedAt: group.find((cell) => cell.startedAt != null)?.startedAt ?? null,
      durationMs: observedSpan(group),
      pending: group.some((cell) => cell.pending),
      cells: group,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Timing overview                                                             */
/* -------------------------------------------------------------------------- */

function emptyLanes(): Record<TrajectoryLane, TrajectorySpan[]> {
  return { input: [], model: [], tools: [] };
}

function spanTitle(cell: TrajectoryCell): string {
  const parts = [`Turn ${cell.turn}`, `${cell.kind} ${cell.eventType}`];
  if (cell.args) parts.push(cell.args);
  if (cell.outcome) parts.push(`→ ${cell.outcome}`);
  parts.push(
    cell.durationMs != null
      ? `${(cell.durationMs / 1000).toFixed(2)}s`
      : cell.pending
        ? "no result recorded yet"
        : "duration not recorded",
  );
  return parts.join(" · ");
}

function buildOverview(turns: TrajectoryTurn[], cells: TrajectoryCell[]): TrajectoryOverview {
  const total = cells.length;
  let start: number | null = null;
  let end: number | null = null;
  for (const cell of cells) {
    const from = timestampOf(cell);
    const to = endOf(cell);
    if (from != null && (start == null || from < start)) start = from;
    if (to != null && (end == null || to > end)) end = to;
  }
  const spanSeconds = start != null && end != null && end > start ? end - start : 0;
  const origin = start;
  const durationAvailable = spanSeconds > 0 && origin != null;
  const resolution: TrajectoryResolution = durationAvailable ? "duration" : "sequence";

  const lanes = emptyLanes();
  const order = new Map<string, number>();
  cells.forEach((cell, index) => order.set(cell.id, index));

  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const byOrder = (position: number) => (total > 0 ? position / total : 0);
  const byDuration = (seconds: number | null) =>
    durationAvailable && seconds != null && origin != null ? (seconds - origin) / spanSeconds : null;

  for (const cell of cells) {
    const position = order.get(cell.id) ?? 0;
    const startFraction = byDuration(cell.startedAt) ?? byOrder(position);
    const measuredWidth = byDuration(cell.startedAt) == null
      ? null
      : Math.max(0, (cell.durationMs ?? 0) / 1000 / spanSeconds);
    const widthFraction =
      measuredWidth == null ? byOrder(1) : Math.max(0, Math.min(1 - startFraction, measuredWidth));
    lanes[cell.lane].push({
      cellId: cell.id,
      turn: cell.turn,
      lane: cell.lane,
      start: clamp(startFraction),
      width: widthFraction,
      isError: cell.isError,
      pending: cell.pending,
      title: spanTitle(cell),
    });
  }

  const boundaries: TrajectoryBoundary[] = [];
  for (const turn of turns) {
    const first = turn.cells[0];
    if (!first) continue;
    const position = order.get(first.id) ?? 0;
    const fraction = byDuration(first.startedAt) ?? byOrder(position);
    boundaries.push({ turn: turn.turn, start: clamp(fraction) });
  }

  return { resolution, durationAvailable, spanSeconds, lanes, boundaries };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export function deriveTrajectory(events: RunEvent[]): TrajectoryModel {
  const cells = buildCells(events);
  const turns = buildTurns(cells);
  const overview = buildOverview(turns, cells);

  const tokens = cells.reduce<number | null>((sum, cell) => {
    if (cell.tokens == null) return sum;
    return (sum ?? 0) + cell.tokens;
  }, null);

  return {
    turns,
    overview,
    stats: {
      turns: turns.length,
      cells: cells.length,
      modelCalls: cells.filter((cell) => cell.kind === "model").length,
      toolCalls: cells.filter((cell) => cell.kind === "tool").length,
      safetyEvents: cells.filter((cell) => cell.kind === "safety").length,
      errors: cells.filter((cell) => cell.isError).length,
      tokens,
    },
  };
}

/** Case-insensitive ledger search across cell labels, arguments, and record types. */
export function filterTrajectoryTurns(turns: TrajectoryTurn[], query: string): TrajectoryTurn[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return turns;
  return turns
    .map((turn) => ({
      ...turn,
      cells: turn.cells.filter((cell) => cellMatches(cell, needle)),
    }))
    .filter((turn) => turn.cells.length > 0);
}

function cellMatches(cell: TrajectoryCell, needle: string): boolean {
  const haystack = [
    cell.kind,
    cell.eventType,
    cell.outcome ?? "",
    cell.args,
    cell.node ?? "",
    cell.method ?? "",
    cell.records.map((record) => record.eventType).join(" "),
    cell.records.map((record) => record.message ?? "").join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
