import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cancelJob, getJob, parseLastJson, resetJobRegistry, startJob } from "@/lib/server/control/jobs";

/**
 * Job supervisor tests run against a fake interpreter, so they exercise the
 * real spawn/log/parse/cancel machinery without touching TESIS or DVWA.
 */

const SUCCESS_SCRIPT = `#!/bin/sh
echo 'progress: starting' >&2
echo '{"status":"success","artifact_dir":"/tmp/artifact","execution_id":"exec-1","run_id":"run-1"}'
exit 0
`;

const FAILURE_SCRIPT = `#!/bin/sh
echo 'Traceback: boom' >&2
echo '{"status":"error","error":"provider auth failed"}'
exit 1
`;

const SLOW_SCRIPT = `#!/bin/sh
trap 'echo "cancelled" >&2; echo "{\\"status\\":\\"cancelled\\"}"; exit 0' INT
sleep 30 &
wait
`;

const HANG_SCRIPT = `#!/bin/sh
trap '' INT
sleep 30 &
wait
`;

let root: string;

async function writeScript(name: string, body: string): Promise<string> {
  const file = path.join(root, name);
  await fs.writeFile(file, body, { mode: 0o755 });
  return file;
}

function useInterpreter(file: string) {
  process.env.TESIS_PYTHON = file;
}

async function waitForTerminal(id: string, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob(id);
    if (["finished", "failed", "cancelled", "lost"].includes(job.status)) return job;
    if (Date.now() > deadline) throw new Error(`job ${id} stayed ${job.status}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

beforeAll(async () => {
  // Scripts live inside the workspace: some sandboxes mount /tmp noexec, which
  // would make spawn fail with ENOENT before the supervisor ever runs.
  const base = path.join(process.cwd(), ".test-tmp");
  await fs.mkdir(base, { recursive: true });
  root = await fs.mkdtemp(path.join(base, "jobs-"));
  process.env.TESIS_WEB_STATE_DIR = path.join(root, "state");
  // spawn runs with the checkout as cwd, so the directory must exist; an empty
  // one also proves the profile seed falls back when no config.yaml is present.
  process.env.TESIS_ROOT = path.join(root, "tesis");
  await fs.mkdir(process.env.TESIS_ROOT, { recursive: true });
  process.env.TESIS_CONTROL_ALLOW_CONCURRENT_RUNS = "1";
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  resetJobRegistry();
});

describe("parseLastJson", () => {
  it("finds the final JSON object in mixed output", () => {
    expect(parseLastJson('noise\n{"status":"success"}\nmore\n{"status":"cancelled"}')).toEqual({
      status: "cancelled",
    });
  });

  it("returns null when no JSON object is present", () => {
    expect(parseLastJson("plain text\n[1,2,3]")).toBeNull();
    expect(parseLastJson("")).toBeNull();
  });
});

describe("job supervisor", () => {
  it("records a finished run with its summary and log", async () => {
    useInterpreter(await writeScript("success.sh", SUCCESS_SCRIPT));
    const started = await startJob("run", "single");
    expect(started.status).toBe("running");
    expect(started.argv).toContain("--headless");
    expect(started.argv).toContain("single");

    const finished = await waitForTerminal(started.id);
    expect(finished.status).toBe("finished");
    expect(finished.exitCode).toBe(0);
    expect(finished.executionId).toBe("exec-1");
    expect(finished.runId).toBe("run-1");
    expect(finished.artifactDir).toBe("/tmp/artifact");
    expect(finished.result?.status).toBe("success");
  });

  it("marks a non-zero runtime failure as failed with its error", async () => {
    useInterpreter(await writeScript("failure.sh", FAILURE_SCRIPT));
    const started = await startJob("run", "matrix");
    const finished = await waitForTerminal(started.id);
    expect(finished.status).toBe("failed");
    expect(finished.error).toBe("provider auth failed");
    expect(finished.argv).toContain("matrix");
  });

  it("cancels a cooperative process with SIGINT", async () => {
    useInterpreter(await writeScript("slow.sh", SLOW_SCRIPT));
    const started = await startJob("run", "single");
    const cancelled = await cancelJob(started.id);
    expect(cancelled.status).toBe("cancelling");
    const finished = await waitForTerminal(started.id);
    expect(finished.status).toBe("cancelled");
    expect(finished.cancelRequestedAt).toBeTruthy();
  });

  it("escalates to SIGKILL when forced", async () => {
    useInterpreter(await writeScript("hang.sh", HANG_SCRIPT));
    const started = await startJob("run", "single");
    await cancelJob(started.id, true);
    const finished = await waitForTerminal(started.id);
    expect(finished.status).toBe("cancelled");
    expect(finished.signal).toBe("SIGKILL");
  }, 15000);

  it("refuses to cancel a finished job", async () => {
    useInterpreter(await writeScript("success2.sh", SUCCESS_SCRIPT));
    const started = await startJob("run", "single");
    await waitForTerminal(started.id);
    await expect(cancelJob(started.id)).rejects.toThrow(/already/);
  });

  it("rejects unknown job ids instead of touching the filesystem", async () => {
    await expect(getJob("../../etc/passwd")).rejects.toThrow(/Invalid job id/);
    await expect(getJob("does-not-exist")).rejects.toThrow(/Unknown job/);
  });
});
