"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Settings2 } from "lucide-react";

import { Badge, Button, Tabs } from "@/components/ui/primitives";
import { DoctorPanel } from "@/components/control/doctor-panel";
import { LaunchWizard } from "@/components/control/launch-wizard";
import { RunConsole } from "@/components/control/run-console";
import { fetchControlJobs, fetchControlSchema } from "@/lib/api-client";
import type { ControlSchema } from "@/lib/control-contract";
import { jobModeLabel } from "@/lib/control-options";
import { useReadResource } from "@/lib/use-read-resource";
import styles from "./control.module.css";

/**
 * Runtime control surface: launch experiments, supervise runs, and run the
 * Doctor. Every write goes through the local control API, which is
 * loopback-gated by default.
 *
 * `initialSchema` is rendered on the server so the launch form is already in
 * the first paint; the job list stays client-side because it is polled.
 */

const ACTIVE_POLL_MS = 3000;
/** Idle launch tab: watch for runs started elsewhere without a 3s refresh loop. */
const IDLE_POLL_MS = 15000;

/** Stable loaders: `useReadResource` keys its effect on this identity. */
async function loadSchema(_key: string, signal: AbortSignal) {
  return fetchControlSchema(signal);
}

async function loadJobs(_key: string, signal: AbortSignal) {
  return fetchControlJobs(25, signal);
}

const TABS = [
  { value: "launch", label: "Launch" },
  { value: "runs", label: "Runs" },
  { value: "doctor", label: "Doctor" },
];

export function ControlPage({ initialSchema }: { initialSchema?: ControlSchema | null }) {
  const [tab, setTab] = useState("launch");
  const schemaResource = useReadResource("control-schema", loadSchema, initialSchema ?? undefined);
  const jobsResource = useReadResource("control-jobs", loadJobs);
  const refreshJobs = jobsResource.refresh;
  const refreshRef = useRef(refreshJobs);

  useEffect(() => {
    refreshRef.current = refreshJobs;
  });

  const schema = schemaResource.data ?? null;
  const jobs = jobsResource.data?.jobs ?? [];
  /** A background refresh, as opposed to the first load this page paints without. */
  const refreshingJobs = jobsResource.busy && jobsResource.data !== undefined;
  const controlEnabled = schema?.control?.enabled ?? true;
  const controlReason = schema?.control?.reason ?? null;
  const activeRun =
    jobs.find((job) => job.kind === "run" && (job.status === "running" || job.status === "cancelling")) ?? null;
  const runJobs = jobs.filter((job) => job.kind === "run");

  // Fast cadence only where progress matters: a running experiment or a tab
  // that displays runs. The launch form refreshes slowly and never while hidden.
  const pollMs = tab === "launch" && !activeRun ? IDLE_POLL_MS : ACTIVE_POLL_MS;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refreshRef.current();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  const openRuns = useCallback(() => {
    setTab("runs");
    refreshRef.current();
  }, []);

  return (
    <div className={`control-page ${styles.page}`}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Experiment control</h1>
          <p className="page-description">
            Configure the matrix, launch the runtime, watch it progress, and cancel it. Runs use the same headless
            entry point and artifacts as the TUI and appear in the live monitor and results explorer.
          </p>
          {!controlEnabled || activeRun ? (
            <div className={styles.statusRow}>
              {controlEnabled ? null : <Badge variant="amber">read-only</Badge>}
              {activeRun ? <Badge variant="outline">{jobModeLabel(activeRun.mode)} running</Badge> : null}
            </div>
          ) : null}
        </div>
        <div className="page-actions">
          <Button type="button" variant="ghost" onClick={jobsResource.refresh} disabled={jobsResource.busy}>
            <RefreshCw size={15} aria-hidden /> {refreshingJobs ? "Refreshing…" : "Refresh"}
          </Button>
          <Link className="ui-button ui-button-outline" href="/settings">
            <Settings2 size={15} aria-hidden /> Settings
          </Link>
        </div>
      </header>

      {schemaResource.error ? (
        <p className="notice notice-error" role="alert">
          {schemaResource.error}
        </p>
      ) : null}
      {jobsResource.error ? (
        <p className="notice notice-error" role="alert">
          {jobsResource.error}
        </p>
      ) : null}
      {!controlEnabled && controlReason ? (
        <p className="notice" role="status">
          {controlReason}
        </p>
      ) : null}
      {schema?.resolvedError ? (
        <p className="notice notice-error" role="alert">
          The saved profile does not resolve: {schema.resolvedError}. Fix it in Settings before starting a run.
        </p>
      ) : null}

      <Tabs
        tabs={TABS.map((item) => (item.value === "runs" ? { ...item, badge: activeRun ? 1 : 0 } : item))}
        value={tab}
        onValueChange={setTab}
        idPrefix="control-tab"
        panelId="control-panel"
        label="Control sections"
        className={styles.tabs}
      />

      <div id="control-panel" role="tabpanel" aria-labelledby={`control-tab-${tab}`} className={styles.panel}>
        {tab === "launch" ? (
          schema ? (
            <LaunchWizard
              schema={schema}
              disabled={!controlEnabled || schemaResource.busy}
              onStarted={openRuns}
            />
          ) : (
            <section className="ui-card" aria-busy={schemaResource.busy}>
              <header className="ui-card-header">
                <h2 className="ui-card-title">Launch experiment</h2>
              </header>
              <div className="ui-card-content">
                <p className={styles.hint} role="status">
                  {schemaResource.busy
                    ? "Preparing the launch form…"
                    : "The settings profile could not be read, so the launch form is unavailable."}
                </p>
                {schemaResource.busy ? null : (
                  <Button type="button" variant="outline" onClick={schemaResource.refresh}>
                    <RefreshCw size={15} aria-hidden /> Try again
                  </Button>
                )}
              </div>
            </section>
          )
        ) : null}

        {tab === "runs" ? (
          <RunConsole jobs={runJobs} disabled={!controlEnabled} onRefresh={jobsResource.refresh} />
        ) : null}

        {tab === "doctor" ? (
          <DoctorPanel jobs={jobs} disabled={!controlEnabled} onRefresh={jobsResource.refresh} />
        ) : null}
      </div>
    </div>
  );
}
