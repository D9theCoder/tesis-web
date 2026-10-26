/**
 * Small, lossless YAML tokenizer for the settings editor.
 *
 * It is deliberately not a parser: it only classifies the text already on
 * screen so the editor can colour it without a syntax-highlighting dependency.
 * Concatenating the tokens of a line always reproduces that line exactly, which
 * keeps the transparent textarea and the painted layer pixel-identical.
 */

export type YamlTokenKind =
  | "comment"
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "env"
  | "secret"
  | "punctuation"
  | "plain";

export type YamlToken = { text: string; kind: YamlTokenKind };

const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const BOOLEAN = /^(?:true|false|yes|no|on|off)$/i;
const NULL = /^(?:null|~)$/i;
const ENV_REF = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
const SECRET_PLACEHOLDER = /^__TESIS_PRESERVE_SECRET_\d+__$/;
const KEY = /^(\s*(?:-\s+)?)([^:#\n'"[\]]+?)(:)(\s|$)/;

function classifyValue(value: string): YamlTokenKind {
  if (!value) return "plain";
  if (ENV_REF.test(value)) return "env";
  if (SECRET_PLACEHOLDER.test(value)) return "secret";
  if (NUMBER.test(value)) return "number";
  if (BOOLEAN.test(value)) return "boolean";
  if (NULL.test(value)) return "null";
  return "plain";
}

/** Split a value into quoted/unquoted runs while preserving every character. */
function tokenizeValue(value: string): YamlToken[] {
  const tokens: YamlToken[] = [];
  let index = 0;
  let plain = "";

  const flushPlain = () => {
    if (!plain) return;
    tokens.push({ text: plain, kind: classifyValue(plain.trim()) });
    plain = "";
  };

  while (index < value.length) {
    const char = value[index];

    // Comments start a new word beginning with # and are not part of a value.
    if (char === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
      flushPlain();
      tokens.push({ text: value.slice(index), kind: "comment" });
      return tokens;
    }

    if (char === '"' || char === "'") {
      flushPlain();
      let end = index + 1;
      while (end < value.length) {
        if (value[end] === "\\" && char === '"') {
          end += 2;
          continue;
        }
        if (value[end] === char) {
          end += 1;
          break;
        }
        end += 1;
      }
      tokens.push({ text: value.slice(index, end), kind: "string" });
      index = end;
      continue;
    }

    if (char === "$" && value[index + 1] === "{") {
      const end = value.indexOf("}", index);
      if (end > index) {
        flushPlain();
        tokens.push({ text: value.slice(index, end + 1), kind: "env" });
        index = end + 1;
        continue;
      }
    }

    if ("[]{},".includes(char)) {
      flushPlain();
      tokens.push({ text: char, kind: "punctuation" });
      index += 1;
      continue;
    }

    plain += char;
    index += 1;
  }

  flushPlain();
  return tokens;
}

function tokenizeLine(line: string): YamlToken[] {
  if (!line) return [];
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);

  if (trimmed.startsWith("#")) {
    return [
      ...(indent ? [{ text: indent, kind: "plain" as const }] : []),
      { text: trimmed, kind: "comment" },
    ];
  }

  const tokens: YamlToken[] = [];
  const keyMatch = KEY.exec(line);
  if (keyMatch) {
    const [whole, prefix, name, colon, trailing] = keyMatch;
    if (prefix) tokens.push({ text: prefix, kind: "plain" });
    tokens.push({ text: name, kind: "key" });
    tokens.push({ text: colon, kind: "punctuation" });
    if (trailing) tokens.push({ text: trailing, kind: "plain" });
    tokens.push(...tokenizeValue(line.slice(whole.length)));
    return tokens;
  }

  const listMatch = /^(\s*)(-)(\s|$)/.exec(line);
  if (listMatch) {
    const [whole, spacing, dash, trailing] = listMatch;
    if (spacing) tokens.push({ text: spacing, kind: "plain" });
    tokens.push({ text: dash, kind: "punctuation" });
    if (trailing) tokens.push({ text: trailing, kind: "plain" });
    tokens.push(...tokenizeValue(line.slice(whole.length)));
    return tokens;
  }

  tokens.push(...tokenizeValue(line));
  return tokens;
}

/** One token list per source line, preserving line breaks and indentation. */
export function highlightYaml(source: string): YamlToken[][] {
  return source.split("\n").map(tokenizeLine);
}

/** Convenience for tests and callers that only need the colour per line part. */
export function tokenText(tokens: YamlToken[]): string {
  return tokens.map((token) => token.text).join("");
}
