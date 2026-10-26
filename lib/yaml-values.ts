import { parseDocument } from "yaml";

/**
 * Structured view of the masked configuration document.
 *
 * Keys and collection shapes are read-only; only scalar leaves are editable.
 * Paths stay arrays so keys containing dots or brackets never get confused
 * with nesting, and the original `yaml` AST is mutated in place so comments
 * and formatting survive an edit.
 */

export type YamlPath = Array<string | number>;
export type YamlScalar = string | number | boolean | null;

export type YamlValueKind = "string" | "number" | "boolean" | "null" | "environment" | "secret";

export type YamlValueRow = {
  kind: "value";
  path: YamlPath;
  displayPath: string;
  key: string;
  value: YamlScalar;
  valueKind: YamlValueKind;
};

export type YamlEmptyRow = {
  kind: "empty";
  path: YamlPath;
  displayPath: string;
  key: string;
  collection: "mapping" | "sequence";
};

export type YamlRow = YamlValueRow | YamlEmptyRow;

export type YamlGroup = {
  key: string;
  path: YamlPath;
  collection: "mapping" | "sequence" | "value";
  rows: YamlRow[];
};

export type YamlAnalysis = {
  groups: YamlGroup[];
  valueCount: number;
  error: string | null;
};

const SECRET_PLACEHOLDER = /^__TESIS_PRESERVE_SECRET_\d+__$/;
const ENV_REFERENCE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
const SIMPLE_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function formatYamlPath(path: YamlPath): string {
  let text = "";
  for (const part of path) {
    if (typeof part === "number") {
      text += `[${part}]`;
      continue;
    }
    if (SIMPLE_KEY.test(part)) {
      text = text ? `${text}.${part}` : part;
      continue;
    }
    text += `[${JSON.stringify(part)}]`;
  }
  return text;
}

function scalarKind(value: YamlScalar): YamlValueKind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value === null) return "null";
  if (SECRET_PLACEHOLDER.test(value)) return "secret";
  if (ENV_REFERENCE.test(value)) return "environment";
  return "string";
}

function isScalar(value: unknown): value is YamlScalar {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function flattenValue(value: unknown, path: YamlPath, rows: YamlRow[]): void {
  if (isScalar(value)) {
    const last = path[path.length - 1];
    rows.push({
      kind: "value",
      path,
      displayPath: formatYamlPath(path),
      key: typeof last === "number" ? `[${last}]` : String(last ?? ""),
      value,
      valueKind: scalarKind(value),
    });
    return;
  }
  if (Array.isArray(value)) {
    const last = path[path.length - 1];
    if (value.length === 0) {
      rows.push({
        kind: "empty",
        path,
        displayPath: formatYamlPath(path),
        key: typeof last === "number" ? `[${last}]` : String(last ?? ""),
        collection: "sequence",
      });
      return;
    }
    for (const [index, item] of value.entries()) flattenValue(item, [...path, index], rows);
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const last = path[path.length - 1];
    if (entries.length === 0) {
      rows.push({
        kind: "empty",
        path,
        displayPath: formatYamlPath(path),
        key: typeof last === "number" ? `[${last}]` : String(last ?? ""),
        collection: "mapping",
      });
      return;
    }
    for (const [key, item] of entries) flattenValue(item, [...path, key], rows);
  }
}

/** Parse the masked profile once for rendering; keys never become editable. */
export function analyzeYaml(yamlText: string): YamlAnalysis {
  const document = parseDocument(yamlText, { prettyErrors: false });
  if (document.errors.length > 0) {
    return { groups: [], valueCount: 0, error: document.errors[0].message };
  }
  const data: unknown = document.toJS();
  if (data === null || data === undefined) return { groups: [], valueCount: 0, error: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { groups: [], valueCount: 0, error: "The profile root must be a mapping." };
  }
  const groups: YamlGroup[] = [];
  let valueCount = 0;
  for (const [key, value] of Object.entries(data)) {
    const rows: YamlRow[] = [];
    flattenValue(value, [key], rows);
    const collection: YamlGroup["collection"] = Array.isArray(value)
      ? "sequence"
      : value && typeof value === "object"
        ? "mapping"
        : "value";
    groups.push({ key, path: [key], collection, rows });
    valueCount += rows.filter((row) => row.kind === "value").length;
  }
  return { groups, valueCount, error: null };
}

/**
 * Replace one scalar in the YAML AST and serialize it back. Comments on the
 * document, keys, and values stay attached to their nodes.
 */
export function updateYamlValue(
  yamlText: string,
  path: YamlPath,
  value: YamlScalar,
): { text: string; error: string | null } {
  const document = parseDocument(yamlText, { prettyErrors: false });
  if (document.errors.length > 0) {
    return { text: yamlText, error: document.errors[0].message };
  }
  try {
    document.setIn(path, value);
    return { text: String(document), error: null };
  } catch (error) {
    return {
      text: yamlText,
      error: error instanceof Error ? error.message : "The value could not be written.",
    };
  }
}
