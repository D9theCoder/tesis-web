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

  it("renders every cell unfiltered and in journal order by default", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const toggles = screen.getAllByRole("button", { name: /#\d/ });
    expect(toggles).toHaveLength(RICH_MODEL.stats.cells);
    expect(toggles.map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual(
      toggles.map(() => "false"),
    );
    expect(toggles[0].textContent).toContain("llm.request");
    expect(toggles[toggles.length - 1].textContent).toContain("vuln.confirmed");
    expect(screen.getByRole("searchbox", { name: "Filter trajectory records" })).toHaveValue("");
  });

  it("narrows the ledger to system, user, and model records", () => {
    const mixed = deriveTrajectory([
      { event_type: "run.started", timestamp: 1 },
      { event_type: "graph.state", timestamp: 2 },
      { event_type: "llm.request", timestamp: 3 },
      { event_type: "llm.response", timestamp: 4 },
      { event_type: "probe.attempt", timestamp: 5 },
      { event_type: "probe.success", timestamp: 6 },
      { event_type: "guardrail.blocked", timestamp: 7 },
    ]);
    render(<TrajectoryView model={mixed} />);

    const filter = screen.getByRole("button", { name: "Show conversation records only" });
    const rows = () =>
      screen.getAllByRole("button", { name: /#\d/ }).map((button) => button.textContent ?? "");

    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(rows()).toHaveLength(5);

    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-pressed", "true");
    const kept = rows();
    expect(kept).toHaveLength(2);
    expect(kept[0]).toContain("run.started");
    expect(kept[1]).toContain("llm.request");
    expect(screen.getByText(/2 of 5 records/)).toBeInTheDocument();

    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(rows()).toHaveLength(5);
  });

  it("folds a turn from its header and restores it from the turns control", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const rows = () => screen.queryAllByRole("button", { name: /#\d/ });
    expect(rows()).toHaveLength(RICH_MODEL.stats.cells);

    const collapse = screen.getByRole("button", { name: "Collapse turn 1" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);
    expect(rows()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Expand turn 1" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    const all = screen.getByRole("button", { name: "Expand turns" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(all);
    expect(rows()).toHaveLength(RICH_MODEL.stats.cells);
    expect(screen.getByRole("button", { name: "Collapse turns" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches the overview between actual duration and equal width", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const axisMiddle = () =>
      document.querySelector(".trajectory-axis span:nth-child(2)")?.textContent;

    expect(axisMiddle()).toMatch(/^\d+s observed$/);
    const toggle = screen.getByRole("button", { name: "Use equal-width operations" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(toggle);
    expect(axisMiddle()).toBe("equal width");
    expect(screen.getByRole("button", { name: "Use actual duration" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use actual duration" }));
    expect(axisMiddle()).toMatch(/observed$/);
  });

  it("explains an empty conversation filter instead of an empty search", () => {
    render(<TrajectoryView model={MODEL} />);

    fireEvent.click(screen.getByRole("button", { name: "Show conversation records only" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter trajectory records" }), {
      target: { value: "probe" },
    });

    expect(screen.getByText("No conversation records")).toBeInTheDocument();
    expect(
      screen.getByText("Tool, graph, and safety records are hidden by the conversation filter."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No records match/)).toBeNull();
  });

  it("explains an empty journal instead of showing a blank panel", () => {
    render(<TrajectoryView model={deriveTrajectory([])} />);

    expect(screen.getByText("No trajectory records yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeDisabled();
  });
});

describe("ConversationPanel", () => {
  const state = { ...initialState("exec-1"), events: EVENTS };

  it("renders the trajectory ledger as its only body", () => {
    render(<ConversationPanel state={state} />);

    expect(screen.queryByRole("group", { name: "Conversation view" })).toBeNull();
    expect(screen.getAllByText("5 records").length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { name: "Trajectory records" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Turn 1" })).toBeInTheDocument();
  });
});

/** A model call that carries request, reasoning, response, usage, and graph path. */
const RICH_EVENTS: RunEvent[] = [
  {
    event_type: "llm.request",
    timestamp: 2000,
    node: "bf_dictionary",
    method: "bf_dictionary",
    data: {
      model: "deepseek-chat",
      prompts: [
        { role: "system", content: "You are TESIS." },
        { role: "user", content: "Pick the next AKG method." },
      ],
      akg_path: ["unauthenticated", "brute_force", "bf_dictionary"],
    },
  },
  {
    event_type: "llm.response",
    timestamp: 2002,
    node: "bf_dictionary",
    method: "bf_dictionary",
    data: {
      reasoning_content: "Dictionary attempt is cheapest.",
      response_text: "Use the seeded credential pair.",
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    },
  },
  { event_type: "probe.attempt", timestamp: 2003, node: "bf_dictionary", method: "bf_dictionary" },
  { event_type: "probe.success", timestamp: 2004, node: "bf_dictionary", method: "bf_dictionary" },
  {
    event_type: "vuln.confirmed",
    timestamp: 2005,
    node: "bf_dictionary_confirmed",
    method: "bf_dictionary",
  },
];

const RICH_MODEL = deriveTrajectory(RICH_EVENTS);

function detailOf(button: HTMLElement): HTMLElement {
  const detail = document.getElementById(button.getAttribute("aria-controls") ?? "");
  if (!detail) throw new Error("cell detail did not render");
  return detail;
}

/** Read one facts list in the record inspector as label → value pairs. */
function facts(detail: HTMLElement, label: "Record timing" | "Token usage"): Record<string, string> {
  const list = within(detail).getByLabelText(label);
  const rows: Record<string, string> = {};
  for (const row of Array.from(list.querySelectorAll(".trajectory-fact"))) {
    const key = row.querySelector("dt")?.textContent ?? "";
    rows[key] = row.querySelector("dd")?.textContent ?? "";
  }
  return rows;
}

describe("TrajectoryView detail", () => {
  it("summarizes a turn with status, usage, node states, and the AKG path", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const turn = screen.getByRole("region", { name: "Turn 1" });
    const texts = (selector: string) =>
      Array.from(turn.querySelectorAll(selector)).map((node) => node.textContent);

    expect(texts(".trajectory-status")).toEqual(["Completed"]);
    expect(texts(".trajectory-turn-fact")).toEqual([
      "deepseek-chat",
      "in 120 · out 30",
      "3 records",
    ]);
    expect(texts(".trajectory-node-name")).toEqual(["bf_dictionary", "bf_dictionary_confirmed"]);
    expect(texts(".trajectory-node-state")).toEqual(["Completed", "Completed"]);
    expect(texts(".trajectory-path-step")).toEqual([
      "unauthenticated",
      "brute_force",
      "bf_dictionary",
    ]);
  });

  it("reveals the request, reasoning, and response behind labelled blocks", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const button = cellButton(/llm\.request/);
    fireEvent.click(button);
    const detail = within(detailOf(button));

    expect(detail.getByText("Request")).toBeInTheDocument();
    expect(detail.getByText("Thinking")).toBeInTheDocument();
    expect(detail.getByText("Response")).toBeInTheDocument();
    expect(detail.getByText("Raw JSON")).toBeInTheDocument();
    expect(detail.getByText(/system: You are TESIS\./)).toBeInTheDocument();
    expect(detail.getByText("Dictionary attempt is cheapest.")).toBeInTheDocument();
    expect(detail.getByText("Use the seeded credential pair.")).toBeInTheDocument();
  });

  it("labels the call with its status, node, method, model, and outcome", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const button = cellButton(/llm\.request/);
    fireEvent.click(button);
    const detail = within(detailOf(button));

    expect(detail.getByText("Completed")).toBeInTheDocument();
    expect(detail.getByText("Result: llm.response")).toBeInTheDocument();
    expect(detail.getByText("Node: bf_dictionary")).toBeInTheDocument();
    expect(detail.getByText("Method: bf_dictionary")).toBeInTheDocument();
    expect(detail.getByText("Model: deepseek-chat")).toBeInTheDocument();
    const timing = facts(detailOf(button), "Record timing");
    expect(timing["Started"]).not.toBe("not recorded");
    expect(timing["Total duration"]).toBe("2s");
    expect(timing["Source"]).toBe("journal event timestamps");
  });

  it("reports every timing and token fact as its own labelled row", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const button = cellButton(/llm\.request/);
    fireEvent.click(button);
    const detail = detailOf(button);

    expect(facts(detail, "Record timing")).toEqual({
      Started: expect.any(String),
      "Total duration": "2s",
      TTFT: "not recorded",
      Generation: "not recorded",
      Throughput: "not recorded",
      Source: "journal event timestamps",
    });
    expect(facts(detail, "Token usage")).toEqual({
      Input: "120",
      Cached: "not recorded",
      Output: "30",
      Reasoning: "not recorded",
      "Total tokens": "150",
    });
    // The gap is explained on the row instead of silently showing a dash.
    const ttftRow = Array.from(
      within(detail).getByLabelText("Record timing").querySelectorAll(".trajectory-fact"),
    ).find((row) => row.querySelector("dt")?.textContent === "TTFT");
    expect(ttftRow?.querySelector("dd")?.getAttribute("title")).toContain(
      "no streamed chunk records",
    );
  });

  it("measures latency and throughput from streamed chunks", () => {
    const streamed = deriveTrajectory([
      { event_type: "llm.started", timestamp: 10, data: { prompt_tokens: 100 } },
      { event_type: "llm.token", timestamp: 10.5, data: { token: "Use " } },
      { event_type: "llm.token", timestamp: 10.9, data: { token: "the pair." } },
      { event_type: "llm.completed", timestamp: 11.5, data: { completion_tokens: 10 } },
    ]);
    render(<TrajectoryView model={streamed} />);

    const button = cellButton(/llm\.started/);
    fireEvent.click(button);

    expect(facts(detailOf(button), "Record timing")).toMatchObject({
      "Total duration": "1s",
      TTFT: "500 ms",
      Generation: "1s",
      Throughput: "10.0 tok/s",
    });
  });

  it("marks latency rows n/a for a record kind that has no such phase", () => {
    render(<TrajectoryView model={MODEL} />);

    const button = probeCells()[0];
    fireEvent.click(button);
    const timing = facts(detailOf(button), "Record timing");

    expect(timing["TTFT"]).toBe("n/a");
    expect(timing["Generation"]).toBe("n/a");
    expect(timing["Throughput"]).toBe("n/a");
    expect(timing["Started"]).not.toBe("not recorded");
  });

  it("omits payload blocks the journal never recorded", () => {
    render(<TrajectoryView model={MODEL} />);

    const button = probeCells()[0];
    fireEvent.click(button);
    const detail = within(detailOf(button));

    expect(detail.queryByText("Request")).toBeNull();
    expect(detail.queryByText("Thinking")).toBeNull();
    expect(detail.queryByText("Response")).toBeNull();
    expect(detail.getByText("Raw JSON")).toBeInTheDocument();
  });

  it("lists every turn with its time and token usage in the timing overview", () => {
    render(<TrajectoryView model={RICH_MODEL} />);

    const table = screen.getByRole("table", { name: "Turn timing and token usage" });
    expect(within(table).getByRole("columnheader", { name: "In/Out/Think" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "T1" })).toBeInTheDocument();
    expect(within(table).getByText("120/30/—")).toBeInTheDocument();
    expect(within(table).getByText("Completed")).toBeInTheDocument();
  });
});
