"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, ShieldCheck } from "lucide-react";

import { Badge, Button } from "@/components/ui/primitives";
import { FieldControl } from "@/components/control/field-control";
import { startControlRun, validateControlDraft } from "@/lib/api-client";
import {
  type ControlField,
  type ControlJob,
  type ControlSchema,
  type ControlValidation,
} from "@/lib/control-contract";
import { EXTRA_FIELDS, extraFieldBaseline } from "@/lib/control-fields";
import {
  CONDITION_LABELS,
  LEVEL_LABELS,
  PAYLOAD_MODE_LABELS,
  SCORING_MODE_LABELS,
  SURFACE_LABELS,
  controlOptionLabels,
  labelFor,
  matrixAxesComplete,
  matrixAxesMissing,
  matrixAxisSummary,
  matrixCoordinateCount,
} from "@/lib/control-options";
import styles from "./control.module.css";

const SCOPE_PATHS = ["target_url", "experiment_condition", "target_method", "scoring_mode"] as const;
const SINGLE_PATHS = ["provider", "model_profile", "level", "surface", "payload_mode"] as const;
const MATRIX_PATHS = ["providers", "levels", "surfaces", "payload_modes", "repeats"] as const;
const RUNTIME_PATHS = [
  "candidate_budget",
  "iterations",
  "output_dir",
  "stop_policy",
  "coverage_target",
  "report_format",
  "log_verbosity",
  "enriched_reporting",
  "diagnose",
] as const;

const STEPS = ["Scope", "Coordinates", "Runtime", "Review"] as const;

/** Matrix axes stay out of single-run review: their errors do not apply. */
const MATRIX_ONLY_PATHS = new Set([
  "matrix",
  "providers",
  "levels",
  "surfaces",
  "payload_modes",
  "experiment_conditions",
  "target_methods",
]);

type Mode = "single" | "matrix";
type Overrides = Record<string, unknown>;

/** Which step owns a field path, so a review error can send the reader there. */
const STEP_OF_PATH = new Map<string, number>();
for (const path of SCOPE_PATHS) STEP_OF_PATH.set(path, 0);
for (const path of [...SINGLE_PATHS, ...MATRIX_PATHS]) STEP_OF_PATH.set(path, 1);
for (const path of [...RUNTIME_PATHS, ...EXTRA_FIELDS.map((field) => field.path)]) STEP_OF_PATH.set(path, 2);

/**
 * The loader names the field inside its own message and routes overrides under
 * a separate `__override__` namespace. Strip both so the review list can show
 * the field's label once and its message once.
 */
function normalizeFieldError(path: string, message: string): { path: string; message: string } {
  const key = path.replace(/^__override__\s+/, "");
  let text = message.trim();
  for (let pass = 0; pass < 4 && text.startsWith(`${key}:`); pass += 1) {
    text = text.slice(key.length + 1).trim();
  }
  return { path: key, message: text };
}

/** "A", "A and B", "A, B and C" — the axis list reads as prose, not a dump. */
function listAxisNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "every axis";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function baseline(schema: ControlSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of schema.fields) values[field.path] = field.value;
  Object.assign(
    values,
    extraFieldBaseline({ guardrails: schema.guardrails, llmRuntime: schema.llmRuntime }),
  );
  return values;
}

export type LaunchWizardProps = {
  schema: ControlSchema;
  disabled?: boolean;
  onStarted: (job: ControlJob) => void;
};

export const LaunchWizard = memo(function LaunchWizard({ schema, disabled, onStarted }: LaunchWizardProps) {
  const [mode, setMode] = useState<Mode>("single");
  const [step, setStep] = useState(0);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [validation, setValidation] = useState<ControlValidation | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shownStep = useRef(step);

  const base = useMemo(() => baseline(schema), [schema]);
  const fieldByPath = useMemo(() => {
    const map = new Map<string, ControlField>();
    for (const field of schema.fields) map.set(field.path, field);
    for (const field of EXTRA_FIELDS) map.set(field.path, field);
    return map;
  }, [schema.fields]);

  const optionLabels = useMemo(() => controlOptionLabels(schema.modelProfiles), [schema.modelProfiles]);

  const valueFor = useCallback(
    (path: string) => (path in overrides ? overrides[path] : base[path]),
    [overrides, base],
  );

  const setValue = useCallback((path: string, value: unknown) => {
    setOverrides((previous) => {
      const next = { ...previous };
      if (value === null || value === undefined || value === "") delete next[path];
      else next[path] = value;
      return next;
    });
  }, []);

  const matrixAxes = useMemo(
    () => ({
      providers: valueFor("providers"),
      levels: valueFor("levels"),
      surfaces: valueFor("surfaces"),
      payloadModes: valueFor("payload_modes"),
      repeats: valueFor("repeats"),
    }),
    [valueFor],
  );

  const axesComplete = matrixAxesComplete(matrixAxes);
  const missingAxes = matrixAxesMissing(matrixAxes);
  const coordinateCount = matrixCoordinateCount(matrixAxes);

  const requestOverrides = useMemo<Overrides>(() => {
    const payload: Overrides = { ...overrides, matrix: mode === "matrix" };
    return payload;
  }, [overrides, mode]);

  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setValidating(true);
      setValidateError(null);
      validateControlDraft({ yaml: schema.yaml, overrides: requestOverrides })
        .then((result) => {
          if (!cancelled) setValidation(result);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setValidation(null);
          setValidateError(error instanceof Error ? error.message : "Validation failed.");
        })
        .finally(() => {
          if (!cancelled) setValidating(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, schema.yaml, requestOverrides]);

  // A step change replaces the controls that held focus, so move focus to the
  // new step instead of dropping it on <body> when "Next" unmounts.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    bodyRef.current?.focus();
  }, [step]);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const { job } = await startControlRun({
        mode,
        yaml: schema.yaml,
        overrides: requestOverrides,
      });
      onStarted(job);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "The experiment could not be started.");
    } finally {
      setStarting(false);
    }
  };

  const renderField = (path: string) => {
    const field = fieldByPath.get(path);
    if (!field) return null;
    return (
      <FieldControl
        key={path}
        field={field}
        value={valueFor(path)}
        error={validation?.fieldErrors?.[path]}
        disabled={disabled || starting}
        optionLabels={optionLabels[path]}
        onChange={(value) => setValue(path, value)}
      />
    );
  };

  const canAdvance = step !== 1 || mode === "single" || axesComplete;
  const visibleFieldErrors = Object.entries(validation?.fieldErrors ?? {})
    .map(([path, message]) => normalizeFieldError(path, message))
    .filter((entry) => mode === "matrix" || !MATRIX_ONLY_PATHS.has(entry.path))
    // The loader can report the same constraint under two keys; one row each.
    .filter(
      (entry, index, list) =>
        list.findIndex((other) => other.path === entry.path && other.message === entry.message) === index,
    );
  const advancedErrorCount = visibleFieldErrors.filter((entry) =>
    EXTRA_FIELDS.some((field) => field.path === entry.path),
  ).length;
  const providersMissing = (fieldByPath.get("providers")?.choices.length ?? 1) === 0;
  const dirty = Object.keys(overrides).length > 0;
  const startDisabled =
    disabled || starting || validating || !validation?.valid || Boolean(validateError);

  return (
    <section className={`${styles.wizard} ui-card`} aria-labelledby="launch-wizard-title">
      <header className="ui-card-header">
        <div>
          <h2 className="ui-card-title" id="launch-wizard-title">
            Launch experiment
          </h2>
          <p className={styles.cardHint}>
            Scope, coordinates, runtime, then review. Starting saves these settings to the web profile and runs
            the runtime headlessly with the same artifacts as the TUI.
          </p>
        </div>
        <div className="control-segmented" role="group" aria-label="Experiment mode">
          <button type="button" aria-pressed={mode === "single"} onClick={() => setMode("single")} disabled={starting}>
            Single run
          </button>
          <button type="button" aria-pressed={mode === "matrix"} onClick={() => setMode("matrix")} disabled={starting}>
            Matrix
          </button>
        </div>
      </header>

      <div className="ui-card-content">
        <ol className={styles.steps} aria-label="Launch steps">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className={index === step ? `${styles.stepButton} ${styles.stepActive}` : styles.stepButton}
                aria-current={index === step ? "step" : undefined}
                aria-label={`Step ${index + 1} of ${STEPS.length}: ${label}`}
                onClick={() => setStep(index)}
                disabled={starting || (index > 1 && mode === "matrix" && !axesComplete && index > step)}
              >
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        <div
          className={styles.stepBody}
          ref={bodyRef}
          tabIndex={-1}
          role="group"
          aria-label={`${STEPS[step]} step`}
        >
          {step === 0 ? (
            <div className="control-form-grid">
              {SCOPE_PATHS.map(renderField)}
              <p className={`${styles.hint} ${styles.fullWidth}`}>
                {mode === "matrix"
                  ? "A matrix uses one condition, method and review mode across every coordinate."
                  : "Blank values keep what the profile already configures."}
              </p>
            </div>
          ) : null}

          {step === 1 ? (
            <div className={styles.coordinatePane}>
              <div className="control-form-grid">
                {SINGLE_PATHS.map(renderField)}
              </div>
              {mode === "matrix" ? (
                <>
                  <div className={styles.divider} role="presentation" />
                  <div className={styles.matrixAxes}>
                    <h3 className={styles.groupHeading}>Matrix axes</h3>
                    <div className="control-form-grid">{MATRIX_PATHS.map(renderField)}</div>
                  </div>
                  {providersMissing ? (
                    <p className="notice" role="status">
                      No model profile is configured yet, so the provider axis is empty. Add an API provider under{" "}
                      <a className="ui-link" href="/settings">
                        Settings → Model providers
                      </a>{" "}
                      first.
                    </p>
                  ) : null}
                  <div
                    className={
                      axesComplete
                        ? styles.coordinateSummary
                        : `${styles.coordinateSummary} ${styles.coordinateSummaryPending}`
                    }
                    role="status"
                    aria-label="Matrix coordinate preview"
                  >
                    {axesComplete ? (
                      <>
                        <strong>
                          {coordinateCount} coordinate{coordinateCount === 1 ? "" : "s"}
                        </strong>
                        <span className={styles.coordinateSummaryAxes}>{matrixAxisSummary(matrixAxes)}</span>
                      </>
                    ) : (
                      <span>Choose at least one value for {listAxisNames(missingAxes)} to build the matrix.</span>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className={styles.runtimeGroups}>
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.groupLegend}>Run limits</legend>
                <div className={styles.groupFields}>
                  {["candidate_budget", "iterations"].map(renderField)}
                </div>
              </fieldset>

              <fieldset className={styles.fieldGroup}>
                <legend className={styles.groupLegend}>Coverage and stopping</legend>
                <div className={styles.groupFields}>
                  {["stop_policy", "coverage_target", "report_format"].map(renderField)}
                </div>
              </fieldset>

              <fieldset className={styles.fieldGroup}>
                <legend className={styles.groupLegend}>Logging and output</legend>
                <div className={styles.groupFields}>
                  {["output_dir", "log_verbosity", "enriched_reporting", "diagnose"].map(renderField)}
                </div>
              </fieldset>

              <details className={styles.advanced}>
                <summary className={styles.advancedSummary}>
                  Guardrails and LLM runtime
                  {advancedErrorCount > 0 ? (
                    <span className={styles.advancedNote}>
                      {advancedErrorCount} need{advancedErrorCount === 1 ? "s" : ""} attention
                    </span>
                  ) : null}
                </summary>
                <div className={`${styles.advancedBody} ${styles.groupFields}`}>
                  {EXTRA_FIELDS.map((field) => (
                    <FieldControl
                      key={field.path}
                      field={field}
                      value={valueFor(field.path)}
                      error={validation?.fieldErrors?.[field.path]}
                      disabled={disabled || starting}
                      onChange={(value) => setValue(field.path, value)}
                    />
                  ))}
                </div>
              </details>
            </div>
          ) : null}

          {step === 3 ? (
            <div className={styles.review} aria-busy={validating || undefined}>
              <h3 className={styles.reviewHeading}>
                <ShieldCheck size={16} aria-hidden /> Resolved request
              </h3>
                {validating ? (
                  <p className={styles.hint} role="status">
                    Resolving with the TESIS loader…
                  </p>
                ) : null}
                {validateError ? (
                  <p className="notice notice-error" role="alert">
                    {validateError}
                  </p>
                ) : null}
                {validation && !validation.valid && visibleFieldErrors.length === 0 ? (
                  <div className="notice notice-error" role="alert">
                    <strong>Configuration needs attention.</strong>
                    <p>{validation.error ?? "The runtime rejected this configuration."}</p>
                  </div>
                ) : null}
                {validation?.valid ? (
                  <dl className={styles.reviewGrid} aria-label="Resolved request">
                    <div>
                      <dt>Mode</dt>
                      <dd>{mode === "matrix" ? "Matrix" : "Single run"}</dd>
                    </div>
                    <div>
                      <dt>Coordinates</dt>
                      <dd>{validation.totalCoordinates}</dd>
                    </div>
                    <div>
                      <dt>Target</dt>
                      <dd>{String(validation.resolved?.target_url ?? "—")}</dd>
                    </div>
                    <div>
                      <dt>Condition</dt>
                      <dd>{CONDITION_LABELS[String(validation.resolved?.experiment_condition ?? "")] ?? String(validation.resolved?.experiment_condition ?? "—")}</dd>
                    </div>
                    <div>
                      <dt>Provider</dt>
                      <dd>{String(validation.resolved?.provider ?? "—")}</dd>
                    </div>
                    <div>
                      <dt>Coordinate</dt>
                      <dd>
                        {[
                          labelFor(SURFACE_LABELS, validation.resolved?.surface),
                          labelFor(LEVEL_LABELS, validation.resolved?.level),
                          labelFor(PAYLOAD_MODE_LABELS, validation.resolved?.payload_mode),
                        ]
                          .filter((value) => value !== "—")
                          .join(" · ") || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Budget / iterations</dt>
                      <dd>
                        {String(validation.resolved?.candidate_budget ?? "—")} / {String(validation.resolved?.iterations ?? "—")}
                      </dd>
                    </div>
                    <div>
                      <dt>Scoring</dt>
                      <dd>{SCORING_MODE_LABELS[String(validation.resolved?.scoring_mode ?? "")] ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Output</dt>
                      <dd>{String(validation.resolved?.output_dir ?? "—")}</dd>
                    </div>
                    <div>
                      <dt>Settings profile</dt>
                      <dd className={styles.pathValue}>{schema.configPath}</dd>
                    </div>
                  </dl>
                ) : null}
                {visibleFieldErrors.length > 0 ? (
                  <div className="notice notice-error" role="alert">
                    <strong>Configuration needs attention.</strong>
                    <ul className={styles.fieldErrorList}>
                      {visibleFieldErrors.map(({ path, message }) => {
                        const target = STEP_OF_PATH.get(path);
                        return (
                          <li key={`${path}:${message}`}>
                            <strong>{fieldByPath.get(path)?.label ?? path}</strong>: {message}
                            {target !== undefined && target !== step ? (
                              <button
                                type="button"
                                className={styles.errorJump}
                                onClick={() => setStep(target)}
                              >
                                Fix in {STEPS[target]}
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {schema.warnings.length > 0 ? (
                  <ul className={styles.warningList}>
                    {schema.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {startError ? (
                  <p className="notice notice-error" role="alert">
                    {startError}
                  </p>
                ) : null}
              <p className={styles.hint}>
                Starting writes artifacts under the TESIS results root that cannot be edited afterwards. Cancel the
                run from the Runs tab; the first cancel request is graceful.
              </p>
            </div>
          ) : null}
        </div>

        <footer className={styles.wizardFooter}>
          <div className={styles.statusRow}>
            {mode === "matrix" ? (
              <Badge variant={axesComplete ? "outline" : "amber"}>
                {axesComplete ? `${coordinateCount} coordinates` : "Incomplete axes"}
              </Badge>
            ) : null}
            {dirty ? <Badge variant="amber">Draft changes</Badge> : null}
            {disabled ? <Badge variant="amber">Control endpoints unavailable</Badge> : null}
          </div>
          <div className={styles.footerButtons}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0 || starting}
            >
              <ChevronLeft size={15} aria-hidden /> Back
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(Math.min(3, step + 1))}
                disabled={!canAdvance || starting}
              >
                Next <ChevronRight size={15} aria-hidden />
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={start} disabled={startDisabled}>
                <Play size={15} aria-hidden />
                {starting ? "Starting…" : dirty ? "Save and start" : "Start experiment"}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </section>
  );
});
