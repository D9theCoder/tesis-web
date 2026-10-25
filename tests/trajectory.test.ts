import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/lib/schemas";
import { deriveTrajectory, filterTrajectoryTurns } from "@/lib/trajectory";

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
    expect(filterTrajectoryTurns(model.turns, "   ")).toEqual(model.turns);
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
