import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs, closeSync, openSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { tesisRoot } from "@/lib/server/fs-util";
import { tesisProcessEnv } from "@/lib/server/control/env";
import { ControlError } from "@/lib/server/control/errors";
import { stateDir, tesisPython } from "@/lib/server/control/paths";
import { controlAuthFlowSchema, type ControlAuthFlow } from "@/lib/control-contract";

/**
 * Supervised ChatGPT sign-in and sign-out.
 *
 * The browser loopback, PKCE exchange, and revocation belong to the TESIS
 * runtime, so the web starts the same `tesis auth ... --json-events` process
 * the TUI uses and reads its progress from a private log. The process is
 * detached: closing this page or reloading the dev server does not abandon a
 * sign-in that the browser has already approved.
 */

export type AuthAction = "login" | "logout";

/** The runtime expires sign-in after five minutes; sign-out may retry revocation. */
const TIMEOUT_MS: Record<AuthAction, number> = { login: 360_000, logout: 150_000 };

const MAX_EVENT_LOG_BYTES = 256 * 1024;
const SPAWN_GRACE_MS = 100;

const authEventSchema = z
  .object({
    event: z.string(),
    url: z.string().optional(),
    accounts: z.record(z.record(z.unknown())).optional(),
    remote_revoked: z.boolean().optional(),
    message: z.string().optional(),
  })
  .passthrough();

type AuthEvent = z.infer<typeof authEventSchema>;

type GlobalWithAuthQueue = typeof globalThis & { __tesisAuthQueue?: Promise<unknown> };

const globalScope = globalThis as GlobalWithAuthQueue;

function flowStatePath(): string {
  return path.join(stateDir(), "auth-flow.json");
}

function flowEventLogPath(): string {
  return path.join(stateDir(), "auth-flow.events.log");
}

function flowStderrPath(): string {
  return path.join(stateDir(), "auth-flow.stderr.log");
}

function now(): string {
  return new Date().toISOString();
}

function idleFlow(): ControlAuthFlow {
  return {
    state: "idle",
    action: null,
    account: "default",
    authorizeUrl: null,
    message: null,
    startedAt: null,
    endedAt: null,
    pid: null,
    remoteRevoked: null,
    status: null,
  };
}

function isTerminal(state: ControlAuthFlow["state"]): boolean {
  return state === "succeeded" || state === "failed" || state === "cancelled";
}

/** Serialize state transitions inside this server process. */
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const previous = globalScope.__tesisAuthQueue ?? Promise.resolve();
  const run = previous.then(work, work);
  globalScope.__tesisAuthQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function killGroup(pid: number | null | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    // The child is a process-group leader, so the shell and its children go together.
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      /* Already gone. */
    }
  }
}

async function readFlow(): Promise<ControlAuthFlow> {
  try {
    const parsed = controlAuthFlowSchema.safeParse(JSON.parse(await fs.readFile(flowStatePath(), "utf8")));
    return parsed.success ? parsed.data : idleFlow();
  } catch {
    return idleFlow();
  }
}

async function persist(flow: ControlAuthFlow): Promise<void> {
  await fs.mkdir(stateDir(), { recursive: true, mode: 0o700 });
  const target = flowStatePath();
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(flow)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

async function readEventLog(): Promise<string> {
  try {
    const file = flowEventLogPath();
    const info = await fs.stat(file);
    const length = Math.min(info.size, MAX_EVENT_LOG_BYTES);
    if (length === 0) return "";
    const handle = await fs.open(file, "r");
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, info.size - length);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

function parseEvents(text: string): AuthEvent[] {
  const events: AuthEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = authEventSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) events.push(parsed.data);
    } catch {
      /* A partially written trailing line is read again on the next poll. */
    }
  }
  return events;
}

function safeAuthorizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "auth.openai.com") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeMessage(raw: unknown): string {
  const text =
    typeof raw === "string" && raw.trim()
      ? raw.trim()
      : "The account action failed. Check your connection and try again.";
  return text
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/._~=-]+/gi, "$1 [REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/((?:access_token|refresh_token|id_token|token)\s*[=:]\s*)[^\s&;,"'<>]+/gi, "$1[REDACTED]")
    .slice(0, 600);
}

const ACCOUNT_STATUS_FIELDS = ["signed_in", "plan_usage", "email", "expires_at", "client_id"] as const;

/** Project the account status the runtime returns; credentials never cross this boundary. */
function projectAccountStatus(
  accounts: Record<string, Record<string, unknown>> | undefined,
  account: string,
): Record<string, unknown> | null {
  const entry = accounts?.[account];
  if (!entry) return null;
  const status: Record<string, unknown> = {};
  for (const key of ACCOUNT_STATUS_FIELDS) {
    if (entry[key] !== undefined) status[key] = entry[key];
  }
  return status;
}

function loginMessage(account: string, status: Record<string, unknown> | null): string {
  if (!status || typeof status.signed_in !== "boolean") {
    return `${account}: sign-in finished. Check the account status before choosing a model.`;
  }
  if (!status.signed_in) return `${account}: signed out. Choose Sign in to connect ChatGPT.`;
  if (status.plan_usage === true) {
    return `${account}: signed in. ChatGPT plan usage is enabled. Fetch the catalog to choose one.`;
  }
  return `${account}: signed in. ChatGPT plan usage is disabled. Sign in again and approve plan usage to use inference.`;
}

function applyEvents(flow: ControlAuthFlow, text: string): ControlAuthFlow {
  if (isTerminal(flow.state)) return flow;
  let next = flow;
  for (const event of parseEvents(text)) {
    if (event.event === "authorize" && next.action === "login") {
      const url = safeAuthorizeUrl(event.url);
      if (!url) {
        next = {
          ...next,
          state: "failed",
          authorizeUrl: null,
          message: "The runtime returned an unsafe authorization URL; sign-in was stopped.",
          endedAt: now(),
        };
        continue;
      }
      next = {
        ...next,
        authorizeUrl: url,
        message: "Finish sign-in in your browser within five minutes. Approve TESIS and ChatGPT plan usage.",
      };
      continue;
    }
    if (event.event === "complete" && next.action === "login") {
      const status = projectAccountStatus(event.accounts, next.account);
      next = {
        ...next,
        state: "succeeded",
        authorizeUrl: null,
        status,
        message: loginMessage(next.account, status),
        endedAt: now(),
      };
      continue;
    }
    if (event.event === "signed_out" && next.action === "logout") {
      const remoteRevoked = event.remote_revoked === true;
      next = {
        ...next,
        state: "succeeded",
        authorizeUrl: null,
        remoteRevoked,
        message: remoteRevoked
          ? `${next.account}: signed out.`
          : `${next.account}: signed out locally. Remote revocation was not confirmed. Disconnect TESIS in ChatGPT Settings.`,
        endedAt: now(),
      };
      continue;
    }
    if (event.event === "error") {
      next = {
        ...next,
        state: "failed",
        authorizeUrl: null,
        message: safeMessage(event.message),
        endedAt: now(),
      };
    }
  }
  return next;
}

async function reconcile(flow: ControlAuthFlow): Promise<ControlAuthFlow> {
  if (flow.state === "idle" || isTerminal(flow.state)) return flow;

  const events = await readEventLog();
  const next = applyEvents(flow, events);

  if (next.state !== "running") {
    // A rejected URL or a reported error leaves the loopback waiting; stop it.
    if (next.state === "failed") killGroup(next.pid, "SIGKILL");
    await persist(next);
    return next;
  }

  const started = flow.startedAt ? Date.parse(flow.startedAt) : Number.NaN;
  const limit = flow.action ? TIMEOUT_MS[flow.action] : TIMEOUT_MS.login;
  if (Number.isFinite(started) && Date.now() - started > limit) {
    killGroup(flow.pid, "SIGKILL");
    const timedOut: ControlAuthFlow = {
      ...next,
      state: "failed",
      authorizeUrl: null,
      message: "Account action timed out. Check status before trying again.",
      endedAt: now(),
    };
    await persist(timedOut);
    return timedOut;
  }

  let alive = false;
  if (flow.pid) {
    try {
      process.kill(flow.pid, 0);
      alive = true;
    } catch {
      /* The process already exited. */
    }
  }
  if (!alive) {
    const lost: ControlAuthFlow = {
      ...next,
      state: "failed",
      authorizeUrl: null,
      message: "The account action stopped before reporting a result. Check status and try again.",
      endedAt: now(),
    };
    await persist(lost);
    return lost;
  }

  if (next !== flow) await persist(next);
  return next;
}

async function reconcileDetached(pid: number | null): Promise<void> {
  const current = await readFlow();
  if (current.state === "running" && current.pid === pid) await reconcile(current);
}

export function getAuthFlow(): Promise<ControlAuthFlow> {
  return serialize(async () => reconcile(await readFlow()));
}

export function startAuthFlow(action: AuthAction, account = "default"): Promise<ControlAuthFlow> {
  return serialize(async () => {
    const current = await reconcile(await readFlow());
    if (current.state === "running") {
      throw new ControlError(
        `A ChatGPT ${current.action === "logout" ? "sign-out" : "sign-in"} is already in progress for ${current.account}.`,
        409,
      );
    }

    await fs.mkdir(stateDir(), { recursive: true, mode: 0o700 });
    await fs.rm(flowEventLogPath(), { force: true });
    await fs.rm(flowStderrPath(), { force: true });

    const argv = ["-m", "tesis", "auth", action, "--account", account, "--json-events"];
    if (action === "login") argv.push("--enable-plan-usage");

    const env = await tesisProcessEnv({ TESIS_ROOT: tesisRoot() });
    const out = openSync(flowEventLogPath(), "a", 0o600);
    const err = openSync(flowStderrPath(), "a", 0o600);

    let child: ChildProcess;
    try {
      child = spawn(tesisPython(), argv, {
        cwd: tesisRoot(),
        env,
        detached: true,
        stdio: ["ignore", out, err],
      });
    } finally {
      closeSync(out);
      closeSync(err);
    }

    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
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
          : `Unable to start ChatGPT account management: ${error.message}`,
        500,
      );
    }

    const flow: ControlAuthFlow = {
      state: "running",
      action,
      account,
      authorizeUrl: null,
      message: action === "login" ? "Starting browser sign-in…" : "Signing out and revoking the session…",
      startedAt: now(),
      endedAt: null,
      pid: child.pid ?? null,
      remoteRevoked: null,
      status: null,
    };
    await persist(flow);
    const pid = flow.pid ?? null;
    void exited.then(() => {
      const timer = setTimeout(() => {
        void serialize(() => reconcileDetached(pid)).catch(() => undefined);
      }, SPAWN_GRACE_MS);
      timer.unref?.();
    });
    child.unref();
    return flow;
  });
}

export function cancelAuthFlow(account = "default"): Promise<ControlAuthFlow> {
  return serialize(async () => {
    const flow = await reconcile(await readFlow());
    if (flow.state !== "running") throw new ControlError("No ChatGPT sign-in is in progress.", 409);
    if (flow.action !== "login") throw new ControlError("Only a ChatGPT sign-in can be canceled.", 409);
    if (flow.account !== account) {
      throw new ControlError(`The active sign-in belongs to ${flow.account}.`, 409);
    }
    killGroup(flow.pid, "SIGKILL");
    const cancelled: ControlAuthFlow = {
      ...flow,
      state: "cancelled",
      authorizeUrl: null,
      message: "Sign-in canceled. Check status if browser approval had already finished.",
      endedAt: now(),
    };
    await persist(cancelled);
    return cancelled;
  });
}
