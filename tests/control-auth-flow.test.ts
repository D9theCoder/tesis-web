import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cancelAuthFlow, getAuthFlow, startAuthFlow } from "@/lib/server/control/auth-flow";
import type { ControlAuthFlow } from "@/lib/control-contract";

/**
 * Auth-flow tests run against fake interpreters, so the real spawn/log/parse/
 * cancel path is exercised without contacting OpenAI or touching credentials.
 */

const LOGIN_SCRIPT = `#!/bin/sh
printf '%s\\n' "$@" > "$TESIS_WEB_STATE_DIR/login-argv.txt"
echo '{"event":"authorize","url":"https://auth.openai.com/oauth/authorize?state=abc&code_challenge=def"}'
sleep 0.2
echo '{"event":"complete","accounts":{"default":{"signed_in":true,"plan_usage":true,"email":"analyst@example.com","access_token":"sk-should-not-cross"}}}'
exit 0
`;

const UNSAFE_URL_SCRIPT = `#!/bin/sh
echo '{"event":"authorize","url":"http://auth.openai.com/oauth/authorize?state=abc"}'
sleep 30
`;

const LOGOUT_UNCONFIRMED_SCRIPT = `#!/bin/sh
echo '{"event":"signed_out","remote_revoked":false}'
exit 1
`;

const SLOW_LOGIN_SCRIPT = `#!/bin/sh
echo '{"event":"authorize","url":"https://auth.openai.com/oauth/authorize?state=slow"}'
sleep 30
`;

const NO_RESULT_SCRIPT = `#!/bin/sh
exit 1
`;

let root: string;
let stateDir: string;

async function writeScript(name: string, body: string): Promise<string> {
  const file = path.join(root, name);
  await fs.writeFile(file, body, { mode: 0o755 });
  return file;
}

async function waitForAuth(
  predicate: (flow: ControlAuthFlow) => boolean,
  timeoutMs = 8000,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const flow = await getAuthFlow();
    if (predicate(flow)) return flow;
    if (Date.now() > deadline) throw new Error(`auth flow stayed ${flow.state}: ${flow.message ?? ""}`);
    // The child is a real process; fake timers cannot advance its file writes,
    // so this integration test polls the platform clock.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

beforeAll(async () => {
  const base = path.join(process.cwd(), ".test-tmp");
  await fs.mkdir(base, { recursive: true });
  root = await fs.mkdtemp(path.join(base, "auth-"));
  stateDir = path.join(root, "state");
  process.env.TESIS_WEB_STATE_DIR = stateDir;
  process.env.TESIS_ROOT = path.join(root, "tesis");
  await fs.mkdir(process.env.TESIS_ROOT, { recursive: true });
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(stateDir, { recursive: true, force: true });
});

afterEach(async () => {
  try {
    const flow = await getAuthFlow();
    if (flow.state === "running" && flow.action === "login") await cancelAuthFlow();
  } catch {
    /* No flow to stop. */
  }
});

describe("ChatGPT auth flow", () => {
  it("starts idle without spawning the runtime", async () => {
    const flow = await getAuthFlow();
    expect(flow.state).toBe("idle");
    expect(flow.pid).toBeNull();
    expect(flow.authorizeUrl).toBeNull();
  });

  it("exposes the one-time URL and completes with a non-secret account status", async () => {
    process.env.TESIS_PYTHON = await writeScript("login.sh", LOGIN_SCRIPT);

    const started = await startAuthFlow("login");
    expect(started.state).toBe("running");
    expect(started.action).toBe("login");

    const authorizing = await waitForAuth((flow) => flow.authorizeUrl !== null);
    expect(authorizing.authorizeUrl).toBe("https://auth.openai.com/oauth/authorize?state=abc&code_challenge=def");

    const finished = await waitForAuth((flow) => flow.state === "succeeded");
    expect(finished.status).toEqual({
      signed_in: true,
      plan_usage: true,
      email: "analyst@example.com",
    });
    expect(finished.status).not.toHaveProperty("access_token");
    expect(finished.authorizeUrl).toBeNull();
    expect(finished.message).toMatch(/plan usage is enabled/);

    const argv = (await fs.readFile(path.join(stateDir, "login-argv.txt"), "utf8")).trim().split("\n");
    expect(argv).toContain("login");
    expect(argv).toContain("--json-events");
    expect(argv).toContain("--enable-plan-usage");
    expect(argv).toContain("--account");
    expect(argv).toContain("default");
  });

  it("rejects an authorization URL outside auth.openai.com", async () => {
    process.env.TESIS_PYTHON = await writeScript("unsafe.sh", UNSAFE_URL_SCRIPT);

    await startAuthFlow("login");
    const finished = await waitForAuth((flow) => flow.state === "failed");
    expect(finished.authorizeUrl).toBeNull();
    expect(finished.message).toMatch(/unsafe authorization URL/);
  });

  it("reports sign-out even when OpenAI does not confirm remote revocation", async () => {
    process.env.TESIS_PYTHON = await writeScript("logout.sh", LOGOUT_UNCONFIRMED_SCRIPT);

    const started = await startAuthFlow("logout");
    expect(started.action).toBe("logout");

    const finished = await waitForAuth((flow) => flow.state === "succeeded");
    expect(finished.remoteRevoked).toBe(false);
    expect(finished.message).toMatch(/signed out locally/);
    expect(finished.message).toMatch(/Remote revocation was not confirmed/);
  });

  it("cancels a sign-in and refuses a second concurrent action", async () => {
    process.env.TESIS_PYTHON = await writeScript("slow.sh", SLOW_LOGIN_SCRIPT);

    const started = await startAuthFlow("login");
    await waitForAuth((flow) => flow.authorizeUrl !== null);
    await expect(startAuthFlow("logout")).rejects.toThrow(/already in progress/);
    await expect(startAuthFlow("login")).rejects.toThrow(/already in progress/);

    const cancelled = await cancelAuthFlow();
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.authorizeUrl).toBeNull();
    expect(cancelled.message).toMatch(/canceled/);
    await expect(cancelAuthFlow()).rejects.toThrow(/No ChatGPT sign-in/);
    expect(started.pid).toBeTypeOf("number");
  });

  it("fails a sign-in that outlives the loopback window", async () => {
    process.env.TESIS_PYTHON = await writeScript("expired.sh", SLOW_LOGIN_SCRIPT);

    await startAuthFlow("login");
    await waitForAuth((flow) => flow.authorizeUrl !== null);

    const statePath = path.join(stateDir, "auth-flow.json");
    const persisted = JSON.parse(await fs.readFile(statePath, "utf8"));
    persisted.startedAt = new Date(Date.now() - 400_000).toISOString();
    await fs.writeFile(statePath, JSON.stringify(persisted), { mode: 0o600 });

    const failed = await getAuthFlow();
    expect(failed.state).toBe("failed");
    expect(failed.message).toMatch(/timed out/);
    expect(failed.authorizeUrl).toBeNull();
  });

  it("fails when the runtime exits without a result", async () => {
    process.env.TESIS_PYTHON = await writeScript("no-result.sh", NO_RESULT_SCRIPT);

    await startAuthFlow("logout");
    const finished = await waitForAuth((flow) => flow.state === "failed");
    expect(finished.message).toMatch(/stopped before reporting a result/);
  });
});
