"use client";

import type { ControlField } from "@/lib/control-contract";

/**
 * One settings/launch field rendered from the TESIS field specification.
 *
 * The bridge decides the kind, choices, and limits; this component only maps
 * them onto native inputs so keyboard access and validation stay browser-native.
 *
 * The hint and the error sit outside the `<label>` and are wired through
 * `aria-describedby`: a hint inside the label becomes part of the accessible
 * name, which turns "Target URL" into "Target URL Authorized DVWA base URL."
 */

type Props = {
  field: ControlField;
  value: unknown;
  error?: string;
  disabled?: boolean;
  secretHint?: string;
  optionLabels?: Record<string, string>;
  onChange: (value: unknown) => void;
};

const CHECKBOX_GROUP_LIMIT = 40;

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function FieldControl({ field, value, error: rawError, disabled, secretHint, optionLabels, onChange }: Props) {
  // Loader messages arrive as "path: message"; the field already names the path.
  const error = rawError?.startsWith(`${field.path}:`)
    ? rawError.slice(field.path.length + 1).trim()
    : rawError;
  const inputId = field.path.replace(/\./g, "-");
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [field.description ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const label = optionLabels?.[field.path] ?? field.label;

  if (field.multiple) {
    const selected = asList(value);
    const choices = field.choices.slice(0, CHECKBOX_GROUP_LIMIT);
    return (
      <fieldset className="control-field" disabled={disabled}>
        <legend className="control-field-label">{label}</legend>
        <div className="control-checkbox-grid" role="group" aria-label={label}>
          {choices.map((choice) => {
            const id = `${inputId}-${choice}`;
            const checked = selected.includes(choice);
            return (
              <label key={choice} className="control-checkbox" htmlFor={id}>
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, choice]
                      : selected.filter((item) => item !== choice);
                    onChange(next);
                  }}
                />
                <span>{optionLabels?.[choice] ?? choice}</span>
              </label>
            );
          })}
          {field.choices.length === 0 ? <p className="control-field-hint">No choices are configured yet.</p> : null}
        </div>
        {field.description ? (
          <p className="control-field-hint" id={hintId}>
            {field.description}
          </p>
        ) : null}
        {error ? (
          <p className="control-field-error" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.kind === "boolean" || field.valueType === "bool") {
    const labelId = `${inputId}-label`;
    const checked = Boolean(value);
    return (
      <div className="control-field">
        <span className="control-field-label" id={labelId}>
          {label}
        </span>
        <label className="control-checkbox" htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(event.target.checked)}
          />
          {/* A fixed word next to a checkbox says nothing about its state. */}
          <span>{checked ? "On" : "Off"}</span>
        </label>
        {field.description ? (
          <p className="control-field-hint" id={hintId}>
            {field.description}
          </p>
        ) : null}
        {error ? (
          <p className="control-field-error" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.choices.length > 0) {
    return (
      <div className="control-field">
        <label className="control-field-label" htmlFor={inputId}>
          {label}
        </label>
        <select
          id={inputId}
          className="form-control"
          value={asText(value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">{field.required ? "Choose…" : "Keep configured value"}</option>
          {field.choices.map((choice) => (
            <option key={choice} value={choice}>
              {optionLabels?.[choice] ?? choice}
            </option>
          ))}
        </select>
        {field.description ? (
          <span className="control-field-hint" id={hintId}>
            {field.description}
          </span>
        ) : null}
        {error ? (
          <span className="control-field-error" id={errorId} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  const numeric = field.kind === "integer" || field.kind === "decimal" || field.valueType === "int" || field.valueType === "float";
  const isSecret = field.secret || field.kind === "secret";
  return (
    <div className="control-field">
      <label className="control-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="form-control"
        type={isSecret ? "password" : numeric ? "number" : field.kind === "url" ? "url" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        step={field.kind === "decimal" || field.valueType === "float" ? "0.01" : undefined}
        min={field.minValue ?? undefined}
        max={field.maxValue ?? undefined}
        autoComplete={isSecret ? "off" : undefined}
        value={asText(value)}
        placeholder={isSecret ? (secretHint ?? "Stored in the web profile .env") : undefined}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          if (numeric) {
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : raw);
            return;
          }
          onChange(raw);
        }}
      />
      {field.description ? (
        <span className="control-field-hint" id={hintId}>
          {field.description}
        </span>
      ) : null}
      {error ? (
        <span className="control-field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
