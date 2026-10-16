import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogPage } from "@/components/catalog-page";
import { fetchRuns } from "@/lib/api-client";
import type { RunListResponse, RunSummary } from "@/lib/schemas";

vi.mock("@/lib/api-client", () => ({ fetchRuns: vi.fn() }));
const fetch = vi.mocked(fetchRuns);
const response = (runs: RunSummary[] = []): RunListResponse => ({ tesisRoot: "/sanitized", runs, total: runs.length, nextCursor: null });
const saved: RunSummary = { executionId: "saved-execution", mode: "single-run", directory: "", status: "completed", executionStatus: "completed", hasArtifact: true };
beforeEach(() => { fetch.mockReset(); });

describe("catalog availability and recovery", () => {
  it("keeps unknown counts distinct from a successful empty catalog and recovers through Retry", async () => {
    let reject!: (error: Error) => void;
    fetch.mockImplementationOnce(() => new Promise<RunListResponse>((_, failure) => { reject = failure; }));
    render(<CatalogPage overview />);
    expect(screen.getByRole("status", { name: "Loading run catalog" })).toBeVisible();
    await act(async () => { reject(new Error("Source temporarily unavailable")); });
    expect(screen.getByRole("alert")).toHaveTextContent("Source temporarily unavailable");
    expect(screen.getByRole("heading", { name: "Run catalog unavailable" })).toBeVisible();
    expect(screen.queryByText("No runs available")).toBeNull();
    fetch.mockResolvedValueOnce(response());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "No runs available" })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("preserves loaded executions during a failed refresh and disables Retry while recovery is pending", async () => {
    fetch.mockResolvedValueOnce(response([saved]));
    render(<CatalogPage overview />);
    expect(await screen.findByRole("link", { name: "saved-execution" })).toBeVisible();
    fetch.mockRejectedValueOnce(new Error("Refresh unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalog" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh unavailable");
    expect(screen.getByRole("link", { name: "saved-execution" })).toBeVisible();
    let resolve!: (value: RunListResponse) => void;
    fetch.mockImplementationOnce(() => new Promise<RunListResponse>(success => { resolve = success; }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "saved-execution" })).toBeVisible();
    await act(async () => { resolve(response([saved])); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh catalog" })).toBeEnabled();
  });
});
