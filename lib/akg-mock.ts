import type {
  AkgSnapshot,
  LiveRunState,
  RunEvent,
  RunSummary,
} from "@/lib/schemas";

export interface AkgMockRunSeed {
  mode?: string;
  surface?: string;
  security_level?: string;
  provider?: string;
  model?: string;
  payload_mode?: string;
  experiment_condition?: string;
  target_method?: string;
  target_url?: string;
  candidate_budget?: number;
  max_iterations?: number;
}

export interface AkgMockSeedEvent {
  event_type: string;
  name?: string;
  node?: string;
  method?: string;
  candidate?: unknown;
  message?: string;
  data?: Record<string, unknown>;
}

export interface AkgMockSeed {
  schema_version: string;
  name: string;
  description?: string;
  interval_ms?: number;
  run: AkgMockRunSeed;
  assertions: {
    expected_path: string[];
    expected_confirmed: string[];
    expected_outcomes: string[];
  };
  events: AkgMockSeedEvent[];
}

export interface AkgMockCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface AkgMockVerification {
  passed: boolean;
  snapshotVersion: string;
  expectedPath: string[];
  actualPath: string[];
  transitions: number;
  checks: AkgMockCheck[];
}

export interface AkgMockSimulation {
  seed: {
    file: string;
    schemaVersion: string;
    name: string;
    description?: string;
    intervalMs: number;
  };
  executionId: string;
  runId: string;
  status: "completed";
  run: RunSummary;
  events: RunEvent[];
  assertions: AkgMockSeed["assertions"];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string, fallback?: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value === undefined && fallback !== undefined) return fallback;
  throw new Error(`${label} must be a non-empty string`);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value))
    throw new Error(`${label} must be an array of strings`);
  const values = value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
  if (values.length !== value.length)
    throw new Error(`${label} must be an array of strings`);
  return values;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return stringValue(value, "optional string field");
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("numeric field must be a finite non-negative number");
  return value;
}

/** Validate the YAML shape at the API boundary before creating runtime events. */
export function parseAkgMockSeed(value: unknown): AkgMockSeed {
  const root = record(value, "seed");
  if (root.schema_version !== "akg-simulation.v1")
    throw new Error("Unsupported schema_version; expected akg-simulation.v1");
  const run = record(root.run, "run");
  const assertions = record(root.assertions, "assertions");
  const rawEvents = root.events;
  if (!Array.isArray(rawEvents) || rawEvents.length < 2) {
    throw new Error("events must contain at least two entries");
  }

  const events = rawEvents.map((raw, index) => {
    const event = record(raw, `events[${index}]`);
    const data =
      event.data === undefined
        ? undefined
        : record(event.data, `events[${index}].data`);
    for (const key of [
      "akg_path",
      "confirmed_vulns",
      "achieved_outcomes",
      "viable_methods",
      "final_path",
    ]) {
      if (data?.[key] !== undefined)
        stringArray(data[key], `events[${index}].data.${key}`);
    }
    for (const key of [
      "iteration_count",
      "generation_budget",
      "generation_remaining",
      "max_iterations",
      "generated_candidates",
      "tried_candidates",
      "accepted_candidates",
      "total_tokens",
    ]) {
      if (data?.[key] !== undefined) optionalNumber(data[key]);
    }
    if (data?.success !== undefined && typeof data.success !== "boolean")
      throw new Error("data.success must be a boolean");
    return {
      event_type: stringValue(event.event_type, `events[${index}].event_type`),
      name: optionalString(event.name),
      node: optionalString(event.node),
      method: optionalString(event.method),
      candidate: event.candidate,
      message: optionalString(event.message),
      data,
    } satisfies AkgMockSeedEvent;
  });

  const interval = optionalNumber(root.interval_ms) ?? 420;
  if (interval < 120 || interval > 5000)
    throw new Error("interval_ms must be between 120 and 5000");

  if (!stringArray(assertions.expected_path, "assertions.expected_path").length)
    throw new Error("assertions.expected_path must not be empty");
  return {
    schema_version: stringValue(root.schema_version, "schema_version"),
    name: stringValue(root.name, "name"),
    description: optionalString(root.description),
    interval_ms: interval,
    run: {
      mode: optionalString(run.mode),
      surface: optionalString(run.surface),
      security_level: optionalString(run.security_level),
      provider: optionalString(run.provider),
      model: optionalString(run.model),
      payload_mode: optionalString(run.payload_mode),
      experiment_condition: optionalString(run.experiment_condition),
      target_method: optionalString(run.target_method),
      target_url: optionalString(run.target_url),
      candidate_budget: optionalNumber(run.candidate_budget),
      max_iterations: optionalNumber(run.max_iterations),
    },
    assertions: {
      expected_path: stringArray(
        assertions.expected_path,
        "assertions.expected_path",
      ),
      expected_confirmed: stringArray(
        assertions.expected_confirmed === undefined
          ? []
          : assertions.expected_confirmed,
        "assertions.expected_confirmed",
      ),
      expected_outcomes: stringArray(
        assertions.expected_outcomes === undefined
          ? []
          : assertions.expected_outcomes,
        "assertions.expected_outcomes",
      ),
    },
    events,
  };
}

/** Verify the reduced state against the exact snapshot displayed for this session. */
export function verifyAkgMockState(
  state: LiveRunState,
  assertions: AkgMockSeed["assertions"],
  snapshot: AkgSnapshot,
): AkgMockVerification {
  const expectedPath = assertions.expected_path;
  const actualPath = state.akgPath;
  const ids = new Set(snapshot.nodes.map((node) => node.id));
  const edges = new Set(
    snapshot.edges.map((edge) => JSON.stringify([edge.source, edge.target])),
  );
  const missingNodes = [
    ...new Set([
      ...expectedPath,
      ...actualPath,
      ...(state.currentNode ? [state.currentNode] : []),
    ]),
  ].filter((id) => !ids.has(id));
  const missingEdges = [expectedPath, actualPath].flatMap((path) =>
    path
      .slice(1)
      .flatMap((target, i) =>
        edges.has(JSON.stringify([path[i], target]))
          ? []
          : [`${path[i]} → ${target}`],
      ),
  );
  const detail = (expected: unknown, actual: unknown) =>
    `Expected: ${JSON.stringify(expected)}; actual: ${JSON.stringify(actual)}`;
  const checks: AkgMockCheck[] = [
    {
      id: "path",
      label: "Exact ordered traversal",
      passed:
        expectedPath.length > 0 &&
        JSON.stringify(expectedPath) === JSON.stringify(actualPath),
      detail: detail(expectedPath, actualPath),
    },
    {
      id: "current",
      label: "Final node",
      passed:
        expectedPath.length > 0 && state.currentNode === expectedPath.at(-1),
      detail: detail(expectedPath.at(-1), state.currentNode),
    },
    {
      id: "confirmed",
      label: "Required findings",
      passed: assertions.expected_confirmed.every((id) =>
        state.confirmedVulns.includes(id),
      ),
      detail: detail(assertions.expected_confirmed, state.confirmedVulns),
    },
    {
      id: "outcomes",
      label: "Required outcomes",
      passed: assertions.expected_outcomes.every((id) =>
        state.achievedOutcomes.includes(id),
      ),
      detail: detail(assertions.expected_outcomes, state.achievedOutcomes),
    },
    {
      id: "nodes",
      label: "Nodes exist in displayed snapshot",
      passed: missingNodes.length === 0,
      detail: `Expected all path nodes to exist; missing: ${missingNodes.join(", ") || "none"}`,
    },
    {
      id: "edges",
      label: "Directed transitions exist",
      passed: missingEdges.length === 0,
      detail: `Expected every directed transition; missing: ${[...new Set(missingEdges)].join(", ") || "none"}`,
    },
  ];
  return {
    passed: checks.every((check) => check.passed),
    snapshotVersion: snapshot.schema_version,
    expectedPath: [...expectedPath],
    actualPath: [...actualPath],
    transitions: Math.max(0, actualPath.length - 1),
    checks,
  };
}

export function createAkgMockSimulation(
  rawSeed: unknown,
  options: { nowMs?: number; executionId?: string; runId?: string } = {},
): AkgMockSimulation {
  const seed = parseAkgMockSeed(rawSeed);
  const nowMs = options.nowMs ?? Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const executionId = options.executionId ?? `mock-akg-${nowMs}-${suffix}`;
  const runId = options.runId ?? `mock-run-${nowMs}-${suffix}`;
  const intervalMs = seed.interval_ms ?? 420;
  const startEpoch = nowMs / 1000;
  const runData: Record<string, unknown> = {
    mode: seed.run.mode ?? "mock",
    surface: seed.run.surface,
    security_level: seed.run.security_level,
    provider: seed.run.provider,
    model: seed.run.model,
    payload_mode: seed.run.payload_mode,
    experiment_condition: seed.run.experiment_condition,
    target_method: seed.run.target_method,
    target_url: seed.run.target_url,
    candidate_budget: seed.run.candidate_budget,
    max_iterations: seed.run.max_iterations,
  };
  const events: RunEvent[] = seed.events.map((event, index) => {
    const data = { ...(event.data ?? {}) };
    if (event.event_type === "run.started") Object.assign(data, runData);
    return {
      event_type: event.event_type,
      name: event.name,
      timestamp: startEpoch + (index * intervalMs) / 1000,
      execution_id: executionId,
      run_id: runId,
      node: event.node ?? null,
      method: event.method ?? null,
      candidate: event.candidate ?? null,
      message: event.message ?? null,
      data,
    };
  });
  const startedAt = new Date(nowMs).toISOString();
  const endedAt = new Date(
    (startEpoch + ((events.length - 1) * intervalMs) / 1000) * 1000,
  ).toISOString();
  const run: RunSummary = {
    executionId,
    runId,
    mode: seed.run.mode ?? "mock",
    directory: "data/akg-simulation.yaml",
    status: "active",
    connection: "active",
    provider: seed.run.provider,
    model: seed.run.model,
    surface: seed.run.surface,
    securityLevel: seed.run.security_level,
    payloadMode: seed.run.payload_mode,
    experimentCondition: seed.run.experiment_condition,
    targetMethod: seed.run.target_method,
    targetUrl: seed.run.target_url,
    candidateBudget: seed.run.candidate_budget,
    maxIterations: seed.run.max_iterations,
    startedAt,
    endedAt,
    hasJournal: false,
    hasManifest: false,
    hasArtifact: false,
  };
  return {
    seed: {
      file: "data/akg-simulation.yaml",
      schemaVersion: seed.schema_version,
      name: seed.name,
      description: seed.description,
      intervalMs,
    },
    executionId,
    runId,
    status: "completed",
    run,
    events,
    assertions: seed.assertions,
  };
}
