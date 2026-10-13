import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunCatalog } from "@/components/run-catalog";
import type { RunSummary } from "@/lib/schemas";

const runs: RunSummary[] = [
  { executionId: "new-run", mode: "single-run", directory: "", status: "success", executionStatus: "completed", securityOutcome: "no_finding", provider: "provider-a", model: "model-a", startedAt: "2026-10-13T00:00:00Z", hasArtifact: true },
  { executionId: "old-run", mode: "matrix", directory: "", status: "error", executionStatus: "failed", securityOutcome: "confirmed", provider: "provider-b", startedAt: "2026-10-12T00:00:00Z", hasArtifact: true },
  { executionId: "unknown-run", mode: "single-run", directory: "", status: "success" },
];
describe("run catalog review", () => {
  it("filters loaded runs by model and canonical security outcome without inferring missing status", () => {
    render(<RunCatalog runs={runs} />);
    expect(within(screen.getByRole("row", { name: /unknown-run/ })).getAllByText("unknown")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search loaded runs" }), { target: { value: "model-a" } });
    expect(screen.getByRole("link", { name: "new-run" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "old-run" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Security outcome" }), { target: { value: "confirmed" } });
    expect(screen.getByRole("link", { name: "old-run" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "new-run" })).toBeNull();
  });
  it("keeps missing dates last in oldest order and provides separate monitor/result actions", () => {
    const pick = vi.fn();
    render(<RunCatalog runs={runs} onPick={pick} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "oldest" } });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("old-run");
    expect(rows[2]).toHaveTextContent("unknown-run");
    fireEvent.click(screen.getByRole("button", { name: "Monitor old-run" }));
    expect(pick).toHaveBeenCalledWith(runs[1]);
    expect(screen.getByRole("link", { name: "Results for old-run" })).toHaveAttribute("href", "/results/old-run");
  });
});
