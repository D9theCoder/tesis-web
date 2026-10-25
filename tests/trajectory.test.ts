import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/lib/schemas";
import { deriveTrajectory, filterTrajectoryTurns, projectOverview } from "@/lib/trajectory";

function event(
  event_type: string,
  extra: Omit<Partial<RunEvent>, "event_type"> = {},
): RunEvent {
  return { event_type, ...extra };
}

/** A short run: one planning turn, one probe turn, and a model call. */
const SAMPLE: RunEvent[] = [
  event("run.started", { timestamp: 1000 }),
  event("method.selected", { timestamp: 1000.5, method: "sqli-basic" }),
  event("probe.attempt", { timestamp: 1001, method: "sqli-basic", node: "param-id" }),
  event("probe.success", { timestamp: 1003, method: "sqli-basic", node: "param-id" }),
  event("llm.request", { timestamp: 1004 }),
  event("llm.response", { timestamp: 1006.5, data: { total_tokens: 128 } }),
  event("method.selected", { timestamp: 1007, method: "xss-reflected" }),
  event("probe.attempt", { timestamp: 1008, method: "xss-reflected" }),
];

describe("deriveTrajectory", () => {
  it("collapses a matching start and finish into one measured cell", () => {
    const model = deriveTrajectory([
      event("probe.attempt", { timestamp: 10 }),
      event("probe.success", { timestamp: 12.25 }),
    ]);

    expect(model.turns).toHaveLength(1);
    const [cell] = model.turns[0].cells;
    expect(cell.kind).toBe("tool");
    expect(cell.lane).toBe("tools");
    expect(cell.eventType).toBe("probe.attempt");
    expect(cell.outcome).toBe("probe.success");
    expect(cell.durationMs).toBe(2250);
    expect(cell.pending).toBe(false);
    expect(cell.records.map((record) => record.index)).toEqual([1, 2]);
    expect(model.stats.cells).toBe(1);
    expect(model.stats.toolCalls).toBe(1);
  });

  it("keeps an unanswered start pending and never invents a duration", () => {
    const model = deriveTrajectory([event("probe.attempt", { timestamp: 10 })]);

    const [cell] = model.turns[0].cells;
    expect(cell.pending).toBe(true);
    expect(cell.durationMs).toBeNull();
    expect(cell.outcome).toBeNull();
    expect(model.overview.durationAvailable).toBe(false);
    expect(model.overview.resolution).toBe("sequence");
    expect(model.overview.spanSeconds).toBe(0);
    expect(model.turns[0].pending).toBe(true);
    expect(model.turns[0].durationMs).toBeNull();
  });

  it("classifies event types into the shared kind vocabulary", () => {
    const cases: Array<[string, string, string]> = [
      ["run.started", "system", "input"],
      ["chat.user", "user", "input"],
      ["graph.state", "context", "input"],
      ["method.selected", "context", "input"],
      ["chain.transition", "context", "input"],
      ["llm.response", "model", "model"],
      ["probe.success", "tool", "tools"],
      ["vuln.confirmed", "tool", "tools"],
      ["guardrail.blocked", "safety", "tools"],
      ["containment.triggered", "safety", "tools"],
    ];

    for (const [eventType, kind, lane] of cases) {
      const [cell] = deriveTrajectory([event(eventType)]).turns[0].cells;
      expect({ eventType, kind: cell.kind, lane: cell.lane }).toEqual({
        eventType,
        kind,
        lane,
      });
    }
  });

  it("appends streamed chunks to the preceding model row", () => {
    const model = deriveTrajectory([
      event("llm.request", { timestamp: 1 }),
      event("llm.token", { timestamp: 1.5 }),
      event("llm.token", { timestamp: 1.8 }),
      event("llm.response", { timestamp: 2 }),
    ]);

    expect(model.stats.cells).toBe(1);
    const [cell] = model.turns[0].cells;
    expect(cell.records).toHaveLength(4);
    expect(cell.durationMs).toBe(1000);
  });

  it("opens a new turn at each planning marker and model request", () => {
    const model = deriveTrajectory(SAMPLE);

    expect(model.stats.turns).toBe(3);
    expect(model.turns.map((turn) => turn.turn)).toEqual([1, 2, 3]);
    expect(model.turns.map((turn) => turn.cells.length)).toEqual([1, 2, 3]);
    // Turn 2 holds the method selection plus the probe it triggered; turn 3 opens
    // on the model request and absorbs the follow-up selection.
    expect(model.turns[1].cells.map((cell) => cell.kind)).toEqual(["context", "tool"]);
    expect(model.turns[2].cells.map((cell) => cell.kind)).toEqual(["model", "context", "tool"]);
    expect(model.turns[1].label).toBe("sqli-basic");
    expect(model.turns[2].label).toBe("xss-reflected");
    expect(model.turns[1].cells.every((cell) => cell.turn === 2)).toBe(true);
  });

  it("measures the overview in duration mode when timestamps exist", () => {
    const { overview } = deriveTrajectory(SAMPLE);

    expect(overview.resolution).toBe("duration");
    expect(overview.durationAvailable).toBe(true);
    expect(overview.spanSeconds).toBeCloseTo(8, 5);
    expect(overview.boundaries.map((boundary) => boundary.turn)).toEqual([1, 2, 3]);
    expect(overview.boundaries[0].start).toBe(0);

    const spans = [...overview.lanes.input, ...overview.lanes.model, ...overview.lanes.tools];
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.start).toBeLessThanOrEqual(1);
      expect(span.width).toBeGreaterThanOrEqual(0);
      expect(span.start + span.width).toBeLessThanOrEqual(1.0000001);
      expect(span.title).toContain(`Turn ${span.turn}`);
    }
  });

  it("falls back to emission order when records carry no timestamps", () => {
    const model = deriveTrajectory([
      event("probe.attempt"),
      event("probe.success"),
      event("vuln.confirmed"),
    ]);

    expect(model.overview.resolution).toBe("sequence");
    expect(model.overview.durationAvailable).toBe(false);
    const spans = model.overview.lanes.tools;
    expect(spans).toHaveLength(2);
    expect(spans[0].start).toBe(0);
    expect(spans[1].start).toBeCloseTo(1 / 2, 5);
    expect(spans[0].width).toBeCloseTo(1 / 2, 5);
  });

  it("flags failures from event types and from payload verdicts", () => {
    const model = deriveTrajectory([
      event("probe.attempt", { timestamp: 1 }),
      event("probe.failed", { timestamp: 2 }),
      event("guardrail.rejected", { timestamp: 3, data: { ok: false } }),
    ]);

    const [paired, standalone] = model.turns[0].cells;
    expect(paired.isError).toBe(true);
    expect(standalone.isError).toBe(true);
    expect(model.stats.errors).toBe(2);
    expect(model.stats.safetyEvents).toBe(1);
  });

  it("sums reported token usage and keeps it null when unreported", () => {
    const withTokens = deriveTrajectory([
      event("llm.request", { timestamp: 1 }),
      event("llm.response", { timestamp: 2, data: { total_tokens: 90 } }),
      event("llm.request", { timestamp: 3 }),
      event("llm.response", { timestamp: 4, data: { total_tokens: 10 } }),
    ]);
    expect(withTokens.stats.tokens).toBe(100);

    const withoutTokens = deriveTrajectory([event("probe.success", { timestamp: 1 })]);
    expect(withoutTokens.stats.tokens).toBeNull();
  });

  it("keeps every record in journal order without dropping any kind", () => {
    const journal: RunEvent[] = [
      event("run.started", { timestamp: 1 }),
      event("graph.state", { timestamp: 2 }),
      event("method.selected", { timestamp: 3, method: "sqli" }),
      event("llm.request", { timestamp: 4 }),
      event("llm.response", { timestamp: 5, data: { response_text: "next" } }),
      event("probe.attempt", { timestamp: 6, method: "sqli" }),
      event("probe.success", { timestamp: 7, method: "sqli" }),
      event("guardrail.blocked", { timestamp: 8, data: { ok: false } }),
      event("run.completed", { timestamp: 9 }),
    ];

    const model = deriveTrajectory(journal);
    const ordered = model.turns.flatMap((turn) => turn.cells.flatMap((cell) => cell.records));

    expect(ordered.map((record) => record.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ordered.map((record) => record.eventType)).toEqual(
      journal.map((entry) => entry.event_type),
    );
    expect(new Set(model.turns.flatMap((turn) => turn.cells.map((cell) => cell.kind)))).toEqual(
      new Set(["system", "context", "model", "tool", "safety"]),
    );
  });

  it("projects equal-width spans on request and keeps measured spans by default", () => {
    const turns = deriveTrajectory(SAMPLE).turns;
    const cells = turns.flatMap((turn) => turn.cells);

    const equal = projectOverview(turns, "equal");
    expect(equal.scale).toBe("equal");
    expect(equal.resolution).toBe("sequence");
    expect(equal.durationAvailable).toBe(true);

    const equalSpans = [...equal.lanes.input, ...equal.lanes.model, ...equal.lanes.tools];
    expect(equalSpans).toHaveLength(cells.length);
    for (const span of equalSpans) {
      expect(span.width).toBeCloseTo(1 / cells.length, 6);
    }
    expect(equalSpans.some((span) => span.kind === "tool")).toBe(true);

    const timed = projectOverview(turns);
    expect(timed.scale).toBe("duration");
    expect(timed.resolution).toBe("duration");
    expect(timed.lanes.tools).not.toEqual(equal.lanes.tools);
  });

  it("is deterministic for the same event window", () => {
    expect(deriveTrajectory(SAMPLE)).toEqual(deriveTrajectory(SAMPLE));
  });

  it("returns an empty model for an empty journal", () => {
    const model = deriveTrajectory([]);
    expect(model.turns).toEqual([]);
    expect(model.stats).toMatchObject({ turns: 0, cells: 0, errors: 0, tokens: null });
    expect(model.overview.durationAvailable).toBe(false);
    expect(model.overview.lanes).toEqual({ input: [], model: [], tools: [] });
  });
});

describe("filterTrajectoryTurns", () => {
  const model = deriveTrajectory(SAMPLE);

  it("returns every turn for a blank query", () => {
    expect(filterTrajectoryTurns(model.turns, "   ")).toBe(model.turns);
  });

  it("narrows to the requested kinds without changing the two-argument call", () => {
    const conversation = filterTrajectoryTurns(model.turns, "", ["system", "user", "model"]);
    const kinds = conversation.flatMap((turn) => turn.cells.map((cell) => cell.kind));

    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((kind) => kind === "system" || kind === "user" || kind === "model")).toBe(
      true,
    );
    expect(filterTrajectoryTurns(model.turns, "", [])).toEqual(model.turns);

    const composed = filterTrajectoryTurns(model.turns, "xss", ["tool"]);
    expect(composed).toHaveLength(1);
    expect(composed[0].cells.map((cell) => cell.kind)).toEqual(["tool"]);
    expect(composed[0].cells.map((cell) => cell.eventType)).toEqual(["probe.attempt"]);
  });

  it("drops turns whose cells were all filtered out", () => {
    const filtered = filterTrajectoryTurns(model.turns, "", ["model"]);
    expect(filtered.flatMap((turn) => turn.cells.map((cell) => cell.kind))).toEqual(
      filtered.flatMap((turn) => turn.cells.map(() => "model")),
    );
    expect(filtered.length).toBeLessThan(model.turns.length);
  });

  it("keeps matching cells and drops turns left empty", () => {
    const filtered = filterTrajectoryTurns(model.turns, "XSS-REFLECTED");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].cells).toHaveLength(2);
    expect(filtered[0].cells.every((cell) => cell.method === "xss-reflected")).toBe(true);
  });

  it("matches record event types and messages", () => {
    const typed = filterTrajectoryTurns(model.turns, "llm.response");
    expect(typed.flatMap((turn) => turn.cells)).toHaveLength(1);
    expect(filterTrajectoryTurns(model.turns, "no-such-record")).toEqual([]);
  });
});

describe("payload projection", () => {
  it("projects request, response, reasoning, model, path, and usage", () => {
    const model = deriveTrajectory([
      event("llm.request", {
        timestamp: 1,
        node: "bf_dictionary",
        data: {
          model: "deepseek-chat",
          prompts: [
            { role: "system", content: "You are TESIS." },
            { role: "user", content: "Pick the next AKG method." },
          ],
          akg_path: ["unauthenticated", "brute_force", "bf_dictionary"],
        },
      }),
      event("llm.response", {
        timestamp: 1.8,
        node: "bf_dictionary",
        data: {
          reasoning_content: "Dictionary attempt is cheapest.",
          response_text: "Use the seeded credential pair.",
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            completion_tokens_details: { reasoning_tokens: 64 },
          },
        },
      }),
    ]);

    const [cell] = model.turns[0].cells;
    expect(cell.inputText).toContain("system: You are TESIS.");
    expect(cell.inputText).toContain("user: Pick the next AKG method.");
    expect(cell.thinkingText).toBe("Dictionary attempt is cheapest.");
    expect(cell.outputText).toBe("Use the seeded credential pair.");
    expect(cell.model).toBe("deepseek-chat");
    expect(cell.akgPath).toEqual(["unauthenticated", "brute_force", "bf_dictionary"]);
    expect(cell.usage).toEqual({ input: 120, output: 30, reasoning: 64, cached: null, total: 150 });
    expect(model.turns[0].akgPath).toEqual(["unauthenticated", "brute_force", "bf_dictionary"]);
    expect(model.turns[0].usage).toMatchObject({ input: 120, output: 30, total: 150 });
  });

  it("derives first-token latency and throughput from streamed chunks", () => {
    const model = deriveTrajectory([
      event("llm.started", { timestamp: 10, data: { prompt_tokens: 100 } }),
      event("llm.token", { timestamp: 10.5, data: { token: "Use " } }),
      event("llm.token", { timestamp: 10.9, data: { token: "the pair." } }),
      event("llm.completed", { timestamp: 11.5, data: { completion_tokens: 10 } }),
    ]);

    const [cell] = model.turns[0].cells;
    expect(cell.records).toHaveLength(4);
    expect(cell.outputText).toBe("Use the pair.");
    expect(cell.timing.ttftMs).toBe(500);
    expect(cell.timing.decodeMs).toBe(1000);
    expect(cell.timing.tokensPerSecond).toBe(10);
    expect(cell.usage).toMatchObject({ input: 100, output: 10, total: 110 });
  });

  it("keeps unrecorded payload facts null instead of guessing", () => {
    const model = deriveTrajectory([
      event("llm.request", { timestamp: 1 }),
      event("llm.response", { timestamp: 2, message: "Done." }),
    ]);

    const [cell] = model.turns[0].cells;
    expect(cell.inputText).toBeNull();
    expect(cell.outputText).toBeNull();
    expect(cell.thinkingText).toBeNull();
    expect(cell.model).toBeNull();
    expect(cell.akgPath).toEqual([]);
    expect(cell.usage.total).toBeNull();
    expect(cell.timing.ttftMs).toBeNull();
    expect(cell.timing.tokensPerSecond).toBeNull();
  });

  it("derives a status per cell and the ending status per node", () => {
    const model = deriveTrajectory([
      event("method.selected", { timestamp: 1, node: "sqli" }),
      event("probe.attempt", { timestamp: 2, node: "sqli", method: "sqli" }),
      event("probe.failed", { timestamp: 3, node: "sqli", method: "sqli" }),
      event("probe.attempt", { timestamp: 4, node: "sqli", method: "sqli" }),
      event("probe.success", { timestamp: 5, node: "sqli", method: "sqli" }),
      event("vuln.confirmed", { timestamp: 6, node: "sqli_confirmed", method: "sqli" }),
    ]);

    const turn = model.turns[0];
    expect(turn.cells.map((cell) => cell.eventType)).toEqual([
      "method.selected",
      "probe.attempt",
      "probe.attempt",
      "vuln.confirmed",
    ]);
    expect(turn.cells[1].status).toBe("failed");
    expect(turn.cells[2].status).toBe("completed");
    expect(turn.cells[3].status).toBe("completed");
    expect(turn.status).toBe("completed");
    expect(turn.nodes).toEqual([
      { node: "sqli", method: "sqli", status: "completed" },
      { node: "sqli_confirmed", method: "sqli", status: "completed" },
    ]);
    expect(model.stats.errors).toBe(1);
  });

  it("reports a still-running turn as pending", () => {
    const model = deriveTrajectory([
      event("probe.attempt", { timestamp: 1, node: "sqli" }),
      event("graph.state", { timestamp: 2 }),
    ]);

    expect(model.turns[0].cells[0].status).toBe("pending");
    expect(model.turns[0].status).toBe("pending");
  });

  it("aggregates token totals and node count for the window", () => {
    const model = deriveTrajectory([
      event("llm.request", { timestamp: 1, node: "a", data: { prompt_tokens: 40 } }),
      event("llm.response", {
        timestamp: 2,
        node: "a",
        data: { completion_tokens: 8, reasoning_tokens: 16 },
      }),
    ]);

    expect(model.stats).toMatchObject({
      inputTokens: 40,
      outputTokens: 8,
      reasoningTokens: 16,
      tokens: 48,
      nodes: 1,
    });
  });

  it("searches projected request and response text", () => {
    const model = deriveTrajectory([
      event("llm.request", { timestamp: 1, data: { prompts: ["find the injection point"] } }),
      event("graph.state", { timestamp: 2 }),
    ]);

    const hits = filterTrajectoryTurns(model.turns, "injection point");
    expect(hits).toHaveLength(1);
    expect(hits[0].cells).toHaveLength(1);
    expect(filterTrajectoryTurns(model.turns, "credential-pair")).toEqual([]);
  });
});
