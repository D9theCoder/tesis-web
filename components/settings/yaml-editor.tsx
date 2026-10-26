"use client";

import { Fragment, useMemo, useRef } from "react";

import { highlightYaml, type YamlTokenKind } from "@/lib/yaml-highlight";
import styles from "./runtime-settings.module.css";

/**
 * YAML editor with syntax colour.
 *
 * A transparent textarea sits exactly on top of a painted `pre`; both share the
 * same font, padding, and line height, and the textarea drives the scroll of the
 * layer behind it. The text stays a real textarea — native selection, undo,
 * spellcheck control, and screen-reader behaviour are unchanged.
 */

const TOKEN_CLASS: Record<YamlTokenKind, string> = {
  comment: styles.yamlComment,
  key: styles.yamlKey,
  string: styles.yamlString,
  number: styles.yamlNumber,
  boolean: styles.yamlLiteral,
  null: styles.yamlLiteral,
  env: styles.yamlEnv,
  secret: styles.yamlSecret,
  punctuation: styles.yamlPunctuation,
  plain: "",
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
};

export function YamlEditor({ value, onChange, disabled, label = "Configuration YAML" }: Props) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const lines = useMemo(() => highlightYaml(value), [value]);

  return (
    <div className={styles.yamlEditor}>
      <pre ref={highlightRef} className={styles.yamlHighlight} aria-hidden="true">
        {lines.map((tokens, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 ? "\n" : null}
            {tokens.map((token, tokenIndex) =>
              token.kind === "plain" ? (
                <Fragment key={tokenIndex}>{token.text}</Fragment>
              ) : (
                <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                  {token.text}
                </span>
              ),
            )}
          </Fragment>
        ))}
      </pre>
      <textarea
        className={styles.yamlInput}
        aria-label={label}
        value={value}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          const highlight = highlightRef.current;
          if (!highlight) return;
          highlight.scrollTop = event.currentTarget.scrollTop;
          highlight.scrollLeft = event.currentTarget.scrollLeft;
        }}
      />
    </div>
  );
}
