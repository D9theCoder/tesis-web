"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Ban, ExternalLink, Skull } from "lucide-react";

import { Badge, Button, Dialog } from "@/components/ui/primitives";
import { cancelControlRun, fetchControlLog } from "@/lib/api-client";
import type { ControlJob } from "@/lib/control-contract";
import { JOB_STATUS_TONES, jobModeLabel } from "@/lib/control-options";
import { fmtDuration, fmtIsoFromStr } from "@/lib/formatters";
import styles from "./control.module.css";

/**
 * Supervised job list plus a live tail of the runtime's progress log.
 * Cancel is graceful first; the force action is a deliberate second step.
 */

const ACTIVE = new Set(["running", "cancelling"]);
const LOG_LIMIT = 40_000;

function duration(job: ControlJob): string {
  const start = job.startedAt ? Date.parse(job.startedAt) : NaN;
  const end = job.endedAt ? Date.parse(job.endedAt) : NaN;
  if (!Number.isFinite(start)) return "—";
  if (!Number.isFinite(end)) return fmtDuration(Date.now() - start);
  return fmtDuration(end - start);
}

/** Runtime summaries use success/error; the app speaks succeeded/failed. */
const RESULT_LABELS: Record<string, string> = {
  success: "succeeded",
  complete: "succeeded",
  completed: "succeeded",
  error: "failed",
  failure: "failed",
};

function resultHeadline(job: ControlJob): string {
  if (job.status === "running" || job.status === "cancelling") return "in progress";
  if (job.error) return job.error;
  const raw = typeof job.result?.status === "string" ? job.result.status : null;
  const status = raw ? RESULT_LABELS[raw.toLowerCase()] ?? raw : null;
  if (job.kind === "doctor" && status) return `Doctor ${status}`;
  if (status) return status;
  return job.status;
}

export type RunConsoleProps = {
  jobs: ControlJob[];
  disabled?: boolean;
  onRefresh: () => void;
};

export function RunConsole({ jobs, disabled, onRefresh }: RunConsoleProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [log, setLog] = useState<{ jobId: string | null; text: string }>({ jobId: null, text: "" });
  const [logError, setLogError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0] ?? null;
  const selectedJobId = selected?.id ?? null;
  const selectedStatus = selected?.status ?? null;
  const selectedActive = selectedStatus ? ACTIVE.has(selectedStatus) : false;

  useEffect(() => {
    if (!selectedJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const chunk = await fetchControlLog(selectedJobId, offsetRef.current);
        if (cancelled) return;
        if (chunk.text) {
          offsetRef.current = chunk.nextOffset;
          setLog((previous) => ({
            jobId: selectedJobId,
            text: ((previous.jobId === selectedJobId ? previous.text : "") + chunk.text).slice(-LOG_LIMIT),
          }));
        }
        setLogError(null);
      } catch (error) {
        if (!cancelled) setLogError(error instanceof Error ? error.message : "Log unavailable.");
        return;
      }
      if (!cancelled && selectedStatus && ACTIVE.has(selectedStatus)) {
        timer = setTimeout(tick, 1500);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedJobId, selectedStatus]);

  const selectJob = (id: string) => {
    offsetRef.current = 0;
    setSelectedId(id);
    setLog({ jobId: id, text: "" });
    setLogError(null);
    setForceOpen(false);
    setActionError(null);
  };

  const cancel = async (force: boolean) => {
    if (!selected) return;
    setCancelBusy(true);
    setActionError(null);
    try {
      await cancelControlRun(selected.id, force);
      setForceOpen(false);
      onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Cancel failed.");
    } finally {
      setCancelBusy(false);
    }
  };

  const visibleLog = log.jobId === selectedJobId ? log.text : "";

  return (
    <section className={`${styles.console} ui-card`} aria-labelledby="run-console-title">
      <header className="ui-card-header">
        <div>
          <h2 className="ui-card-title" id="run-console-title">
            Runs
          </h2>
          <p className={styles.cardHint}>
            Experiments started here stay supervised: the process, its log, and its artifacts are all tracked.
          </p>
        </div>
      </header>

      <div className="ui-card-content">
        {jobs.length === 0 ? (
          <div className="empty-state">
            <h3>No run in this session yet</h3>
            <p>Start one from the Launch tab. Runs begun in the TUI stay out of this list, but they still appear in the live monitor and results explorer.</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Started</th>
                    <th scope="col">Mode</th>
                    <th scope="col">Status</th>
                    <th scope="col">Elapsed</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      className={selectedJobId === job.id ? "selected" : undefined}
                      onClick={() => selectJob(job.id)}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.rowButton}
                          aria-pressed={selectedJobId === job.id}
                          aria-label={`Show run started ${fmtIsoFromStr(job.createdAt)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectJob(job.id);
                          }}
                        >
                          {fmtIsoFromStr(job.createdAt)}
                        </button>
                        <small>{job.id.slice(0, 8)}</small>
                      </td>
                      <td>{jobModeLabel(job.mode)}</td>
                      <td>
                        <Badge variant={JOB_STATUS_TONES[job.status] ?? "default"}>{job.status}</Badge>
                      </td>
                      <td className="tabular-nums">{duration(job)}</td>
                      <td className={styles.resultCell}>{resultHeadline(job)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected ? (
              <div className={styles.jobDetail}>
                <div className={styles.statusRow} aria-live="polite">
                  <Badge variant={JOB_STATUS_TONES[selected.status] ?? "default"}>{selected.status}</Badge>
                  {selected.executionId ? <Badge variant="outline">execution {selected.executionId}</Badge> : null}
                  {selected.pid ? <Badge variant="outline">pid {selected.pid}</Badge> : null}
                  {selected.artifactDir ? (
                    <Badge variant="outline" title={selected.artifactDir}>
                      artifacts recorded
                    </Badge>
                  ) : null}
                </div>

                <div className={styles.detailActions}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void cancel(false)}
                    disabled={!selectedActive || cancelBusy || disabled}
                  >
                    <Ban size={15} aria-hidden /> Cancel run
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setForceOpen(true)}
                    disabled={!selectedActive || cancelBusy || disabled}
                  >
                    <Skull size={15} aria-hidden /> Force kill…
                  </Button>
                  {selectedActive ? (
                    <Link className="ui-button ui-button-outline" href="/">
                      Live monitor <ExternalLink size={14} aria-hidden />
                    </Link>
                  ) : null}
                  {selected.executionId ? (
                    <Link
                      className="ui-button ui-button-outline"
                      href={`/results/${encodeURIComponent(selected.executionId)}`}
                    >
                      Open results <ExternalLink size={14} aria-hidden />
                    </Link>
                  ) : null}
                </div>

                {actionError ? (
                  <p className="notice notice-error" role="alert">
                    {actionError}
                  </p>
                ) : null}
                {selected.error ? (
                  <p className="notice notice-error" role="alert">
                    {selected.error}
                  </p>
                ) : null}

                {selected.artifactDir ? (
                  <dl className={styles.detailGrid}>
                    <div>
                      <dt>Artifacts</dt>
                      <dd className={styles.pathValue}>{selected.artifactDir}</dd>
                    </div>
                    <div>
                      <dt>Command</dt>
                      <dd className={styles.pathValue}>python {selected.argv.join(" ")}</dd>
                    </div>
                  </dl>
                ) : null}

                <div>
                  <h3 className={styles.logHeading}>Runtime log</h3>
                  {logError ? (
                    <p className="notice notice-error" role="alert">
                      {logError}
                    </p>
                  ) : null}
                  <pre className="control-log" role="region" aria-label="Runtime log" tabIndex={0}>
                    {visibleLog.trim() || (selectedActive ? "Waiting for the runtime to report progress…" : "No log output.")}
                  </pre>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Dialog
        open={forceOpen}
        onClose={() => setForceOpen(false)}
        title="Force kill this run?"
        footer={
          <>
            <Button type="button" variant="ghost" data-dialog-initial-focus onClick={() => setForceOpen(false)}>
              Keep running
            </Button>
            <Button type="button" variant="danger" onClick={() => void cancel(true)} disabled={cancelBusy}>
              <Skull size={15} aria-hidden /> Force kill
            </Button>
          </>
        }
      >
        <p>
          <strong>Cancel run</strong> already asked the runtime to stop in its own time. Force kill sends SIGKILL,
          which cannot write a terminal descriptor or an aggregate artifact.
        </p>
        <p>The run will look incomplete until the live monitor marks it stale, so prefer the graceful cancel.</p>
      </Dialog>
    </section>
  );
}
