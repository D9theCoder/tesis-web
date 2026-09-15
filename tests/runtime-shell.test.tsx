import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { StrictMode, useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeShell } from "@/components/runtime/runtime-shell";
import * as api from "@/lib/api-client";
import { createAkgMockSimulation } from "@/lib/akg-mock";
import { AKG_SNAPSHOT } from "@/lib/akg-static";
import type {
  AkgSnapshot,
  RunListResponse,
  EventCursorResponse,
  NormalizedResult,
} from "@/lib/schemas";

const graph = vi.hoisted(() => ({ ready: true }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function TestGraph(props: {
      onLayoutReady?: () => void;
      snapshot: AkgSnapshot;
      akgPath: string[];
    }) {
      const { onLayoutReady } = props;
      useEffect(() => {
        if (graph.ready) onLayoutReady?.();
      }, [onLayoutReady]);
      return (
        <div
          data-testid="graph"
          data-snapshot={JSON.stringify(props.snapshot)}
          data-path={JSON.stringify(props.akgPath)}
        >
          <button onClick={props.onLayoutReady}>Layout ready</button>
        </div>
      );
    },
}));
vi.mock("@/lib/api-client", () => ({
  fetchRuns: vi.fn(),
  fetchEvents: vi.fn(),
  fetchResult: vi.fn(),
  fetchAkg: vi.fn(),
  fetchAkgMock: vi.fn(),
}));
const simulation = () =>
  createAkgMockSimulation(
    load(readFileSync("data/akg-simulation.yaml", "utf8")),
    { nowMs: 1000 },
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}
async function tick(ms = 420) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function start() {
  fireEvent.click(
    screen.getByRole("button", { name: "Run seeded AKG traversal test" }),
  );
  await flush();
}
async function finish() {
  for (let i = 0; i < 18; i++) await tick();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  graph.ready = true;
  vi.mocked(api.fetchRuns).mockResolvedValue({
    runs: [],
    active: [],
  } as unknown as RunListResponse);
  vi.mocked(api.fetchAkg).mockResolvedValue(
    AKG_SNAPSHOT as unknown as Record<string, unknown>,
  );
  vi.mocked(api.fetchAkgMock).mockImplementation(async () => simulation());
  vi.mocked(api.fetchEvents).mockResolvedValue({
    executionId: "live-run",
    hasMore: false,
    events: [],
    nextCursor: 0,
    status: "active",
  } as EventCursorResponse);
  vi.mocked(api.fetchResult).mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());
describe("isolated mock sessions", () => {
  it("ignores a pending live event response after entering mock mode", async () => {
    const run = { ...simulation().run, executionId: "live" };
    vi.mocked(api.fetchRuns).mockResolvedValue({
      runs: [run],
      active: [run],
    } as unknown as RunListResponse);
    const pending = deferred<EventCursorResponse>();
    vi.mocked(api.fetchEvents).mockReturnValue(pending.promise);
    render(<RuntimeShell />);
    await flush();
    await tick(2000);
    expect(api.fetchEvents).toHaveBeenCalled();
    await start();
    pending.resolve({
      executionId: "live",
      hasMore: false,
      status: "completed",
      nextCursor: 1,
      events: [
        {
          event_type: "graph.state",
          node: "late-live-node",
          data: { akg_path: ["late-live-node"] },
        },
      ],
    });
    await flush();
    await finish();
    expect(screen.getByText(/AKG verified/)).toBeVisible();
    expect(screen.getByTestId("graph").dataset.path).not.toContain(
      "late-live-node",
    );
    expect(api.fetchResult).not.toHaveBeenCalled();
  });
  it("waits for layout and stays pending until all 18 events have been reduced", async () => {
    graph.ready = false;
    render(<RuntimeShell />);
    await start();
    await tick(10000);
    expect(screen.getByTestId("replay-count")).toHaveTextContent("0/18");
    expect(screen.queryByText(/AKG verified/)).toBeNull();
    fireEvent.click(screen.getByText("Layout ready"));
    for (let i = 0; i < 17; i++) {
      await tick();
      expect(screen.queryByText(/AKG verified/)).toBeNull();
    }
    await tick();
    expect(screen.getByText(/AKG verified/)).toBeInTheDocument();
    expect(screen.getByTestId("replay-count")).toHaveTextContent("18/18");
    expect(JSON.parse(screen.getByTestId("graph").dataset.path!)).toEqual(
      simulation().assertions.expected_path,
    );
  });
  it("Strict Mode and reruns reduce each event exactly once and retain the completed result", async () => {
    render(
      <StrictMode>
        <RuntimeShell />
      </StrictMode>,
    );
    await start();
    await finish();
    expect(screen.getByTestId("replay-count")).toHaveTextContent("18/18");
    const count = vi.mocked(api.fetchRuns).mock.calls.length;
    await tick(15000);
    expect(api.fetchRuns).toHaveBeenCalledTimes(count);
    expect(screen.getByText(/AKG verified/)).toBeVisible();
    await start();
    expect(screen.getByTestId("replay-count")).toHaveTextContent("0/18");
    expect(screen.queryByText(/AKG verified/)).toBeNull();
    await finish();
    expect(screen.getByTestId("replay-count")).toHaveTextContent("18/18");
    fireEvent.click(screen.getByText("Return to live"));
    await flush();
    expect(api.fetchRuns).toHaveBeenCalledTimes(count + 1);
    expect(screen.queryByTestId("replay-count")).toBeNull();
  });
  it("verifies against the captured resolved snapshot and shows useful mismatch details", async () => {
    const drift = {
      ...AKG_SNAPSHOT,
      edges: AKG_SNAPSHOT.edges.filter(
        (edge) => edge.target !== "data_exfiltrated",
      ),
    };
    vi.mocked(api.fetchAkg).mockResolvedValue(
      drift as unknown as Record<string, unknown>,
    );
    render(<RuntimeShell />);
    await start();
    await finish();
    expect(screen.getByText(/AKG mismatch/)).toBeVisible();
    expect(
      screen.getByText(
        /Expected every directed transition; missing: access_control_confirmed/,
      ),
    ).toBeVisible();
    expect(
      JSON.parse(screen.getByTestId("graph").dataset.snapshot!).edges,
    ).toHaveLength(drift.edges.length);
  });
  it("shows failure for a deliberately mismatched path assertion", async () => {
    const seed = simulation();
    seed.assertions.expected_path = ["unauthenticated"];
    vi.mocked(api.fetchAkgMock).mockResolvedValue(seed);
    render(<RuntimeShell />);
    await start();
    await finish();
    expect(screen.getByText(/AKG mismatch/)).toBeVisible();
    expect(screen.getByText("Exact ordered traversal")).toBeVisible();
  });
  it.each(["resolve", "reject"] as const)(
    "ignores a late live discovery %s and stops all live work",
    async (action) => {
      const pending = deferred<RunListResponse>();
      vi.mocked(api.fetchRuns).mockReturnValue(pending.promise);
      render(<RuntimeShell />);
      await start();
      if (action === "reject") pending.reject(new Error("late live error"));
      else
        pending.resolve({
          runs: [simulation().run],
          active: [simulation().run],
        } as unknown as RunListResponse);
      await flush();
      await finish();
      expect(screen.queryByText(/late live error/)).toBeNull();
      expect(screen.getByText(/AKG verified/)).toBeVisible();
      expect(api.fetchEvents).not.toHaveBeenCalled();
    },
  );
  it("ignores late events, artifacts and snapshot responses from the live session", async () => {
    const run = { ...simulation().run, executionId: "live-run" };
    vi.mocked(api.fetchRuns).mockResolvedValue({
      runs: [run],
      active: [run],
    } as unknown as RunListResponse);
    const artifact = deferred<NormalizedResult | null>();
    vi.mocked(api.fetchResult).mockReturnValue(artifact.promise);
    vi.mocked(api.fetchEvents).mockResolvedValue({
      executionId: "live-run",
      hasMore: false,
      events: [],
      status: "completed",
      nextCursor: 0,
    } as EventCursorResponse);
    const oldSnapshot = deferred<Record<string, unknown>>();
    vi.mocked(api.fetchAkg).mockReturnValueOnce(oldSnapshot.promise);
    render(<RuntimeShell />);
    await flush();
    await tick(2000);
    expect(api.fetchResult).toHaveBeenCalled();
    await start();
    artifact.resolve({ mode: "single-run" } as NormalizedResult);
    oldSnapshot.resolve({ ...AKG_SNAPSHOT, nodes: [] });
    await flush();
    await finish();
    expect(screen.queryByText("Open detailed results")).toBeNull();
    expect(screen.getByText(/AKG verified/)).toBeVisible();
    expect(
      JSON.parse(screen.getByTestId("graph").dataset.snapshot!).nodes,
    ).toHaveLength(29);
  });
  it("aborts a pending mock and ignores its result after Return to live or replacement", async () => {
    const old = deferred<ReturnType<typeof simulation>>();
    vi.mocked(api.fetchAkgMock).mockReturnValueOnce(old.promise);
    render(<RuntimeShell />);
    await start();
    const signal = vi.mocked(api.fetchAkgMock).mock.calls[0][0];
    fireEvent.click(screen.getByText("Return to live"));
    expect(signal?.aborted).toBe(true);
    await start();
    old.resolve(simulation());
    await flush();
    await finish();
    expect(screen.getByTestId("replay-count")).toHaveTextContent("18/18");
  });
  it("cancels timers on unmount and retains loading errors until a rerun or Return to live", async () => {
    vi.mocked(api.fetchAkgMock).mockRejectedValueOnce(
      new Error("Malformed seed"),
    );
    const mounted = render(<RuntimeShell />);
    await start();
    expect(screen.getByRole("alert")).toHaveTextContent("Malformed seed");
    await tick(10000);
    expect(screen.getByText(/AKG mismatch/)).toBeVisible();
    await start();
    await tick();
    mounted.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
