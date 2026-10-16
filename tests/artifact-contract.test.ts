import { describe, expect, it } from "vitest";
import { canonicalStatus, coverage, metricReading } from "@/lib/artifact-contract";
import { normalizeResult, buildEvidenceRows, selectedCoordinate } from "@/lib/result-normalizer";
import { candidateExecutionStatusSchema, artifactSchema } from "@/lib/schemas";
import { initialState, reduceEvents } from "@/lib/event-reducer";
const single = (extra = {}) => ({ schema_version: "tui.v1", execution_id: "test-single", status: "success", config: {}, ...extra });
describe("lifecycle and security semantics", () => {
  for (const execution of ["completed", "failed", "interrupted"]) for (const outcome of ["confirmed", "no_finding", "unconfirmed", "fixture_limited"]) {
    it(`${execution} / ${outcome} remain independent`, () => {
      const result = normalizeResult(single({ execution_status: execution, security_outcome: outcome }));
      expect(result.executionStatus).toBe(execution); expect(result.securityOutcome).toBe(outcome);
    });
  }
  it("retains unknown attribution and separates candidate dispositions", () => {
    expect(canonicalStatus(single({ status: "error", task_result: "INCOMPLETE" })).executionStatus).toBeNull();
    expect(canonicalStatus(single({ status: "error", response_evidence: [{ status_code: 200, signal_detected: true }] })).securityOutcome).toBeNull();
    expect(candidateExecutionStatusSchema.parse("executed")).toBe("executed");
    expect(artifactSchema.safeParse(single({ execution_status: "executed" })).success).toBe(false);
  });
  it("keeps planned, represented, canonical, unknown and skipped coverage distinct", () => {
    const c = coverage({ cancellation: { total_runs: 6, not_started_runs: 1, completed_runs: 5 }, totals: { total_runs: 5, successful_runs: 2, error_runs: 3 }, runs: [
      single({ execution_status: "failed", security_outcome: "confirmed" }), single({ execution_status: "completed", security_outcome: "no_finding" }),
      single({ status: "error", task_result: "INCOMPLETE" }), single({ status: "skipped" }), single({ status: "cancelled", security_outcome: "fixture_limited" }),
    ] });
    expect(c).toMatchObject({ represented: 5, planned: 6, unstarted: 1, completed: 1, failed: 1, interrupted: 1, confirmed: 1, unknown: 1, skipped: 1 });
    expect(c?.legacyTotals?.successful_runs).toBe(2);
  });
});
describe("nullable scores and metric availability", () => {
  it("does not fabricate zero, round components, or recompute partial composites", () => {
    const result = normalizeResult(single({ method_score: 2.75, output_score: 0 }));
    expect(result.scores).toEqual({ Smethod: 2.75, Soutput: 0 });
    expect(result.scoringRows.find(r => r.dimension === "Spayload")?.score).toBeNull();
    expect(result.scoringRows.find(r => r.dimension === "Srun")?.score).toBeNull();
  });
  it("prefers report summary, preserves explicit zero, rejects bare/null/nonfinite metrics", () => {
    expect(metricReading({ token_cost: 9 }, "token_cost")).toMatchObject({ value: null, reason: "legacy_numeric" });
    expect(metricReading({ token_cost: null }, "token_cost").value).toBeNull();
    expect(metricReading({ token_cost: Infinity, metric_availability: { token_cost: true } }, "token_cost")).toMatchObject({ available: false, reason: "invalid_numeric" });
    expect(metricReading({ token_cost: 9, report: { summary: { token_cost: 0, metric_availability: { token_cost: true } } } },"token_cost")).toMatchObject({ value: 0, available: true });
    const r = normalizeResult(single({ report: { summary: { method_selection_accuracy: .5 } }, llm_performance_summary: { adaptation_rate: .9 } }));
    expect(r.metrics.methodSelectionAccuracy).toBe(.5); expect(r.metrics.adaptationRate).toBeUndefined();
  });
  it("retains aggregate availability denominators and reasons", () => {
    const r = metricReading({ token_cost: { mean: null, n_available: 0, n_unavailable: 3, unavailable_reasons: { not_computed: 3 } } }, "token_cost");
    expect(r).toMatchObject({ value: null, available: false, nAvailable: 0, nUnavailable: 3, unavailableReasons: { not_computed: 3 } });
  });
  it("backfills top-level availability and reasons while nested fields take precedence", () => {
    const hybrid = { token_cost: 9, metric_availability: { token_cost: true },
      metric_unavailable_reason: { token_cost: "provider_usage_missing" }, report: { summary: { token_cost: 0 } } };
    expect(metricReading(hybrid, "token_cost")).toMatchObject({ value: 0, available: true, reason: null });
    expect(metricReading({ ...hybrid, metric_availability: { token_cost: false } }, "token_cost"))
      .toMatchObject({ value: null, available: false, reason: "provider_usage_missing" });
    expect(metricReading({ ...hybrid, report: { summary: { token_cost: 3,
      metric_availability: { token_cost: false }, metric_unavailable_reason: { token_cost: "nested_reason" } } } }, "token_cost"))
      .toMatchObject({ value: null, available: false, reason: "nested_reason" });
    expect(metricReading({ ...hybrid, report: { summary: { metric_availability: {} } } }, "token_cost"))
      .toMatchObject({ value: null, available: false, reason: "provider_usage_missing" });
  });
});
describe("child evidence and references", () => {
  it("uses independent final_state/config and cannot use parent evidence as child detail", () => {
    const matrix = normalizeResult({ execution_id: "parent", runs: [single({ execution_id: "child", status: "error", config: { surface: "sqli" }, final_state: { selected_method: "child-method", method_score: 2.5 } })],
      response_evidence: [{ evidence_id: "parent-only", response_excerpt: "parent" }] });
    expect(matrix.coordinates[0]).toMatchObject({ selectedMethod: "child-method", surface: "sqli", scores: { Smethod: 2.5 } });
    const child = selectedCoordinate(matrix,"child");
    expect(child?.executionId).toBe("child"); expect(child?.evidenceRows).toEqual([]);
    expect(selectedCoordinate(normalizeResult({ execution_id: "parent", runs: [{ execution_id: "child", status: "success" }] }),"child")).toBeNull();
  });
  it("uses persistent IDs, excerpts, timestamps, joins and separates transport/signal/proof", () => {
    const rows = buildEvidenceRows({ request_evidence: [{ request_id: "request-a", candidate_id: "candidate-a", timestamp: 100 }],
      response_evidence: [{ evidence_id: "response-a", request_id: "request-a", candidate_id: "candidate-a", timestamp: "2026-10-12T00:00:00Z", response_excerpt: "saved excerpt", signal_detected: true }],
      verifier_history: [{ verifier_id: "proof-a", decision: "not_confirmed", evidence_refs: ["#/response_evidence/0"] }] });
    const response = rows.find(r => r.id === "response-a")!;
    expect(response.timestamp).toBe("2026-10-12T00:00:00.000Z"); expect(response.details.responseExcerpt).toBe("saved excerpt");
    expect(response.result).toContain("transport: unknown"); expect(response.status).toBe("info");
    expect(response.relatedEventIds).toEqual(expect.arrayContaining(["request-a", "proof-a"]));
  });
});
describe("selected execution journal state", () => {
  it("LLM and child terminal events do not stop matrix timing or union concurrent graphs", () => {
    const state = { ...initialState("matrix-a"), mode: "matrix" };
    const r = reduceEvents(state,[
      { event_type: "matrix.started", execution_id: "matrix-a", timestamp: 1 },
      { event_type: "llm.completed", execution_id: "matrix-a", timestamp: 2 },
      { event_type: "graph.state", execution_id: "child-a", timestamp: 3, data: { akg_path: ["a"], confirmed_vulns: ["finding-a"] } },
      { event_type: "graph.state", execution_id: "child-b", timestamp: 4, data: { akg_path: ["b"], confirmed_vulns: ["finding-b"] } },
      { event_type: "matrix.run.finished", execution_id: "matrix-a", timestamp: 5, data: { coordinate_execution_id: "child-a", execution_status: "completed" } },
    ],{ nowEpochSec: 10, status: "active" });
    expect(r.endedAt).toBeNull(); expect(r.elapsedMs).toBe(9000); expect(r.akgPath).toEqual([]); expect(r.confirmedVulns).toEqual([]);
    expect(r.children["child-a"].akgPath).toEqual(["a"]); expect(r.children["child-b"].confirmedVulns).toEqual(["finding-b"]);
    expect(r.children["child-a"].executionStatus).toBe("completed");
    const ended = reduceEvents(r,[{ event_type: "matrix.cancelled", execution_id: "matrix-a", timestamp: 12, data: { execution_status: "interrupted", security_outcome: "confirmed" } }],{ nowEpochSec: 12 });
    expect(ended.endedAt).toBe(12); expect(ended.securityOutcome).toBe("confirmed"); expect(ended.children["child-a"].confirmedVulns).toEqual(["finding-a"]);
  });
  it("isolates a directly selected child and keeps unknown usage null", () => {
    const r = reduceEvents(initialState("child-a"),[{ event_type: "vuln.confirmed", execution_id: "child-b", method: "unrelated" }],{ nowEpochSec: 1 });
    expect(r.confirmedVulns).toEqual([]); expect(r.metrics.tokenCost).toBeNull(); expect(r.metrics.tokenCount).toBeNull();
  });
});

describe("producer precedence regressions", () => {
  it("falls back from raw null envelope fields without undoing projected unknowns", () => {
    const raw = single({ execution_status: null, security_outcome: null, final_state: { execution_status: "completed", security_outcome: "no_finding" } });
    expect(canonicalStatus(raw)).toMatchObject({ executionStatus: "completed", securityOutcome: "no_finding" });
    expect(canonicalStatus({ ...raw, observer_projection: { epoch: "bound" } })).toMatchObject({ executionStatus: null, securityOutcome: null });
  });
  it("retains projected components and explicit unknowns over legacy scores", () => {
    const result = normalizeResult(single({ method_score: 1, composite_score: 1, payload_scores: { candidate: 1 },
      observer_runtime_scores: { components: { Smethod: 4, Spayload: 2.75, Srun: null } } }));
    expect(result.scores).toEqual({ Smethod: 4, Spayload: 2.75 });
  });
  it("bounds previews without dropping cumulative findings or lifecycle", () => {
    const events = Array.from({ length: 700 }, (_, index) => ({ event_type: "vuln.confirmed", execution_id: "bounded", method: `method-${index}`, timestamp: index + 1 }));
    const state = reduceEvents(initialState("bounded"), events);
    expect(state.events).toHaveLength(300);
    expect(state.events[0].timestamp).toBe(401);
    expect(state.confirmedVulns).toContain("method-0");
    expect(state.confirmedVulns).toContain("method-699");
    expect(state.endedAt).toBeNull();
  });
});
