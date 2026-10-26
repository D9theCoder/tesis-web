"use client";

import { useState } from "react";
import { Activity, Wifi } from "lucide-react";

import { Badge, Button, Dialog } from "@/components/ui/primitives";
import { startDoctorRun } from "@/lib/api-client";
import { doctorReportSchema, type ControlJob } from "@/lib/control-contract";
import { fmtIsoFromStr } from "@/lib/formatters";
import { JOB_STATUS_TONES } from "@/lib/control-options";
import styles from "./control.module.css";

/** Friendly titles for the Doctor check ids emitted by `tesis doctor --json`. */
const CHECK_LABELS: Record<string, string> = {
  "coverage.scope": "Method / level coverage",
  "akg.integrity": "Attack knowledge graph",
  "graph.compilation": "LangGraph compilation",
  "payload.static_seeds": "Static payload seeds",
  "containment.http": "Request containment",
  "config.profiles_roles": "Model profiles and roles",
  "config.credentials": "Provider credentials",
  "config.endpoints": "Provider endpoints",
  "config.load": "Configuration load",
  "config.redaction": "Secret redaction",
  "environment.dependencies": "Python dependencies",
  "output.writability": "Output directory",
  "reasoning.controls": "Reasoning controls",
  "live.dvwa.authentication": "DVWA authentication",
  "live.dvwa.levels": "DVWA security levels",
  "live.dvwa.surfaces": "DVWA surfaces",
  "live.model.orchestrator": "Orchestrator model call",
  "live.model.payload_generator": "Payload generator model call",
};

const STATUS_TONE: Record<string, "lime" | "red" | "outline"> = {
  passed: "lime",
  failed: "red",
  skipped: "outline",
};

export type DoctorPanelProps = {
  jobs: ControlJob[];
  disabled?: boolean;
  onRefresh: () => void;
};

export function DoctorPanel({ jobs, disabled, onRefresh }: DoctorPanelProps) {
  const [busy, setBusy] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doctorJobs = jobs.filter((job) => job.kind === "doctor");
  const latest = doctorJobs[0] ?? null;
  const running = latest ? latest.status === "running" || latest.status === "cancelling" : false;
  const parsed = latest?.result ? doctorReportSchema.safeParse(latest.result) : null;
  const report = parsed?.success ? parsed.data : null;

  const run = async (live: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await startDoctorRun(live);
      setLiveOpen(false);
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Doctor could not run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${styles.console} ui-card`} aria-labelledby="doctor-title">
      <header className="ui-card-header">
        <div>
          <h2 className="ui-card-title" id="doctor-title">
            Doctor
          </h2>
          <p className={styles.cardHint}>
            Offline checks stay local. Live checks contact DVWA and the configured model providers, so they may use
            provider credits.
          </p>
        </div>
      </header>

      <div className="ui-card-content">
        <div className={styles.detailActions}>
          <Button type="button" variant="outline" onClick={() => void run(false)} disabled={busy || running || disabled}>
            <Activity size={15} aria-hidden /> {busy ? "Starting…" : "Run offline checks"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setLiveOpen(true)}
            disabled={busy || running || disabled}
          >
            <Wifi size={15} aria-hidden /> Check services…
          </Button>
        </div>
        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : null}

        {!latest ? (
          <p className="empty-state">The Doctor has not run for this profile yet.</p>
        ) : (
          <div className={styles.jobDetail}>
            <div className={styles.statusRow}>
              <Badge variant="outline">{latest.mode === "doctor-live" ? "live" : "offline"}</Badge>
              {report ? (
                <>
                  <Badge variant={report.status === "passed" ? "lime" : "red"}>{report.status}</Badge>
                  <span className={styles.hint}>
                    {report.summary.passed} passed · {report.summary.failed} failed · {report.summary.skipped} not
                    checked
                  </span>
                </>
              ) : (
                <Badge variant={JOB_STATUS_TONES[latest.status] ?? "outline"}>{latest.status}</Badge>
              )}
              <span className={styles.hint}>started {fmtIsoFromStr(latest.createdAt)}</span>
            </div>

            {running ? <p className={styles.hint}>Running checks…</p> : null}
            {latest.error ? (
              <p className="notice notice-error" role="alert">
                {latest.error}
              </p>
            ) : null}

            {report ? (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Check</th>
                      <th scope="col">Status</th>
                      <th scope="col">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.checks.map((check) => (
                      <tr key={check.id}>
                        <td>
                          {CHECK_LABELS[check.id] ?? check.id}
                          <small>{check.id}</small>
                        </td>
                        <td>
                          <Badge variant={STATUS_TONE[check.status] ?? "default"}>{check.status}</Badge>
                        </td>
                        <td>
                          {check.summary}
                          {check.status === "failed" && check.remediation ? (
                            <small>Remediation: {check.remediation}</small>
                          ) : null}
                          {check.status === "failed" && check.details ? <small>{check.details}</small> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Dialog
        open={liveOpen}
        onClose={() => setLiveOpen(false)}
        title="Run live Doctor checks"
        footer={
          <>
            <Button type="button" variant="ghost" data-dialog-initial-focus onClick={() => setLiveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={() => void run(true)} disabled={busy || disabled}>
              <Wifi size={15} aria-hidden /> {busy ? "Starting…" : "Run live checks"}
            </Button>
          </>
        }
      >
        <p>
          Live checks authenticate to the configured DVWA instance and make one structured model call per role. They
          may consume provider credits and take noticeably longer than the offline checks.
        </p>
        <p>The offline checks stay local and are always safe to run first.</p>
      </Dialog>
    </section>
  );
}
