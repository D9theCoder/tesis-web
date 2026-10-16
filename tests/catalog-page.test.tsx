import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentOverviewPage } from "@/components/experiment-overview";
import { ExperimentInventoryPage } from "@/components/experiment-inventory";
import { fetchExperimentOverview, fetchExperiments } from "@/lib/api-client";
import type { ExperimentEntry, ExperimentList, ExperimentOverview } from "@/lib/experiment-contract";
import { navigation, useRouter, useSearchParams } from "./navigation-mock";

vi.mock("next/navigation", () => ({ useRouter: () => useRouter(), useSearchParams: () => useSearchParams() }));
vi.mock("@/lib/api-client", () => ({ fetchExperimentOverview: vi.fn(), fetchExperiments: vi.fn() }));
const entry = (id: string): ExperimentEntry => ({ run: { executionId: id, mode: "single-run", directory: "fixture", status: "success", executionStatus: "completed", securityOutcome: null, hasArtifact: true, experimentCondition: "Recorded condition" },
  kind: "standalone", unit: "execution", memberCount: 0, contextFromMembers: false, coverage: null, lifecycle: { completed: 1 }, outcomes: { confirmed: 0 }, unknownOutcomes: 1, diagnostics: [] });
const list = (id = "saved-a"): ExperimentList => ({ entries: [entry(id)], total: 1, nextCursor: null, experiments: 1, executions: 1, unresolved: 0, partial: false, refreshedAt: "2026-10-17T00:00:00Z", diagnostics: [] });
function overview(id: string): ExperimentOverview {
  const workflow = { eligible: 0, eligibilityUnknown: 1, scanned: 1, total: 1, states: { missing: 1 } };
  return { experiment: entry(id), source: null, refreshedAt: "2026-10-17T00:00:00Z", partial: false, unit: "standalone execution", coverage: null,
    lifecycle: { completed: 1, failed: 0, interrupted: 0, unknown: 0 }, outcomes: { confirmed: 0 }, unknownOutcomes: 1,
    reviews: { human: workflow, ai: workflow, complete: true, limit: 100 }, attention: [], diagnostics: [] };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); navigation.url = "/overview?scope=saved-a";
  vi.mocked(fetchExperiments).mockResolvedValue(list());
  vi.mocked(fetchExperimentOverview).mockResolvedValue(overview("saved-a"));
});

describe("scoped research workflow", () => {
  it("does not expose the previous scope while a new selection loads or after its late response", async () => {
    const a = deferred<ExperimentOverview>(), b = deferred<ExperimentOverview>();
    vi.mocked(fetchExperimentOverview).mockImplementation(query => query.includes("saved-b") ? b.promise : a.promise);
    render(<ExperimentOverviewPage />);
    await act(async () => { navigation.router.push("/overview?scope=saved-b"); });
    b.resolve(overview("saved-b"));
    expect(await screen.findByText("saved-b", { selector: "code" })).toBeVisible();
    await act(async () => { a.resolve(overview("saved-a")); });
    expect(screen.queryByText("saved-a", { selector: "code" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open results" })).toHaveAttribute("href", "/results/saved-b");
  });
  it("keeps an explicit missing source unavailable and recovers only through a successful retry", async () => {
    vi.mocked(fetchExperimentOverview).mockRejectedValueOnce(new Error("Selected experiment unavailable: saved-a"));
    render(<ExperimentOverviewPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No other experiment has been substituted");
    expect(screen.queryByRole("link", { name: "Open results" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Open results" })).toHaveAttribute("href", "/results/saved-a");
  });
  it("keeps unavailable planned coverage and missing reviews distinct from zero or pending", async () => {
    render(<ExperimentOverviewPage />);
    await screen.findByRole("heading", { name: "Coverage" });
    const planned = screen.getByText("Recorded planned").parentElement!;
    expect(planned).toHaveTextContent("Unavailable");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Row density" })).toBeNull();
    expect(within(screen.getByRole("heading", { name: "Human workflow" }).parentElement!).getByText("missing").parentElement).toHaveTextContent("1");
  });
});

describe("server-owned inventory state", () => {
  it("preserves scope and filters in a shareable search URL and restores it on navigation", async () => {
    navigation.url = "/results?view=executions&scope=matrix-a&outcome=confirmed&cursor=25&density=compact";
    render(<ExperimentInventoryPage />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search experiments and exact IDs" }), { target: { value: "exact child" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const query = new URL(navigation.url, "http://localhost").searchParams;
    expect(Object.fromEntries(query)).toMatchObject({ scope: "matrix-a", view: "executions", outcome: "confirmed", cursor: "0", density: "compact", q: "exact child" });
    await act(async () => { navigation.router.push("/results?view=experiments&q=restored&sort=oldest"); });
    expect(screen.getByRole("searchbox")).toHaveValue("restored");
  });
  it("retains the current inventory after a failed refresh but hides it on a query identity change", async () => {
    navigation.url = "/results";
    render(<ExperimentInventoryPage />);
    expect(await screen.findByRole("link", { name: "Open results" })).toHaveAttribute("href", "/results/saved-a");
    vi.mocked(fetchExperiments).mockRejectedValueOnce(new Error("Refresh unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh inventory" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh unavailable");
    expect(screen.getByRole("link", { name: "Open results" })).toBeVisible();
    vi.mocked(fetchExperiments).mockRejectedValueOnce(new Error("Selected experiment unavailable"));
    await act(async () => { navigation.router.push("/results?scope=missing"); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Selected experiment unavailable");
    expect(screen.queryByRole("link", { name: "Open results" })).toBeNull();
  });
});
