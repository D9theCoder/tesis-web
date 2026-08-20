import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Read-only filesystem adapter for the TESIS observer.
 *
 * Every route resolves paths strictly under TESIS_ROOT/results/runs (and the
 * TESIS_ROOT itself for the AKG/config reads) and rejects traversal. No route
 * ever writes to the Python repository. Responses are filtered through an
 * explicit secret-key allowlist/denylist before returning to the browser.
 */

export const DEFAULT_TESIS_ROOT = "/home/kevin/coding/tesis";

const SECRET_KEY_PARTS = new Set([
  "access_key", "access_token", "api_key", "apikey", "key", "auth", "auth_header",
  "authorization", "bearer", "client_secret", "cookie", "credential", "credentials",
  "dvwa_password", "id_token", "jwt", "passphrase", "passwd", "password",
  "private_key", "refresh_token", "secret", "session_cookie", "session_token",
  "token",
]);

const SECRET_PART_SUBSTRINGS = [
  "apikey", "authorization", "bearer", "credential", "password", "passwd",
  "secret", "token",
];

function normaliseKey(key: string): string {
  const k = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return k;
}

function isSecretKey(key: string): boolean {
  const n = normaliseKey(key);
  if (SECRET_KEY_PARTS.has(n)) return true;
  const parts = new Set(n.split("_"));
  for (const part of SECRET_PART_SUBSTRINGS) {
    if (part === "token" && parts.has("token") && !(parts.size === 1)) {
      // allow harmless token_count / total_tokens style keys
      const harmless = new Set(["token_count", "total_tokens", "tokens", "token_cost", "output_tokens", "input_tokens", "cache_read"]);
      if (harmless.has(n)) continue;
      return true;
    }
    if (parts.has(part) && part !== "token") return true;
  }
  if (n.endsWith("_key") || n.endsWith("_token") || n.endsWith("_password") || n.endsWith("_secret") || n.endsWith("_cookie")) {
    return true;
  }
  return false;
}

function safeTargetUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
  } catch {
    return value.split("?", 1)[0].split("#", 1)[0];
  }
}

/** Mask a value for a redacted response. Always replaces secret-keyed fields. */
export function redact(
  value: unknown,
  deep: boolean = true,
  knownSecrets: string[] = [],
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    let s = value;
    for (const secret of knownSecrets) {
      if (secret && secret.length >= 4) s = s.split(secret).join("[REDACTED]");
    }
    return s;
  }
  if (Array.isArray(value)) {
    return deep ? value.map((v) => redact(v, deep, knownSecrets)) : value;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isSecretKey(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      if (normaliseKey(k) === "target_url" && typeof v === "string") {
        out[k] = safeTargetUrl(v);
        continue;
      }
      out[k] = deep ? redact(v, deep, knownSecrets) : v;
    }
    return out;
  }
  return value;
}

export function tesisRoot(): string {
  const raw = process.env.TESIS_ROOT;
  if (raw && raw.trim()) return raw.trim();
  return DEFAULT_TESIS_ROOT;
}

export function runsRoot(): string {
  return path.join(tesisRoot(), "results", "runs");
}

export function relativeToTesisRoot(candidate: string): string {
  const relative = path.relative(tesisRoot(), candidate);
  return relative && !relative.startsWith("..") ? relative : ".";
}

export function resolveInside(base: string, candidate: string): string | null {
  const baseResolved = path.resolve(base);
  const full = path.resolve(baseResolved, candidate);
  if (full !== baseResolved && !full.startsWith(baseResolved + path.sep)) {
    return null;
  }
  return full;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T = Record<string, unknown>>(
  file: string,
): Promise<T | null> {
  try {
    const text = await fs.readFile(file, "utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function listFiles(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

export function isExecutionJson(name: string): boolean {
  return /^exec-[A-Za-z0-9-]+\.json$/.test(name) && !name.endsWith(".events.json");
}

export function isMatrixAggregate(name: string): boolean {
  return /^exec-[A-Za-z0-9-]+\.matrix\.json$/.test(name);
}

export function isRunCoordinateDir(name: string): boolean {
  return /^run-\d{3}-.*$/.test(name);
}

/** Count complete lines in a JSONL file (tolerating a trailing partial line). */
export async function countJsonlLines(file: string): Promise<number> {
  try {
    const stats = await fs.stat(file);
    if (stats.size === 0) return 0;
    const buffer = Buffer.alloc(Math.min(stats.size, 1_048_576));
    const fd = await fs.open(file, "r");
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
    await fd.close();
    const head = buffer.subarray(0, bytesRead).toString("utf-8");
    let count = 0;
    for (const ch of head) if (ch === "\n") count += 1;
    return count;
  } catch {
    return 0;
  }
}

/**
 * Read JSONL lines strictly after a byte `cursor`, ignoring an incomplete
 * final line until it is terminated by a newline. Returns parsed events,
 * the new cursor, and whether a trailing partial line was skipped.
 */
export async function readJsonlFrom(
  file: string,
  cursor: number,
): Promise<{ events: unknown[]; nextCursor: number; skippedPartial: boolean }> {
  const events: unknown[] = [];
  try {
    const stats = await fs.stat(file);
    const size = stats.size;
    if (size <= cursor) {
      return { events, nextCursor: size, skippedPartial: false };
    }
    const fd = await fs.open(file, "r");
    const buffer = Buffer.alloc(size - cursor);
    const { bytesRead } = await fd.read(buffer, 0, size - cursor, cursor);
    await fd.close();
    const chunk = buffer.subarray(0, bytesRead).toString("utf-8");
    const lines = chunk.split("\n");
    // The final element after splitting is "" when the last line was complete.
    const lastMayBePartial = lines[lines.length - 1] !== "";
    const completeLines = lines.slice(0, lastMayBePartial ? lines.length - 1 : lines.length);
    for (const line of completeLines) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip any malformed single line rather than aborting the read.
      }
    }
    let nextCursor = cursor;
    for (const line of completeLines) {
      nextCursor += Buffer.byteLength(line, "utf-8") + 1;
    }
    return { events, nextCursor, skippedPartial: lastMayBePartial };
  } catch {
    return { events, nextCursor: cursor, skippedPartial: false };
  }
}

/** Recursively scan results/runs for experiment directories (max depth 2). */
export async function collectRuns(): Promise<
  Array<{ dir: string; file: string; kind: "single" | "matrix" | "coordinate" }>
> {
  const root = runsRoot();
  const top = await listDirectories(root);
  const out: Array<{ dir: string; file: string; kind: "single" | "matrix" | "coordinate" }> = [];
  for (const topName of top) {
    const topPath = path.join(root, topName);
    // Matrix child directories hold run json; experiment dirs hold manifest + aggregate.
    const experimentFlag = await pathExists(path.join(topPath, "experiment.manifest.json"));
    const files = await listFiles(topPath);
    for (const f of files) {
      if (isMatrixAggregate(f)) {
        out.push({ dir: topPath, file: f, kind: "matrix" });
      } else if (isExecutionJson(f)) {
        out.push({
          dir: topPath,
          file: f,
          kind: experimentFlag ? "single" : "coordinate",
        });
        break;
      } else if (/\.json$/.test(f) && !f.endsWith(".events.json") && !f.includes("manifest")) {
        out.push({ dir: topPath, file: f, kind: "single" });
      }
    }
    if (experimentFlag) {
      // This is an experiment directory; matrix children live one level down.
      const children = await listDirectories(topPath);
      for (const child of children) {
        if (!isRunCoordinateDir(child)) continue;
        const childPath = path.join(topPath, child);
        const childFiles = await listFiles(childPath);
        for (const f of childFiles) {
          if (isExecutionJson(f)) {
            out.push({ dir: childPath, file: f, kind: "coordinate" });
            break;
          }
        }
      }
    }
  }
  return out;
}

export function isSafeId(value: string): boolean {
  if (!value || value.length < 3 || value.length > 200) return false;
  return /^[A-Za-z0-9._:-]+$/.test(value);
}

/** Serialize an error object to a stable string without leaking internals. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
