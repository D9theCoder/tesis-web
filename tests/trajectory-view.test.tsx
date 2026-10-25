import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/lib/schemas";
import { deriveTrajectory } from "@/lib/trajectory";
import { initialState } from "@/lib/event-reducer";
import { TrajectoryView } from "@/components/runtime/trajectory-view";
import { ConversationPanel } from "@/components/runtime/conversation-panel";

const EVENTS: RunEvent[] = [
  { event_type: "run.started", timestamp: 1000 },
  { event_type: "method.selected", timestamp: 1001, method: "sqli-basic" },
  {
    event_type: "probe.attempt",
    timestamp: 1002,
    method: "sqli-basic",
    data: { url: "http://dvwa.local/sqli" },
  },
  { event_type: "probe.success", timestamp: 1004.5, method: "sqli-basic" },
  { event_type: "method.selected", timestamp: 1005, method: "xss-reflected" },
  { event_type: "probe.attempt", timestamp: 1006, method: "xss-reflected" },
];

const MODEL = deriveTrajectory(EVENTS);

function cellButton(name: RegExp) {
  return screen.getByRole("button", { name });
}

function probeCells() {
  return screen.getAllByRole("button", { name: /probe\.attempt/ });
}

describe("TrajectoryView", () => {
  it("renders one section per turn with the timing overview", () => {
    render(<TrajectoryView model={MODEL} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Turn 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Trajectory records" })).toBeInTheDocument();
  });

  it("folds the timing overview behind a summary that still reports the counts", () => {
    render(<TrajectoryView model={MODEL} />);

    const summary = screen.getByText(/3 turns · 5 records/);
    const timing = summary.closest("details");
    expect(timing).not.toBeNull();
    const details = timing as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary .trajectory-timing-meta")).toContainElement(summary);

    const lanes = within(details).getAllByText(/^(Input|Model|Tools)$/);
    expect(lanes).toHaveLength(3);
    expect(details.querySelector(".trajectory-timing-body")?.textContent).toContain("Input");
  });

  it("shows kind, index, args and duration for each cell", () => {
    render(<TrajectoryView model={MODEL} />);

    const probe = probeCells()[0];
    expect(within(probe).getByText("#3")).toBeInTheDocument();
    expect(within(probe).getByText("Tool")).toBeInTheDocument();
    expect(within(probe).getByText(/dvwa\.local\/sqli/)).toBeInTheDocument();
    expect(within(probe).getByText("2s")).toBeInTheDocument();
  });

  it("expands a cell to reveal its records and outcome", () => {
    render(<TrajectoryView model={MODEL} />);

    const probe = probeCells()[0];
    expect(probe).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(probe);

    expect(probe).toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById(probe.getAttribute("aria-controls") ?? "");
    expect(detail).not.toBeNull();
    expect(within(detail as HTMLElement).getByText("Result: probe.success")).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText("probe.success")).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText("#4")).toBeInTheDocument();
  });

  it("marks in-flight calls as running without inventing a duration", () => {
    render(<TrajectoryView model={MODEL} />);

    const pending = probeCells()[1];
    expect(within(pending).getByText("running")).toBeInTheDocument();
    expect(screen.getByText("in flight")).toBeInTheDocument();
  });

  it("toggles every row with the fold-all control", () => {
    render(<TrajectoryView model={MODEL} />);

    const foldAll = screen.getByRole("button", { name: "Expand all" });
    expect(foldAll).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(foldAll);

    expect(screen.getByRole("button", { name: "Collapse all" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(cellButton(/run\.started/)).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(cellButton(/run\.started/)).toHaveAttribute("aria-expanded", "false");
  });

  it("filters records by method and reports the empty result", () => {
    render(<TrajectoryView model={MODEL} />);

    const filter = screen.getByRole("searchbox", { name: "Filter trajectory records" });
    fireEvent.change(filter, { target: { value: "xss" } });

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.getByText(/2 of 5 records/)).toBeInTheDocument();

    fireEvent.change(filter, { target: { value: "no-such-record" } });
    expect(screen.getByText("No records match “no-such-record”")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Trajectory records" })).toBeNull();
  });

  it("explains an empty journal instead of showing a blank panel", () => {
    render(<TrajectoryView model={deriveTrajectory([])} />);

    expect(screen.getByText("No trajectory records yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeDisabled();
  });
});

describe("ConversationPanel trajectory view", () => {
  const state = { ...initialState("exec-1"), events: EVENTS };

  it("switches between chat, trace and trajectory", () => {
    render(<ConversationPanel state={state} />);

    const tabs = within(screen.getByRole("group", { name: "Conversation view" })).getAllByRole(
      "button",
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Chat", "Trace", "Trajectory"]);
    expect(tabs[0]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("5 records").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Turn 1" })).toBeInTheDocument();

    fireEvent.click(tabs[1]);
    expect(screen.getByText("6 events")).toBeInTheDocument();
    const entries = screen.getAllByRole("article");
    expect(entries).toHaveLength(6);
    expect(entries[0].querySelector(".conversation-event-type")).toHaveTextContent("run.started");
  });
});
