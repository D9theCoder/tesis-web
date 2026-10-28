import { describe, expect, it } from "vitest";
import { createElement, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { EvidenceDrawer } from "@/components/results/evidence-drawer";
import { CoordinatePanel } from "@/components/runtime/coordinate-panel";
import { normalizeResult } from "@/lib/result-normalizer";
import { evidenceForReference } from "@/lib/evidence-ref";
import { initialState, reduceEvents } from "@/lib/event-reducer";
import { deriveTrajectory } from "@/lib/trajectory";

const path = ["bf_dictionary", "authenticated_session", "ac_idor"];
const branch = ["authenticated_session", "ac_force_browse"];

describe("TESIS ad53a15 to ed4faf9 compatibility", () => {
  it("keeps the active branch separate from the connected historical traversal", () => {
    const before = reduceEvents(initialState("run"), [{ event_type: "graph.state", execution_id: "run", data: { akg_path: path } }]);
    const after = reduceEvents(before, [{ event_type: "graph.state", execution_id: "run", node: "chaining_router",
      data: { akg_path: path, current_chain: branch, selected_method: "ac_force_browse" } }]);
    expect(after.akgPath).toEqual(path);
    expect(after.chain).toEqual(branch);
    expect(after.currentNode).toBe("ac_force_browse");
    expect(before.chain).toEqual([]);
    expect(before.currentNode).toBe("ac_idor");
  });

  it("shows the active branch in trajectory context without joining unrelated edges", () => {
    const trajectory = deriveTrajectory([{ event_type: "graph.state", node: "chaining_router", data: { akg_path: path, current_chain: branch } }]);
    expect(trajectory.turns[0].cells[0].akgPath).toEqual(branch);
  });

  it("consumes the route event emitted by TESIS and does not regress on its next graph snapshot", () => {
    const after = reduceEvents(initialState("run"), [
      { event_type: "graph.state", execution_id: "run", data: { akg_path: path } },
      { event_type: "akg.route.selected", execution_id: "run", node: "chaining_router", data: {
        reason: "chain_ready", chain: branch, source: "authenticated_session", target: "ac_force_browse", target_agent: "ac_force_browse" } },
      { event_type: "graph.state", execution_id: "run", data: { akg_path: path, selected_method: "ac_force_browse" } },
    ]);
    expect(after.chain).toEqual(branch);
    expect(after.akgPath).toEqual(path);
    expect(after.currentNode).toBe("ac_force_browse");
    render(createElement(CoordinatePanel, { state: after }));
    expect(screen.getByRole("list", { name: "Recorded route" })).toHaveTextContent("ac_force_browse");
    expect(screen.getByRole("list", { name: "Recorded route" })).not.toHaveTextContent("ac_idor");
    const trajectory = deriveTrajectory([{ event_type: "akg.route.selected", data: { chain: branch } }]);
    expect(trajectory.turns[0].cells[0].akgPath).toEqual(branch);
  });

  it("retains drawer keyboard access when a related-record link disappears", () => {
    const rows = normalizeResult({ execution_id: "related", response_evidence: [
      { evidence_id: "response:a", candidate_id: "shared" },
      { evidence_id: "response:b", candidate_id: "shared" },
    ] }).evidenceRows;
    function Example() {
      const [row, setRow] = useState(rows[0]);
      const [open, setOpen] = useState(true);
      return createElement(EvidenceDrawer, { row, open, onClose: () => setOpen(false),
        onSelectRelated: (id: string) => setRow(rows.find(record => record.id === id)!) });
    }
    render(createElement(Example));
    const related = screen.getByRole("button", { name: "response:b" });
    related.focus();
    fireEvent.click(related);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("indexes negative attestations, controls and pending dependency sources without inventing proof", () => {
    const ref = "#/config/scoring_oracles/0/document/negative_attestations/0";
    const result = normalizeResult({ execution_id: "run", execution_status: "completed", security_outcome: "no_finding",
      response_evidence: [{ evidence_id: "response:0", candidate_id: "candidate", agent_id: "bf_dictionary",
        signal_detected: false, success: false, negative_oracle_ref: ref }],
      config: { scoring_oracles: [
        { source_id: "negative", origin: "operator_fixture", sha256: "a".repeat(64), document: {
          status: "not_confirmed", negative_attestations: [{ evidence_id: "response:0", candidate_id: "candidate", method: "bf_dictionary", outcome: "not_confirmed" }],
          controls: [{ control: "known_valid_identity", credentials_valid: true }],
        } },
        { source_id: "dependency", origin: "operator_fixture", sha256: "b".repeat(64), document: {
          status: "not_dependent", reason: "destination_available_without_source", dependency_controls: [{ source_available: false, destination_confirmed: true }],
        } },
      ] },
    });
    const negative = result.evidenceRows.find(row => row.details.sourceRef === ref);
    expect(negative).toMatchObject({ phase: "negative_attestations", result: "not_confirmed", status: "info" });
    expect(negative?.details.oracleSource).toEqual({ sourceId: "negative", origin: "operator_fixture", sha256: "a".repeat(64) });
    const response = result.evidenceRows.find(row => row.phase === "response_evidence")!;
    expect(response.relatedEventIds).toContain(negative?.id);
    expect(evidenceForReference(result, ref)).toBe(negative);
    expect(result.evidenceRows.some(row => row.phase === "controls")).toBe(true);
    expect(result.evidenceRows.some(row => row.phase === "dependency_controls")).toBe(true);
    expect(result.evidenceRows.find(row => row.details.sourceRef === "#/config/scoring_oracles/1/document")?.result).toBe("destination_available_without_source");
    expect(result.securityOutcome).toBe("no_finding");
    expect(result.scores).toEqual({});
    expect(result.confirmedVulns).toEqual([]);
  });
});
