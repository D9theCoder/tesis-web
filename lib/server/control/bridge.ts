import { spawn } from "node:child_process";

import { tesisRoot } from "@/lib/server/fs-util";
import { BRIDGE_TIMEOUT_MS, bridgeScriptPath, profileConfigPath, tesisPython } from "@/lib/server/control/paths";
import { tesisProcessEnv } from "@/lib/server/control/env";
import { ControlError } from "@/lib/server/control/errors";

/**
 * JSON-over-stdin bridge into the TESIS Python runtime.
 *
 * Short operations (schema, validation, save, discovery) call the bridge
 * synchronously; long experiments are started through the job runner instead.
 */

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/** The bridge always answers with one JSON object. */
export type BridgeResult = Record<string, unknown>;

export async function runBridge<T extends BridgeResult = BridgeResult>(
  command: string,
  payload: Record<string, unknown> = {},
  timeoutMs = BRIDGE_TIMEOUT_MS,
): Promise<T> {
  const env = await tesisProcessEnv({
    TESIS_ROOT: tesisRoot(),
    TESIS_WEB_CONFIG_PATH: profileConfigPath(),
  });

  return new Promise<T>((resolve, reject) => {
    const child = spawn(tesisPython(), [bridgeScriptPath(), command], {
      cwd: tesisRoot(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;

    const finish = (error: Error | null, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value as T);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new ControlError(`The TESIS bridge timed out after ${Math.round(timeoutMs / 1000)}s.`, 504));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new ControlError("The TESIS bridge produced too much output.", 502));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // Keep a bounded tail; tracebacks are useful, unbounded logs are not.
      stderr = (stderr + chunk.toString("utf8")).slice(-8192);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      const hint =
        error.code === "ENOENT"
          ? `Python interpreter not found at ${tesisPython()}. Set TESIS_PYTHON to the TESIS virtualenv interpreter.`
          : error.message;
      finish(new ControlError(`Unable to run the TESIS bridge: ${hint}`, 500));
    });
    child.on("close", (code) => {
      const text = Buffer.concat(stdout).toString("utf8").trim();
      let parsed: BridgeResult | null = null;
      try {
        parsed = text ? (JSON.parse(text) as BridgeResult) : null;
      } catch {
        parsed = null;
      }
      if (!parsed) {
        const detail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
        finish(
          new ControlError(
            `The TESIS bridge returned no JSON (exit ${code}).${detail ? ` ${detail}` : ""}`,
            502,
          ),
        );
        return;
      }
      if (parsed.ok === false) {
        finish(new ControlError(String(parsed.error ?? "The TESIS bridge rejected the request."), 422));
        return;
      }
      finish(null, parsed as T);
    });

    child.stdin.on("error", () => {
      /* The child closing early surfaces through exit handling. */
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
