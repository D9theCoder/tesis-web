import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { workflowProgress } from "@/lib/artifact-contract";
import { initialState, reduceEvents } from "@/lib/event-reducer";
import { normalizeResult } from "@/lib/result-normalizer";
import { ResultsSummary } from "@/components/results/status-details";
import { workflowProgressSchema, type WorkflowProgress } from "@/lib/schemas";

const progress: WorkflowProgress = {
  protocol_version: "workflow.v2", iteration_unit: "method_visit", iteration_count: 2, max_iterations: 4,
  stop_policy: "coverage", coverage_target: 0.5,
  method_coverage: { attempted: 2, total: 4, ratio: 0.5, methods: ["sqli_union", "sqli_error"] },
  stop_reason: "coverage_target_reached",
};

describe("versioned TESIS workflow progress", () => {
  it("keeps method coverage separate from matrix coverage and tolerates legacy artifacts", () => {
    const result = normalizeResult({ execution_id: "new", workflow: progress });
    expect(result.workflow).toEqual(progress);
    expect(result.coverage).toBeNull();
    expect(normalizeResult({ execution_id: "legacy", final_state: { iteration_count: 7 } }).workflow).toBeNull();
  });

  it("reads an enriched scorer summary when there is no top-level workflow", () => {
    expect(workflowProgress({ final_state: { summary: { workflow: progress } } })).toEqual(progress);
  });

  it("rejects inconsistent method counts and does not invent a replacement", () => {
    expect(workflowProgressSchema.safeParse({ ...progress, method_coverage: { ...progress.method_coverage, ratio: 1 } }).success).toBe(false);
    expect(workflowProgress({ workflow: { ...progress, iteration_count: 6 } })).toBeNull();
  });

  it("retains newer visit progress and terminal stop reasons during stale snapshot replay", () => {
    const event = (workflow: WorkflowProgress) => ({ event_type: "graph.state", execution_id: "run", data: { workflow } });
    const state = reduceEvents(initialState("run"), [event(progress)]);
    const earlier = { ...progress, iteration_count: 1, stop_reason: null };
    const replayed = reduceEvents(state, [event(earlier), event({ ...progress, stop_reason: null })]);
    expect(replayed.workflow).toEqual(progress);
    expect(replayed.metrics.iterationCount).toBe(2);
    expect(replayed.metrics.remainingIterations).toBe(2);
    expect(state.workflow).toEqual(progress);
  });

  it("records destination recon without counting a method visit or exploit", () => {
    const workflow = { ...progress, iteration_count: 1, stop_reason: null,
      method_coverage: { attempted: 1, total: 4, ratio: 0.25, methods: ["sqli_union"] } };
    const before = reduceEvents(initialState("run"), [{ event_type: "graph.state", execution_id: "run",
      data: { workflow, selected_method: "sqli_union" } }]);
    const after = reduceEvents(before, [
      { event_type: "recon.destination.probe", execution_id: "run", node: "chaining_router",
        data: { method: "bf_dictionary", signal_detected: true, verified_grade: 1, status_code: 200 } },
      { event_type: "recon.destination.completed", execution_id: "run", node: "chaining_router",
        data: { method: "bf_dictionary", reason: "preconditions_measured", observations: { no_rate_limit: true } } },
    ]);
    expect(after.workflow).toEqual(workflow);
    expect(after.selectedMethod).toBe("sqli_union");
    expect(after.metrics.iterationCount).toBe(1);
    expect(after.metrics.attempts).toBe(0);
    expect(after.metrics.successes).toBe(0);
    expect(after.confirmedVulns).toEqual([]);
    expect(after.events.slice(-2).map(event => event.event_type)).toEqual([
      "recon.destination.probe", "recon.destination.completed",
    ]);
    expect(before.events).toHaveLength(1);
  });

  it("keeps child workflow progress out of the matrix parent", () => {
    const state = { ...initialState("matrix"), mode: "matrix" };
    const reduced = reduceEvents(state, [{ event_type: "graph.state", execution_id: "child", data: { workflow: progress } }]);
    expect(reduced.workflow).toBeNull();
    expect(reduced.children.child.workflow).toEqual(progress);
  });

  it("renders stop policy, method visits and stop reason in completed results", () => {
    render(<ResultsSummary result={normalizeResult({ execution_id: "new", workflow: progress })} />);
    expect(screen.getByText("Method visits").nextElementSibling).toHaveTextContent("2 / 4");
    expect(screen.getByText("Method coverage").nextElementSibling).toHaveTextContent("2 / 4 (50%)");
    expect(screen.getByText("Coverage target").nextElementSibling).toHaveTextContent("50%");
    expect(screen.getByText("Stop reason").nextElementSibling).toHaveTextContent(/coverage target reached/i);
  });
});
