"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Dialog } from "@/components/ui/primitives";
import { configureReasoning } from "@/lib/api-client";
import type { ReasoningTarget } from "@/lib/control-contract";
import styles from "./runtime-settings.module.css";

type Props = {
  yaml: string;
  overrides: Record<string, unknown>;
  apiProviderKeys: Record<string, string>;
  disabled: boolean;
  onApply: (patch: Record<string, unknown>) => void;
};

export function ReasoningSettings(props: Props) {
  const [response, setResponse] = useState<{
    key: string;
    catalog?: { targets: ReasoningTarget[]; fallback: string[] };
    error?: string;
  } | null>(null);
  const [selected, setSelected] = useState("");
  const draftKey = JSON.stringify([props.yaml, props.overrides, props.apiProviderKeys]);
  const catalog = response?.key === draftKey ? response.catalog : null;
  const error = response?.key === draftKey ? response.error : null;

  useEffect(() => {
    const controller = new AbortController();
    const [yaml, overrides, apiProviderKeys] = JSON.parse(draftKey) as [string, Record<string, unknown>, Record<string, string>];
    configureReasoning({ action: "describe", yaml, overrides, apiProviderKeys }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setResponse({ key: draftKey,
          catalog: { targets: result.targets ?? [], fallback: result.fallbackEfforts ?? [] } });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setResponse({ key: draftKey,
          error: cause instanceof Error ? cause.message : "Could not load model reasoning settings." });
      });
    return () => controller.abort();
  }, [draftKey]);

  const target = catalog?.targets.find((item) => item.id === selected) ?? catalog?.targets[0];
  return (
    <div className={styles.scorerPane}>
      <h3 className={styles.groupHeading}>Reasoning effort</h3>
      <p className={styles.hint}>
        Configure each API or ChatGPT model independently. The AI scorer has its own override.
        Runtime role overrides take precedence over model settings; keep them unset to inherit the model effort.
      </p>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
      {!catalog && !error ? <p role="status">Reading model reasoning settings…</p> : null}
      {catalog && catalog.targets.length === 0 ? (
        <p className="notice">Add and apply a model in Model providers first, then return here.</p>
      ) : null}
      {target && catalog ? (
        <>
          <label className="control-field" htmlFor="reasoning-model">
            <span className="control-field-label">Model to configure</span>
            <select id="reasoning-model" className="form-control" value={target.id}
              disabled={props.disabled} onChange={(event) => setSelected(event.target.value)}>
              {catalog.targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <EffortEditor key={`${draftKey}:${target.id}`} {...props} target={target} fallback={catalog.fallback} />
        </>
      ) : null}
    </div>
  );
}

function EffortEditor({ target, fallback, ...props }: Props & { target: ReasoningTarget; fallback: string[] }) {
  const choices = target.supported ? (target.efforts ?? fallback) : [];
  const [choice, setChoice] = useState(target.effort ? (choices.includes(target.effort) ? target.effort : "custom") : "inherit");
  const [custom, setCustom] = useState(target.effort ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, unknown> | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const effort = choice === "inherit" ? null : (choice === "custom" ? custom : choice).trim().toLowerCase();
  const invalid = effort !== null && !/^[a-z][a-z0-9_-]{0,63}$/.test(effort);
  const requiresCheck = effort !== null && !(target.efforts?.includes(effort) ?? false);

  const invalidate = () => {
    generation.current += 1;
    setChecked(null);
    setBusy(false);
    setStatus(null);
    setConfirm(false);
  };

  const request = async (action: "apply" | "check") => {
    const current = ++generation.current;
    setConfirm(false);
    setBusy(true);
    setChecked(null);
    setStatus(null);
    try {
      const result = await configureReasoning({ action, yaml: props.yaml, overrides: props.overrides,
        apiProviderKeys: props.apiProviderKeys, target: target.id, effort });
      if (current !== generation.current) return;
      if (!result.accepted || !result.overrides) {
        setStatus(result.error ?? "The provider did not confirm this effort.");
      } else if (action === "check") {
        setChecked(result.overrides);
        setStatus("Provider accepted the effort. Internal reasoning is unverified. Apply the effort to stage it.");
      } else {
        props.onApply(result.overrides);
      }
    } catch (cause) {
      if (current === generation.current) setStatus(cause instanceof Error ? cause.message : "Reasoning request failed.");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };

  return (
    <div className={styles.scorerPane}>
      <p className={styles.hint}>
        {!target.supported ? "This adapter cannot send reasoning effort. Use provider default." : target.efforts === null
          ? "Unknown model, please set your own reasoning effort. Fallback choices require a support check before applying."
          : "Model reasoning catalog loaded from TESIS. Custom values require a support check."}
      </p>
      <div className="control-form-grid">
        <label className="control-field" htmlFor="reasoning-effort">
          <span className="control-field-label">Reasoning effort</span>
          <select id="reasoning-effort" className="form-control" value={choice} disabled={props.disabled || busy}
            onChange={(event) => { invalidate(); setChoice(event.target.value); }}>
            <option value="inherit">{target.id === "__evaluator__" ? "Inherit model profile" : "Provider default"}</option>
            {choices.map((value) => <option key={value} value={value}>{value}</option>)}
            {target.supported ? <option value="custom">Type another effort</option> : null}
          </select>
        </label>
        {choice === "custom" ? (
          <label className="control-field" htmlFor="reasoning-custom">
            <span className="control-field-label">Custom effort</span>
            <input id="reasoning-custom" className="form-control" value={custom} maxLength={64}
              aria-invalid={invalid} disabled={props.disabled || busy}
              onChange={(event) => { invalidate(); setCustom(event.target.value); }} />
          </label>
        ) : null}
      </div>
      {invalid ? <p className="notice notice-error">Enter an effort name using letters, digits, underscores, or hyphens.</p> : null}
      {status ? <p className="notice" role="status">{status}</p> : null}
      <div className={styles.rowActions}>
        {requiresCheck ? <Button type="button" variant="outline" disabled={props.disabled || busy || invalid || !target.supported}
          onClick={() => setConfirm(true)}>{busy ? "Checking…" : "Check reasoning support"}</Button> : null}
        <Button type="button" variant="primary" disabled={props.disabled || busy || invalid || (requiresCheck && !checked)}
          onClick={() => checked ? props.onApply(checked) : void request("apply")}>Apply effort</Button>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Check reasoning support"
        footer={<>
          <Button type="button" variant="ghost" data-dialog-initial-focus onClick={() => setConfirm(false)}>Cancel</Button>
          <Button type="button" variant="primary" onClick={() => void request("check")}>Run support check</Button>
        </>}>
        <p>This sends a short text request to <code>{target.model}</code> with effort <code>{effort}</code>.
          It uses your configured credentials and may spend provider credits or ChatGPT plan usage.</p>
        <p>Acceptance confirms the request setting only. It does not verify internal reasoning.</p>
      </Dialog>
    </div>
  );
}
