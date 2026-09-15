import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createAkgMockSimulation,
  parseAkgMockSeed,
  verifyAkgMockState,
} from "@/lib/akg-mock";
import { initialState, reduceEvents } from "@/lib/event-reducer";
import { AKG_SNAPSHOT } from "@/lib/akg-static";
import type { RunEvent } from "@/lib/schemas";

const raw = () =>
  load(readFileSync("data/akg-simulation.yaml", "utf8")) as Record<
    string,
    unknown
  >;
const fixture = () => createAkgMockSimulation(raw(), { nowMs: 100000 });
describe("seed validation", () => {
  it("parses the checked-in YAML and supplies omitted optional defaults", () => {
    const seed = raw();
    delete seed.interval_ms;
    seed.run = {};
    seed.assertions = { expected_path: ["unauthenticated"] };
    const parsed = parseAkgMockSeed(seed);
    expect(parsed.interval_ms).toBe(420);
    expect(parsed.assertions.expected_confirmed).toEqual([]);
    expect(createAkgMockSimulation(seed).run.mode).toBe("mock");
  });
  it.each([
    null,
    [],
    "yaml",
    { ...raw(), schema_version: "v2" },
    { ...raw(), run: [] },
    { ...raw(), assertions: [] },
    { ...raw(), events: [] },
    { ...raw(), interval_ms: "420" },
    { ...raw(), description: 42 },
    { ...raw(), run: { model: 7 } },
    { ...raw(), run: { max_iterations: -1 } },
    { ...raw(), assertions: { expected_path: [] } },
    { ...raw(), assertions: { expected_path: [1] } },
    {
      ...raw(),
      events: [
        { event_type: "run.started", data: [] },
        { event_type: "run.completed" },
      ],
    },
    {
      ...raw(),
      events: [
        { event_type: "graph.state", data: { akg_path: [null] } },
        { event_type: "run.completed" },
      ],
    },
  ])("rejects malformed seed %#", (value) => {
    expect(() => parseAkgMockSeed(value)).toThrow();
  });
  it("returns validated assertions without a server verdict", () => {
    const simulation = fixture();
    expect(simulation).not.toHaveProperty("verification");
    expect(simulation.assertions.expected_path).toHaveLength(10);
  });
});
describe("actual reduced state verification", () => {
  it("reduces all 18 events once to the exact 10-node path and nine directed transitions", () => {
    const simulation = fixture();
    const state = simulation.events.reduce(
      (state, event) => reduceEvents(state, [event]),
      initialState(),
    );
    expect(state.events).toHaveLength(18);
    expect(state.akgPath).toEqual(simulation.assertions.expected_path);
    expect(state.currentNode).toBe("data_exfiltrated");
    expect(state.confirmedVulns).toEqual(
      expect.arrayContaining([
        "bf_dictionary",
        "bf_dictionary_confirmed",
        "ac_idor",
        "ac_idor_confirmed",
      ]),
    );
    expect(state.achievedOutcomes).toEqual([
      "authenticated_session",
      "data_exfiltrated",
    ]);
    expect(
      verifyAkgMockState(state, simulation.assertions, AKG_SNAPSHOT),
    ).toMatchObject({ passed: true, transitions: 9 });
  });
  it.each(["path", "current", "confirmed", "outcomes", "nodes", "edges"])(
    "detects a %s mismatch with expected/actual details",
    (kind) => {
      const simulation = fixture();
      const state = reduceEvents(initialState(), simulation.events);
      const snapshot = structuredClone(AKG_SNAPSHOT);
      if (kind === "path") state.akgPath = state.akgPath.slice(1);
      if (kind === "current") state.currentNode = "unauthenticated";
      if (kind === "confirmed") state.confirmedVulns = [];
      if (kind === "outcomes") state.achievedOutcomes = [];
      if (kind === "nodes")
        snapshot.nodes = snapshot.nodes.filter(
          (node) => node.id !== "data_exfiltrated",
        );
      if (kind === "edges")
        snapshot.edges = snapshot.edges.map((edge) =>
          edge.target === "data_exfiltrated"
            ? { ...edge, source: edge.target, target: edge.source }
            : edge,
        );
      const result = verifyAkgMockState(state, simulation.assertions, snapshot);
      expect(result.passed).toBe(false);
      expect(result.checks.find((check) => check.id === kind)).toMatchObject({
        passed: false,
        detail: expect.stringMatching(/Expected/),
      });
    },
  );
  it("does not turn aliases and extra findings into a mismatch", () => {
    const simulation = fixture();
    const state = reduceEvents(initialState(), simulation.events);
    state.confirmedVulns.push("another_finding");
    state.achievedOutcomes.push("another_outcome");
    expect(
      verifyAkgMockState(state, simulation.assertions, AKG_SNAPSHOT).passed,
    ).toBe(true);
  });
  it("preserves repeated visits, accumulations, counters and ignores malformed traversal arrays", () => {
    const event = (
      event_type: string,
      data: Record<string, unknown>,
    ): RunEvent => ({ event_type, data });
    let state = reduceEvents(initialState(), [
      event("chain.transition", {
        akg_path: ["a", "b", "a"],
        confirmed_vulns: ["x"],
        achieved_outcomes: ["y"],
      }),
      event("graph.state", { iteration_count: 8, confirmed_vulns: [] }),
    ]);
    state = reduceEvents(state, [
      event("graph.state", { akg_path: [], iteration_count: 1 }),
      event("graph.state", { akg_path: ["a"], iteration_count: 1 }),
      event("outcome.achieved", { akg_path: ["a", 0] }),
    ]);
    expect(state.akgPath).toEqual(["a", "b", "a"]);
    expect(state.currentNode).toBe("a");
    expect(state.metrics.iterationCount).toBe(8);
    expect(state.confirmedVulns).toEqual(["x"]);
    expect(state.achievedOutcomes).toEqual(["y"]);
  });
});
