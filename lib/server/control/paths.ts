import path from "node:path";

import { tesisRoot } from "@/lib/server/fs-util";

/**
 * Server-side paths for the TESIS web control plane.
 *
 * The web never writes into the TESIS checkout: edited settings live in a
 * web-owned profile that is passed to the runtime with `--config`. Artifacts
 * still land under `TESIS_ROOT/results` because the runtime resolves its
 * relative `output_dir` against the checkout it runs from.
 */

/** Repository root of this Next.js app; route handlers run with it as cwd. */
export function appRoot(): string {
  return process.cwd();
}

/** Bridge script executed by the TESIS interpreter. */
export function bridgeScriptPath(): string {
  return path.join(appRoot(), "scripts", "tesis_bridge.py");
}

/**
 * Web-owned state: the settings profile and job registry.
 * Configurable so tests and multiple checkouts do not share a queue.
 */
export function stateDir(): string {
  const configured = process.env.TESIS_WEB_STATE_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(appRoot(), ".tesis-web");
}

export function profileConfigPath(): string {
  return path.join(stateDir(), "config.yaml");
}

/** The TESIS checkout document the web profile was seeded from. */
export function sourceConfigPath(): string {
  return path.join(tesisRoot(), "config.yaml");
}

export function jobsDir(): string {
  return path.join(stateDir(), "jobs");
}

export function profileEnvPath(): string {
  return path.join(stateDir(), ".env");
}

/** Interpreter that can import the TESIS package. */
export function tesisPython(): string {
  const configured = process.env.TESIS_PYTHON?.trim();
  if (configured) return configured;
  return path.join(tesisRoot(), ".venv", "bin", "python");
}

/** Hard ceiling for short bridge calls such as schema and validation. */
export const BRIDGE_TIMEOUT_MS = 60_000;
