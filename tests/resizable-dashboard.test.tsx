import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizableRuntimeDashboard } from "@/components/runtime/resizable-dashboard";
import {
  applyPanelDelta,
  clamp,
  clampDashboardHeight,
  clampRailWidth,
  defaultPanelHeights,
  effectivePanelMin,
  fitPanelHeights,
  GRAPH_MIN_WIDTH,
  keyboardStep,
  panelMaxHeight,
  panelTrackHeight,
  parseDashboardHeight,
  parsePanelHeights,
  parseRailWidth,
  railMaxWidth,
  readStoredValue,
  resetPanelPair,
  serializeDashboardHeight,
  serializePanelHeights,
  serializeRailWidth,
  setPanelHeight,
  writeStoredValue,
  PANEL_MIN_HEIGHT,
  RAIL_DEFAULT_WIDTH,
  RAIL_MIN_WIDTH,
  RAIL_STORAGE_KEY,
  PANEL_STORAGE_KEY,
  DASHBOARD_HEIGHT_KEY,
  DASHBOARD_MAX_HEIGHT,
  DASHBOARD_MIN_HEIGHT,
} from "@/lib/resizable-layout";

const FALLBACK_HEIGHT = 700;

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    media: "(min-width: 1201px)",
    get matches() {
      return matches;
    },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return {
    query,
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}

function renderDashboard() {
  return render(
    <ResizableRuntimeDashboard
      graph={<div data-testid="graph" />}
      panels={[
        { label: "Coordinate", content: <div data-testid="coordinate" /> },
        { label: "Trajectory", content: <div data-testid="trajectory" /> },
        { label: "Outcomes", content: <div data-testid="outcomes" /> },
      ]}
    />,
  );
}

function separator(name: string): HTMLElement {
  return screen.getByRole("separator", { name });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("resizable layout helpers", () => {
  it("clamps sizes and rail limits", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);

    // The rail can take most of the workspace, but never the graph's floor.
    expect(railMaxWidth(1201)).toBe(501);
    expect(railMaxWidth(1366)).toBe(666);
    expect(railMaxWidth(1440)).toBe(720);
    expect(railMaxWidth(2560)).toBe(720);
    expect(railMaxWidth(800)).toBe(480);
    expect(railMaxWidth(300)).toBe(RAIL_MIN_WIDTH);
    expect(clampRailWidth(900, 1201)).toBe(501);
    expect(clampRailWidth(100, 800)).toBe(RAIL_MIN_WIDTH);
    expect(clampRailWidth(400, 1920)).toBe(400);
  });

  it("stops the rail before the graph drops below its minimum width", () => {
    for (const viewport of [1201, 1280, 1366, 1440, 1920, 2560]) {
      const graphWidth = viewport - 280 - railMaxWidth(viewport);
      expect(graphWidth).toBeGreaterThanOrEqual(GRAPH_MIN_WIDTH);
    }
  });

  it("derives the 3/4/3 defaults and fits rows without overflow", () => {
    const heights = defaultPanelHeights(FALLBACK_HEIGHT);
    expect(heights).toHaveLength(3);
    expect(heights.reduce((sum, value) => sum + value, 0)).toBe(
      panelTrackHeight(FALLBACK_HEIGHT),
    );
    expect(heights.every((height) => height >= PANEL_MIN_HEIGHT)).toBe(true);
    expect(heights[1]).toBeGreaterThan(heights[0]);
    expect(heights[1]).toBeGreaterThan(heights[2]);

    const cramped = fitPanelHeights([80, 80, 80], FALLBACK_HEIGHT);
    expect(cramped.reduce((sum, value) => sum + value, 0)).toBe(
      panelTrackHeight(FALLBACK_HEIGHT),
    );
    expect(cramped.every((height) => height >= PANEL_MIN_HEIGHT)).toBe(true);

    const enormous = fitPanelHeights([900, 20, 20], FALLBACK_HEIGHT);
    expect(enormous.reduce((sum, value) => sum + value, 0)).toBe(
      panelTrackHeight(FALLBACK_HEIGHT),
    );
    expect(enormous.every((height) => height >= PANEL_MIN_HEIGHT)).toBe(true);
    expect(effectivePanelMin(120, PANEL_MIN_HEIGHT)).toBeLessThan(
      PANEL_MIN_HEIGHT,
    );
  });

  it("applies a panel drag delta to exactly two adjacent rows", () => {
    const start = defaultPanelHeights(FALLBACK_HEIGHT);
    const moved = applyPanelDelta(start, 0, 50, PANEL_MIN_HEIGHT);
    expect(moved[0]).toBe(start[0] + 50);
    expect(moved[1]).toBe(start[1] - 50);
    expect(moved[2]).toBe(start[2]);
    expect(moved.reduce((sum, value) => sum + value, 0)).toBe(
      start.reduce((sum, value) => sum + value, 0),
    );

    const squeezed = applyPanelDelta(start, 0, -10_000, PANEL_MIN_HEIGHT);
    expect(squeezed[0]).toBe(PANEL_MIN_HEIGHT);
    expect(squeezed[1]).toBe(start[0] + start[1] - PANEL_MIN_HEIGHT);

    const badIndex = applyPanelDelta(start, 5, 50);
    expect(badIndex).toEqual(start);
  });

  it("sets one panel to min/max and resets a pair to its default ratio", () => {
    const start = defaultPanelHeights(FALLBACK_HEIGHT);
    const maximum = panelMaxHeight(FALLBACK_HEIGHT);
    const atMax = setPanelHeight(start, 0, maximum, FALLBACK_HEIGHT);
    expect(atMax).toEqual([maximum, PANEL_MIN_HEIGHT, PANEL_MIN_HEIGHT]);
    expect(atMax.reduce((sum, value) => sum + value, 0)).toBe(
      panelTrackHeight(FALLBACK_HEIGHT),
    );

    const atMin = setPanelHeight(start, 0, PANEL_MIN_HEIGHT, FALLBACK_HEIGHT);
    expect(atMin[0]).toBe(PANEL_MIN_HEIGHT);
    expect(atMin.reduce((sum, value) => sum + value, 0)).toBe(
      panelTrackHeight(FALLBACK_HEIGHT),
    );

    const dragged = applyPanelDelta(start, 0, 80, PANEL_MIN_HEIGHT);
    expect(resetPanelPair(dragged, 0, start, PANEL_MIN_HEIGHT)).toEqual(start);
  });

  it("parses and serializes persisted sizes defensively", () => {
    expect(serializeRailWidth(412.4)).toBe("412");
    expect(parseRailWidth("412")).toBe(412);
    expect(parseRailWidth('{"width":390}')).toBe(390);
    expect(parseRailWidth("nope")).toBeNull();
    expect(parseRailWidth("-20")).toBeNull();
    expect(parseRailWidth(null)).toBeNull();

    const heights = defaultPanelHeights(FALLBACK_HEIGHT);
    expect(parsePanelHeights(serializePanelHeights(heights))).toEqual(heights);
    expect(parsePanelHeights("[120,200]")).toBeNull();
    expect(parsePanelHeights("[120,200,0]")).toBeNull();
    expect(parsePanelHeights("not json")).toBeNull();
    expect(parsePanelHeights(null)).toBeNull();
  });

  it("falls back to an in-memory store when persistence is blocked", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      const key = "tesis.live.test.memory-fallback.v1";
      expect(readStoredValue(key)).toBeNull();
      writeStoredValue(key, "remembered");
      expect(readStoredValue(key)).toBe("remembered");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("uses 16px steps and a larger Shift step", () => {
    expect(keyboardStep(false)).toBe(16);
    expect(keyboardStep(true)).toBe(64);
  });

  it("clamps and round-trips the workspace height", () => {
    expect(clampDashboardHeight(300)).toBe(DASHBOARD_MIN_HEIGHT);
    expect(clampDashboardHeight(5000)).toBe(DASHBOARD_MAX_HEIGHT);
    expect(clampDashboardHeight(900.6)).toBe(900.6);
    expect(clampDashboardHeight(Number.NaN)).toBe(DASHBOARD_MIN_HEIGHT);

    expect(parseDashboardHeight(serializeDashboardHeight(900))).toBe(900);
    expect(parseDashboardHeight(serializeDashboardHeight(5000))).toBe(
      DASHBOARD_MAX_HEIGHT,
    );
    expect(parseDashboardHeight("")).toBeNull();
    expect(parseDashboardHeight("tall")).toBeNull();
    expect(parseDashboardHeight(null)).toBeNull();
  });
});

describe("ResizableRuntimeDashboard", () => {
  it("renders one rail splitter and a splitter between each side panel", () => {
    stubMatchMedia(true);
    renderDashboard();

    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(4);
    // Two panel boundaries plus the workspace height; the rail is vertical.
    expect(
      separators.filter(
        (element) => element.getAttribute("aria-orientation") === "horizontal",
      ),
    ).toHaveLength(3);

    const height = separator("Resize live monitor height");
    expect(height).toHaveAttribute("aria-orientation", "horizontal");
    expect(height).toHaveAttribute("aria-controls", "runtime-dashboard");
    expect(height).toHaveAttribute("aria-valuemin", "480");
    expect(height).toHaveAttribute("aria-valuemax", "1400");
    expect(height).toHaveAttribute("aria-valuenow", String(FALLBACK_HEIGHT));
    expect(height).toHaveAttribute("tabindex", "0");

    const rail = separator("Resize runtime rail");
    expect(rail).toHaveAttribute("aria-orientation", "vertical");
    expect(rail).toHaveAttribute("aria-controls", "runtime-sidebar");
    expect(rail).toHaveAttribute("aria-valuemin", "280");
    expect(rail).toHaveAttribute(
      "aria-valuemax",
      String(railMaxWidth(window.innerWidth)),
    );
    expect(rail).toHaveAttribute("aria-valuenow", "330");
    expect(rail).toHaveAttribute("tabindex", "0");

    const coordinate = separator("Resize runtime coordinate panel");
    expect(coordinate).toHaveAttribute("aria-orientation", "horizontal");
    expect(coordinate).toHaveAttribute(
      "aria-controls",
      "runtime-coordinate-panel runtime-trajectory-panel",
    );
    expect(coordinate).toHaveAttribute("aria-valuemin", "120");
    expect(coordinate).toHaveAttribute(
      "aria-valuenow",
      String(defaultPanelHeights(FALLBACK_HEIGHT)[0]),
    );

    expect(
      separator("Resize runtime trajectory panel"),
    ).toBeInTheDocument();

    expect(screen.getByTestId("coordinate").closest("section")).toHaveAttribute(
      "id",
      "runtime-coordinate-panel",
    );
    expect(document.querySelector(".runtime-sidebar")).toHaveAttribute(
      "id",
      "runtime-sidebar",
    );
  });

  it("keeps renders split-free below the wide breakpoint", () => {
    stubMatchMedia(false);
    renderDashboard();

    expect(screen.queryAllByRole("separator")).toHaveLength(0);
    expect(screen.getByTestId("graph")).toBeInTheDocument();
    expect(screen.getByTestId("coordinate")).toBeInTheDocument();
    expect(screen.getByTestId("trajectory")).toBeInTheDocument();
    expect(screen.getByTestId("outcomes")).toBeInTheDocument();

    const dashboard = document.querySelector(".runtime-dashboard");
    const sidebar = document.querySelector(".runtime-sidebar");
    expect(dashboard).not.toHaveAttribute("style");
    expect(sidebar).not.toHaveAttribute("style");
    expect(sidebar).toHaveAttribute("id", "runtime-sidebar");
  });

  it("removes the handles when crossing below the wide breakpoint", () => {
    const media = stubMatchMedia(true);
    renderDashboard();
    expect(screen.getAllByRole("separator")).toHaveLength(4);

    act(() => media.setMatches(false));
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
    expect(screen.getByTestId("coordinate")).toBeInTheDocument();
  });

  it("resizes the rail with the keyboard and resets with Enter/Space", () => {
    stubMatchMedia(true);
    renderDashboard();
    const rail = separator("Resize runtime rail");
    rail.focus();

    fireEvent.keyDown(rail, { key: "ArrowRight" });
    expect(rail).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT_WIDTH + 16));
    expect(rail).toHaveFocus();

    fireEvent.keyDown(rail, { key: "ArrowRight", shiftKey: true });
    expect(rail).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT_WIDTH + 80));

    fireEvent.keyDown(rail, { key: "Enter" });
    expect(rail).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT_WIDTH));

    fireEvent.keyDown(rail, { key: "End" });
    expect(rail).toHaveAttribute(
      "aria-valuenow",
      String(railMaxWidth(window.innerWidth)),
    );
    fireEvent.keyDown(rail, { key: "Home" });
    expect(rail).toHaveAttribute("aria-valuenow", "280");
    fireEvent.keyDown(rail, { key: " " });
    expect(rail).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT_WIDTH));

    fireEvent.doubleClick(rail);
    expect(rail).toHaveAttribute("aria-valuenow", String(RAIL_DEFAULT_WIDTH));
  });

  it("resizes a panel boundary with arrows, Home/End, and Enter", () => {
    stubMatchMedia(true);
    renderDashboard();
    const handle = separator("Resize runtime coordinate panel");
    const initial = defaultPanelHeights(FALLBACK_HEIGHT)[0];

    expect(handle).toHaveAttribute("aria-valuemax", String(panelMaxHeight(700)));
    expect(handle).toHaveAttribute("aria-valuenow", String(initial));

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(handle).toHaveAttribute("aria-valuenow", String(initial + 16));

    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", String(initial + 80));

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle).toHaveAttribute("aria-valuenow", String(initial + 64));

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(handle).toHaveAttribute("aria-valuenow", String(initial));

    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", String(panelMaxHeight(700)));

    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle).toHaveAttribute("aria-valuenow", "120");

    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute("aria-valuenow", String(initial));
  });

  it("grows the workspace past the CSS clamp and persists the new height", () => {
    stubMatchMedia(true);
    renderDashboard();
    const handle = separator("Resize live monitor height");
    const dashboard = document.getElementById("runtime-dashboard");
    expect(dashboard?.style.getPropertyValue("--live-height")).toBe("");

    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(handle).toHaveAttribute("aria-valuenow", String(FALLBACK_HEIGHT + 16));
    expect(dashboard?.style.getPropertyValue("--live-height")).toBe("716px");

    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", "780");

    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "1400");

    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle).toHaveAttribute("aria-valuenow", "480");

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(handle).toHaveAttribute("aria-valuenow", String(FALLBACK_HEIGHT));
    expect(dashboard?.style.getPropertyValue("--live-height")).toBe("");
    expect(localStorage.getItem(DASHBOARD_HEIGHT_KEY)).toBe("");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle).toHaveAttribute("aria-valuenow", String(FALLBACK_HEIGHT - 16));
    expect(localStorage.getItem(DASHBOARD_HEIGHT_KEY)).toBe(
      String(FALLBACK_HEIGHT - 16),
    );

    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute("aria-valuenow", String(FALLBACK_HEIGHT));
  });

  it("restores a saved workspace height on mount", () => {
    localStorage.setItem(DASHBOARD_HEIGHT_KEY, "940");
    stubMatchMedia(true);
    renderDashboard();

    expect(separator("Resize live monitor height")).toHaveAttribute(
      "aria-valuenow",
      "940",
    );
    expect(
      document.getElementById("runtime-dashboard")?.style.getPropertyValue(
        "--live-height",
      ),
    ).toBe("940px");
    // Panels keep the 3/4/3 weights inside the taller workspace.
    expect(defaultPanelHeights(940).reduce((sum, value) => sum + value, 0)).toBe(
      940 - 2 * 16,
    );
  });

  it("restores persisted sizes after mount and writes changes back", () => {
    localStorage.setItem(RAIL_STORAGE_KEY, "412");
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify([150, 250, 268]));
    stubMatchMedia(true);
    renderDashboard();

    const rail = separator("Resize runtime rail");
    expect(rail).toHaveAttribute("aria-valuenow", "412");
    expect(separator("Resize runtime coordinate panel")).toHaveAttribute(
      "aria-valuenow",
      "150",
    );

    fireEvent.keyDown(rail, { key: "ArrowRight" });
    expect(localStorage.getItem(RAIL_STORAGE_KEY)).toBe("428");
    expect(localStorage.getItem(PANEL_STORAGE_KEY)).toBe(
      JSON.stringify([150, 250, 268]),
    );
  });
});
