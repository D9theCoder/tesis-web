import type {
  ConversationEntry,
  LiveRunState,
  OutcomeMetrics,
  RunConnectionStatus,
  RunEvent,
} from "@/lib/schemas";
import { asNum, asStr, extractText, normalizeRunStatus } from "@/lib/formatters";

/**
 * Monotonic reducer over the redacted runtime event journal.
 *
 * The live dashboard state is derived *exclusively* from the appended event
 * stream (plus descriptor + final artifact). Rules:
 *
 *  - Events are appended, never replaced, preserving emission order.
 *  - Confirmed vulns and achieved outcomes are only ever *added* (union), and
 *    are never clobbered by a stale `graph.state` snapshot.
 *  - Counters are monotonic: we keep the largest observed value so a snapshot
 *    that forgets an earlier count cannot roll the dashboard backwards.
 *  - Token chunks share a coalesce key so the conversation panel can collapse
 *    a streamed response into a single entry without discarding the journal.
 */

const LLM_EVENT_TYPES = new Set([
  "llm.started",
  "llm.completed",
  "llm.failed",
  "llm.stream",
  "llm.token",
  "llm.parse_error",
  "llm.cache_hit",
  "llm.response",
  "chat.user",
  "chat.assistant",
  "chat.system",
  "chat.tool",
  "chat.stream",
  "prompt",
  "model.request",
  "model.response",
]);

const CONTAINMENT_EVENT_TYPES = new Set([
  "containment.blocked",
  "containment.violation",
  "containment.blocked_external",
  "safety.containment",
  "http.blocked_external",
]);

const GUARDRAIL_EVENT_TYPES = new Set([
  "guardrail.activation",
  "guardrail.handling",
  "guardrail.retry",
  "guardrail.blocked",
  "guardrail.clarified",
]);

const SUCCESS_EVENT_TYPES = new Set([
  "method.confirmed",
  "vuln.confirmed",
  "exploit.success",
  "probe.success",
  "verifier.confirmed",
  "outcome.achieved",
]);

const FAILURE_EVENT_TYPES = new Set([
  "method.failed",
  "exploit.failed",
  "probe.failed",
  "verifier.rejected",
  "task.failed",
]);

const LLM_ROLE_MAP: Record<string, ConversationEntry["role"]> = {
  "chat.system": "system",
  "prompt": "system",
  "llm.started": "tool",
  "llm.completed": "assistant",
  "llm.response": "assistant",
  "llm.stream": "assistant",
  "llm.token": "assistant",
  "chat.assistant": "assistant",
  "chat.stream": "assistant",
  "chat.user": "user",
  "chat.tool": "tool",
  "model.request": "tool",
  "model.response": "assistant",
};

function emptyMetrics(): OutcomeMetrics {
  return {
    successes: 0,
    failures: 0,
    containmentCount: 0,
    containmentViolations: 0,
    guardrailCount: 0,
    invalidJson: 0,
    fallbacks: 0,
    attempts: 0,
    acceptedCandidates: 0,
    rejectedCandidates: 0,
    generatedCandidates: 0,
    iterationCount: 0,
    remainingBudget: 0,
    generationBudget: 0,
    remainingIterations: 0,
    maxIterations: 0,
    tokenCount: 0,
    tokenCost: 0,
  };
}

export function initialState(executionId?: string | null): LiveRunState {
  return {
    cursor: 0,
    lastPolledAt: 0,
    status: "waiting",
    connection: "waiting",
    executionId: executionId ?? null,
    runId: null,
    mode: "single-run",
    surface: null,
    securityLevel: null,
    provider: null,
    model: null,
    payloadMode: null,
    experimentCondition: null,
    targetMethod: null,
    targetUrl: null,
    currentNode: null,
    selectedMethod: null,
    viableMethods: [],
    akgPath: [],
    chain: [],
    confirmedVulns: [],
    achievedOutcomes: [],
    startedAt: null,
    endedAt: null,
    elapsedMs: 0,
    events: [],
    conversation: [],
    metrics: emptyMetrics(),
    hasArtifact: false,
    artifactReady: false,
  };
}

function monotonicMax(current: number, candidate: number | null | undefined): number {
  const c = candidate == null || !Number.isFinite(candidate) ? 0 : Math.max(0, Math.round(candidate));
  return Math.max(current, c);
}

function pushUnique(list: string[], item: string | null | undefined): string[] {
  if (!item) return list;
  if (list.includes(item)) return list;
  return [...list, item];
}

function pushManyUnique(list: string[], items: unknown): string[] {
  const next = [...list];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (typeof item === "string" && item && !next.includes(item)) next.push(item);
    }
  }
  return next;
}

function updateSnapshotCounters(
  metrics: OutcomeMetrics,
  data: Record<string, unknown>,
): OutcomeMetrics {
  const next = { ...metrics };
  next.guardrailCount = monotonicMax(next.guardrailCount, asNum(data, "guardrail_count"));
  next.invalidJson = monotonicMax(next.invalidJson, asNum(data, "invalid_json_count"));
  next.fallbacks = monotonicMax(next.fallbacks, asNum(data, "fallback_count"));
  next.iterationCount = monotonicMax(next.iterationCount, asNum(data, "iteration_count"));
  next.attempts = monotonicMax(next.attempts, asNum(data, "tried_candidates"));
  next.generatedCandidates = monotonicMax(
    next.generatedCandidates,
    asNum(data, "generated_candidates"),
  );
  const budget = asNum(data, "generation_budget");
  if (budget != null) next.generationBudget = Math.max(next.generationBudget, budget);
  const remaining = asNum(data, "generation_remaining");
  if (remaining != null) next.remainingBudget = Math.max(0, remaining);
  const accepted = asNum(data, "accepted_candidates");
  if (accepted != null) next.acceptedCandidates = Math.max(next.acceptedCandidates, accepted);
  const maxIterations = asNum(data, "max_iterations");
  if (maxIterations != null) next.maxIterations = Math.max(next.maxIterations, maxIterations);
  next.remainingIterations =
    next.maxIterations > 0
      ? Math.max(0, next.maxIterations - next.iterationCount)
      : next.remainingIterations;
  return next;
}

export interface ReduceOptions {
  nowEpochSec?: number;
  connection?: RunConnectionStatus;
  status?: string;
}

/**
 * Reduce raw events into the next monotonic dashboard state. Returns a fresh
 * state object; the previous state is never mutated.
 */
export function reduceEvents(
  prev: LiveRunState,
  events: RunEvent[],
  options: ReduceOptions = {},
): LiveRunState {
  if (!events.length) {
    const polledAt = options.nowEpochSec ?? Date.now() / 1000;
    const status = normalizeRunStatus(options.status ?? prev.status);
    return {
      ...prev,
      lastPolledAt: polledAt,
      status,
      connection: options.connection ?? prev.connection,
      elapsedMs:
        prev.startedAt == null
          ? 0
          : Math.max(
              0,
              Math.round(((prev.endedAt ?? polledAt) - prev.startedAt) * 1000),
            ),
    };
  }

  const next: LiveRunState = {
    ...prev,
    events: [...prev.events, ...events],
    conversation: [...prev.conversation],
    confirmedVulns: [...prev.confirmedVulns],
    achievedOutcomes: [...prev.achievedOutcomes],
    viableMethods: [...prev.viableMethods],
    akgPath: [...prev.akgPath],
    chain: [...prev.chain],
    metrics: { ...prev.metrics },
    lastPolledAt: options.nowEpochSec ?? Date.now() / 1000,
    status: normalizeRunStatus(options.status ?? prev.status),
    connection: options.connection ?? prev.connection,
  };

  for (const event of events) {
    const data = event.data ?? {};
    const type = event.event_type;
    const ts = event.timestamp ?? 0;

    // --- node / method / graph traversal ---
    if (type === "run.started") {
      next.surface = next.surface ?? asStr(data, "surface");
      next.securityLevel = next.securityLevel ?? asStr(data, "security_level");
      next.provider = next.provider ?? asStr(data, "provider");
      next.model = next.model ?? asStr(data, "model");
      next.payloadMode = next.payloadMode ?? asStr(data, "payload_mode");
      next.experimentCondition =
        next.experimentCondition ?? asStr(data, "experiment_condition");
      next.targetMethod =
        next.targetMethod ?? asStr(data, "target_method");
      next.targetUrl = next.targetUrl ?? asStr(data, "target_url");
      next.mode = asStr(data, "mode") ?? next.mode;
      next.runId = next.runId ?? event.run_id ?? null;
      next.executionId = next.executionId ?? event.execution_id ?? null;
      if (next.startedAt == null) next.startedAt = ts || Date.now() / 1000;
    } else if (type.startsWith("graph.node.")) {
      if (event.node) next.currentNode = event.node;
    } else if (type === "graph.state") {
      if (event.node) next.currentNode = event.node;
      next.selectedMethod =
        asStr(data, "selected_method") ?? next.selectedMethod;
      const viable = data["viable_methods"];
      if (Array.isArray(viable)) {
        for (const v of viable) {
          if (typeof v === "string") next.viableMethods = pushUnique(next.viableMethods, v);
        }
      }
      // Do NOT overwrite confirmedVulns / achievedOutcomes here — a graph.state
      // snapshot can be stale relative to previously confirmed findings.
      next.metrics = updateSnapshotCounters(next.metrics, data);
    } else if (event.node && type.includes("node")) {
      next.currentNode = event.node;
    }

    // A valid traversal snapshot is authoritative, including repeated visits.
    // Do not coerce malformed paths or erase progress with an empty payload.
    const path = data.akg_path;
    if (
      Array.isArray(path) &&
      path.length > 0 &&
      path.every((id) => typeof id === "string" && id.trim().length > 0)
    ) {
      const candidate = path as string[];
      const extendsObserved =
        next.akgPath.length === 0 ||
        (candidate.length >= next.akgPath.length &&
          next.akgPath.every((node, index) => candidate[index] === node));
      if (extendsObserved) {
        next.akgPath = [...candidate];
        next.currentNode = candidate[candidate.length - 1];
      }
    }
    next.confirmedVulns = pushManyUnique(next.confirmedVulns, data.confirmed_vulns);
    next.achievedOutcomes = pushManyUnique(next.achievedOutcomes, data.achieved_outcomes);

    // --- method selection ---
    if (type.includes("method.selected") || type.includes("select")) {
      next.selectedMethod = event.method ?? asStr(data, "method") ?? next.selectedMethod;
    }

    // --- outcomes (only ever add) ---
    if (type.includes("confirmed") || type.includes("vuln.confirmed")) {
      next.confirmedVulns = pushUnique(next.confirmedVulns, event.method);
      next.confirmedVulns = pushManyUnique(next.confirmedVulns, data["confirmed_vulns"]);
      if (event.node) next.confirmedVulns = pushUnique(next.confirmedVulns, event.node);
    }
    if (type.includes("outcome") || type.includes("achieved")) {
      next.achievedOutcomes = pushUnique(next.achievedOutcomes, event.method);
      next.achievedOutcomes = pushManyUnique(next.achievedOutcomes, data["achieved_outcomes"]);
      if (event.node) next.achievedOutcomes = pushUnique(next.achievedOutcomes, event.node);
    }

    // --- counters ---
    if (CONTAINMENT_EVENT_TYPES.has(type) || type.includes("containment")) {
      next.metrics.containmentCount += 1;
      if (type.includes("violation") || type.includes("blocked_external")) {
        next.metrics.containmentViolations += 1;
      }
    }
    if (GUARDRAIL_EVENT_TYPES.has(type) || type.includes("guardrail")) {
      next.metrics.guardrailCount += 1;
    }
    if (type.includes("invalid_json") || type.includes("parse_error")) {
      next.metrics.invalidJson += 1;
    }
    if (type.includes("fallback")) {
      next.metrics.fallbacks += 1;
    }
    if (type.includes("iteration")) {
      next.metrics.iterationCount += 1;
    }
    const eventSuccess = data["success"] === true || data["decision"] === "confirmed";
    const eventFailure = data["success"] === false || data["decision"] === "rejected";
    if (SUCCESS_EVENT_TYPES.has(type) || eventSuccess) {
      next.metrics.successes += 1;
    }
    if (FAILURE_EVENT_TYPES.has(type) || eventFailure) {
      next.metrics.failures += 1;
    }

    // payload candidate accounting
    if (type.includes("payload.accept") || type.includes("candidate.accept")) {
      next.metrics.acceptedCandidates += 1;
    }
    if (type.includes("payload.reject") || type.includes("candidate.reject")) {
      next.metrics.rejectedCandidates += 1;
    }
    if (type.includes("payload.generate") || type.includes("candidate.generate")) {
      next.metrics.generatedCandidates += 1;
    }
    if (type.includes("attempt") || type.includes("execute")) {
      next.metrics.attempts += 1;
    }

    // token usage
    if (type.includes("token") || type.includes("usage")) {
      const used = asNum(data, "total_tokens") ?? asNum(data, "tokens");
      if (used != null) next.metrics.tokenCount += used;
    }
    const usage = data["provider_usage"];
    if (usage && typeof usage === "object") {
      const used = asNum(usage as Record<string, unknown>, "total_tokens");
      if (used != null) next.metrics.tokenCount += used;
    }
    const cost = asNum(data, "cost") ?? asNum(data, "token_cost");
    if (cost != null) next.metrics.tokenCost += cost;

    // --- conversation / LLM trace ---
    if (
      LLM_EVENT_TYPES.has(type) ||
      type.startsWith("llm.") ||
      type.startsWith("chat.") ||
      type.includes(".llm.")
    ) {
      next.conversation = appendConversation(next.conversation, event);
    }

    // --- timing ---
    if (next.startedAt == null) {
      next.startedAt = ts || Date.now() / 1000;
    }
    if (next.endedAt == null && (type.includes("finished") || type.includes("completed") || type.includes("terminated"))) {
      next.endedAt = ts || Date.now() / 1000;
    }
  }

  next.elapsedMs = computeElapsed(next);
  next.status = normalizeRunStatus(options.status ?? next.status);
  if (next.metrics.maxIterations > 0) {
    next.metrics.remainingIterations = Math.max(
      0,
      next.metrics.maxIterations - next.metrics.iterationCount,
    );
  }
  if (next.metrics.generationBudget > 0 && next.metrics.remainingBudget === 0) {
    next.metrics.remainingBudget = Math.max(
      0,
      next.metrics.generationBudget - next.metrics.generatedCandidates,
    );
  }
  if (next.status === "completed" || next.status === "cancelled" || next.status === "error") {
    next.connection = next.status;
  }
  return next;
}

function computeElapsed(state: LiveRunState): number {
  const start = state.startedAt;
  if (start == null) return 0;
  const upper = state.endedAt ?? Date.now() / 1000;
  return Math.max(0, Math.round((upper - start) * 1000));
}

function appendConversation(
  conversation: ConversationEntry[],
  event: RunEvent,
): ConversationEntry[] {
  const data = event.data ?? {};
  const callId =
    typeof data["call_id"] === "string"
      ? data["call_id"]
      : typeof data["callId"] === "string"
        ? data["callId"]
        : undefined;
  const hasPrompts = Array.isArray(data["prompts"]);
  const role =
    hasPrompts
      ? "user"
      : LLM_ROLE_MAP[event.event_type] ??
        (event.event_type.includes(".llm.response") ? "assistant" : "trace");
  const structuredText =
    hasPrompts
      ? extractText(data["prompts"])
      : typeof data["response_text"] === "string"
        ? data["response_text"]
        : typeof data["response"] === "string"
          ? data["response"]
          : "";
  const entry: ConversationEntry = {
    id:
      `${callId ?? event.run_id ?? "event"}-${event.timestamp ?? 0}-${event.event_type}-${conversation.length}`,
    role,
    eventType: event.event_type,
    callId,
    node: event.node ?? null,
    method: event.method ?? null,
    message:
      structuredText ||
      event.message ||
      (event.event_type.includes("stream") || event.event_type.includes("token")
        ? extractText(event.data ?? {})
        : ""),
    timestamp: event.timestamp ?? Date.now() / 1000,
    data,
    coalesceKey:
      event.event_type.includes("stream") || event.event_type.includes("token")
        ? callId
        : undefined,
  };
  const used = asNum(data, "total_tokens") ?? asNum(data, "tokens");
  if (used != null) entry.tokens = used;
  return [...conversation, entry];
}

/**
 * Coalesce a conversation into grouped entries per call/role so token chunks
 * do not flood the panel, while preserving full order.
 */
export function coalesceConversation(
  conversation: ConversationEntry[],
): ConversationEntry[] {
  const grouped: ConversationEntry[] = [];
  for (const entry of conversation) {
    if (entry.coalesceKey) {
      const last = grouped[grouped.length - 1];
      if (last && last.coalesceKey === entry.coalesceKey) {
        if (entry.message && last.message) {
          // append chunk text to the coalesced message
          const merged: ConversationEntry = {
            ...last,
            message: last.message + entry.message,
            tokens: (last.tokens ?? 0) + (entry.tokens ?? 0),
            timestamp: entry.timestamp,
          };
          grouped[grouped.length - 1] = merged;
          continue;
        }
      }
    }
    grouped.push(entry);
  }
  return grouped;
}
