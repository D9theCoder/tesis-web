"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Search } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import {
  analyzeYaml,
  updateYamlValue,
  type YamlPath,
  type YamlRow,
  type YamlValueKind,
} from "@/lib/yaml-values";
import styles from "./yaml-key-value.module.css";

const KIND_LABEL: Record<YamlValueKind, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  null: "null",
  environment: "env reference",
  secret: "stored secret",
};

function kindLabel(row: YamlRow): string {
  return row.kind === "empty" ? row.collection : KIND_LABEL[row.valueKind];
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function rowMatches(row: YamlRow, query: string): boolean {
  if (!query) return true;
  const haystack = row.kind === "value" ? `${row.displayPath} ${String(row.value)}` : row.displayPath;
  return haystack.toLowerCase().includes(query);
}

function ScalarControl({
  row,
  disabled,
  onCommit,
}: {
  row: YamlRow;
  disabled: boolean;
  onCommit: (path: YamlPath, value: string | number | boolean | null) => void;
}) {
  if (row.kind === "empty") {
    return (
      <span className={styles.emptyValue}>
        {row.collection === "mapping" ? "empty mapping" : "empty sequence"}
      </span>
    );
  }

  if (row.valueKind === "secret") {
    return (
      <span className={styles.secretValue}>
        <Lock size={13} aria-hidden /> Stored secret — edit its provider or source field.
      </span>
    );
  }

  if (row.valueKind === "boolean") {
    return (
      <select
        className={`form-control ${styles.booleanControl}`}
        aria-label={`${row.displayPath} value`}
        value={String(row.value)}
        disabled={disabled}
        onChange={(event) => onCommit(row.path, event.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (row.valueKind === "number") {
    return <DraftControl key={String(row.value)} row={row} disabled={disabled} onCommit={onCommit} numeric />;
  }

  if (row.valueKind === "null") {
    return <DraftControl key="null" row={row} disabled={disabled} onCommit={onCommit} />;
  }

  const text = String(row.value);
  return (
    <textarea
      className={`${styles.textControl} ${row.valueKind === "environment" ? styles.environmentControl : ""}`}
      aria-label={`${row.displayPath} value`}
      value={text}
      rows={Math.min(4, Math.max(1, text.split("\n").length))}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => onCommit(row.path, event.target.value)}
    />
  );
}

function DraftControl({
  row,
  disabled,
  onCommit,
  numeric = false,
}: {
  row: YamlRow & { kind: "value" };
  disabled: boolean;
  onCommit: (path: YamlPath, value: string | number | null) => void;
  numeric?: boolean;
}) {
  const initial = row.value === null ? "" : String(row.value);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (numeric) {
      const parsed = Number(draft);
      if (!draft.trim() || !Number.isFinite(parsed)) {
        setError("Enter a valid number.");
        return;
      }
      setError(null);
      onCommit(row.path, parsed);
      return;
    }
    setError(null);
    onCommit(row.path, draft ? draft : null);
  };

  return (
    <span className={styles.draftWrap}>
      <input
        className={`form-control ${styles.textControl} ${error ? styles.invalidControl : ""}`}
        aria-label={`${row.displayPath} value`}
        aria-invalid={error ? true : undefined}
        value={draft}
        inputMode={numeric ? "decimal" : "text"}
        placeholder={numeric ? "0" : "null"}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            setDraft(row.value === null ? "" : String(row.value));
            setError(null);
          }
        }}
      />
      {error ? (
        <span className={styles.inlineError} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function YamlKeyValue({ value, onChange, disabled }: Props) {
  const analysis = useMemo(() => analyzeYaml(value), [value]);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const groups = analysis.groups
    .map((group) => ({
      ...group,
      rows: normalizedQuery ? group.rows.filter((row) => rowMatches(row, normalizedQuery)) : group.rows,
    }))
    .filter((group) => group.rows.length > 0);

  const groupKeys = analysis.groups.filter((group) => group.collection !== "value").map((group) => group.key);
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((key) => collapsed.includes(key));
  const matchCount = groups.reduce((total, group) => total + group.rows.length, 0);

  const commit = (path: YamlPath, next: string | number | boolean | null) => {
    const result = updateYamlValue(value, path, next);
    if (result.error) {
      setWriteError(result.error);
      return;
    }
    setWriteError(null);
    onChange(result.text);
  };

  if (analysis.error) {
    return (
      <p className="notice notice-error" role="alert">
        The masked profile could not be read: {analysis.error}
      </p>
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={14} aria-hidden />
          <input
            className="form-control"
            type="search"
            aria-label="Search configuration keys and values"
            placeholder="Search keys or values"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className={styles.count} role="status" aria-live="polite">
          {normalizedQuery
            ? `${matchCount} ${matchCount === 1 ? "match" : "matches"}`
            : `${analysis.valueCount} value${analysis.valueCount === 1 ? "" : "s"}`}
        </span>
        {groupKeys.length > 0 && !normalizedQuery ? (
          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCollapsed(allCollapsed ? [] : groupKeys)}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </Button>
          </div>
        ) : null}
      </div>

      {writeError ? (
        <p className="notice notice-error" role="alert">
          {writeError}
        </p>
      ) : null}

      {analysis.groups.length === 0 ? (
        <p className={styles.emptyState}>No configuration keys are present in this profile.</p>
      ) : groups.length === 0 ? (
        <p className={styles.emptyState}>No key or value matches “{query.trim()}”.</p>
      ) : (
        <div className={styles.list}>
          {groups.map((group) => {
            if (group.collection === "value") {
              return group.rows.map((row) => (
                <div className={`${styles.row} ${styles.standaloneRow}`} key={row.displayPath}>
                  <div className={styles.keyCell}>
                    <code className={styles.key}>{row.displayPath}</code>
                    <span className={styles.kind}>{kindLabel(row)}</span>
                  </div>
                  <div className={styles.valueCell}>
                    <ScalarControl row={row} disabled={Boolean(disabled)} onCommit={commit} />
                  </div>
                </div>
              ));
            }
            const open = Boolean(normalizedQuery) || !collapsed.includes(group.key);
            const valueRows = group.rows.filter((row) => row.kind === "value").length;
            const header = (
              <>
                {normalizedQuery ? null : open ? (
                  <ChevronDown size={15} aria-hidden />
                ) : (
                  <ChevronRight size={15} aria-hidden />
                )}
                <code className={styles.groupKey}>{group.key}</code>
                <span className={styles.groupMeta}>
                  {group.collection} ·{" "}
                  {normalizedQuery
                    ? `${group.rows.length} ${group.rows.length === 1 ? "match" : "matches"}`
                    : valueRows === 0
                      ? "empty"
                      : `${valueRows} ${valueRows === 1 ? "value" : "values"}`}
                </span>
              </>
            );
            return (
              <section className={styles.group} key={group.key}>
                {normalizedQuery ? (
                  <div className={`${styles.groupToggle} ${styles.groupHeaderStatic}`}>{header}</div>
                ) : (
                  <button
                    type="button"
                    className={styles.groupToggle}
                    aria-expanded={open}
                    onClick={() => {
                      setCollapsed((previous) =>
                        previous.includes(group.key)
                          ? previous.filter((key) => key !== group.key)
                          : [...previous, group.key],
                      );
                    }}
                  >
                    {header}
                  </button>
                )}
                {open ? (
                  <div className={styles.rows}>
                    {group.rows.map((row) => (
                      <div className={styles.row} key={row.displayPath}>
                        <div className={styles.keyCell}>
                          <code className={styles.key}>{row.displayPath}</code>
                          <span className={`${styles.kind} ${row.kind === "value" && row.valueKind === "environment" ? styles.kindEnvironment : ""} ${row.kind === "value" && row.valueKind === "secret" ? styles.kindSecret : ""}`}>
                            {kindLabel(row)}
                          </span>
                        </div>
                        <div className={styles.valueCell}>
                          <ScalarControl row={row} disabled={Boolean(disabled)} onCommit={commit} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
