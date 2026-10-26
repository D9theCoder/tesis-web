import { controlFieldSchema, type ControlField } from "@/lib/control-contract";

/**
 * Runtime settings the TESIS field registry does not describe.
 *
 * Paths follow the canonical YAML contract the loader actually reads:
 * `guardrail_retry.*` (not the legacy `evasion.*` alias) and
 * `llm_runtime.max_concurrency` / `cache_scope`.
 */
export const EXTRA_FIELDS: ControlField[] = [
  controlFieldSchema.parse({
    path: "guardrail_retry.enabled",
    label: "Guardrail retry enabled",
    category: "guardrail_retry",
    kind: "boolean",
    valueType: "bool",
    description: "Retry schema-safe prompt clarifications after a guardrail refusal.",
  }),
  controlFieldSchema.parse({
    path: "guardrail_retry.mode",
    label: "Guardrail handling",
    category: "guardrail_retry",
    kind: "select",
    valueType: "str",
    choices: ["reactive", "proactive", "disabled"],
    description: "Reactive clarifies after a refusal; proactive rewrites before sending.",
  }),
  controlFieldSchema.parse({
    path: "guardrail_retry.max_retries",
    label: "Guardrail retry max",
    category: "guardrail_retry",
    kind: "integer",
    valueType: "int",
    minValue: 1,
  }),
  controlFieldSchema.parse({
    path: "guardrail_retry.cooldown_threshold",
    label: "Guardrail retry cooldown",
    category: "guardrail_retry",
    kind: "integer",
    valueType: "int",
    minValue: 1,
  }),
  controlFieldSchema.parse({
    path: "llm_runtime.max_concurrency",
    label: "LLM max concurrency",
    category: "model",
    kind: "integer",
    valueType: "int",
    minValue: 1,
    maxValue: 4,
    description: "Provider calls in flight. Matrix runs only; single runs stay serial.",
  }),
  controlFieldSchema.parse({
    path: "llm_runtime.cache_scope",
    label: "LLM cache",
    category: "model",
    kind: "select",
    valueType: "str",
    choices: ["none", "run"],
    description: "Reuse successful validated responses within one run.",
  }),
];

/** Extra field paths shown on the Settings → Experiment tab. */
export const EXPERIMENT_EXTRA_PATHS = EXTRA_FIELDS.map((field) => field.path);

/** Baseline values for the extra fields, projected from the saved profile. */
export function extraFieldBaseline(input: {
  guardrails?: { enabled: boolean; mode: string; maxRetries: unknown; cooldownThreshold: unknown } | null;
  llmRuntime?: { maxConcurrency: unknown; cacheScope: string } | null;
}): Record<string, unknown> {
  return {
    "guardrail_retry.enabled": input.guardrails?.enabled ?? false,
    "guardrail_retry.mode": input.guardrails?.mode ?? "reactive",
    "guardrail_retry.max_retries": input.guardrails?.maxRetries ?? 3,
    "guardrail_retry.cooldown_threshold": input.guardrails?.cooldownThreshold ?? 5,
    "llm_runtime.max_concurrency": input.llmRuntime?.maxConcurrency ?? 1,
    "llm_runtime.cache_scope": input.llmRuntime?.cacheScope ?? "none",
  };
}
