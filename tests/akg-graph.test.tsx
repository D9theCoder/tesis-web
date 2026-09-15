import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AkgGraph } from "@/components/runtime/akg-graph";
import { layoutAkg, type AkgLayout } from "@/lib/akg-layout";
import { AKG_SNAPSHOT } from "@/lib/akg-static";

const flow = vi.hoisted(() => ({
  fitView: vi.fn(),
  setCenter: vi.fn(),
  getZoom: () => 1,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  setViewport: vi.fn(),
}));
vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  ReactFlow: () => <div data-testid="flow" />,
  useReactFlow: () => flow,
  useNodesInitialized: () => true,
  BaseEdge: () => null,
  Handle: () => null,
  Position: { Right: "right", Left: "left" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}));
vi.mock("@/lib/akg-layout", async (original) => ({
  ...(await original<typeof import("@/lib/akg-layout")>()),
  layoutAkg: vi.fn(),
}));
const props = {
  snapshot: AKG_SNAPSHOT,
  currentNode: null,
  selectedMethod: null,
  akgPath: [],
  confirmedVulns: [],
  achievedOutcomes: [],
  viableMethods: [],
};
const layout: AkgLayout = { nodes: [], edges: [], groups: [] };
beforeEach(() => {
  vi.clearAllMocks();
});

it("discards a stale failed layout after a snapshot change and fits the resolved layout", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(layoutAkg)
    .mockReturnValueOnce(
      new Promise((_, no) => {
        reject = no;
      }),
    )
    .mockResolvedValueOnce(layout);
  const onLayoutReady = vi.fn();
  const mounted = render(<AkgGraph {...props} onLayoutReady={onLayoutReady} />);
  mounted.rerender(
    <AkgGraph
      {...props}
      snapshot={{ ...AKG_SNAPSHOT, schema_version: "replacement" }}
      onLayoutReady={onLayoutReady}
    />,
  );
  await waitFor(() => expect(onLayoutReady).toHaveBeenCalled());
  await act(async () => reject(new Error("stale failure")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(flow.fitView).toHaveBeenCalled();
});

it("shows layout failure with a working retry and never signals ready for the failure", async () => {
  vi.mocked(layoutAkg)
    .mockRejectedValueOnce(new Error("placement failed"))
    .mockResolvedValueOnce(layout);
  const ready = vi.fn();
  render(<AkgGraph {...props} onLayoutReady={ready} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "placement failed",
  );
  expect(ready).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry layout" }));
  await waitFor(() => expect(ready).toHaveBeenCalled());
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not refit on runtime events after a user changes the viewport", async () => {
  vi.mocked(layoutAkg).mockResolvedValue(layout);
  const ready = vi.fn();
  const mounted = render(<AkgGraph {...props} onLayoutReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenCalled());
  flow.fitView.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  mounted.rerender(
    <AkgGraph
      {...props}
      akgPath={["unauthenticated", "brute_force"]}
      currentNode="brute_force"
      onLayoutReady={ready}
    />,
  );
  expect(flow.zoomIn).toHaveBeenCalled();
  expect(flow.fitView).not.toHaveBeenCalled();
  expect(layoutAkg).toHaveBeenCalledTimes(1);
});

it("discards a stale successful layout and preserves repeated traversal steps", async () => {
  let resolve!: (value: AkgLayout) => void;
  vi.mocked(layoutAkg)
    .mockReturnValueOnce(
      new Promise((yes) => {
        resolve = yes;
      }),
    )
    .mockResolvedValueOnce(layout);
  const ready = vi.fn();
  const mounted = render(<AkgGraph {...props} onLayoutReady={ready} />);
  mounted.rerender(
    <AkgGraph
      {...props}
      snapshot={{ ...AKG_SNAPSHOT, schema_version: "new" }}
      akgPath={["unauthenticated", "brute_force", "unauthenticated"]}
      onLayoutReady={ready}
    />,
  );
  await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  await act(async () =>
    resolve({
      ...layout,
      groups: [
        { id: "stale", label: "stale", x: 0, y: 0, width: 1, height: 1 },
      ],
    }),
  );
  expect(ready).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Step 1: unauthenticated" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Step 3: unauthenticated" }),
  ).toBeVisible();
});
