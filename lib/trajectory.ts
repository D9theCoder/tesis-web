import type { RunEvent } from "@/lib/schemas";
import { asNum, asStr, extractText, truncate } from "@/lib/formatters";

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
 *
 * Each cell also projects the payload facts a harness trajectory shows for a
 * call: the request text the model received, its reasoning trace and summary
 * (with the metadata field each came from), its response text, the tool name,
 * the AKG path, token usage, first-token latency, and a derived status. Every
 * field is optional and stays `null` when the journal never carried it, so the
 * view states "not recorded" instead of guessing.
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

/** Outcome a cell or turn reached, derived from its event types and payload. */
export type TrajectoryStatus = "completed" | "failed" | "pending" | "observed";

/** Token facts reported by the journal for one call, when it reported any. */
export interface TrajectoryUsage {
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cached: number | null;
  total: number | null;
}

/** Timing facts a harness trajectory shows per call; each stays null when unrecorded. */
export interface TrajectoryTiming {
  startedAt: number | null;
  /** Timestamp of the first streamed token, when the journal recorded chunks. */
  firstTokenAt: number | null;
  completedAt: number | null;
  /** Start to first token, in milliseconds. */
  ttftMs: number | null;
  /** First token to completion, in milliseconds. */
  decodeMs: number | null;
  tokensPerSecond: number | null;
}

/**
 * Provider-returned reasoning, kept as two independent representations.
 *
 * TESIS retains a pure trace (`reasoning_trace`) and, when the provider exposes
 * one instead, a summary of its reasoning (`reasoning_summary`, usually OpenAI
 * Codex auth). Each text carries the metadata field it arrived in, and every
 * value stays null when the provider returned nothing — the view never infers
 * reasoning from an answer or a token count.
 */
export interface TrajectoryReasoning {
  trace: string | null;
  /** Metadata field the trace came from, e.g. `additional_kwargs.reasoning_content`. */
  traceSource: string | null;
  summary: string | null;
  /** Metadata field the summary came from, e.g. `additional_kwargs.reasoning`. */
  summarySource: string | null;
}

/** Status reached by one AKG node inside a turn. */
export interface TrajectoryNodeState {
  node: string;
  method: string | null;
  status: TrajectoryStatus;
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
  /** Full request text the model received, when the journal carried it. */
  inputText: string | null;
  /** Full assistant or tool output text, when the journal carried it. */
  outputText: string | null;
  /** Provider reasoning trace and summary, with the field each came from. */
  reasoning: TrajectoryReasoning;
  /** Model identifier reported for this call. */
  model: string | null;
  /** Tool name reported for this call, when it is not just the method. */
  toolName: string | null;
  /** AKG path recorded with the latest record that carried one. */
  akgPath: string[];
  status: TrajectoryStatus;
  usage: TrajectoryUsage;
  timing: TrajectoryTiming;
  records: TrajectoryRecord[];
}

export interface TrajectoryTurn {
  id: string;
  turn: number;
  label: string;
  startedAt: number | null;
  durationMs: number | null;
  pending: boolean;
  status: TrajectoryStatus;
  /** Node states reached in this turn, in journal order. */
  nodes: TrajectoryNodeState[];
  akgPath: string[];
  model: string | null;
  usage: TrajectoryUsage;
  cells: TrajectoryCell[];
}

/** Horizontal projection: measured time, or equal-width operations in order. */
export type TrajectoryScale = "duration" | "equal";

export interface TrajectorySpan {
  cellId: string;
  turn: number;
  lane: TrajectoryLane;
  kind: TrajectoryKind;
  /** Event type, used for the block tooltip and legend. */
  label: string;
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
  /** Projection actually used: "sequence" whenever widths are equal or unusable. */
  resolution: TrajectoryResolution;
  /** Projection requested by the viewer. */
  scale: TrajectoryScale;
  /** False when records carry no usable timestamps; the overview then uses order. */
  durationAvailable: boolean;
  /** Seconds covered by the window, 0 when unavailable. */
  spanSeconds: number;
  /** First and last observed timestamps (epoch seconds), for the axis labels. */
  startedAt: number | null;
  endedAt: number | null;
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
  /** Distinct AKG nodes observed in the window. */
  nodes: number;
  tokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
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
/* Payload facts                                                               */
/* -------------------------------------------------------------------------- */

/** Journal keys that carry the request the model received. */
const REQUEST_KEYS = [
  "prompts",
  "prompt",
  "system_prompt",
  "systemPrompt",
  "messages",
  "request_text",
  "input",
];
/** Journal keys that carry assistant or tool output text. */
const OUTPUT_KEYS = [
  "response_text",
  "responseText",
  "response",
  "content",
  "output_text",
  "output",
  "completion",
  "text",
];
/**
 * Journal keys that carry the provider's pure chain-of-thought text. The first
 * is the TESIS evidence field; the rest are provider-native spellings kept for
 * gateways that forward them directly.
 */
const REASONING_TRACE_KEYS = [
  "reasoning_trace",
  "reasoningTrace",
  "reasoning_content",
  "reasoningContent",
  "reasoning_text",
  "reasoning",
  "thinking_text",
  "thinking",
  "analysis",
  "thought",
];
/** Journal keys that name the metadata field each reasoning text arrived in. */
const REASONING_TRACE_SOURCE_KEYS = ["reasoning_trace_source", "reasoningTraceSource"];
const REASONING_SUMMARY_KEYS = ["reasoning_summary", "reasoningSummary"];
const REASONING_SUMMARY_SOURCE_KEYS = ["reasoning_summary_source", "reasoningSummarySource"];
const MODEL_KEYS = ["model", "model_name", "modelName", "model_id", "modelId"];
const TOOL_KEYS = ["tool", "tool_name", "toolName"];
const PATH_KEYS = ["current_chain", "currentChain", "chain", "akg_path", "akgPath"];

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Flatten one payload value into readable text, keeping known chat roles. */
function messageText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(messageText).filter(Boolean).join("\n\n");
  }
  const object = recordOf(value);
  if (!object) return "";
  const body = extractText(object).trim();
  if (!body) return "";
  const role = asStr(object, "role") ?? asStr(object, "type");
  return role ? `${role}: ${body}` : body;
}

function textOf(data: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (!(key in data)) continue;
    const text = messageText(data[key]);
    if (text) return text;
  }
  return null;
}

/** Read the metadata field one reasoning text arrived in, when it was named. */
function sourceOf(data: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = asStr(data, key)?.trim();
    if (value) return value;
  }
  return null;
}

/**
 * Payload keys that wrap the LLM performance record TESIS writes for a call.
 * `orchestrator.llm.response` nests its record under `data.performance`; the
 * reasoning evidence lives inside that record.
 */
const PERFORMANCE_KEYS = ["performance", "llm_performance"];

/** One payload plus any performance record it wraps, outermost first. */
function payloadsOf(data: Record<string, unknown>): Record<string, unknown>[] {
  const payloads = [data];
  for (const key of PERFORMANCE_KEYS) {
    const nested = recordOf(data[key]);
    if (nested) payloads.push(nested);
  }
  return payloads;
}

/**
 * Read both reasoning representations from one payload and any performance
 * record it wraps. A source only travels with text from the same container, so
 * provenance is never attached to a text the journal reported elsewhere.
 */
function reasoningOf(data: Record<string, unknown>): TrajectoryReasoning {
  let result: TrajectoryReasoning = EMPTY_REASONING;
  for (const payload of payloadsOf(data)) {
    const trace = textOf(payload, REASONING_TRACE_KEYS);
    const summary = textOf(payload, REASONING_SUMMARY_KEYS);
    if (result.trace == null && trace != null) {
      result = {
        ...result,
        trace,
        traceSource: sourceOf(payload, REASONING_TRACE_SOURCE_KEYS),
      };
    }
    if (result.summary == null && summary != null) {
      result = {
        ...result,
        summary,
        summarySource: sourceOf(payload, REASONING_SUMMARY_SOURCE_KEYS),
      };
    }
  }
  return result;
}

function pathOf(data: Record<string, unknown>): string[] {
  for (const key of PATH_KEYS) {
    const value = data[key];
    if (!Array.isArray(value)) continue;
    const path = value.filter(
      (item): item is string => typeof item === "string" && item.trim() !== "",
    );
    if (path.length > 0) return path.map((item) => item.trim());
  }
  return [];
}

function numberIn(container: Record<string, unknown> | undefined, keys: readonly string[]): number | null {
  if (!container) return null;
  for (const key of keys) {
    const value = asNum(container, key);
    if (value != null) return value;
  }
  return null;
}

const EMPTY_USAGE: TrajectoryUsage = {
  input: null,
  output: null,
  reasoning: null,
  cached: null,
  total: null,
};

const EMPTY_REASONING: TrajectoryReasoning = {
  trace: null,
  traceSource: null,
  summary: null,
  summarySource: null,
};

/** Read token usage from either a nested `usage` block or flat journal fields. */
function usageOf(data: Record<string, unknown>): TrajectoryUsage {
  const usage = recordOf(data["usage"]);
  const promptDetails = recordOf(usage?.["prompt_tokens_details"]);
  const completionDetails = recordOf(usage?.["completion_tokens_details"]);
  return {
    input:
      numberIn(usage, ["input_tokens", "prompt_tokens"]) ??
      numberIn(data, ["input_tokens", "prompt_tokens"]),
    output:
      numberIn(usage, ["output_tokens", "completion_tokens"]) ??
      numberIn(data, ["output_tokens", "completion_tokens"]),
    reasoning:
      numberIn(completionDetails, ["reasoning_tokens"]) ??
      numberIn(usage, ["reasoning_tokens"]) ??
      numberIn(data, ["reasoning_tokens"]),
    cached:
      numberIn(promptDetails, ["cached_tokens"]) ??
      numberIn(usage, ["cached_tokens", "cache_read_tokens"]) ??
      numberIn(data, ["cached_tokens", "cache_read_tokens"]),
    total: numberIn(usage, ["total_tokens"]) ?? numberIn(data, ["total_tokens", "tokens"]),
  };
}

function mergeUsage(base: TrajectoryUsage, next: TrajectoryUsage): TrajectoryUsage {
  return {
    input: base.input ?? next.input,
    output: base.output ?? next.output,
    reasoning: base.reasoning ?? next.reasoning,
    cached: base.cached ?? next.cached,
    total: base.total ?? next.total,
  };
}

/** Fill a missing total from the parts the journal did report. */
function completeUsage(usage: TrajectoryUsage): TrajectoryUsage {
  if (usage.total != null) return usage;
  if (usage.input == null && usage.output == null) return usage;
  return { ...usage, total: (usage.input ?? 0) + (usage.output ?? 0) };
}

/** Join streamed fragments, tolerating providers that resend the whole prefix. */
function appendChunk(base: string, chunk: string): string {
  if (!chunk) return base;
  if (!base) return chunk;
  if (chunk.startsWith(base)) return chunk;
  return base + chunk;
}

const COMPLETE_PATTERN = /confirm|success|succeed|achiev|pass|verif|complete|finish|response|result/i;

function statusOf(cell: TrajectoryCell): TrajectoryStatus {
  if (cell.isError) return "failed";
  if (cell.pending) return "pending";
  if (cell.outcome != null) return "completed";
  const data = cell.records[cell.records.length - 1]?.data ?? {};
  if (data["ok"] === true || data["success"] === true) return "completed";
  if (COMPLETE_PATTERN.test(cell.eventType)) return "completed";
  return "observed";
}

const EMPTY_TIMING: TrajectoryTiming = {
  startedAt: null,
  firstTokenAt: null,
  completedAt: null,
  ttftMs: null,
  decodeMs: null,
  tokensPerSecond: null,
};

/** Project payload text, usage, and latency facts onto one finished cell. */
function finalizeCell(cell: TrajectoryCell): void {
  let usage: TrajectoryUsage = EMPTY_USAGE;
  let inputText: string | null = null;
  let outputText: string | null = null;
  let reasoning: TrajectoryReasoning = EMPTY_REASONING;
  let streamed = "";
  let model: string | null = null;
  let toolName: string | null = null;
  let akgPath: string[] = [];

  cell.records.forEach((record, position) => {
    const data = record.data;
    usage = mergeUsage(usage, usageOf(data));
    inputText = inputText ?? textOf(data, REQUEST_KEYS);
    outputText = textOf(data, OUTPUT_KEYS) ?? outputText;
    // The latest record that carries each representation wins, and keeps the
    // source field it arrived with instead of borrowing another record's.
    const found = reasoningOf(data);
    if (found.trace != null) {
      reasoning = { ...reasoning, trace: found.trace, traceSource: found.traceSource };
    }
    if (found.summary != null) {
      reasoning = { ...reasoning, summary: found.summary, summarySource: found.summarySource };
    }
    model = model ?? textOf(data, MODEL_KEYS);
    toolName = toolName ?? textOf(data, TOOL_KEYS);
    const path = pathOf(data);
    if (path.length > 0) akgPath = path;
    if (position > 0 && CHUNK_PATTERN.test(record.eventType)) {
      // Stream fragments keep their own whitespace; trimming would splice words.
      streamed = appendChunk(streamed, extractText(data));
    }
  });

  cell.usage = completeUsage(usage);
  cell.tokens = cell.usage.total ?? cell.tokens;
  cell.inputText = inputText;
  cell.outputText = outputText ?? (streamed || null);
  cell.reasoning = reasoning;
  cell.model = model;
  cell.toolName = toolName;
  cell.akgPath = akgPath;
  cell.status = statusOf(cell);

  const finishedAt =
    cell.startedAt != null && cell.durationMs != null
      ? cell.startedAt + cell.durationMs / 1000
      : null;
  const firstToken = cell.records.find(
    (record, position) =>
      position > 0 && CHUNK_PATTERN.test(record.eventType) && record.timestamp != null,
  );
  const firstTokenAt = firstToken?.timestamp ?? null;
  const ttftMs =
    cell.startedAt != null && firstTokenAt != null
      ? Math.max(0, Math.round((firstTokenAt - cell.startedAt) * 1000))
      : null;
  const decodeMs =
    firstTokenAt != null && finishedAt != null
      ? Math.max(0, Math.round((finishedAt - firstTokenAt) * 1000))
      : null;
  cell.timing = {
    startedAt: cell.startedAt,
    firstTokenAt,
    completedAt: finishedAt,
    ttftMs,
    decodeMs,
    tokensPerSecond:
      decodeMs != null && decodeMs > 0 && cell.usage.output != null
        ? cell.usage.output / (decodeMs / 1000)
        : null,
  };
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
    inputText: null,
    outputText: null,
    reasoning: EMPTY_REASONING,
    model: null,
    toolName: null,
    akgPath: [],
    status: "observed",
    usage: EMPTY_USAGE,
    timing: EMPTY_TIMING,
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
  for (const cell of cells) finalizeCell(cell);
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

/** Last meaningful status per node, so a retried node reports its final state. */
function nodesOf(cells: TrajectoryCell[]): TrajectoryNodeState[] {
  const states = new Map<string, TrajectoryNodeState>();
  for (const cell of cells) {
    if (!cell.node) continue;
    const existing = states.get(cell.node);
    const status = cell.status === "observed" && existing ? existing.status : cell.status;
    states.set(cell.node, {
      node: cell.node,
      method: cell.method ?? existing?.method ?? null,
      status,
    });
  }
  return [...states.values()];
}

/**
 * How a turn ended: a retried failure that later succeeded reports succeeded,
 * while a still-running call keeps the turn pending.
 */
function turnStatus(cells: TrajectoryCell[]): TrajectoryStatus {
  if (cells.some((cell) => cell.status === "pending")) return "pending";
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    if (cells[index].status !== "observed") return cells[index].status;
  }
  return "observed";
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
    const usage = group.reduce<TrajectoryUsage>(
      (total, cell) => mergeUsage(total, cell.usage),
      EMPTY_USAGE,
    );
    return {
      id: `turn-${turn}-${group[0].id}`,
      turn,
      label: labelOf(group),
      startedAt: group.find((cell) => cell.startedAt != null)?.startedAt ?? null,
      durationMs: observedSpan(group),
      pending: group.some((cell) => cell.pending),
      status: turnStatus(group),
      nodes: nodesOf(group),
      akgPath: [...group].reverse().find((cell) => cell.akgPath.length > 0)?.akgPath ?? [],
      model: group.find((cell) => cell.model != null)?.model ?? null,
      usage: completeUsage(usage),
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

function buildOverview(
  turns: TrajectoryTurn[],
  cells: TrajectoryCell[],
  scale: TrajectoryScale,
): TrajectoryOverview {
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
  const measured = scale === "duration" && durationAvailable;
  const resolution: TrajectoryResolution = measured ? "duration" : "sequence";

  const lanes = emptyLanes();
  const order = new Map<string, number>();
  cells.forEach((cell, index) => order.set(cell.id, index));

  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const byOrder = (position: number) => (total > 0 ? position / total : 0);
  const byDuration = (seconds: number | null) =>
    measured && seconds != null && origin != null ? (seconds - origin) / spanSeconds : null;

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
      kind: cell.kind,
      label: cell.eventType,
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

  return {
    resolution,
    scale,
    durationAvailable,
    spanSeconds,
    startedAt: start,
    endedAt: end,
    lanes,
    boundaries,
  };
}

/** Re-project the overview with another scale without rebuilding the ledger. */
export function projectOverview(
  turns: TrajectoryTurn[],
  scale: TrajectoryScale = "duration",
): TrajectoryOverview {
  return buildOverview(
    turns,
    turns.flatMap((turn) => turn.cells),
    scale,
  );
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export function deriveTrajectory(events: RunEvent[]): TrajectoryModel {
  const cells = buildCells(events);
  const turns = buildTurns(cells);
  const overview = buildOverview(turns, cells, "duration");

  const sumOf = (pick: (cell: TrajectoryCell) => number | null) =>
    cells.reduce<number | null>((sum, cell) => {
      const value = pick(cell);
      if (value == null) return sum;
      return (sum ?? 0) + value;
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
      nodes: new Set(cells.map((cell) => cell.node).filter((node): node is string => node != null))
        .size,
      tokens: sumOf((cell) => cell.tokens),
      inputTokens: sumOf((cell) => cell.usage.input),
      outputTokens: sumOf((cell) => cell.usage.output),
      reasoningTokens: sumOf((cell) => cell.usage.reasoning),
    },
  };
}

/**
 * Case-insensitive ledger search across cell labels, arguments, record types, and
 * projected payload text. The optional `kinds` argument narrows the ledger to those
 * kinds; omitting it keeps every kind, so the two-argument call is unchanged.
 */
export function filterTrajectoryTurns(
  turns: TrajectoryTurn[],
  query: string,
  kinds?: readonly TrajectoryKind[],
): TrajectoryTurn[] {
  const needle = query.trim().toLowerCase();
  const allowed = kinds && kinds.length > 0 ? new Set(kinds) : null;
  if (!needle && !allowed) return turns;
  return turns
    .map((turn) => ({
      ...turn,
      cells: turn.cells.filter(
        (cell) =>
          (!allowed || allowed.has(cell.kind)) && (needle === "" || cellMatches(cell, needle)),
      ),
    }))
    .filter((turn) => turn.cells.length > 0);
}

function cellMatches(cell: TrajectoryCell, needle: string): boolean {
  const haystack = [
    cell.kind,
    cell.status,
    cell.eventType,
    cell.outcome ?? "",
    cell.args,
    cell.node ?? "",
    cell.method ?? "",
    cell.model ?? "",
    cell.toolName ?? "",
    cell.akgPath.join(" "),
    cell.inputText ?? "",
    cell.outputText ?? "",
    cell.reasoning.trace ?? "",
    cell.reasoning.traceSource ?? "",
    cell.reasoning.summary ?? "",
    cell.reasoning.summarySource ?? "",
    cell.records.map((record) => record.eventType).join(" "),
    cell.records.map((record) => record.message ?? "").join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
