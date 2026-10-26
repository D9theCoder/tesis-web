"use client";

import { useCallback, useMemo, useState } from "react";
import { CloudDownload, Plus, RefreshCw, Save, ShieldCheck, Trash2, Upload } from "lucide-react";

import { Badge, Button, Dialog, Tabs } from "@/components/ui/primitives";
import { FieldControl } from "@/components/control/field-control";
import { YamlEditor } from "@/components/settings/yaml-editor";
import {
  discoverProviderModels,
  fetchChatGPTAccount,
  fetchControlSchema,
  saveControlConfig,
  syncControlToCheckout,
  validateControlDraft,
} from "@/lib/api-client";
import type {
  ControlProviderSummary,
  ControlSchema,
  ControlValidation,
  DiscoveredModel,
} from "@/lib/control-contract";
import { EXTRA_FIELDS, extraFieldBaseline } from "@/lib/control-fields";
import { PROTOCOL_LABELS, SCORING_MODE_LABELS, controlOptionLabels } from "@/lib/control-options";
import { useReadResource } from "@/lib/use-read-resource";
import styles from "./runtime-settings.module.css";

/**
 * Server-backed configuration: model providers, the AI scorer, experiment
 * defaults, and the raw YAML document.
 *
 * Every write goes through the bridge, which validates with the TESIS loader
 * before the profile is replaced, so a bad edit is rejected rather than saved.
 */

/** Stable loader identity for `useReadResource`. */
async function loadSettingsSchema(_key: string, signal: AbortSignal) {
  return fetchControlSchema(signal);
}

type EvaluatorDraft = {
  provider?: string;
  max_attempts?: number;
  max_tokens?: number;
  timeout?: number;
};

type ProviderDraft = {
  id: string;
  displayName: string;
  protocol: string;
  baseUrl: string;
  fetchUrl: string;
  models: string[];
  apiKey: string;
  isNew: boolean;
  baseUrlTouched: boolean;
  fetchUrlTouched: boolean;
};

type Status = { tone: "ok" | "error" | "info"; message: string } | null;

const TABS = [
  { value: "experiment", label: "Experiment" },
  { value: "providers", label: "Model providers" },
  { value: "scorer", label: "AI scorer" },
  { value: "yaml", label: "Advanced YAML" },
];

const EXPERIMENT_CATEGORIES = new Set(["target", "run", "reporting", "logging"]);

function emptyProviderDraft(): ProviderDraft {
  return {
    id: "",
    displayName: "",
    protocol: "openai_compatible",
    baseUrl: "",
    fetchUrl: "",
    models: [],
    apiKey: "",
    isNew: true,
    baseUrlTouched: false,
    fetchUrlTouched: false,
  };
}

function draftFromProvider(provider: ControlProviderSummary): ProviderDraft {
  return {
    id: provider.id,
    displayName: provider.displayName,
    protocol: provider.protocol || "openai_compatible",
    baseUrl: provider.baseUrl,
    fetchUrl: provider.fetchUrl,
    models: [...provider.models],
    apiKey: "",
    isNew: false,
    baseUrlTouched: false,
    fetchUrlTouched: false,
  };
}

function isSafeProviderId(value: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

export function RuntimeSettings() {
  const schemaResource = useReadResource("control-settings", loadSettingsSchema);
  const schema: ControlSchema | null = schemaResource.data ?? null;
  const [tab, setTab] = useState("experiment");
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [yamlText, setYamlText] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "saving" | "validating" | "syncing">(null);
  const [status, setStatus] = useState<Status>(null);
  const [validation, setValidation] = useState<ControlValidation | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);

  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [catalog, setCatalog] = useState<DiscoveredModel[]>([]);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [modelsOverrides, setModelsOverrides] = useState<Record<string, unknown>>({});

  const [codexStatus, setCodexStatus] = useState<Record<string, unknown> | null>(null);
  const [codexModels, setCodexModels] = useState<Record<string, unknown>[]>([]);
  const [codexBusy, setCodexBusy] = useState(false);
  const [codexError, setCodexError] = useState<string | null>(null);

  const baseline = useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const field of schema?.fields ?? []) values[field.path] = field.value;
    if (schema) {
      Object.assign(
        values,
        extraFieldBaseline({ guardrails: schema.guardrails, llmRuntime: schema.llmRuntime }),
      );
    }
    return { ...values, ...modelsOverrides };
  }, [schema, modelsOverrides]);

  const valueFor = useCallback(
    (path: string) => (path in overrides ? overrides[path] : baseline[path]),
    [overrides, baseline],
  );

  const setValue = useCallback((path: string, value: unknown) => {
    setOverrides((previous) => {
      const next = { ...previous };
      if (value === null || value === undefined || value === "") delete next[path];
      else next[path] = value;
      return next;
    });
  }, []);

  const setEvaluator = useCallback((patch: EvaluatorDraft) => {
    setOverrides((previous) => {
      const current = (previous.scoring_evaluator as EvaluatorDraft | undefined) ?? {};
      return { ...previous, scoring_evaluator: { ...current, ...patch } };
    });
  }, []);

  const dirty = Object.keys(overrides).length > 0 || Object.keys(providerKeys).length > 0 || yamlText !== null;
  const controlEnabled = schema?.control?.enabled ?? true;

  const currentYaml = yamlText ?? schema?.yaml ?? "";
  const experimentFields = useMemo(
    () => (schema?.fields ?? []).filter((field) => EXPERIMENT_CATEGORIES.has(field.category)),
    [schema?.fields],
  );
  const optionLabels = useMemo(
    () => (schema ? controlOptionLabels(schema.modelProfiles) : {}),
    [schema],
  );

  const resetDraft = useCallback(() => {
    setOverrides({});
    setProviderKeys({});
    setYamlText(null);
    setModelsOverrides({});
    setDraft(null);
    setValidation(null);
    setSyncOpen(false);
    setDiscardArmed(false);
  }, []);

  const discard = useCallback(() => {
    resetDraft();
    setStatus({ tone: "info", message: "Unsaved changes discarded. The saved profile is unchanged." });
  }, [resetDraft]);

  const save = useCallback(async () => {
    if (!schema) return;
    setBusy("saving");
    setStatus(null);
    try {
      const result = await saveControlConfig({
        yaml: currentYaml,
        overrides,
        apiProviderKeys: providerKeys,
      });
      if (!result.saved) {
        setStatus({ tone: "error", message: result.error ?? "The configuration was rejected." });
        return;
      }
      setStatus({
        tone: "ok",
        message: result.resolvedError
          ? `Saved, but the profile still has a problem: ${result.resolvedError}`
          : "Saved. New runs use this profile immediately.",
      });
      resetDraft();
      schemaResource.refresh();
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Save failed." });
    } finally {
      setBusy(null);
    }
  }, [schema, currentYaml, overrides, providerKeys, resetDraft, schemaResource]);

  const validate = useCallback(async () => {
    if (!schema) return;
    setBusy("validating");
    setStatus(null);
    try {
      const result = await validateControlDraft({
        yaml: currentYaml,
        overrides,
        form: "settings",
      });
      setValidation(result);
      setStatus({
        tone: result.valid ? "ok" : "error",
        message: result.valid
          ? `Resolved ${result.totalCoordinates} coordinate(s) without errors.`
          : result.error ?? "The TESIS loader rejected this configuration.",
      });
    } catch (error) {
      setValidation(null);
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Validation failed." });
    } finally {
      setBusy(null);
    }
  }, [schema, currentYaml, overrides]);

  const sync = useCallback(async () => {
    setBusy("syncing");
    setStatus(null);
    try {
      const result = await syncControlToCheckout();
      setStatus({
        tone: result.written ? "ok" : "error",
        message: result.written
          ? `Wrote ${result.path}. A backup of the previous document is next to it.`
          : result.error ?? "The TESIS checkout was not updated.",
      });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Sync failed." });
    } finally {
      setBusy(null);
      setSyncOpen(false);
    }
  }, []);

  // -- provider editor ------------------------------------------------------

  const openNewProvider = () => {
    setDraft(emptyProviderDraft());
    setCatalog([]);
    setCatalogError(null);
    setManualModel("");
    setModelFilter("");
  };

  const openProvider = (provider: ControlProviderSummary) => {
    setDraft(draftFromProvider(provider));
    setCatalog([]);
    setCatalogError(null);
    setManualModel("");
    setModelFilter("");
  };

  const fetchCatalog = async () => {
    if (!draft) return;
    setCatalogBusy(true);
    setCatalogError(null);
    try {
      const result = await discoverProviderModels({
        providerId: draft.isNew ? undefined : draft.id,
        baseUrl: draft.baseUrlTouched ? draft.baseUrl : undefined,
        protocol: draft.protocol,
        fetchUrl: draft.fetchUrlTouched ? draft.fetchUrl : undefined,
        apiKey: draft.apiKey || undefined,
      });
      if (!result.fetched) {
        setCatalogError(result.error ?? "Model discovery failed.");
        setCatalog([]);
        return;
      }
      setCatalog(result.models);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Model discovery failed.");
    } finally {
      setCatalogBusy(false);
    }
  };

  const applyProvider = () => {
    if (!draft) return;
    if (!isSafeProviderId(draft.id)) {
      setCatalogError("Provider ID must start with a lowercase letter and use a-z, 0-9, _ or -.");
      return;
    }
    if (draft.baseUrlTouched && !draft.baseUrl.trim()) {
      setCatalogError("A base URL is required.");
      return;
    }
    if (draft.models.length === 0) {
      setCatalogError("Select or add at least one model.");
      return;
    }
    const entry: Record<string, unknown> = {
      display_name: draft.displayName.trim() || draft.id,
      protocol: draft.protocol,
      models: draft.models,
    };
    if (draft.isNew || draft.baseUrlTouched) entry.base_url = draft.baseUrl.trim();
    if (draft.isNew || draft.fetchUrlTouched) entry.fetch_url = draft.fetchUrl.trim();
    setOverrides((previous) => ({ ...previous, [`api_providers.${draft.id}`]: entry }));
    if (draft.apiKey) {
      setProviderKeys((previous) => ({ ...previous, [draft.id]: draft.apiKey }));
    }
    setStatus({
      tone: "info",
      message: `Provider ${draft.id} staged. Save the profile to persist it.`,
    });
    setDraft(null);
    setCatalog([]);
    setCatalogError(null);
  };

  const removeProvider = (id: string) => {
    setOverrides((previous) => ({ ...previous, [`api_providers.${id}`]: null }));
    setStatus({ tone: "info", message: `Provider ${id} staged for removal. Save the profile to apply it.` });
  };

  const toggleModel = (id: string) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const models = previous.models.includes(id)
        ? previous.models.filter((model) => model !== id)
        : [...previous.models, id];
      return { ...previous, models };
    });
  };

  const addManualModel = () => {
    const id = manualModel.trim();
    if (!id || /\s/.test(id)) {
      setCatalogError("Model IDs cannot be empty or contain spaces.");
      return;
    }
    setDraft((previous) => (previous ? { ...previous, models: [...new Set([...previous.models, id])] } : previous));
    setManualModel("");
    setCatalogError(null);
  };

  const filteredCatalog = catalog.filter((model) =>
    modelFilter ? `${model.id} ${model.display_name ?? ""}`.toLowerCase().includes(modelFilter.toLowerCase()) : true,
  );

  const checkCodex = async (action: "status" | "models") => {
    setCodexBusy(true);
    setCodexError(null);
    try {
      const result = await fetchChatGPTAccount(action);
      if (action === "models") {
        setCodexModels(result.models ?? []);
      } else {
        setCodexStatus(result.status ?? result);
      }
      if (result.error) setCodexError(result.error);
    } catch (error) {
      setCodexError(error instanceof Error ? error.message : "ChatGPT account lookup failed.");
    } finally {
      setCodexBusy(false);
    }
  };

  const applyCodexModel = (modelId: string) => {
    setModelsOverrides((previous) => ({
      ...previous,
      "models.openai_codex_auth": modelId,
    }));
    setOverrides((previous) => ({
      ...previous,
      "models.openai_codex_auth": {
        provider: "openai_codex_auth",
        model_name: modelId,
        timeout: 60,
        extra: { account: "default" },
      },
    }));
    setStatus({ tone: "info", message: `Staged models.openai_codex_auth → ${modelId}. Save to persist.` });
  };

  // -- view -----------------------------------------------------------------

  const scoring = schema?.scoring;
  const evaluatorOverride = (overrides.scoring_evaluator as EvaluatorDraft | undefined) ?? {};
  const scoringMode = String(overrides.scoring_mode ?? scoring?.mode ?? "human");
  const rubricVersion = String(overrides.scoring_rubric_version ?? scoring?.rubricVersion ?? "scoring.v4");
  const evaluatorProvider = String(evaluatorOverride.provider ?? scoring?.evaluator?.provider ?? "");
  const evaluatorAttempts = Number(evaluatorOverride.max_attempts ?? scoring?.evaluator?.maxAttempts ?? 2);
  const evaluatorTokens = Number(evaluatorOverride.max_tokens ?? scoring?.evaluator?.maxTokens ?? 1024);
  const evaluatorTimeout = Number(evaluatorOverride.timeout ?? scoring?.evaluator?.timeout ?? 60);
  const evaluatorMissing = scoringMode !== "human" && !evaluatorProvider;

  if (!schema) {
    return (
      <section className={`settings-section ${styles.panel}`} aria-busy={schemaResource.busy}>
        <h2 className="settings-section-heading">Runtime configuration</h2>
        {schemaResource.error ? (
          <p className="notice notice-error" role="alert">
            {schemaResource.error}
          </p>
        ) : (
          <p className={styles.hint} role="status">
            Loading the settings profile…
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={`settings-section ${styles.panel}`} aria-labelledby="runtime-settings-heading">
      <header className={styles.header}>
        <div>
          <h2 className="settings-section-heading" id="runtime-settings-heading">
            Runtime configuration
          </h2>
          <p className={styles.hint}>
            The web keeps its own profile and passes it to every run, so the TUI document stays untouched unless you
            write it explicitly. Validated by the real TESIS loader before anything is replaced.
          </p>
        </div>
        <div className={styles.headerBadges}>
          {controlEnabled ? <Badge variant="outline">control plane active</Badge> : <Badge variant="amber">read-only</Badge>}
          {dirty ? <Badge variant="amber">unsaved changes</Badge> : null}
        </div>
      </header>

      {schemaResource.error ? (
        <p className="notice notice-error" role="alert">
          {schemaResource.error}
        </p>
      ) : null}
      {status ? (
        <p
          className={status.tone === "error" ? "notice notice-error" : "notice"}
          role={status.tone === "error" ? "alert" : "status"}
        >
          {status.message}
        </p>
      ) : null}
      {schema.resolvedError ? (
        <p className="notice notice-error" role="alert">
          The saved profile does not resolve: {schema.resolvedError}
        </p>
      ) : null}
      {schema.warnings.map((warning) => (
        <p className="notice" key={warning}>
          {warning}
        </p>
      ))}

      <Tabs
        tabs={TABS}
        value={tab}
        onValueChange={setTab}
        idPrefix="settings-tab"
        panelId="runtime-settings-panel"
        label="Runtime configuration sections"
        className={styles.tabs}
      />

      <div id="runtime-settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
        {tab === "experiment" ? (
          <div className="control-form-grid">
            {experimentFields.map((field) => (
              <FieldControl
                key={field.path}
                field={field}
                value={valueFor(field.path)}
                error={validation?.fieldErrors?.[field.path]}
                optionLabels={optionLabels[field.path]}
                disabled={!controlEnabled || busy !== null}
                onChange={(value) => setValue(field.path, value)}
              />
            ))}
            {EXTRA_FIELDS.map((field) => (
              <FieldControl
                key={field.path}
                field={field}
                value={valueFor(field.path)}
                disabled={!controlEnabled || busy !== null}
                onChange={(value) => setValue(field.path, value)}
              />
            ))}
          </div>
        ) : null}

        {tab === "providers" ? (
          <div className={`${styles.providerPane} ${draft ? styles.providerPaneSplit : styles.providerPaneSolo}`}>
            <div className={styles.providerList}>
              <div className={styles.sectionHeader}>
                <h3 className="control-section-title">API providers</h3>
                <Button type="button" variant="outline" onClick={openNewProvider} disabled={!controlEnabled}>
                  <Plus size={15} aria-hidden /> Add provider
                </Button>
              </div>
              {schema.providers.length === 0 ? (
                <p className={styles.hint}>
                  No API provider is configured yet. Add one to build the model profiles that runs and the AI scorer
                  select from.
                </p>
              ) : (
                <ul className={styles.providerRows}>
                  {schema.providers.map((provider) => {
                    const stagedRemoval = overrides[`api_providers.${provider.id}`] === null;
                    const staged = `${provider.id}` in overrides || provider.id in providerKeys;
                    const title = provider.displayName || provider.id;
                    return (
                      <li key={provider.id} className={styles.providerRow}>
                        <div className={styles.providerIdentity}>
                          <div className={styles.providerHead}>
                            <h4 className={styles.providerName}>{title}</h4>
                            {provider.hasKey ? null : <Badge variant="amber">no key</Badge>}
                            {staged ? <Badge variant="outline">staged</Badge> : null}
                            {stagedRemoval ? <Badge variant="amber">removal staged</Badge> : null}
                          </div>
                          <p className={styles.providerMeta}>
                            {title === provider.id ? null : (
                              <>
                                <code>{provider.id}</code>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span>{PROTOCOL_LABELS[provider.protocol] ?? provider.protocol}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {provider.models.length} model{provider.models.length === 1 ? "" : "s"}
                            </span>
                          </p>
                          <dl className={styles.providerFacts}>
                            <div>
                              <dt>Base URL</dt>
                              <dd>
                                {provider.baseUrl ? (
                                  <code>{provider.baseUrl}</code>
                                ) : (
                                  <span className={styles.emptyValue}>not set</span>
                                )}
                              </dd>
                            </div>
                            {provider.fetchUrl ? (
                              <div>
                                <dt>Catalog</dt>
                                <dd>
                                  <code>{provider.fetchUrl}</code>
                                </dd>
                              </div>
                            ) : null}
                            <div className={styles.factWide}>
                              <dt>Models</dt>
                              <dd>
                                {provider.models.length === 0 ? (
                                  <span className={styles.emptyValue}>none selected</span>
                                ) : (
                                  <ul className={styles.providerModels}>
                                    {provider.models.map((model) => (
                                      <li key={model}>
                                        <code>{model}</code>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Key</dt>
                              <dd>
                                {provider.hasKey ? (
                                  <span>
                                    stored in the profile <code>.env</code>
                                  </span>
                                ) : (
                                  <span className={styles.emptyValue}>none — add one when you edit</span>
                                )}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className={styles.providerAside}>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => openProvider(provider)}
                            disabled={!controlEnabled || stagedRemoval}
                          >
                            Edit provider
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeProvider(provider.id)}
                            disabled={!controlEnabled || stagedRemoval}
                          >
                            <Trash2 size={14} aria-hidden /> Remove
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className={styles.authBlock}>
                <div className={styles.sectionHeader}>
                  <div className={styles.authTitle}>
                    <h3 className="control-section-title">ChatGPT sign-in</h3>
                    <code className={styles.authKey}>openai_codex_auth</code>
                  </div>
                  <div className={styles.rowActions}>
                    <Button type="button" variant="ghost" onClick={() => void checkCodex("status")} disabled={codexBusy}>
                      <RefreshCw size={14} aria-hidden /> Account status
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void checkCodex("models")} disabled={codexBusy}>
                      <CloudDownload size={14} aria-hidden /> Fetch models
                    </Button>
                  </div>
                </div>
                <p className={styles.hint}>
                  Signing in needs a browser loopback, so it stays in the terminal. Model selection works here once
                  the account is signed in.
                </p>
                <code className={styles.commandBlock}>python -m tesis auth login --account default</code>
              </div>
              {codexError ? (
                <p className="notice notice-error" role="alert">
                  {codexError}
                </p>
              ) : null}
              {codexStatus ? (
                <dl className={styles.codexStatus}>
                  {Object.entries(codexStatus)
                    .filter(([key]) => !/token|secret|key|credential/i.test(key))
                    .slice(0, 8)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                      </div>
                    ))}
                </dl>
              ) : null}
              {codexModels.length > 0 ? (
                <ul className={styles.codexModels}>
                  {codexModels.slice(0, 40).map((model) => {
                    const id = typeof model.id === "string" ? model.id : typeof model.slug === "string" ? model.slug : "";
                    if (!id) return null;
                    return (
                      <li key={id}>
                        <span className={styles.mono}>{id}</span>
                        <Button type="button" variant="ghost" onClick={() => applyCodexModel(id)} disabled={!controlEnabled}>
                          Use profile
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            {draft ? (
              <div className={styles.providerEditor}>
                <h3 className="control-section-title">
                  {draft.isNew ? "Add API provider" : `Edit ${draft.id}`}
                </h3>
                <label className="control-field" htmlFor="provider-id">
                  <span className="control-field-label">Provider ID</span>
                  <input
                    id="provider-id"
                    className="form-control"
                    value={draft.id}
                    disabled={!draft.isNew}
                    placeholder="river-ai"
                    onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase() })}
                  />
                </label>
                <label className="control-field" htmlFor="provider-display-name">
                  <span className="control-field-label">Display name</span>
                  <input
                    id="provider-display-name"
                    className="form-control"
                    value={draft.displayName}
                    placeholder={draft.id || "Human-readable label"}
                    onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                  />
                </label>
                <label className="control-field" htmlFor="provider-protocol">
                  <span className="control-field-label">Protocol</span>
                  <select
                    id="provider-protocol"
                    className="form-control"
                    value={draft.protocol}
                    onChange={(event) => setDraft({ ...draft, protocol: event.target.value })}
                  >
                    {Object.entries(PROTOCOL_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="control-field" htmlFor="provider-base-url">
                  <span className="control-field-label">Base URL</span>
                  <input
                    id="provider-base-url"
                    className="form-control"
                    value={draft.baseUrl}
                    placeholder="https://gateway.example/v1"
                    onChange={(event) =>
                      setDraft({ ...draft, baseUrl: event.target.value, baseUrlTouched: true })
                    }
                  />
                </label>
                <label className="control-field" htmlFor="provider-fetch-url">
                  <span className="control-field-label">Catalog URL (optional)</span>
                  <input
                    id="provider-fetch-url"
                    className="form-control"
                    value={draft.fetchUrl}
                    placeholder="https://gateway.example/v1/models"
                    onChange={(event) =>
                      setDraft({ ...draft, fetchUrl: event.target.value, fetchUrlTouched: true })
                    }
                  />
                </label>
                <label className="control-field" htmlFor="provider-api-key">
                  <span className="control-field-label">API key</span>
                  <input
                    id="provider-api-key"
                    className="form-control"
                    type="password"
                    autoComplete="off"
                    value={draft.apiKey}
                    placeholder="Leave blank to keep the stored key"
                    onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                  />
                  <span className="control-field-hint">
                    Keys are written to the profile <code>.env</code> as an environment reference; the YAML only
                    stores <code>${"{VAR}"}</code>.
                  </span>
                </label>

                <div className={styles.modelPicker}>
                  <div className={styles.sectionHeader}>
                    <span className="control-field-label">Models</span>
                    <Button type="button" variant="ghost" onClick={() => void fetchCatalog()} disabled={catalogBusy}>
                      <CloudDownload size={14} aria-hidden /> {catalogBusy ? "Fetching…" : "Fetch catalog"}
                    </Button>
                  </div>
                  {catalogError ? (
                    <p className="notice notice-error" role="alert">
                      {catalogError}
                    </p>
                  ) : null}
                  {catalog.length > 0 ? (
                    <>
                      <input
                        className="form-control"
                        aria-label="Filter discovered models"
                        placeholder="Filter discovered models"
                        value={modelFilter}
                        onChange={(event) => setModelFilter(event.target.value)}
                      />
                      <div className="control-checkbox-grid">
                        {filteredCatalog.slice(0, 200).map((model) => (
                          <label key={model.id} className="control-checkbox">
                            <input
                              type="checkbox"
                              checked={draft.models.includes(model.id)}
                              onChange={() => toggleModel(model.id)}
                            />
                            <span>{model.display_name || model.id}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className={styles.hint}>Fetch the catalog or add exact model IDs.</p>
                  )}
                  <div className={styles.inlineAdd}>
                    <input
                      className="form-control"
                      aria-label="Exact model ID"
                      value={manualModel}
                      placeholder="Exact model ID"
                      onChange={(event) => setManualModel(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addManualModel();
                        }
                      }}
                    />
                    <Button type="button" variant="ghost" onClick={addManualModel}>
                      Add
                    </Button>
                  </div>
                  <div className={styles.selectedModels}>
                    {draft.models.length === 0 ? (
                      <span className={styles.hint}>No model selected yet.</span>
                    ) : (
                      draft.models.map((model) => (
                        <button
                          key={model}
                          type="button"
                          className={styles.modelChip}
                          onClick={() => toggleModel(model)}
                          title="Remove model"
                        >
                          {model} ×
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className={styles.rowActions}>
                  <Button type="button" variant="primary" onClick={applyProvider} disabled={!controlEnabled}>
                    Apply provider
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "scorer" ? (
          <div className={styles.scorerPane}>
            <h3 className={styles.groupHeading} id="scoring-mode-heading">
              Payload review preset
            </h3>
            <div className="control-segmented" role="group" aria-labelledby="scoring-mode-heading">
              {Object.entries(SCORING_MODE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scoringMode === value}
                  onClick={() => setValue("scoring_mode", value)}
                  disabled={!controlEnabled}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              Saved reviews keep the evaluator they were frozen with; changing this affects new runs only.
            </p>

            <div className="control-form-grid">
              <label className="control-field" htmlFor="rubric-version">
                <span className="control-field-label">Rubric version</span>
                <input
                  id="rubric-version"
                  className="form-control"
                  value={rubricVersion}
                  onChange={(event) => setValue("scoring_rubric_version", event.target.value)}
                />
              </label>
              <label className="control-field" htmlFor="evaluator-provider">
                <span className="control-field-label">Evaluator model profile</span>
                <select
                  id="evaluator-provider"
                  className="form-control"
                  value={evaluatorProvider}
                  onChange={(event) => setEvaluator({ provider: event.target.value })}
                >
                  <option value="">None</option>
                  {schema.modelProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-field" htmlFor="evaluator-attempts">
                <span className="control-field-label">Max attempts (1–3)</span>
                <input
                  id="evaluator-attempts"
                  className="form-control"
                  type="number"
                  min={1}
                  max={3}
                  value={evaluatorAttempts}
                  onChange={(event) => setEvaluator({ max_attempts: Number(event.target.value) })}
                />
              </label>
              <label className="control-field" htmlFor="evaluator-tokens">
                <span className="control-field-label">Max tokens (1–8192)</span>
                <input
                  id="evaluator-tokens"
                  className="form-control"
                  type="number"
                  min={1}
                  max={8192}
                  value={evaluatorTokens}
                  onChange={(event) => setEvaluator({ max_tokens: Number(event.target.value) })}
                />
              </label>
              <label className="control-field" htmlFor="evaluator-timeout">
                <span className="control-field-label">Timeout seconds (1–120)</span>
                <input
                  id="evaluator-timeout"
                  className="form-control"
                  type="number"
                  min={1}
                  max={120}
                  value={evaluatorTimeout}
                  onChange={(event) => setEvaluator({ timeout: Number(event.target.value) })}
                />
              </label>
            </div>

            {evaluatorMissing ? (
              <p className="notice" role="status">
                AI and combined review need a frozen evaluator. Choose an evaluator model profile before starting an
                AI-scored run, or the runtime will reject it.
              </p>
            ) : null}
            {scoring?.configured ? (
              <p className={styles.hint}>
                Current evaluator: <code>{scoring.evaluator.provider || "—"}</code>
                {scoring.evaluator.model ? <code> · {scoring.evaluator.model}</code> : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "yaml" ? (
          <div className={styles.yamlPane}>
            <p className={styles.hint}>
              Edits are validated by the TESIS loader before they are saved. Literal secrets appear as restorable
              placeholders, <code>{"${VAR}"}</code> stays an environment reference, and nothing is written back to
              this page unmasked. Profile: <code>{schema.configPath}</code>
            </p>
            <YamlEditor
              value={currentYaml}
              disabled={!controlEnabled || busy !== null}
              onChange={(next) => setYamlText(next)}
            />
            <div className={styles.rowActions}>
              <Button type="button" variant="ghost" onClick={() => setYamlText(null)} disabled={yamlText === null}>
                Reload from profile
              </Button>
            </div>
            {validation ? (
              <div className="notice" role="status">
                {validation.valid
                  ? `Resolved ${validation.totalCoordinates} coordinate(s).`
                  : validation.error ?? "Configuration rejected."}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <dl className={styles.profilePaths}>
          <div>
            <dt>Profile</dt>
            <dd>
              <code>{schema.configPath}</code>
            </dd>
          </div>
          <div>
            <dt>Seeded from</dt>
            <dd>
              <code>{schema.sourceConfigPath}</code>
            </dd>
          </div>
        </dl>
        <div className={styles.rowActions}>
          {discardArmed ? (
            <Button type="button" variant="danger" onClick={discard} disabled={busy !== null}>
              Confirm discard
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDiscardArmed(true)}
              disabled={busy !== null || !dirty}
            >
              Discard changes
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void validate()} disabled={busy !== null || !controlEnabled}>
            <ShieldCheck size={15} aria-hidden /> {busy === "validating" ? "Validating…" : "Validate"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={styles.footerWide}
            onClick={() => setSyncOpen(true)}
            disabled={busy !== null || !controlEnabled}
          >
            <Upload size={15} aria-hidden /> Write to TESIS config.yaml
          </Button>
          <Button
            type="button"
            variant="primary"
            className={styles.footerWide}
            onClick={() => void save()}
            disabled={busy !== null || !dirty || !controlEnabled}
          >
            <Save size={15} aria-hidden /> {busy === "saving" ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </footer>

      <Dialog
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        title="Write to TESIS config.yaml"
        footer={
          <>
            <Button type="button" variant="ghost" data-dialog-initial-focus onClick={() => setSyncOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void sync()}
              disabled={busy !== null || dirty}
            >
              <Upload size={15} aria-hidden /> {busy === "syncing" ? "Writing…" : "Write config.yaml"}
            </Button>
          </>
        }
      >
        <p>
          This replaces <code>{schema.sourceConfigPath}</code> with the saved web profile
          <code> {schema.configPath}</code>. The TUI and every headless invocation read that checkout document, so
          they will use these settings from then on.
        </p>
        <p>A timestamped backup of the previous document is kept beside it, so the change can be reverted.</p>
        {dirty ? (
          <p className="notice notice-error" role="status">
            This page has unsaved changes. Save the profile first, then write it to the checkout.
          </p>
        ) : (
          <p className={styles.hint}>Only the saved profile is written; the file is validated before it replaces anything.</p>
        )}
      </Dialog>
    </section>
  );
}
