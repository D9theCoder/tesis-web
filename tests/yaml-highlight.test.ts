import { describe, expect, it } from "vitest";

import { highlightYaml, tokenText, type YamlToken, type YamlTokenKind } from "@/lib/yaml-highlight";

function kinds(tokens: YamlToken[]): YamlTokenKind[] {
  return tokens.map((token) => token.kind);
}

function values(tokens: YamlToken[]): string[] {
  return tokens.filter((token) => token.kind !== "plain").map((token) => token.text);
}

const SOURCE = `# TESIS runtime configuration
target_url: http://172.19.48.1/dvwa
provider: river-ai__deepseek-ai-deepseek-v4-1-flash-1017_15efb2abf693
matrix: true
repeats: 2
coverage_target: 0.70
target_method: null

api_providers:
  river-ai:
    protocol: openai_compatible
    models:
      - zai-org/GLM-5.3-Flash
      - deepseek-ai/DeepSeek-V4.1-Flash-1017
    api_key: \${TESIS_PROVIDER_RIVER_AI_8DE913F7_API_KEY}

dvwa_password: __TESIS_PRESERVE_SECRET_0__

scoring_evaluator:
  max_attempts: 2
  note: "values keep: colons # and hashes"

guardrail_retry:
  enabled: false
  mode: reactive # inline comment
`;

describe("highlightYaml", () => {
  it("reproduces the source exactly, line by line", () => {
    const highlighted = highlightYaml(SOURCE);
    const lines = SOURCE.split("\n");
    expect(highlighted).toHaveLength(lines.length);
    highlighted.forEach((tokens, index) => {
      expect(tokenText(tokens)).toBe(lines[index]);
    });
    expect(highlighted.map(tokenText).join("\n")).toBe(SOURCE);
  });

  it("classifies comments, keys, and inline comments", () => {
    const [commentLine, target, ...rest] = highlightYaml(SOURCE);
    expect(kinds(commentLine)).toContain("comment");
    expect(commentLine.every((token) => token.kind === "plain" || token.kind === "comment")).toBe(true);

    expect(target[0]).toEqual({ text: "target_url", kind: "key" });
    expect(target[1]).toEqual({ text: ":", kind: "punctuation" });

    const inline = rest.find((tokens) => tokenText(tokens).includes("reactive # inline comment"));
    expect(inline?.some((token) => token.kind === "comment" && token.text.startsWith("#"))).toBe(true);
  });

  it("marks values by type", () => {
    const byLine = new Map(highlightYaml(SOURCE).map((tokens) => [tokenText(tokens).split(":")[0].trim(), tokens]));
    expect(byLine.get("matrix")?.some((token) => token.kind === "boolean")).toBe(true);
    expect(byLine.get("repeats")?.some((token) => token.kind === "number")).toBe(true);
    expect(byLine.get("coverage_target")?.some((token) => token.kind === "number")).toBe(true);
    expect(byLine.get("target_method")?.some((token) => token.kind === "null")).toBe(true);
    expect(byLine.get("protocol")?.some((token) => token.kind === "plain")).toBe(true);
  });

  it("keeps environment references and secret placeholders distinct", () => {
    const tokens = highlightYaml(SOURCE).flat();
    expect(tokens.some((token) => token.kind === "env" && token.text === "${TESIS_PROVIDER_RIVER_AI_8DE913F7_API_KEY}")).toBe(true);
    expect(tokens.some((token) => token.kind === "secret" && token.text === "__TESIS_PRESERVE_SECRET_0__")).toBe(true);
  });

  it("handles quoted strings with punctuation and list items", () => {
    const tokens = highlightYaml(SOURCE).flat();
    expect(
      tokens.some((token) => token.kind === "string" && token.text === '"values keep: colons # and hashes"'),
    ).toBe(true);

    const listLine = highlightYaml(SOURCE).find((line) => tokenText(line).trim().startsWith("- zai-org"));
    expect(listLine?.some((token) => token.kind === "punctuation" && token.text === "-")).toBe(true);
  });

  it("keeps indentation as plain text before a key", () => {
    const nested = highlightYaml(SOURCE).find((line) => tokenText(line).startsWith("  river-ai:"));
    expect(nested?.[0]).toEqual({ text: "  ", kind: "plain" });
    expect(values(nested ?? [])).toEqual(["river-ai", ":"]);
  });

  it("treats an empty document as a single empty line", () => {
    expect(highlightYaml("")).toEqual([[]]);
  });
});
