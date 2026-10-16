import {
  canonicalStatusSchema, executionStatusSchema, securityOutcomeSchema, reasonSchema,
  type Coverage, type MetricReading,
} from "@/lib/schemas";

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
export function mergeArtifact(raw: Record<string, unknown>) {
  return { ...record(raw.final_state ?? raw.state), ...raw };
}
export function canonicalStatus(raw: Record<string, unknown>) {
  const m = mergeArtifact(raw);
  if (!m.observer_projection) {
    const state = record(raw.final_state ?? raw.state);
    for (const key of ["execution_status", "security_outcome", "execution_reason", "security_outcome_reason"]) {
      if (m[key] == null && state[key] != null) m[key] = state[key];
    }
  }
  // Legacy proof classification belongs to TESIS. An incomplete label is not a failure.
  const execution = executionStatusSchema.safeParse(m.execution_status);
  const security = securityOutcomeSchema.safeParse(m.security_outcome);
  const executionReason = reasonSchema.safeParse(m.execution_reason);
  const outcomeReason = reasonSchema.safeParse(m.security_outcome_reason);
  return canonicalStatusSchema.parse({
    executionStatus: execution.success ? execution.data : "execution_status" in m ? null : m.status === "success" ? "completed" : m.status === "cancelled" ? "interrupted" : null,
    securityOutcome: security.success ? security.data : null,
    executionReason: executionReason.success ? executionReason.data : null,
    securityOutcomeReason: outcomeReason.success ? outcomeReason.data : null,
  });
}

export function metricReading(raw: Record<string, unknown>, key: string): MetricReading {
  const m = mergeArtifact(raw);
  const summary = record(record(m.report).summary);
  // Match artifact_summary(): backfill top-level fields; nested fields win.
  const source = { ...m, ...summary };
  const metric = record(source[key]);
  const availability = record(source.metric_availability)[key];
  const reason = text(record(source.metric_unavailable_reason)[key]);
  const value = finite(source[key]);
  if (Object.keys(metric).length) {
    const mean = finite(metric.mean ?? metric.value);
    const n = finite(metric.n_available);
    const available = (metric.available === true || (n !== null && n > 0)) && mean !== null;
    return { value: available ? mean : null, available, reason: available ? null : text(metric.reason ?? metric.unavailable_reason) ?? "unavailable",
      nAvailable: n ?? undefined, nUnavailable: finite(metric.n_unavailable) ?? undefined,
      unavailableReasons: record(metric.unavailable_reasons) as Record<string, number> };
  }
  const available = availability === true && value !== null;
  return { value: available ? value : null, available,
    reason: available ? null : reason ?? (availability === true ? "invalid_numeric" : value !== null && availability === undefined ? "legacy_numeric" : "unavailable") };
}

export function coverage(raw: Record<string, unknown>): Coverage | null {
  if (!Array.isArray(raw.runs) && !raw.totals) return null;
  const totals = record(raw.totals);
  const children = Array.isArray(raw.runs) ? raw.runs.map(record) : [];
  const executionCounts: Record<string, number> = { completed: 0, failed: 0, interrupted: 0 };
  const outcomeCounts: Record<string, number> = { confirmed: 0, no_finding: 0, unconfirmed: 0, fixture_limited: 0 };
  let unknown = 0, skipped = 0;
  for (const child of children) {
    const status = canonicalStatus(child);
    if (status.executionStatus) {
      executionCounts[status.executionStatus]++;
      if (status.securityOutcome) outcomeCounts[status.securityOutcome]++;
    } else if (["skipped", "not_started"].includes(String(child.status))) skipped++;
    else unknown++;
  }
  const canonical = typeof totals.completed_runs === "number" && raw.observer_derived_counts !== true;
  if (canonical) {
    Object.assign(executionCounts, record(totals.execution_status_counts));
    executionCounts.completed = finite(totals.completed_runs) ?? executionCounts.completed;
    executionCounts.failed = finite(totals.error_runs) ?? executionCounts.failed;
    executionCounts.interrupted = finite(totals.cancelled_runs) ?? executionCounts.interrupted;
    Object.assign(outcomeCounts, record(totals.security_outcome_counts));
    unknown = finite(totals.execution_unknown_runs) ?? unknown;
    skipped = finite(totals.skipped_runs) ?? skipped;
  }
  const cancellation = record(raw.cancellation);
  return { represented: finite(totals.total_runs) ?? children.length,
    planned: finite(cancellation.total_runs), unstarted: finite(cancellation.not_started_runs),
    completed: executionCounts.completed, failed: executionCounts.failed, interrupted: executionCounts.interrupted,
    confirmed: canonical ? finite(totals.confirmed_runs) ?? outcomeCounts.confirmed : outcomeCounts.confirmed,
    unknown, skipped, executionCounts, outcomeCounts,
    legacyTotals: raw.observer_legacy_totals ? record(raw.observer_legacy_totals) : canonical ? null : totals };
}
