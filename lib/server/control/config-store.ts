import { promises as fs } from "node:fs";
import path from "node:path";

import { runBridge } from "@/lib/server/control/bridge";
import {
  profileConfigPath,
  sourceConfigPath,
  stateDir,
} from "@/lib/server/control/paths";

/**
 * The web-owned settings profile.
 *
 * It is seeded once from the TESIS checkout `config.yaml` (comments intact)
 * and from then on is the document handed to every runtime invocation. Writing
 * into the checkout stays a separate, explicit operator action.
 */

const SEED_CONFIG = `# TESIS web profile. Seeded because the checkout has no config.yaml.
# Every value can be edited from the Settings page.
target_url: http://localhost/dvwa
provider: gemini
level: low
surface: sqli
payload_mode: static_only
candidate_budget: 10
iterations: 10
repeats: 1
output_dir: results
report_format: both
experiment_condition: akg_guided_hybrid
matrix: false
providers: []
levels:
  - low
  - medium
  - high
surfaces:
  - sqli
  - access_control
  - brute_force
payload_modes:
  - static_only
  - hybrid
scoring_mode: ai
scoring_rubric_version: scoring.v4
scoring_evaluator:
  max_attempts: 2
  max_tokens: 1024
  timeout: 60
`;

export type SchemaPayload = {
  ok: boolean;
  providers: {
    id: string;
    displayName: string;
    protocol: string;
    baseUrl: string;
    fetchUrl: string;
    models: string[];
    keyRef: string;
    hasKey: boolean;
  }[];
  scoring: Record<string, unknown>;
  llmRuntime: Record<string, unknown>;
  guardrails: Record<string, unknown>;
  target: Record<string, unknown>;
  configPath: string;
  sourceConfigPath: string;
  profileExists: boolean;
  yaml: string;
  preservedSecretCount: number;
  fields: ControlField[];
  forms: Record<string, string[]>;
  categories: string[];
  modelProfiles: { id: string; label: string }[];
  resolved: Record<string, unknown> | null;
  resolvedError: string | null;
  fieldErrors: Record<string, string>;
  warnings: string[];
};

export type ControlField = {
  path: string;
  label: string;
  category: string;
  kind: string;
  valueType: string;
  choices: string[];
  default: unknown;
  value: unknown;
  secret: boolean;
  multiple: boolean;
  required: boolean;
  minValue: number | null;
  maxValue: number | null;
  description: string;
  forms: string[];
};

export type ValidationPayload = {
  ok: boolean;
  valid: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  resolved: Record<string, unknown> | null;
  coordinates: Record<string, unknown>[];
  totalCoordinates: number;
};

export type SavePayload = {
  ok: boolean;
  saved: boolean;
  error?: string;
  yaml?: string;
  resolved?: Record<string, unknown> | null;
  resolvedError?: string | null;
  fieldErrors?: Record<string, string>;
};

/** Create the web profile on first use without touching the checkout. */
export async function ensureProfile(): Promise<string> {
  const target = profileConfigPath();
  await fs.mkdir(stateDir(), { recursive: true });
  try {
    await fs.access(target);
    return target;
  } catch {
    /* Seed below. */
  }
  let sourceAvailable = false;
  try {
    await fs.access(sourceConfigPath());
    sourceAvailable = true;
  } catch {
    /* The checkout has no config.yaml; fall back to the minimal document. */
  }
  if (sourceAvailable) {
    // The Python bridge owns TESIS configuration semantics, including relative
    // scoring JSON paths that must keep their meaning outside the checkout.
    await runBridge("seed-profile");
    return target;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, SEED_CONFIG, { encoding: "utf8", mode: 0o600 });
  return target;
}

export async function readSchema(): Promise<SchemaPayload> {
  await ensureProfile();
  return runBridge<SchemaPayload>("schema");
}

export async function validateConfig(
  yaml: string,
  form?: string,
  overrides: Record<string, unknown> = {},
): Promise<ValidationPayload> {
  await ensureProfile();
  return runBridge<ValidationPayload>("validate", { yaml, form, overrides });
}

export async function saveConfig(
  yaml: string,
  secrets: Record<string, string> = {},
  overrides: Record<string, unknown> = {},
  apiProviderKeys: Record<string, string> = {},
): Promise<SavePayload> {
  await ensureProfile();
  return runBridge<SavePayload>("save", { yaml, secrets, overrides, apiProviderKeys });
}

export async function writeCheckoutConfig(): Promise<{ ok: boolean; written: boolean; error?: string; path?: string }> {
  await ensureProfile();
  return runBridge("write-tesis-config", {});
}

export async function discoverModels(input: {
  providerId?: string;
  baseUrl?: string;
  protocol?: string;
  fetchUrl?: string;
  apiKey?: string;
}): Promise<{ ok: boolean; fetched: boolean; error?: string; models?: { id: string; display_name?: string }[] }> {
  await ensureProfile();
  return runBridge("models", input, 45_000);
}

export async function chatGPTAccount(
  action: "status" | "models",
  account = "default",
): Promise<Record<string, unknown>> {
  return runBridge("auth", { action, account }, 45_000);
}

export async function resolvePlan(): Promise<Record<string, unknown>> {
  await ensureProfile();
  return runBridge("plan");
}
