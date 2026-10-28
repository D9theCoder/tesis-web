import { describe, expect, it } from "vitest";

import {
  JOB_STATUS_TONES,
  REPORT_FORMAT_LABELS,
  SCORING_MODE_LABELS,
  SURFACE_LABELS,
  controlOptionLabels,
  jobModeLabel,
  labelFor,
  matrixAxesComplete,
  matrixAxesMissing,
  matrixAxisSummary,
  matrixCoordinateCount,
} from "@/lib/control-options";

describe("matrix coordinate expansion", () => {
  it("multiplies every populated axis and repeats", () => {
    expect(
      matrixCoordinateCount({
        providers: ["a", "b"],
        levels: ["low", "medium", "high"],
        surfaces: ["sqli", "access_control", "brute_force"],
        payloadModes: ["static_only", "hybrid"],
        repeats: 2,
      }),
    ).toBe(2 * 3 * 3 * 2 * 2);
  });

  it("treats empty axes as one and clamps repeats", () => {
    expect(matrixCoordinateCount({})).toBe(1);
    expect(matrixCoordinateCount({ providers: ["a"], repeats: 0 })).toBe(1);
    expect(matrixCoordinateCount({ providers: ["a"], repeats: 2.8 })).toBe(2);
    expect(matrixCoordinateCount({ providers: ["a"], repeats: "4" })).toBe(4);
  });

  it("requires every axis before a matrix is complete", () => {
    expect(matrixAxesComplete({})).toBe(false);
    expect(
      matrixAxesComplete({
        providers: ["a"],
        levels: ["low"],
        surfaces: ["sqli"],
        payloadModes: ["hybrid"],
      }),
    ).toBe(true);
    expect(
      matrixAxesComplete({ providers: ["a"], levels: [], surfaces: ["sqli"], payloadModes: ["hybrid"] }),
    ).toBe(false);
  });

  it("renders a compact axis summary that names every axis and counts empty ones as 1", () => {
    expect(matrixAxisSummary({ providers: ["a", "b"], repeats: 3 })).toBe(
      "2 providers × 1 level × 1 surface × 1 payload mode × 3 repeats",
    );
    expect(matrixAxisSummary({ repeats: 1 })).toBe(
      "1 provider × 1 level × 1 surface × 1 payload mode × 1 repeat",
    );
  });
});

describe("labels", () => {
  it("falls back to the raw value for unknown keys and to an em dash for empty", () => {
    expect(labelFor(SURFACE_LABELS, "sqli")).toBe("SQL injection");
    expect(labelFor(SURFACE_LABELS, "unknown_surface")).toBe("unknown_surface");
    expect(labelFor(SURFACE_LABELS, null)).toBe("—");
  });


  it("maps job modes and statuses to display values", () => {
    expect(jobModeLabel("doctor-live")).toBe("Doctor (live)");
    expect(jobModeLabel("matrix")).toBe("Matrix");
    expect(jobModeLabel("custom-mode")).toBe("custom-mode");
  });

  // Progress is not an outcome: only failure takes red, and green stays
  // reserved for confirmed results (DESIGN.md, signal separation).
  it("keeps status tones off the outcome hues", () => {
    expect(JOB_STATUS_TONES.running).toBe("outline");
    expect(JOB_STATUS_TONES.cancelling).toBe("amber");
    expect(JOB_STATUS_TONES.finished).toBe("outline");
    expect(JOB_STATUS_TONES.failed).toBe("red");
    expect(JOB_STATUS_TONES.lost).toBe("red");
  });

  it("names the axes that block a matrix instead of a generic warning", () => {
    const empty = { providers: [], levels: [], surfaces: [], payloadModes: [], repeats: 1 };
    expect(matrixAxesComplete(empty)).toBe(false);
    expect(matrixAxesMissing(empty)).toEqual([
      "Providers",
      "Security levels",
      "Surfaces",
      "Payload modes",
    ]);
    const partial = { ...empty, providers: ["river-ai"], levels: ["low", "high"] };
    expect(matrixAxesMissing(partial)).toEqual(["Surfaces", "Payload modes"]);
    expect(matrixAxesComplete({ ...partial, surfaces: ["sqli"], payloadModes: ["hybrid"] })).toBe(true);
    expect(matrixAxesMissing({ ...partial, surfaces: ["sqli"], payloadModes: ["hybrid"] })).toEqual([]);
  });

  it("labels one value the same way in a run and in the profile", () => {
    const labels = controlOptionLabels([{ id: "river-ai", label: "river-ai / DeepSeek" }]);
    for (const path of ["provider", "model_profile", "providers"]) {
      expect(labels[path]["river-ai"]).toBe("river-ai / DeepSeek");
    }
    expect(labels.surface.sqli).toBe("SQL injection");
    expect(labels.scoring_mode.ai).toBe(SCORING_MODE_LABELS.ai);
    expect(labels.report_format.both).toBe(REPORT_FORMAT_LABELS.both);
  });
});
