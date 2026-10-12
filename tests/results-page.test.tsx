import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResultsPage from "@/app/results/[executionId]/page";
import { normalizeResult } from "@/lib/result-normalizer";
import * as api from "@/lib/api-client";
import type { NormalizedResult } from "@/lib/schemas";
const route = vi.hoisted(() => ({ executionId: "matrix-a" }));
vi.mock("next/navigation", () => ({ useParams: () => route }));
vi.mock("@/lib/api-client", () => ({ fetchResult: vi.fn(), fetchCoordinateResult: vi.fn() }));
function deferred<T>() { let resolve!: (value:T)=>void; const promise = new Promise<T>(yes => { resolve=yes; }); return { promise, resolve }; }
function child(id: string, excerpt: string) { return normalizeResult({ execution_id: id, status: "success", execution_status: "completed", security_outcome: "no_finding",
  response_evidence: [{ evidence_id: `${id}-response`, response_excerpt: excerpt }], config: {} }); }
const matrix = () => normalizeResult({ execution_id: "matrix-a", status: "success", response_evidence: [{ evidence_id: "parent-only" }], runs: [
  { execution_id: "child-a", run_id: "duplicate-run-id", status: "success" },{ execution_id: "child-b", run_id: "duplicate-run-id", status: "success" },
] });
async function flush() { await act(async () => { await Promise.resolve(); }); }
beforeEach(() => { vi.resetAllMocks(); route.executionId="matrix-a"; vi.mocked(api.fetchResult).mockResolvedValue(matrix()); });
describe("source-consistent result selection", () => {
  it("ignores a late child response, switches the header and downloads to the selected child", async () => {
    const a = deferred<NormalizedResult|null>(), b = deferred<NormalizedResult|null>();
    vi.mocked(api.fetchCoordinateResult).mockImplementation((_parent,id) => id === "child-a" ? a.promise : b.promise);
    render(<ResultsPage />); await flush();
    fireEvent.click(screen.getByRole("button",{ name: /Coordinate 1:/ }));
    fireEvent.click(screen.getByRole("button",{ name: /Coordinate 2:/ }));
    b.resolve(child("child-b","only b")); await flush();
    expect(screen.getByText("execution child-b")).toBeVisible();
    a.resolve(child("child-a","only a")); await flush();
    expect(screen.queryByText("execution child-a")).toBeNull();
    fireEvent.click(screen.getByRole("button",{ name: "JSON" }));
    fireEvent.click(screen.getByRole("button",{ name: "Raw" }));
    expect(screen.getByText(/only b/)).toBeVisible(); expect(screen.queryByText(/only a/)).toBeNull(); expect(screen.queryByText(/parent-only/)).toBeNull();
  });
  it("reports unavailable child detail and cannot expose the parent's evidence", async () => {
    vi.mocked(api.fetchCoordinateResult).mockResolvedValue(null);
    render(<ResultsPage />); await flush(); fireEvent.click(screen.getByRole("button",{ name: /Coordinate 1:/ })); await flush();
    expect(screen.getByRole("status")).toHaveTextContent("Detail unavailable for child-a");
    expect(screen.getByText("execution child-a")).toBeVisible();
    fireEvent.click(screen.getByRole("button",{ name: "JSON" })); expect(screen.queryByText(/parent-only/)).toBeNull();
  });
  it("resets selected evidence and child requests on route changes", async () => {
    const pending = deferred<NormalizedResult|null>(); vi.mocked(api.fetchCoordinateResult).mockReturnValue(pending.promise);
    const rendered = render(<ResultsPage />); await flush(); fireEvent.click(screen.getByRole("button",{ name: /Coordinate 1:/ }));
    route.executionId = "single-new"; vi.mocked(api.fetchResult).mockResolvedValue(child("single-new","new evidence")); rendered.rerender(<ResultsPage />); await flush();
    pending.resolve(child("child-a","old evidence")); await flush(); expect(screen.getByText("execution single-new")).toBeVisible(); expect(screen.queryByText("execution child-a")).toBeNull();
  });
});
