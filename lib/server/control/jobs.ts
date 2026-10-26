import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs, closeSync, openSync } from "node:fs";
import path from "node:path";

import { tesisRoot } from "@/lib/server/fs-util";
import { ControlError } from "@/lib/server/control/errors";
import { tesisProcessEnv } from "@/lib/server/control/env";
import {
  jobsDir,
  profileConfigPath,
  tesisPython,
} from "@/lib/server/control/paths";
import { ensureProfile } from "@/lib/server/control/config-store";

/**
 * Supervised TESIS processes started from the web UI.
 *
 * Experiments take minutes, so every invocation is spawned detached with its
 * output on disk. Job state therefore survives a dev-server reload, and a
 * cancel is a signal to the real process rather than an abandoned promise.
 */

export type JobKind = "run" | "doctor";
export type JobMode = "single" | "matrix" | "doctor-offline" | "doctor-live";
export type JobStatus = "running" | "cancelling" | "finished" | "failed" | "cancelled" | "lost";

export type JobRecord = {
  id: string;
  kind: JobKind;
  mode: JobMode;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  pid: number | null;
  exitCode: number | null;
  signal: string | null;
  argv: string[];
  configPath: string;
  result: Record<string, unknown> | null;
  error: string | null;
  cancelRequestedAt: string | null;
};

export type JobView = JobRecord & {
  artifactDir: string | null;
  executionId: string | null;
  runId: string | null;
  logBytes: number;
};

type GlobalWithJobs = typeof globalThis & {
  __tesisControlJobs?: Map<string, JobRecord>;
  __tesisControlChildren?: Map<string, ChildProcess>;
};

const globalScope = globalThis as GlobalWithJobs;
const records = (globalScope.__tesisControlJobs ??= new Map<string, JobRecord>());
const children = (globalScope.__tesisControlChildren ??= new Map<string, ChildProcess>());

const MAX_JOBS_RETAINED = 200;

function now(): string {
  return new Date().toISOString();
}

function recordPath(id: string): string {
  return path.join(jobsDir(), `${id}.json`);
}

function logPath(id: string): string {
  return path.join(jobsDir(), `${id}.log`);
}

function resultPath(id: string): string {
  return path.join(jobsDir(), `${id}.stdout.log`);
}

function isAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The runtime prints one JSON document; take the last parseable line. */
export function parseLastJson(text: string): Record<string, unknown> | null {
  const lines = text.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* Keep scanning upwards. */
    }
  }
  return null;
}

async function readResultFile(id: string): Promise<Record<string, unknown> | null> {
  try {
    const text = await fs.readFile(resultPath(id), "utf8");
    return parseLastJson(text);
  } catch {
    return null;
  }
}

function finalStatus(job: JobRecord, result: Record<string, unknown> | null): JobStatus {
  if (job.cancelRequestedAt) return "cancelled";
  if (job.signal) return "failed";
  if (result) {
    const status = String(result.status ?? "").toLowerCase();
    if (["success", "finished", "completed", "complete"].includes(status)) return "finished";
    if (status === "cancelled") return "cancelled";
    if (["error", "failed", "failure"].includes(status)) return "failed";
    if (job.exitCode === 0) return "finished";
    return "failed";
  }
  return job.exitCode === 0 ? "finished" : "failed";
}

async function persist(job: JobRecord): Promise<void> {
  await fs.mkdir(jobsDir(), { recursive: true });
  await fs.writeFile(recordPath(job.id), `${JSON.stringify(job, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function remember(job: JobRecord): JobRecord {
  records.set(job.id, job);
  return job;
}

async function finalize(job: JobRecord, exitCode: number | null, signal: NodeJS.Signals | null): Promise<JobRecord> {
  // Re-read the registry: a cancel request may have replaced the record while
  // the process was still finishing, and that flag decides the final status.
  const current = records.get(job.id) ?? job;
  if (current.status !== "running" && current.status !== "cancelling") return current;
  const result = await readResultFile(current.id);
  const updated: JobRecord = {
    ...current,
    exitCode,
    signal,
    endedAt: now(),
    result,
  };
  updated.status = finalStatus(updated, result);
  if (updated.status === "failed" && !updated.error) {
    updated.error =
      (typeof result?.error === "string" && result.error) ||
      `TESIS exited with code ${exitCode ?? "unknown"}${signal ? ` (${signal})` : ""}. See the log.`;
  }
  remember(updated);
  await persist(updated);
  children.delete(current.id);
  return updated;
}

/** Fill in jobs whose supervising server disappeared mid-flight. */
async function reconcile(job: JobRecord): Promise<JobRecord> {
  if (job.status === "finished" || job.status === "failed" || job.status === "cancelled" || job.status === "lost") {
    return job;
  }
  if (isAlive(job.pid)) return job;
  if (!children.has(job.id)) {
    const result = await readResultFile(job.id);
    if (result || job.cancelRequestedAt) {
      return finalize({ ...job, exitCode: job.exitCode, signal: job.signal }, job.exitCode, null);
    }
    const lost: JobRecord = {
      ...job,
      status: "lost",
      endedAt: job.endedAt ?? now(),
      error: job.error ?? "The supervising web server stopped before this job reported a result.",
    };
    remember(lost);
    await persist(lost);
    return lost;
  }
  return job;
}

async function loadJob(id: string): Promise<JobRecord | null> {
  const cached = records.get(id);
  if (cached) return reconcile(cached);
  try {
    const raw = await fs.readFile(recordPath(id), "utf8");
    const parsed = JSON.parse(raw) as JobRecord;
    remember(parsed);
    return reconcile(parsed);
  } catch {
    return null;
  }
}

function assertJobId(id: string): string {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new ControlError("Invalid job id.", 400);
  return id;
}

const RUNNING: JobStatus[] = ["running", "cancelling"];

export async function activeRun(): Promise<JobRecord | null> {
  for (const job of records.values()) {
    if (job.kind !== "run") continue;
    const current = await reconcile(job);
    if (RUNNING.includes(current.status)) return current;
  }
  const jobs = await listJobs(50);
  return (
    jobs.find((job) => job.kind === "run" && RUNNING.includes(job.status)) ?? null
  );
}

function buildArgv(kind: JobKind, mode: JobMode, configPath: string): string[] {
  if (kind === "doctor") {
    return [
      "-m",
      "tesis",
      "doctor",
      "--config",
      configPath,
      "--json",
      ...(mode === "doctor-live" ? ["--live"] : []),
    ];
  }
  return [
    "-m",
    "tesis",
    "run",
    "--headless",
    "--mode",
    mode === "matrix" ? "matrix" : "single",
    "--config",
    configPath,
    "--json",
  ];
}

export async function startJob(kind: JobKind, mode: JobMode): Promise<JobView> {
  if (kind === "run" && process.env.TESIS_CONTROL_ALLOW_CONCURRENT_RUNS !== "1") {
    const running = await activeRun();
    if (running) {
      throw new ControlError(
        `Experiment ${running.id} is still ${running.status}. Cancel it before starting another.`,
        409,
      );
    }
  }
  const configPath = await ensureProfile();
  const id = randomUUID();
  const argv = buildArgv(kind, mode, configPath);
  await fs.mkdir(jobsDir(), { recursive: true });

  const env = await tesisProcessEnv({ TESIS_ROOT: tesisRoot() });
  const out = openSync(resultPath(id), "a", 0o600);
  const err = openSync(logPath(id), "a", 0o600);

  let child: ChildProcess;
  try {
    child = spawn(tesisPython(), argv, {
      cwd: tesisRoot(),
      env,
      detached: true,
      stdio: ["ignore", out, err],
    });
  } catch (error) {
    closeSync(out);
    closeSync(err);
    throw new ControlError(
      `Unable to start TESIS: ${error instanceof Error ? error.message : String(error)}`,
      500,
    );
  } finally {
    closeSync(out);
    closeSync(err);
  }

  const record: JobRecord = {
    id,
    kind,
    mode,
    status: "running",
    createdAt: now(),
    startedAt: now(),
    endedAt: null,
    pid: child.pid ?? null,
    exitCode: null,
    signal: null,
    argv,
    configPath,
    result: null,
    error: null,
    cancelRequestedAt: null,
  };

  // Both listeners are attached synchronously: a fast failure can exit before
  // the spawn bookkeeping below finishes, and a missed exit would leave the job
  // "running" forever.
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const spawnError = new Promise<NodeJS.ErrnoException | null>((resolve) => {
    child.once("error", (error: NodeJS.ErrnoException) => resolve(error));
    child.once("spawn", () => resolve(null));
  });

  const error = await spawnError;
  if (error) {
    throw new ControlError(
      error.code === "ENOENT"
        ? `Python interpreter not found at ${tesisPython()}. Set TESIS_PYTHON to the TESIS virtualenv interpreter, and check that ${tesisRoot()} exists.`
        : `Unable to start TESIS: ${error.message}`,
      500,
    );
  }

  children.set(id, child);
  remember(record);
  await persist(record);
  await pruneOldJobs();

  void exited.then(({ code, signal }) => finalize(record, code, signal));
  child.unref();

  return viewOf(record, await logSize(id));
}

async function logSize(id: string): Promise<number> {
  try {
    return (await fs.stat(logPath(id))).size;
  } catch {
    return 0;
  }
}

function viewOf(job: JobRecord, bytes: number): JobView {
  const result = job.result ?? {};
  return {
    ...job,
    artifactDir: typeof result.artifact_dir === "string" ? result.artifact_dir : null,
    executionId: typeof result.execution_id === "string" ? result.execution_id : null,
    runId: typeof result.run_id === "string" ? result.run_id : null,
    logBytes: bytes,
  };
}

async function pruneOldJobs(): Promise<void> {
  try {
    const entries = await fs.readdir(jobsDir());
    const recordsOnDisk = entries.filter((name) => name.endsWith(".json"));
    if (recordsOnDisk.length <= MAX_JOBS_RETAINED) return;
    const withTimes = await Promise.all(
      recordsOnDisk.map(async (name) => {
        const file = path.join(jobsDir(), name);
        try {
          return { file, mtime: (await fs.stat(file)).mtimeMs };
        } catch {
          return { file, mtime: 0 };
        }
      }),
    );
    withTimes.sort((a, b) => b.mtime - a.mtime);
    for (const stale of withTimes.slice(MAX_JOBS_RETAINED)) {
      const id = path.basename(stale.file, ".json");
      await fs.rm(stale.file, { force: true });
      await fs.rm(logPath(id), { force: true });
      await fs.rm(resultPath(id), { force: true });
      records.delete(id);
    }
  } catch {
    /* Pruning is housekeeping; never fail a request for it. */
  }
}

export async function listJobs(limit = 25): Promise<JobView[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(jobsDir())).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const jobs: JobRecord[] = [];
  for (const name of names) {
    const job = await loadJob(path.basename(name, ".json"));
    if (job) jobs.push(job);
  }
  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sliced = jobs.slice(0, Math.max(1, Math.min(limit, 100)));
  return Promise.all(sliced.map(async (job) => viewOf(job, await logSize(job.id))));
}

export async function getJob(id: string): Promise<JobView> {
  const job = await loadJob(assertJobId(id));
  if (!job) throw new ControlError("Unknown job.", 404);
  return viewOf(job, await logSize(job.id));
}

export type JobLog = { text: string; nextOffset: number; complete: boolean };

export async function readJobLog(id: string, offset = 0): Promise<JobLog> {
  assertJobId(id);
  const job = await loadJob(id);
  if (!job) throw new ControlError("Unknown job.", 404);
  let size = 0;
  try {
    size = (await fs.stat(logPath(id))).size;
  } catch {
    return { text: "", nextOffset: 0, complete: !RUNNING.includes(job.status) };
  }
  const start = Number.isSafeInteger(offset) && offset >= 0 && offset <= size ? offset : 0;
  const CHUNK = 128 * 1024;
  const end = Math.min(size, start + CHUNK);
  const handle = await fs.open(logPath(id), "r");
  try {
    const buffer = Buffer.alloc(end - start);
    await handle.read(buffer, 0, end - start, start);
    return {
      text: buffer.toString("utf8"),
      nextOffset: end,
      complete: end >= size && !RUNNING.includes(job.status),
    };
  } finally {
    await handle.close();
  }
}

export async function cancelJob(id: string, force = false): Promise<JobView> {
  assertJobId(id);
  const job = await loadJob(id);
  if (!job) throw new ControlError("Unknown job.", 404);
  if (!RUNNING.includes(job.status)) {
    throw new ControlError(`Job ${job.id} is already ${job.status}.`, 409);
  }
  const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGINT";
  const pid = job.pid;
  if (!pid) throw new ControlError("This job has no live process to cancel.", 409);
  try {
    // The child is a process-group leader; signal the group so worker threads
    // and any provider subprocess receive the same request.
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch (error) {
      throw new ControlError(
        `Unable to signal TESIS process ${pid}: ${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    }
  }
  const updated: JobRecord = {
    ...job,
    status: "cancelling",
    cancelRequestedAt: job.cancelRequestedAt ?? now(),
  };
  remember(updated);
  await persist(updated);
  return viewOf(updated, await logSize(id));
}

/** Test-only hook: clears the in-memory registry without touching disk. */
export function resetJobRegistry(): void {
  records.clear();
  children.clear();
}

export const CONTROL_PATHS_FOR_TESTS = { profileConfigPath };
