import { describe, expect, it } from "vitest";

import { analyzeYaml, formatYamlPath, updateYamlValue } from "@/lib/yaml-values";

const SAMPLE = `# Leading comment
target_url: http://127.0.0.1/dvwa
api_providers:
  # Provider comment
  river-ai:
    display_name: river-ai
    models:
      - zai-org/GLM-5.3-Flash
      - deepseek-ai/DeepSeek-V4.1-Flash-1017
empty_map: {}
empty_list: []
secret_value: __TESIS_PRESERVE_SECRET_0__
env_value: \${TESIS_PROVIDER_RIVER_AI_KEY}
retries: 2
enabled: true
missing: null
`;

function rowPaths(yamlText: string): string[] {
  return analyzeYaml(yamlText).groups.flatMap((group) => group.rows.map((row) => row.displayPath));
}

describe("analyzeYaml", () => {
  it("flattens nested mappings and sequences into editable leaf paths", () => {
    const analysis = analyzeYaml(SAMPLE);
    expect(analysis.error).toBeNull();
    expect(rowPaths(SAMPLE)).toEqual([
      "target_url",
      "api_providers.river-ai.display_name",
      "api_providers.river-ai.models[0]",
      "api_providers.river-ai.models[1]",
      "empty_map",
      "empty_list",
      "secret_value",
      "env_value",
      "retries",
      "enabled",
      "missing",
    ]);
    expect(analysis.valueCount).toBe(9);
  });

  it("classifies scalar leaves and empty collections", () => {
    const rows = analyzeYaml(SAMPLE).groups.flatMap((group) => group.rows);
    const byPath = new Map(rows.map((row) => [row.displayPath, row]));
    const kindAt = (path: string) => {
      const row = byPath.get(path);
      return row?.kind === "value" ? row.valueKind : row?.kind ?? null;
    };
    expect(kindAt("secret_value")).toBe("secret");
    expect(kindAt("env_value")).toBe("environment");
    expect(kindAt("retries")).toBe("number");
    expect(kindAt("enabled")).toBe("boolean");
    expect(kindAt("missing")).toBe("null");
    expect(kindAt("empty_map")).toBe("empty");
    expect(kindAt("empty_list")).toBe("empty");
  });

  it("keeps dotted and bracketed keys unambiguous", () => {
    expect(formatYamlPath(["reasoning_catalog", "gpt-6.1-sol"])).toBe('reasoning_catalog["gpt-6.1-sol"]');
    expect(formatYamlPath(["api_providers", "river-ai", "models", 0])).toBe(
      "api_providers.river-ai.models[0]",
    );
  });

  it("flattens sequences of mappings and nested sequences", () => {
    const yamlText = `oracles:
  - name: first
    enabled: true
    tags:
      - alpha
  - name: second
`;
    const paths = rowPaths(yamlText);
    expect(paths).toEqual([
      "oracles[0].name",
      "oracles[0].enabled",
      "oracles[0].tags[0]",
      "oracles[1].name",
    ]);
    expect(updateYamlValue(yamlText, ["oracles", 1, "name"], "renamed").text).toContain("name: renamed");
  });

  it("reports an invalid document instead of inventing keys", () => {
    const analysis = analyzeYaml("target_url: [\n");
    expect(analysis.error).toBeTruthy();
    expect(analysis.groups).toEqual([]);
  });
});

describe("updateYamlValue", () => {
  it("updates a nested scalar while preserving comments", () => {
    const result = updateYamlValue(SAMPLE, ["api_providers", "river-ai", "models", 0], "new-model");
    expect(result.error).toBeNull();
    expect(result.text).toContain("# Leading comment");
    expect(result.text).toContain("# Provider comment");
    expect(rowPaths(result.text)).toContain("api_providers.river-ai.models[0]");
    expect(analyzeYaml(result.text).groups.flatMap((group) => group.rows)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayPath: "api_providers.river-ai.models[0]", value: "new-model" }),
      ]),
    );
  });

  it("preserves scalar types when a typed control commits", () => {
    const numbered = updateYamlValue(SAMPLE, ["retries"], 3.5);
    const booleaned = updateYamlValue(numbered.text, ["enabled"], false);
    const rows = analyzeYaml(booleaned.text).groups.flatMap((group) => group.rows);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayPath: "retries", value: 3.5, valueKind: "number" }),
        expect.objectContaining({ displayPath: "enabled", value: false, valueKind: "boolean" }),
      ]),
    );
  });

  it("can clear an optional value back to null", () => {
    const result = updateYamlValue(SAMPLE, ["target_url"], null);
    const rows = analyzeYaml(result.text).groups.flatMap((group) => group.rows);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayPath: "target_url", value: null, valueKind: "null" }),
      ]),
    );
  });
});
