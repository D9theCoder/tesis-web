import { describe, expect, it } from "vitest";

import { effectiveCodexProfiles, stageCodexModels } from "@/lib/control-codex";
import type { CodexModelProfile } from "@/lib/control-contract";

const SAVED: CodexModelProfile[] = [
  {
    profile: "openai_codex_auth",
    model: "gpt-5-codex",
    account: "default",
    timeout: 60,
    reasoningEffort: "high",
    reasoningEfforts: null,
  },
  {
    profile: "openai_codex_auth_2",
    model: "gpt-5",
    account: "default",
    timeout: 90,
    reasoningEffort: null,
    reasoningEfforts: ["low", "high"],
  },
];

describe("effectiveCodexProfiles", () => {
  it("reads a reasoning patch before the provider editor is reopened", () => {
    const profiles = effectiveCodexProfiles(SAVED, {
      models: { openai_codex_auth: { provider: "openai_codex_auth", model_name: "gpt-5-codex", reasoning_effort: "low" } },
    });
    expect(profiles[0].reasoningEffort).toBe("low");
  });
  it("applies staged profile objects and removals", () => {
    const profiles = effectiveCodexProfiles(SAVED, {
      "models.openai_codex_auth_2": null,
      "models.openai_codex_auth_3": {
        provider: "openai_codex_auth",
        model_name: "gpt-6",
        timeout: 45,
        reasoning_effort: "medium",
        extra: { account: "work" },
      },
      "models.other_provider": { provider: "gemini", model_name: "ignored" },
    });
    expect(profiles.map((profile) => [profile.profile, profile.model])).toEqual([
      ["openai_codex_auth", "gpt-5-codex"],
      ["openai_codex_auth_3", "gpt-6"],
    ]);
    expect(profiles[1]).toMatchObject({
      account: "work",
      timeout: 45,
      reasoningEffort: "medium",
    });
  });
});

describe("stageCodexModels", () => {
  it("retains effort metadata returned by account discovery", () => {
    const result = stageCodexModels([], {}, ["gpt-fixture"], [], "default", [
      { id: "gpt-fixture", reasoning_efforts: ["low", "high", "max"] },
    ]);
    expect(result.profiles[0].reasoningEfforts).toEqual(["low", "high", "max"]);
    expect(result.overrides["models.openai_codex_auth"]).toMatchObject({ reasoning_efforts: ["low", "high", "max"] });
  });
  it("creates one profile per selected model", () => {
    const result = stageCodexModels(SAVED, {}, ["gpt-5-codex", "gpt-5"], [], "default");
    expect(result.profiles.map((profile) => profile.profile)).toEqual([
      "openai_codex_auth",
      "openai_codex_auth_2",
    ]);
    expect(result.overrides["models.openai_codex_auth"]).toMatchObject({
      provider: "openai_codex_auth",
      model_name: "gpt-5-codex",
      reasoning_effort: "high",
      extra: { account: "default" },
    });
    expect(result.overrides["models.openai_codex_auth_2"]).toMatchObject({
      provider: "openai_codex_auth",
      model_name: "gpt-5",
      timeout: 90,
      reasoning_efforts: ["low", "high"],
    });
  });

  it("removes profiles that were deselected", () => {
    const result = stageCodexModels(SAVED, {}, ["gpt-5"], [], "default");
    expect(result.overrides["models.openai_codex_auth"]).toBeNull();
    expect(result.overrides["models.openai_codex_auth_2"]).toMatchObject({
      model_name: "gpt-5",
    });
    expect(result.profiles.map((profile) => profile.profile)).toEqual(["openai_codex_auth_2"]);
  });

  it("allocates a new profile name without colliding with other model profiles", () => {
    const result = stageCodexModels(
      SAVED,
      {},
      ["gpt-5-codex", "gpt-5", "gpt-6"],
      ["openai_codex_auth_3"],
      "default",
    );
    expect(result.profiles.map((profile) => profile.profile)).toEqual([
      "openai_codex_auth",
      "openai_codex_auth_2",
      "openai_codex_auth_4",
    ]);
  });

  it("reuses a freed profile name before allocating a suffix", () => {
    const result = stageCodexModels(
      [SAVED[0]],
      {},
      ["gpt-5"],
      [],
      "default",
    );
    expect(result.profiles[0].profile).toBe("openai_codex_auth");
    expect(result.overrides["models.openai_codex_auth"]).toMatchObject({
      model_name: "gpt-5",
    });
  });

  it("stages every existing profile as removed for an empty selection", () => {
    const result = stageCodexModels(SAVED, {}, [], [], "default");
    expect(result.profiles).toEqual([]);
    expect(result.overrides).toEqual({
      "models.openai_codex_auth": null,
      "models.openai_codex_auth_2": null,
    });
  });
});
