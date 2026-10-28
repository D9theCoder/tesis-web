import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResultsPage from "@/app/results/[executionId]/page";
import { normalizeResult } from "@/lib/result-normalizer";
import * as api from "@/lib/api-client";
import type { NormalizedResult, ReviewBundle, ReviewWorkflow } from "@/lib/schemas";
import { navigation, useRouter, useSearchParams, usePathname } from "./navigation-mock";
const route = vi.hoisted(() => ({ executionId: "matrix-a" }));
vi.mock("next/navigation", () => ({
  useParams: () => route,
  useRouter: () => useRouter(),
  useSearchParams: () => useSearchParams(),
  usePathname: () => usePathname(),
}));
vi.mock("@/lib/api-client", () => ({ fetchResult: vi.fn(), fetchCoordinateResult: vi.fn() }));
function deferred<T>() { let resolve!: (value:T)=>void; const promise = new Promise<T>(yes => { resolve=yes; }); return { promise, resolve }; }
function child(id: string, excerpt: string) { return normalizeResult({ execution_id: id, status: "success", execution_status: "completed", security_outcome: "no_finding",
  response_evidence: [{ evidence_id: `${id}-response`, response_excerpt: excerpt }], config: {} }); }
const matrix = () => normalizeResult({ execution_id: "matrix-a", status: "success", execution_status: "completed", security_outcome: "no_finding", response_evidence: [{ evidence_id: "parent-only" }], runs: [
  { execution_id: "child-a", run_id: "duplicate-run-id", status: "success", execution_status: "completed", security_outcome: "no_finding", composite_score: 3.25 },
  { execution_id: "child-b", run_id: "duplicate-run-id", status: "success", execution_status: "completed", security_outcome: "no_finding", composite_score: 2.75 },
] });
function review(status: ReviewWorkflow["status"], score: number | null): ReviewWorkflow {
  return {
    status, reason: status === "final" ? null : "No accepted receipt is available.", componentPendingReasons: {},
    components: status === "final" ? { Smethod: 3, Spayload: 3, Sexploit: 3, Schain: 3, Soutput: 3 } : null,
    SpayloadFinal: score, SrunFinal: score, rubric: "scoring.v4", origin: status === "final" ? "human" : null,
    source: null, numerator: score === null ? null : 3, denominator: score === null ? null : 4,
    candidateGrades: [], evidenceRefs: {},
  };
}
const matrixWithReviews = () => {
  const source = { rootId: "fixtures", path: "results/matrix.json", sha256: "a".repeat(64), schema: "observer-result.v1" };
  return {
    ...matrix(),
    source,
    reviews: { human: { ...review("final", 3.125), source }, ai: review("missing", null), history: [] as ReviewBundle["history"] },
  };
};
const evidenceResult = () => normalizeResult({
  execution_id: "evidence-run", status: "success", execution_status: "completed", security_outcome: "no_finding",
  execution_log: [{ event_id: "event-auth-1", event_type: "payload_validation", timestamp: "2026-10-13T04:00:00Z", node: "validator", method: "sql_probe", endpoint: "/auth", action: "POST /auth", result: "response accepted", candidate: "name=sample" }],
  config: {},
});
const matrixForScoreSorting = () => normalizeResult({ execution_id: "score-sort", status: "success", runs: [
  { execution_id: "score-high", status: "success", execution_status: "completed", security_outcome: "no_finding", composite_score: 3.25 },
  { execution_id: "score-low", status: "success", execution_status: "completed", security_outcome: "no_finding", composite_score: 2.75 },
  { execution_id: "score-missing", status: "success", execution_status: "completed", security_outcome: "no_finding" },
] });
const templateMatrix = () => normalizeResult({ execution_id: "matrix-template", status: "success", execution_status: "completed",
  security_outcome: "no_finding", experiment_condition: "akg_guided_hybrid", surface: "sqli", security_level: "low",
  payload_mode: "llm_template", config: {}, runs: [
    { execution_id: "child-template", run_id: "shared-run-id", status: "success", execution_status: "completed",
      security_outcome: "no_finding", experiment_condition: "akg_guided_hybrid", surface: "sqli", security_level: "low",
      payload_mode: "llm_template", selected_method: "fixture-method", repeat_index: 0, composite_score: 3 },
    { execution_id: "child-legacy", run_id: "shared-run-id", status: "success", execution_status: "completed",
      security_outcome: "no_finding", payload_mode: "static_only", selected_method: "fixture-method",
      repeat_index: 1, composite_score: 2 },
  ] });
async function flush() { await act(async () => { await Promise.resolve(); }); }
function openCoordinateBrowser() { fireEvent.click(screen.getByText("Browse coordinates")); }
beforeEach(() => { vi.resetAllMocks(); navigation.url = "/results/matrix-a"; route.executionId="matrix-a"; vi.mocked(api.fetchResult).mockResolvedValue(matrix()); vi.mocked(api.fetchCoordinateResult).mockResolvedValue(null); });
describe("source-consistent result selection", () => {
  it("shows an unnumbered Codex provider while preserving its ID in raw evidence", async () => {
    vi.mocked(api.fetchResult).mockResolvedValue(normalizeResult({
      execution_id: "codex-run", provider: "openai_codex_auth_2", model: "gpt-fixture", config: {},
    }));
    render(<ResultsPage />); await flush();
    expect(screen.getByText("codex")).toBeVisible();
    expect(screen.getByText("codex · gpt-fixture")).toBeVisible();
    expect(screen.queryByText("openai_codex_auth_2")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /JSON/ }));
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByText(/openai_codex_auth_2/)).toBeVisible();
  });

  it("ignores a late child response, switches the header and downloads to the selected child", async () => {
    const a = deferred<NormalizedResult|null>(), b = deferred<NormalizedResult|null>();
    vi.mocked(api.fetchCoordinateResult).mockImplementation((_parent,id) => id === "child-a" ? a.promise : b.promise);
    render(<ResultsPage />); await flush(); openCoordinateBrowser();
    fireEvent.click(screen.getByRole("button",{ name: /Coordinate 1:/ }));
    fireEvent.click(screen.getByRole("button",{ name: /Coordinate 2:/ }));
    b.resolve(child("child-b","only b")); await flush();
    expect(screen.getByText("execution child-b")).toBeVisible();
    a.resolve(child("child-a","only a")); await flush();
    expect(screen.queryByText("execution child-a")).toBeNull();
    fireEvent.click(screen.getByRole("tab",{ name: /JSON/ }));
    fireEvent.click(screen.getByRole("button",{ name: "Raw" }));
    expect(screen.getByText(/only b/)).toBeVisible(); expect(screen.queryByText(/only a/)).toBeNull(); expect(screen.queryByText(/parent-only/)).toBeNull();
  });
  it("reports unavailable child detail and cannot expose the parent's evidence", async () => {
    vi.mocked(api.fetchCoordinateResult).mockResolvedValue(null);
    render(<ResultsPage />); await flush(); openCoordinateBrowser(); fireEvent.click(screen.getByRole("button",{ name: /Coordinate 1:/ })); await flush();
    expect(within(screen.getByRole("tabpanel")).getByRole("status")).toHaveTextContent("Detail unavailable for child-a");
    expect(screen.getByText("execution child-a")).toBeVisible();
    fireEvent.click(screen.getByRole("tab",{ name: /JSON/ })); expect(screen.queryByText(/parent-only/)).toBeNull();
  });
  it("resets selected evidence and child requests on route changes", async () => {
    const pending = deferred<NormalizedResult|null>(); vi.mocked(api.fetchCoordinateResult).mockReturnValue(pending.promise);
    const rendered = render(<ResultsPage />); await flush(); openCoordinateBrowser(); fireEvent.click(screen.getByRole("button",{ name: /Coordinate 1:/ }));
    route.executionId = "single-new"; navigation.url = "/results/single-new"; vi.mocked(api.fetchResult).mockResolvedValue(child("single-new","new evidence")); rendered.rerender(<ResultsPage />); await flush();
    pending.resolve(child("child-a","old evidence")); await flush(); expect(screen.getByText("execution single-new")).toBeVisible(); expect(screen.queryByText("execution child-a")).toBeNull();
  });
});

describe("results review workflow", () => {
  it("opens on a factual summary with distinct execution, outcome, coverage, and review state", async () => {
    vi.mocked(api.fetchResult).mockResolvedValue(matrixWithReviews());
    render(<ResultsPage />); await flush();

    expect(screen.getByRole("tab", { name: /Summary/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Execution", level: 2 })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Security outcome", level: 2 })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Coverage", level: 2 })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Review state", level: 2 })).toBeVisible();
    expect(screen.getAllByText("Represented")[0].parentElement).toHaveTextContent("2");
    expect(screen.getByText(/scoring.v2.*provisional runtime/i)).toBeVisible();
    expect(screen.getByText("Final")).toBeVisible();
    expect(screen.getAllByText("a".repeat(64))).toHaveLength(2);
  });

  it("searches matrix coordinates and keeps the selected coordinate identity visible", async () => {
    render(<ResultsPage />); await flush(); openCoordinateBrowser();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search coordinates" }), { target: { value: "child-b" } });
    expect(screen.getByRole("button", { name: /Coordinate 2:.*child-b/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Coordinate 1:/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Coordinate 2:/ }));
    expect(screen.getByText("execution child-b")).toBeVisible();
  });

  it("renders Template runs with the shared payload-mode vocabulary and selects coordinates by execution identity", async () => {
    vi.mocked(api.fetchResult).mockResolvedValue(templateMatrix());
    route.executionId = "matrix-template"; navigation.url = "/results/matrix-template";
    render(<ResultsPage />); await flush();

    const description = document.querySelector<HTMLElement>(".page-description")!;
    expect(description).toHaveTextContent("AKG-guided hybrid · SQL injection · Low · Template");
    const execution = screen.getByRole("heading", { name: "Execution", level: 2 }).closest<HTMLElement>("section")!;
    expect(within(execution).getByText("Template")).toBeVisible();
    expect(within(execution).getByText("SQL injection · Low")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/Llm Template/);

    fireEvent.click(screen.getByRole("tab", { name: /Matrix/ }));
    const table = screen.getByRole("table", { name: "Scoring matrix" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("AKG-guided hybrid");
    expect(rows[0]).toHaveTextContent("SQL injection · Low · Template");
    expect(rows[1]).toHaveTextContent("Unavailable");
    expect(rows[1]).toHaveTextContent("Static only");
    expect(table.textContent).not.toMatch(/llm_template|static_only|Llm Template/);

    fireEvent.click(within(table).getByRole("button", { name: /Coordinate 1:.*child-template/ }));
    await flush();
    expect(navigation.url).toContain("coordinate=child-template");
    expect(screen.getByText("execution child-template")).toBeVisible();
    expect(screen.getByText("Viewing coordinate #1")).toBeVisible();
  });

  it("keeps provisional, Human, and AI score origins independent and preserves final precision", async () => {
    vi.mocked(api.fetchResult).mockResolvedValue(matrixWithReviews());
    render(<ResultsPage />); await flush();
    fireEvent.click(screen.getByRole("tab", { name: /Scoring/ }));

    const human = screen.getByRole("button", { name: "Human review" });
    fireEvent.click(human);
    expect(human).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("scoring.v4 · Final")).toBeVisible();
    expect(screen.getAllByText("3.1250").length).toBeGreaterThan(0);
    expect(screen.getByText("a".repeat(64))).toBeVisible();

    const ai = screen.getByRole("button", { name: "AI review" });
    fireEvent.click(ai);
    expect(ai).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("scoring.v4 · Missing")).toBeVisible();
    expect(screen.getAllByText("No accepted receipt is available.").length).toBeGreaterThan(0);
  });

  it("shows source-bound metric populations, coverage, zeros, and unavailable reasons", async () => {
    const result = matrixWithReviews();
    result.reviews.human.metrics = {
      schema_version: "research-metrics.v2",
      values: { payload_validity_rate: 0, first_choice_accuracy: null, guardrail_activation_rate: 0 },
      availability: { payload_validity_rate: true, first_choice_accuracy: false, guardrail_activation_rate: true },
      unavailable_reason: { payload_validity_rate: null, first_choice_accuracy: "no_model_decision", guardrail_activation_rate: null },
      denominators: {
        payload_validity_rate: { numerator: 0, denominator: 2, population: "model_candidates",
          origin: "model", method: "sqli_union", visit_id: null, coverage: 0.5 },
        guardrail_activation_rate: { numerator: 0, denominator: 4, population: null,
          origin: null, method: "sqli_union", visit_id: null, coverage: 0 },
        first_choice_accuracy: { numerator: null, denominator: null, population: "model_decisions",
          origin: null, method: "sqli_union", visit_id: null },
        legacy_count: 4,
      },
    };
    vi.mocked(api.fetchResult).mockResolvedValue(result);
    render(<ResultsPage />); await flush();
    fireEvent.click(screen.getByRole("tab", { name: /Scoring/ }));
    fireEvent.click(screen.getByRole("button", { name: "Human review" }));
    const metrics = screen.getByRole("region", { name: "Human review metrics" });
    const valid = within(metrics).getByText("Payload Validity Rate").parentElement!;
    expect(valid).toHaveTextContent("0");
    expect(valid).toHaveTextContent("Numerator / denominator: 0 / 2");
    expect(valid).toHaveTextContent("Population: Model Candidates");
    expect(valid).toHaveTextContent("Coverage: 50.00%");
    expect(metrics).toHaveTextContent("no_model_decision");
    const guardrail = within(metrics).getByText("Guardrail Activation Rate").parentElement!;
    expect(guardrail).not.toHaveTextContent("Unavailable");
    expect(guardrail).toHaveTextContent("Coverage: 0.00%");
    expect(metrics).toHaveTextContent("Legacy Count");
    expect(metrics).toHaveTextContent("Denominator: 4");
    fireEvent.click(screen.getByRole("button", { name: "AI review" }));
    expect(screen.getByRole("region", { name: "AI review metrics" })).toHaveTextContent("No metric vector");
  });

  it("labels a saved AI receipt by review origin and its rejection reason", async () => {
    const result = matrixWithReviews();
    result.reviews.history = [{ path: "reviews/ai.ai-verified.json", sha256: "b".repeat(64), workflow: "ai",
      accepted: false, reason: "receipt_source_hash_mismatch", receipt: { artifact_type: "thesis_score_receipt" } }];
    vi.mocked(api.fetchResult).mockResolvedValue(result);
    render(<ResultsPage />); await flush();
    fireEvent.click(screen.getByRole("tab", { name: /Scoring/ }));

    const receipts = screen.getByText("Saved review receipts (1)").parentElement!;
    expect(receipts).toHaveTextContent("AI rubric · Receipt Source Hash Mismatch · reviews/ai.ai-verified.json");
    expect(receipts).toHaveTextContent("b".repeat(64));
    expect(receipts).not.toHaveTextContent("· Ai ·");
  });

  it("sorts matrix scores numerically and keeps unavailable values last in both directions", async () => {
    vi.mocked(api.fetchResult).mockResolvedValue(matrixForScoreSorting());
    render(<ResultsPage />); await flush();
    fireEvent.click(screen.getByRole("tab", { name: /Matrix/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort matrix coordinates" }), { target: { value: "score" } });

    const table = screen.getByRole("table", { name: "Scoring matrix" });
    const rows = () => within(table).getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
    expect(rows()[0]).toContain("score-low");
    expect(rows()[1]).toContain("score-high");
    expect(rows()[2]).toContain("score-missing");
    expect(rows()[2]).toContain("Unavailable");

    fireEvent.click(within(table.parentElement!.parentElement!).getByRole("button", { name: "Sort descending" }));
    expect(rows()[0]).toContain("score-high");
    expect(rows()[1]).toContain("score-low");
    expect(rows()[2]).toContain("score-missing");
  });

  it("filters evidence, resets common filters, and opens records with a keyboard-accessible inspect action", async () => {
    vi.mocked(api.fetchResult).mockResolvedValue(evidenceResult());
    render(<ResultsPage />); await flush();
    fireEvent.click(screen.getByRole("tab", { name: /Evidence/ }));

    fireEvent.change(screen.getByRole("searchbox", { name: "Search evidence" }), { target: { value: "POST /auth" } });
    const inspect = screen.getByRole("button", { name: "Inspect evidence event-auth-1" });
    expect(inspect).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText(/1 of 1 matching evidence records/)).toBeVisible();
    fireEvent.click(inspect);
    expect(screen.getByRole("dialog", { name: "Evidence detail" })).toBeVisible();
    expect(screen.getAllByText("POST /auth").length).toBeGreaterThan(0);
  });
});
