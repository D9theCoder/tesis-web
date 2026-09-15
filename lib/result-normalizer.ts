import type {
  CoordinateSummary,
  EvidenceRow,
  NormalizedResult,
  ScoreDimension,
  ScoreRow,
} from "@/lib/schemas";
import { extractText, truncate } from "@/lib/formatters";

/**
 * Normalize a raw TESIS artifact (single run JSON or matrix aggregate) into a
 * stable frontend contract. Handles both the modern layout and legacy fields
 * defensively: a missing field degrades to a safe default rather than
 * throwing. Never invents scores from LLM claims — dimensions map to real
 * artifact fields only.
 */

const COMPOSITE_WEIGHTS: Array<[ScoreDimension, number]> = [
  ["Smethod", 0.2],
  ["Spayload", 0.2],
  ["Sexploit", 0.3],
  ["Schain", 0.1],
  ["Soutput", 0.2],
];

export function compositeFormula(): string {
  return "Srun = 0.20·Smethod + 0.20·Spayload + 0.30·Sexploit + 0.10·Schain + 0.20·Soutput";
}

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function asFloat(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asStr(value: unknown): string | undefined {
  if (value == null || typeof value === "object") return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === "True" || value === 1;
}

function asStrArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").filter(Boolean);
}

function firstKey(obj: Record<string, unknown> | undefined | null, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return undefined;
}

function mergeStateish(raw: Record<string, unknown>): Record<string, unknown> {
  // The modern runner repeats scalar fields at the top level and also below
  // `final_state`. We read top-level first, then final_state as fallback so
  // both generations render.
  const fs = firstKey(raw, ["final_state", "state"]);
  const fsm = fs && typeof fs === "object" ? (fs as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...fsm };
  for (const [k, v] of Object.entries(raw)) {
    if (k === "final_state" || k === "state") continue;
    merged[k] = v;
  }
  return merged;
}

function deriveDimensions(m: Record<string, unknown>): Partial<Record<ScoreDimension, number>> {
  const scores: Partial<Record<ScoreDimension, number>> = {};

  // Smethod: top-level `method_score` or final_state.method_scores[selected].
  const selected = asStr(m["selected_method"]);
  const methodScores = firstKey(m, ["method_scores"]);
  if (typeof m["method_score"] === "number") {
    scores.Smethod = asInt(m["method_score"]);
  } else if (
    selected &&
    methodScores &&
    typeof methodScores === "object"
  ) {
    const ms = methodScores as Record<string, unknown>;
    if (typeof ms[selected] === "number") scores.Smethod = asInt(ms[selected]);
  }

  // Spayload: max of candidate payload scores (mirrors the Python scorer).
  const payloadScores = firstKey(m, ["payload_scores"]);
  if (payloadScores && typeof payloadScores === "object") {
    const values = Object.values(payloadScores as Record<string, unknown>).map(asInt);
    if (values.length) scores.Spayload = Math.max(...values);
  }

  // Sexploit, Schain, Soutput
  if (typeof m["exploitation_score"] === "number") {
    scores.Sexploit = asInt(m["exploitation_score"]);
  } else if (m["exploitation_scores"] && typeof m["exploitation_scores"] === "object") {
    const es = m["exploitation_scores"] as Record<string, unknown>;
    const sel = selected;
    if (sel && typeof es[sel] === "number") scores.Sexploit = asInt(es[sel]);
  }

  if (typeof m["chain_score"] === "number") {
    scores.Schain = asInt(m["chain_score"]);
  } else if (m["chain_scores"] && typeof m["chain_scores"] === "object") {
    const cs = m["chain_scores"] as Record<string, unknown>;
    if (selected && typeof cs[selected] === "number") scores.Schain = asInt(cs[selected]);
  }

  if (typeof m["output_score"] === "number") {
    scores.Soutput = asInt(m["output_score"]);
  } else if (m["output_scores"] && typeof m["output_scores"] === "object") {
    const os = m["output_scores"] as Record<string, unknown>;
    if (selected && typeof os[selected] === "number") scores.Soutput = asInt(os[selected]);
  }

  // Srun: prefer explicit composite, otherwise recompute from the six dims.
  if (typeof m["composite_score"] === "number") {
    scores.Srun = asFloat(m["composite_score"]);
  } else {
    let total = 0;
    let any = false;
    for (const [dim, w] of COMPOSITE_WEIGHTS) {
      if (scores[dim] != null) {
        total += w * (scores[dim] as number);
        any = true;
      }
    }
    if (any) scores.Srun = Math.round(total * 10000) / 10000;
  }
  return scores;
}

function buildScoreRows(
  scores: Partial<Record<ScoreDimension, number>>,
  m: Record<string, unknown>,
): ScoreRow[] {
  const interpretations: Record<ScoreDimension, string> = {
    Smethod: "Method selection accuracy: how well the orchestrator chose the correct static method agent for the surface.",
    Spayload: "Payload effectiveness: best score among executed candidate payloads for the selected method.",
    Sexploit: "Exploitation success: whether the target was actually exploited with verifier-backed evidence.",
    Schain: "Chain utilization: whether the AKG routed to a higher-impact chained outcome.",
    Soutput: "Output integrity: penalty for containment, guardrail, invalid-JSON or fallback activity degrading report quality.",
    Srun: "Composite run score: the weighted thesis metric combining all five dimensions.",
  };
  const evidence: Record<ScoreDimension, string> = {
    Smethod: "method_scores / selected_method / viable_methods",
    Spayload: "payload_scores (max over candidate scores)",
    Sexploit: "exploitation_scores / response_evidence / verifier_decision",
    Schain: "chain_scores / achieved_outcomes / akg_path",
    Soutput: "output_scores / guardrail_activations / invalid_json_events / containment_events",
    Srun: "composite_score or Srun = 0.20·Smethod + 0.20·Spayload + 0.30·Sexploit + 0.10·Schain + 0.20·Soutput",
  };
  const dimensions: ScoreDimension[] = [
    "Smethod",
    "Spayload",
    "Sexploit",
    "Schain",
    "Soutput",
    "Srun",
  ];
  return dimensions.map((dim) => ({
    dimension: dim,
    score: scores[dim] ?? 0,
    max: 4,
    evidenceBasis: evidence[dim],
    interpretation:
      dim === "Srun"
        ? compositeFormula()
        : interpretations[dim],
  }));
}

interface CoalescedEvidence {
  rows: EvidenceRow[];
  seen: Set<string>;
}

function addRow(
  acc: CoalescedEvidence,
  row: EvidenceRow,
): void {
  const key = row.id;
  if (acc.seen.has(key)) return;
  acc.seen.add(key);
  acc.rows.push(row);
}

export function buildEvidenceRows(m: Record<string, unknown>): EvidenceRow[] {
  const acc: CoalescedEvidence = { rows: [], seen: new Set() };

  // 1. execution_log entries (RunEvent.as_dict)
  const log = m["execution_log"];
  if (Array.isArray(log)) {
    log.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      const e = entry as Record<string, unknown>;
      const timestampEpoch =
        typeof e["timestamp"] === "number" ? (e["timestamp"] as number) : 0;
      const phase = typeof e["event_type"] === "string" ? (e["event_type"] as string) : "event";
      const candidate = e["candidate"];
      const message = typeof e["message"] === "string" ? (e["message"] as string) : "";
      addRow(acc, {
        id: `log-${i}-${phase}`,
        timestamp: new Date(timestampEpoch * 1000).toISOString(),
        timestampEpoch,
        node: typeof e["node"] === "string" ? (e["node"] as string) : null,
        phase,
        method: typeof e["method"] === "string" ? (e["method"] as string) : null,
        route: null,
        action: message || phase,
        candidate: candidate ?? null,
        result: message || phase,
        status: classifyEvent(phase),
        signal: extractSignal(phase),
        safety: safetyFor(phase),
        details: {
          data: e["data"] ?? {},
          candidate,
        },
        relatedEventIds: [],
      });
    });
  }

  // 2. response_evidence entries
  const responses = m["response_evidence"];
  if (Array.isArray(responses)) {
    responses.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      const e = entry as Record<string, unknown>;
      const agentId = asStr(e["agent_id"]) ?? "unknown";
      const stage = asStr(e["stage"]) ?? "probe";
      const statusCode = e["status_code"];
      const signal = asBool(e["signal_detected"]);
      const transportOk = asBool(e["transport_ok"]);
      const safe = transportOk && !signal;
      const raw = e["response_snippet"];
      const snippet =
        typeof raw === "string" ? truncate(raw.replace(/\s+/g, " ").trim(), 220) : null;
      addRow(acc, {
        id: `resp-${i}`,
        timestamp: "",
        timestampEpoch: 0,
        node: agentId,
        phase: `response_evidence:${stage}`,
        method: agentId,
        route: asStr(e["endpoint"]) ?? null,
        action: `HTTP ${String(statusCode ?? "?")} · ${stage}`,
        candidate: asStr(e["payload"]) ?? null,
        result: signal ? "signal detected" : transportOk ? "no signal" : "transport error",
        status: signal ? "success" : transportOk ? "info" : "failure",
        signal: signal ? "signal" : safe ? "known-safe" : "none",
        safety: signal ? "low" : "medium",
        details: {
          ...e,
          raw,
        },
        relatedEventIds: [],
      });
    });
  }

  // 3. llm_performance entries
  const perf = m["llm_performance"];
  if (Array.isArray(perf)) {
    perf.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      const e = entry as Record<string, unknown>;
      const role = asStr(e["role"]) ?? "unknown";
      const parse = asStr(e["parse_status"]) ?? "unknown";
      const duration = asNum(e["call_duration_ms"]);
      const usage = e["provider_usage"] as Record<string, unknown> | undefined;
      const totalTokens =
        usage && typeof usage["total_tokens"] === "number"
          ? (usage["total_tokens"] as number)
          : null;
      addRow(acc, {
        id: `llm-${i}`,
        timestamp: "",
        timestampEpoch: 0,
        node: "llm",
        phase: "llm_call",
        method: role,
        route: asStr(e["provider"]) ?? null,
        action: `LLM ${role} · parse=${parse}`,
        candidate: null,
        result: parse === "ok" ? "parsed" : `parse:${parse}`,
        status: parse === "ok" ? "info" : "failure",
        signal: asStr(e["model_fingerprint"])?.slice(0, 12) ?? null,
        safety: "low",
        details: {
          call_id: e["call_id"],
          call_duration_ms: duration,
          cache_hit: e["cache_hit"],
          provider_usage: usage,
          structured_output_mode: e["structured_output_mode"],
          prompt_hash: e["prompt_hash"],
        },
        relatedEventIds: [],
      });
    });
  }

  // 4. recon_events
  const recon = m["recon_events"];
  if (Array.isArray(recon)) {
    recon.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      const e = entry as Record<string, unknown>;
      const kind = asStr(e["event_type"]) ?? asStr(e["kind"]) ?? "recon";
      addRow(acc, {
        id: `recon-${i}`,
        timestamp: "",
        timestampEpoch: asNum(e["timestamp"]) ?? 0,
        node: "recon",
        phase: kind,
        method: null,
        route: asStr(e["url"]) ?? asStr(e["endpoint"]) ?? null,
        action: asStr(e["message"]) ?? kind,
        candidate: null,
        result: asStr(e["status"]) ?? asStr(e["result"]) ?? "done",
        status: "info",
        signal: null,
        safety: "low",
        details: { data: e },
        relatedEventIds: [],
      });
    });
  }

  // 5. safety events (guardrail / containment / invalid / fallback)
  for (const [field, phase] of [
    ["guardrail_activations", "guardrail"],
    ["containment_events", "containment"],
    ["invalid_json_events", "invalid_json"],
    ["fallback_events", "fallback"],
    ["payload_guardrail_activations", "payload_guardrail"],
  ] as const) {
    const list = m[field];
    if (Array.isArray(list)) {
      list.forEach((entry, i) => {
        if (!entry || typeof entry !== "object") return;
        const e = entry as Record<string, unknown>;
        addRow(acc, {
          id: `${phase}-${i}`,
          timestamp: "",
          timestampEpoch: asNum(e["timestamp"]) ?? 0,
          node: asStr(e["agent_id"]) ?? asStr(e["node"]) ?? "safety",
          phase,
          method: asStr(e["agent_id"]) ?? null,
          route: asStr(e["url"]) ?? asStr(e["endpoint"]) ?? null,
          action: asStr(e["reason"]) ?? asStr(e["message"]) ?? phase,
          candidate: asStr(e["candidate"]) ?? null,
          result: asStr(e["status"]) ?? "blocked",
          status: "safety",
          signal: asStr(e["type"]) ?? phase,
          safety: phase === "containment" ? "danger" : "high",
          details: { data: e },
          relatedEventIds: [],
        });
      });
    }
  }

  acc.rows.sort((a, b) => (a.timestampEpoch - b.timestampEpoch) || a.id.localeCompare(b.id));
  return acc.rows;
}

function classifyEvent(phase: string): EvidenceRow["status"] {
  const p = phase.toLowerCase();
  if (p.includes("confirmed") || p.includes("success") || p.includes("achieved") || p.includes("accepted")) {
    return "success";
  }
  if (p.includes("fail") || p.includes("reject") || p.includes("error") || p.includes("invalid")) {
    return "failure";
  }
  if (p.includes("guardrail") || p.includes("containment") || p.includes("blocked")) {
    return "safety";
  }
  if (p.includes("llm") || p.includes("chat") || p.includes("prompt") || p.includes("model")) {
    return "model";
  }
  return "info";
}

function extractSignal(phase: string): string {
  const p = phase.toLowerCase();
  if (p.includes("confirmed")) return "confirmed";
  if (p.includes("containment")) return "containment";
  if (p.includes("guardrail")) return "guardrail";
  if (p.includes("fallback")) return "fallback";
  return "—";
}

function safetyFor(phase: string): EvidenceRow["safety"] {
  const p = phase.toLowerCase();
  if (p.includes("containment")) return "danger";
  if (p.includes("guardrail") || p.includes("blocked")) return "high";
  if (p.includes("confirmed") || p.includes("achieved")) return "medium";
  return "low";
}

function extractModelName(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value || undefined;
  if (typeof value === "object") {
    const cfg = value as Record<string, unknown>;
    const name = cfg["model_name"] ?? cfg["modelName"] ?? cfg["name"];
    if (typeof name === "string" && name) return name;
  }
  return undefined;
}

function asNum(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildMetrics(m: Record<string, unknown>, raw: Record<string, unknown>) {
  const containment =
    Array.isArray(m["containment_events"]) ? m["containment_events"].length :
    typeof m["containment_events"] === "number" ? (m["containment_events"] as number) : 0;
  const guardrail =
    Array.isArray(m["guardrail_activations"]) ? m["guardrail_activations"].length :
    typeof m["guardrail_activations"] === "number" ? (m["guardrail_activations"] as number) : 0;
  const invalidJson =
    Array.isArray(m["invalid_json_events"]) ? (m["invalid_json_events"] as unknown[]).length :
    typeof m["invalid_json_events"] === "number" ? (m["invalid_json_events"] as number) : 0;
  const fallbacks =
    Array.isArray(m["fallback_events"]) ? (m["fallback_events"] as unknown[]).length :
    typeof m["fallback_events"] === "number" ? (m["fallback_events"] as number) : 0;

  const perfSummary =
    firstKey(m, ["llm_performance_summary"]) as Record<string, unknown> | undefined;

  return {
    payloadValidityRate: asFloat(m["payload_validity_rate"]) ?? asFloat(perfSummary?.["payload_validity_rate"]),
    payloadExecutionSuccessRate: asFloat(m["payload_execution_success_rate"]),
    payloadImprovementRate: asFloat(m["payload_improvement_rate"]),
    methodSelectionAccuracy: asFloat(perfSummary?.["method_selection_accuracy"]),
    adaptationRate: asFloat(perfSummary?.["adaptation_rate"]),
    guardrailActivationRate: asFloat(perfSummary?.["guardrail_activation_rate"]),
    containmentCount: containment,
    guardrailActivations: guardrail,
    invalidJson,
    fallbacks,
    attemptsToSuccess: asNum(m["attempts_to_success"]) ?? undefined,
    tokenCost: asFloat(m["token_cost"]),
    tokenCount: asNum(m["tokens"]) ?? asNum(perfSummary?.["total_tokens"]) ?? undefined,
    llmCalls: asNum(perfSummary?.["calls"]) ?? undefined,
  };
}

function buildCoordinates(
  raw: Record<string, unknown>,
  m: Record<string, unknown>,
  mergedStateWrapper: Record<string, unknown>,
): CoordinateSummary[] {
  const children = firstKey(raw, ["runs", "artifacts", "children", "entries", "records", "results"]);
  if (!Array.isArray(children)) {
    // Single run is its own single coordinate.
    const dims = deriveDimensions(m);
    const confirmed = asStrArray(m["confirmed_vulns"]);
    const achieved = asStrArray(m["achieved_outcomes"]);
    return [
      {
        runId: asStr(m["run_id"]) ?? null,
        executionId: asStr(m["execution_id"]) ?? "unknown",
        index: 0,
        status: asStr(m["status"]) ?? "unknown",
        provider: asStr(m["provider"]),
        surface: asStr(m["surface"]),
        securityLevel: asStr(m["security_level"]),
        payloadMode: asStr(m["payload_mode"]),
        experimentCondition: asStr(m["experiment_condition"]),
        targetMethod: asStr(m["target_method"]),
        selectedMethod: asStr(m["selected_method"]) ?? null,
        confirmedVulns: confirmed,
        achievedOutcomes: achieved,
        scores: dims,
        artifactPath: undefined,
      },
    ];
  }

  return children.map((child, index) => {
    if (!child || typeof child !== "object") {
      return {
        runId: null,
        executionId: `run-${index + 1}`,
        index,
        status: "unknown",
        selectedMethod: null,
        confirmedVulns: [],
        achievedOutcomes: [],
        scores: {},
      };
    }
    const c = child as Record<string, unknown>;
    const childConfig =
      c["config"] && typeof c["config"] === "object"
        ? (c["config"] as Record<string, unknown>)
        : {};
    const dims = deriveDimensions(c);
    return {
      runId: asStr(c["run_id"]) ?? null,
      executionId: asStr(c["execution_id"]) ?? `run-${index + 1}`,
      index: Math.max(0, (asNum(c["index"]) ?? index + 1) - 1),
      status: asStr(c["status"]) ?? "unknown",
      provider: asStr(c["provider"]) ?? asStr(childConfig["provider"]),
      surface: asStr(c["surface"]) ?? asStr(childConfig["surface"]),
      securityLevel: asStr(c["security_level"]) ?? asStr(childConfig["security_level"]),
      payloadMode: asStr(c["payload_mode"]) ?? asStr(childConfig["payload_mode"]),
      experimentCondition:
        asStr(c["experiment_condition"]) ?? asStr(childConfig["experiment_condition"]),
      targetMethod: asStr(c["target_method"]) ?? asStr(childConfig["target_method"]),
      selectedMethod: asStr(c["selected_method"]) ?? null,
      confirmedVulns: asStrArray(c["confirmed_vulns"]),
      achievedOutcomes: asStrArray(c["achieved_outcomes"]),
      scores: dims,
      artifactPath: asStr(c["artifact"]) ?? asStr(c["artifact_path"]),
    };
  });
}

export function normalizeResult(rawJson: unknown, sourceMode?: string): NormalizedResult {
  const raw = rawJson && typeof rawJson === "object" ? (rawJson as Record<string, unknown>) : {};
  const m = mergeStateish(raw);

  const isMatrix =
    sourceMode === "matrix" ||
    (Array.isArray(raw["runs"]) && raw["runs"].length > 0) ||
    !!raw["matrix"];
  const mode: "single-run" | "matrix" = isMatrix ? "matrix" : "single-run";

  const stateWrapper =
    firstKey(raw, ["final_state", "state"]) &&
    typeof firstKey(raw, ["final_state", "state"]) === "object"
      ? (firstKey(raw, ["final_state", "state"]) as Record<string, unknown>)
      : {};

  const scores = deriveDimensions(m);
  const scoringRows = buildScoreRows(scores, m);
  const evidenceRows = buildEvidenceRows(m);
  const coordinates = buildCoordinates(raw, m, stateWrapper);

  const config = (m["config"] && typeof m["config"] === "object"
    ? (m["config"] as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const timing =
    m["timing"] && typeof m["timing"] === "object"
      ? (m["timing"] as Record<string, unknown>)
      : {};

  const totals =
    m["totals"] && typeof m["totals"] === "object"
      ? (m["totals"] as Record<string, unknown>)
      : {};

  return {
    executionId: asStr(m["execution_id"]) ?? asStr(raw["execution_id"]) ?? "unknown",
    runId: asStr(m["run_id"]) ?? null,
    mode,
    status: asStr(m["status"]) ?? "unknown",
    taskResult: asStr(m["task_result"]) ?? asStr(m["experiment_outcome"]) ?? null,
    experimentOutcome: asStr(m["experiment_outcome"]) ?? null,
    provider: asStr(m["provider"]) ?? asStr(config["provider"]),
    model: asStr(m["model"]) ?? extractModelName(config["model"]),
    surface: asStr(m["surface"]) ?? asStr(config["surface"]),
    securityLevel: asStr(m["security_level"]) ?? asStr(config["security_level"]),
    payloadMode: asStr(m["payload_mode"]) ?? asStr(config["payload_mode"]),
    experimentCondition: asStr(m["experiment_condition"]) ?? asStr(config["experiment_condition"]),
    targetMethod: asStr(m["target_method"]) ?? asStr(config["target_method"]),
    targetUrl: asStr(m["target_url"]) ?? asStr(config["target_url"]),
    startedAt: asStr(timing["started_at"]) ?? asStr(m["started_at"]),
    endedAt: asStr(timing["ended_at"]) ?? asStr(m["ended_at"]),
    durationMs: asNum(timing["duration_ms"]) ?? asNum(m["duration_ms"]) ?? undefined,
    configFingerprint: asStr(m["config_fingerprint"]),
    schemaVersion: asStr(m["schema_version"]),
    isMatrix,
    selectedMethod: asStr(m["selected_method"]) ?? null,
    viableMethods: asStrArray(m["viable_methods"]),
    akgPath: asStrArray(m["akg_path"]),
    confirmedVulns: asStrArray(m["confirmed_vulns"]),
    achievedOutcomes: asStrArray(m["achieved_outcomes"]),
    scores,
    scoringRows,
    evidenceRows,
    coordinates,
    totalRuns: asNum(totals["total_runs"]) ?? undefined,
    successfulRuns: asNum(totals["successful_runs"]) ?? undefined,
    errorRuns: asNum(totals["error_runs"]) ?? undefined,
    cancelledRuns: asNum(totals["cancelled_runs"]) ?? undefined,
    skippedRuns: asNum(totals["skipped_runs"]) ?? undefined,
    metrics: buildMetrics(m, raw),
    raw,
  };
}

export function selectedCoordinate(
  result: NormalizedResult,
  runId: string | null,
): NormalizedResult {
  if (!result.isMatrix || !runId) return result;
  const coord = result.coordinates.find(
    (c) => c.runId === runId || c.executionId === runId,
  );
  if (!coord) return result;
  return {
    ...result,
    selectedMethod: coord.selectedMethod,
    confirmedVulns: coord.confirmedVulns,
    achievedOutcomes: coord.achievedOutcomes,
    scores: coord.scores,
    scoringRows: buildScoreRows(coord.scores, {
      ...coord,
      containment_events: [],
      guardrail_activations: [],
      invalid_json_events: [],
    }),
    surface: coord.surface ?? result.surface,
    securityLevel: coord.securityLevel ?? result.securityLevel,
    payloadMode: coord.payloadMode ?? result.payloadMode,
    experimentCondition: coord.experimentCondition ?? result.experimentCondition,
    targetMethod: coord.targetMethod ?? result.targetMethod,
  };
}

export { extractText, truncate };
