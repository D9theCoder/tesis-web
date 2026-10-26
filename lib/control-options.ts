/**
 * Presentation labels and pure helpers for the runtime control plane.
 * Values mirror the TESIS runtime vocabulary so the UI never invents choices.
 */

export const SURFACE_LABELS: Record<string, string> = {
  sqli: "SQL injection",
  access_control: "Access control",
  brute_force: "Brute force",
};

export const LEVEL_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const PAYLOAD_MODE_LABELS: Record<string, string> = {
  static_only: "Static only",
  hybrid: "Hybrid",
  llm_mutation_only: "LLM mutation only",
};

export const CONDITION_LABELS: Record<string, string> = {
  akg_guided_hybrid: "AKG-guided hybrid",
  linear_hybrid: "Linear hybrid",
};

export const SCORING_MODE_LABELS: Record<string, string> = {
  human: "Human review",
  ai: "AI rubric",
  both: "Human and AI",
};

export const STOP_POLICY_LABELS: Record<string, string> = {
  impact: "Stop on impact",
  coverage: "Stop on coverage",
};

export const REPORT_FORMAT_LABELS: Record<string, string> = {
  json: "JSON",
  markdown: "Markdown",
  both: "JSON and Markdown",
};

export const PROTOCOL_LABELS: Record<string, string> = {
  openai: "OpenAI Responses",
  openai_compatible: "OpenAI Chat Completions",
  anthropic: "Anthropic Messages",
};

/**
 * Job state uses neutral and caution tones only: green, red, and violet stay
 * reserved for confirmed outcomes, failures, and review provenance.
 */
export const JOB_STATUS_TONES: Record<string, "default" | "amber" | "cyan" | "lime" | "red" | "outline" | "violet"> = {
  running: "outline",
  cancelling: "amber",
  finished: "outline",
  failed: "red",
  cancelled: "outline",
  lost: "red",
};

export function labelFor(labels: Record<string, string>, value: unknown): string {
  const key = typeof value === "string" ? value : "";
  if (!key) return "—";
  return labels[key] ?? key;
}

/** Human label for a job's mode/kind pair. */
export function jobModeLabel(mode: string): string {
  switch (mode) {
    case "single":
      return "Single run";
    case "matrix":
      return "Matrix";
    case "doctor-offline":
      return "Doctor (offline)";
    case "doctor-live":
      return "Doctor (live)";
    default:
      return mode;
  }
}

export type MatrixAxes = {
  providers?: unknown;
  levels?: unknown;
  surfaces?: unknown;
  payloadModes?: unknown;
  repeats?: unknown;
};

function sizeOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Coordinate count for a matrix request, matching the runtime's
 * providers × levels × surfaces × payload modes × repeats expansion.
 */
export function matrixCoordinateCount(axes: MatrixAxes): number {
  const repeats = Number(axes.repeats);
  const safeRepeats = Number.isFinite(repeats) && repeats > 0 ? Math.trunc(repeats) : 1;
  return (
    Math.max(sizeOf(axes.providers), 1) *
    Math.max(sizeOf(axes.levels), 1) *
    Math.max(sizeOf(axes.surfaces), 1) *
    Math.max(sizeOf(axes.payloadModes), 1) *
    safeRepeats
  );
}

/** True when every matrix axis has at least one selection. */
export function matrixAxesComplete(axes: MatrixAxes): boolean {
  return (
    sizeOf(axes.providers) > 0 &&
    sizeOf(axes.levels) > 0 &&
    sizeOf(axes.surfaces) > 0 &&
    sizeOf(axes.payloadModes) > 0
  );
}

const MATRIX_AXIS_NAMES: Array<[keyof MatrixAxes, string]> = [
  ["providers", "Providers"],
  ["levels", "Security levels"],
  ["surfaces", "Surfaces"],
  ["payloadModes", "Payload modes"],
];

/** Names of the axes that still need a selection, for the wizard's message. */
export function matrixAxesMissing(axes: MatrixAxes): string[] {
  return MATRIX_AXIS_NAMES.filter(([key]) => sizeOf(axes[key]) === 0).map(([, name]) => name);
}

/** Short "2 × 3 × 3 × 2 × 1" rendering of the populated axes. */
export function matrixAxisSummary(axes: MatrixAxes): string {
  const parts = [
    sizeOf(axes.providers) || 1,
    sizeOf(axes.levels) || 1,
    sizeOf(axes.surfaces) || 1,
    sizeOf(axes.payloadModes) || 1,
    Math.max(Number(axes.repeats) || 1, 1),
  ];
  return parts.join(" × ");
}

/**
 * Display labels for loader-backed fields whose raw values are machine codes.
 * Shared by the launch wizard and the settings form so the same value never
 * reads one way in a run and another way in the profile.
 */
export function controlOptionLabels(
  modelProfiles: { id: string; label: string }[],
): Record<string, Record<string, string>> {
  const providers: Record<string, string> = {};
  for (const profile of modelProfiles) providers[profile.id] = profile.label;
  return {
    providers,
    provider: providers,
    model_profile: providers,
    surfaces: SURFACE_LABELS,
    surface: SURFACE_LABELS,
    levels: LEVEL_LABELS,
    level: LEVEL_LABELS,
    payload_modes: PAYLOAD_MODE_LABELS,
    payload_mode: PAYLOAD_MODE_LABELS,
    experiment_condition: CONDITION_LABELS,
    scoring_mode: SCORING_MODE_LABELS,
    report_format: REPORT_FORMAT_LABELS,
    protocol: PROTOCOL_LABELS,
  };
}
