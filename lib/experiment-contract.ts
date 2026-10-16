import { z } from "zod";
import { coverageSchema, runSummarySchema, sourceBindingSchema } from "@/lib/schemas";

const count = z.number().int().nonnegative();
export const inventoryQuerySchema = z.object({
  view: z.enum(["experiments", "executions", "unresolved"]).default("experiments"),
  scope: z.string().min(1).max(512).optional(),
  q: z.string().max(512).default(""),
  execution: z.enum(["all", "completed", "failed", "interrupted", "unknown"]).default("all"),
  outcome: z.enum(["all", "confirmed", "no_finding", "unconfirmed", "fixture_limited", "unknown"]).default("all"),
  artifacts: z.enum(["all", "available", "missing"]).default("all"),
  sort: z.enum(["newest", "oldest", "identity"]).default("newest"),
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export const experimentEntrySchema = z.object({
  run: runSummarySchema,
  kind: z.enum(["matrix", "standalone", "coordinate", "unresolved"]),
  unit: z.enum(["coordinates", "execution"]),
  memberCount: count,
  contextFromMembers: z.boolean(),
  coverage: coverageSchema.nullable(),
  lifecycle: z.record(count), outcomes: z.record(count), unknownOutcomes: count.nullable(),
  diagnostics: z.array(z.string()),
});
export type ExperimentEntry = z.infer<typeof experimentEntrySchema>;
export const experimentListSchema = z.object({
  entries: z.array(experimentEntrySchema), total: count, nextCursor: count.nullable(),
  experiments: count, executions: count, unresolved: count,
  refreshedAt: z.string(), partial: z.boolean(), diagnostics: z.array(z.string()),
});
export type ExperimentList = z.infer<typeof experimentListSchema>;
export const readinessStateSchema = z.enum(["final", "pending", "stale", "missing", "unavailable", "not_selected", "not_scanned"]);
export type ReadinessState = z.infer<typeof readinessStateSchema>;
const workflowSummarySchema = z.object({
  eligible: count, eligibilityUnknown: count, scanned: count, total: count,
  states: z.record(readinessStateSchema, count),
});
const attentionItemSchema = z.object({
  executionId: z.string(), source: z.string(), href: z.string(), diagnostics: z.array(z.string()),
});
export const experimentOverviewSchema = z.object({
  experiment: experimentEntrySchema.nullable(),
  source: sourceBindingSchema.nullable(),
  refreshedAt: z.string(), partial: z.boolean(),
  unit: z.enum(["coordinates", "standalone execution"]),
  coverage: coverageSchema.nullable(),
  lifecycle: z.record(count), outcomes: z.record(count), unknownOutcomes: count.nullable(),
  reviews: z.object({ human: workflowSummarySchema, ai: workflowSummarySchema, complete: z.boolean(), limit: count }),
  attention: z.array(z.object({
    id: z.string(), title: z.string(), description: z.string(), unit: z.enum(["executions", "sources"]),
    affected: count, messages: count, href: z.string(), items: z.array(attentionItemSchema), omitted: count,
  })),
  diagnostics: z.array(z.string()),
});
export type ExperimentOverview = z.infer<typeof experimentOverviewSchema>;

export function experimentLabel(run: z.infer<typeof runSummarySchema>) {
  return [run.experimentCondition, run.targetMethod, run.surface].filter(Boolean).join(" · ").replace(/_/g, " ") || (run.mode === "matrix" ? "Matrix experiment" : "Standalone execution");
}
export function resultHref(executionId: string, coordinate?: string, tab?: string) {
  const query = new URLSearchParams();
  if (coordinate) query.set("coordinate", coordinate);
  if (tab) query.set("tab", tab);
  return `/results/${encodeURIComponent(executionId)}${query.size ? `?${query}` : ""}`;
}
export function inventoryHref(values: Partial<InventoryQuery>, current = "") {
  const query = new URLSearchParams(current);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) query.delete(key); else query.set(key, String(value));
  }
  return `/results${query.size ? `?${query}` : ""}`;
}
