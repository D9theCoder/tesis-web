import type { CodexModelProfile } from "@/lib/control-contract";

/**
 * ChatGPT (Codex) stores one model per `models.<profile>` entry, unlike an API
 * provider which stores a model array. These helpers keep the provider editor's
 * multi-select view and that profile shape in sync without inventing runtime
 * behavior.
 */

const PREFIX = "models.";
const ROOT_PROFILE = "openai_codex_auth";

function profileFromConfig(name: string, entry: Record<string, unknown>): CodexModelProfile {
  const extra = entry.extra;
  const extraAccount =
    extra && typeof extra === "object" && !Array.isArray(extra) && "account" in extra ? extra.account : undefined;
  const account = entry.account ?? extraAccount;
  const timeout = entry.timeout;
  const reasoningEffort = entry.reasoning_effort;
  return {
    profile: name,
    model: typeof entry.model_name === "string" ? entry.model_name : "",
    account: typeof account === "string" && account ? account : "default",
    timeout: typeof timeout === "number" || typeof timeout === "string" ? timeout : 60,
    reasoningEffort: typeof reasoningEffort === "string" ? reasoningEffort : null,
    reasoningEfforts: entry.reasoning_efforts ?? null,
  };
}

/** Apply the staged `models.<profile>` overrides to the saved Codex profiles. */
export function effectiveCodexProfiles(
  saved: CodexModelProfile[],
  overrides: Record<string, unknown>,
): CodexModelProfile[] {
  const profiles = new Map(saved.map((profile) => [profile.profile, profile]));
  for (const [key, value] of Object.entries(overrides)) {
    if (!key.startsWith(PREFIX)) continue;
    const name = key.slice(PREFIX.length);
    if (value === null) {
      profiles.delete(name);
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || !("provider" in value)) continue;
    if (value.provider !== "openai_codex_auth") continue;
    profiles.set(name, profileFromConfig(name, value));
  }
  return [...profiles.values()];
}

export type CodexStageResult = {
  /** `models.<profile>` values to merge into the draft overrides. */
  overrides: Record<string, unknown>;
  /** Effective profiles after the selection is applied. */
  profiles: CodexModelProfile[];
};

/**
 * Map selected model IDs onto unique `models.<profile>` entries.
 *
 * Existing profiles keep their names and non-model settings when their model
 * stays selected. Deselected profiles are staged as null. New models reuse a
 * freed profile name before taking the next `openai_codex_auth[_N]` name.
 */
export function stageCodexModels(
  saved: CodexModelProfile[],
  currentOverrides: Record<string, unknown>,
  selectedModels: string[],
  reservedProfileIds: string[],
  account: string,
): CodexStageResult {
  const existing = effectiveCodexProfiles(saved, currentOverrides);
  const models = [...new Set(selectedModels.map((model) => model.trim()).filter(Boolean))];
  const assigned = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const model of models) {
    const profile = existing.find((candidate) => candidate.model === model && !usedNames.has(candidate.profile));
    if (profile) {
      assigned.set(model, profile.profile);
      usedNames.add(profile.profile);
    }
  }

  const freeNames = existing
    .map((profile) => profile.profile)
    .filter((name) => !usedNames.has(name));
  const reserved = new Set([
    ...reservedProfileIds,
    ...existing.map((profile) => profile.profile),
    ...usedNames,
  ]);

  for (const model of models) {
    if (assigned.has(model)) continue;
    let name = freeNames.shift();
    if (!name) {
      name = ROOT_PROFILE;
      let suffix = 2;
      while (reserved.has(name)) {
        name = `${ROOT_PROFILE}_${suffix}`;
        suffix += 1;
      }
      reserved.add(name);
    }
    assigned.set(model, name);
    usedNames.add(name);
  }

  const overrides: Record<string, unknown> = {};
  for (const profile of existing) {
    if (!usedNames.has(profile.profile)) overrides[`${PREFIX}${profile.profile}`] = null;
  }

  const profiles: CodexModelProfile[] = [];
  for (const model of models) {
    const name = assigned.get(model);
    if (!name) continue;
    const previous = existing.find((profile) => profile.profile === name && profile.model === model);
    const entry: Record<string, unknown> = {
      provider: "openai_codex_auth",
      model_name: model,
      timeout: previous?.timeout ?? 60,
      extra: { account },
    };
    if (previous?.reasoningEffort != null) entry.reasoning_effort = previous.reasoningEffort;
    if (previous?.reasoningEfforts != null) entry.reasoning_efforts = previous.reasoningEfforts;
    overrides[`${PREFIX}${name}`] = entry;
    profiles.push({
      profile: name,
      model,
      account,
      timeout: previous?.timeout ?? 60,
      reasoningEffort: previous?.reasoningEffort ?? null,
      reasoningEfforts: previous?.reasoningEfforts ?? null,
    });
  }

  return { overrides, profiles };
}
