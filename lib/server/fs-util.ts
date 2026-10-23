import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const DEFAULT_TESIS_ROOT = "/home/kevin/coding/tesis";
export type Root = { id: string; path: string };
export function tesisRoot() { return process.env.TESIS_ROOT?.trim() || DEFAULT_TESIS_ROOT; }
export function runsRoot() { return path.join(tesisRoot(), "results", "runs"); }
/** Named server-only roots. Never accept a root or path from an HTTP request. */
export function configuredRoots(name: string, defaults: Root[] = []): Root[] {
  if (!process.env[name]?.trim()) return defaults;
  const parsed: unknown = JSON.parse(process.env[name]!);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${name} must be a JSON object of root identifiers and absolute paths`);
  return Object.entries(parsed).map(([id, value]) => {
    if (!/^[A-Za-z0-9_.-]+$/.test(id) || typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`Invalid ${name} entry`);
    return { id, path: path.resolve(value) };
  });
}
export function artifactRoots() { return configuredRoots("TESIS_ARTIFACT_ROOTS", [{ id: "runs", path: runsRoot() }]); }
export function reviewRoots() { return configuredRoots("TESIS_REVIEW_ROOTS"); }
export function resolveInside(base: string, candidate: string): string | null {
  const full = path.resolve(base, candidate), relative = path.relative(path.resolve(base), full);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) ? full : null;
}
export async function realInside(base: string, candidate: string): Promise<string | null> {
  const lexical = resolveInside(base, candidate);
  if (!lexical) return null;
  try {
    const [root, full] = await Promise.all([fs.realpath(base), fs.realpath(lexical)]);
    return resolveInside(root, full);
  } catch { return null; }
}
export async function containedPath(candidate: string, roots = artifactRoots()): Promise<{ root: Root; path: string } | null> {
  for (const root of roots) {
    const full = await realInside(root.path, candidate);
    if (full) return { root, path: full };
  }
  return null;
}
const sourceCache = new Map<string, { identity: string; raw: unknown; sha256: string }>();
export async function readSource(file: string, roots = artifactRoots()) {
  const safe = await containedPath(file, roots);
  if (!safe) throw new Error("Source is missing or outside configured roots");
  const stat = await fs.stat(safe.path, { bigint: true });
  const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  let source = sourceCache.get(safe.path);
  if (!source || source.identity !== identity) {
    const bytes = await fs.readFile(safe.path);
    source = { identity, raw: JSON.parse(bytes.toString("utf8")) as unknown, sha256: createHash("sha256").update(bytes).digest("hex") };
    if (sourceCache.size >= 20000) sourceCache.delete(sourceCache.keys().next().value!);
    sourceCache.set(safe.path, source);
  }
  return { raw: source.raw, sha256: source.sha256, path: safe.path, root: safe.root };
}
export async function readJson<T = Record<string, unknown>>(file: string, roots = artifactRoots()): Promise<T | null> {
  try { return (await readSource(file, roots)).raw as T; } catch { return null; }
}
export async function pathExists(file: string) { return (await containedPath(file)) !== null; }
export async function listFiles(dir: string) {
  try { return (await fs.readdir(dir, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name).sort(); } catch { return []; }
}
export async function listDirectories(dir: string) {
  try { return (await fs.readdir(dir, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch { return []; }
}
export function relativeToTesisRoot(candidate: string) { return path.relative(tesisRoot(), candidate); }
export function isSafeId(value: string) { return value.length >= 3 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value); }

const SAFE_KEYS = /(?:^|_)(?:id|ids|sha256|hash|fingerprint|count|counts|tokens|cost|cost_per_success|budget|usage|available|availability|unavailable_reason|unavailable_reasons|limit|max_tokens|token_count|token_cost)$/i;
export function isSecretKey(key: string) {
  const n = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
  if (["password_hash", "passwd_hash", "phpsessid", "sessionid", "session_id"].includes(n)) return true;
  if (SAFE_KEYS.test(n)) return false;
  return /^(?:key|token|auth|credential|credentials)$|(?:^|_)(?:api_key|apikey|access_key|password|passwd|passphrase|secret|private_key|authorization|cookie|session_cookie|session_token|access_token|refresh_token|id_token|jwt|bearer)(?:_|$)/i.test(n);
}
export function collectSecrets(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach(v => collectSecrets(v, out));
  else if (value && typeof value === "object") for (const [key, v] of Object.entries(value)) {
    if (isSecretKey(key) && typeof v === "string" && v.length >= 4 && v !== "[REDACTED]") out.add(v);
    else collectSecrets(v, out);
  }
  return out;
}
export function redact(value: unknown, deep = true, knownSecrets: string[] = []): unknown {
  const secrets = [...new Set([...knownSecrets, ...collectSecrets(value)])];
  const visit = (v: unknown, key = ""): unknown => {
    if (typeof v === "string") {
      let s = v;
      for (const secret of secrets) s = s.split(secret).join("[REDACTED]");
      s = s.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/._~=-]+/gi, "$1 [REDACTED]")
        .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
        .replace(/((?:api[_-]?key|password|passwd|access_token|session_token|token|PHPSESSID)\s*[=:]\s*)[^\s&;,"'<>]+/gi, "$1[REDACTED]")
        .replace(/(Cookie|Set-Cookie|Authorization)\s*:[^\r\n]+/gi, "$1: [REDACTED]")
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@");
      if (/(?:target_url|endpoint|url)$/.test(key)) {
        try { const u = new URL(s); u.username = ""; u.password = ""; u.search = ""; u.hash = ""; s = u.toString(); } catch { /* non-URL reference */ }
      }
      return s;
    }
    if (Array.isArray(v)) return deep ? v.map(item => visit(item)) : v;
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, item]) =>
      [k, isSecretKey(k) ? "[REDACTED]" : deep ? visit(item, k) : item]));
    return v;
  };
  return visit(value);
}

const sourceSecrets = new WeakMap<object, string[]>();
/** Parsed sources are immutable between file changes, so their secret set is stable too. */
export function cachedSourceSecrets(value: unknown) {
  if (!value || typeof value !== "object") return [...collectSecrets(value)];
  let secrets = sourceSecrets.get(value);
  if (!secrets) { secrets = [...collectSecrets(value)]; sourceSecrets.set(value, secrets); }
  return secrets;
}

export async function readJsonlFrom(file: string, cursor: number, previousIdentity?: string | null,
  limits = { bytes: 524288, events: 500 }) {
  const events: unknown[] = [], diagnostics: string[] = [];
  let nextCursor = cursor, journalIdentity = "", reset = false, hasMore = false, skippedPartial = false;
  let handle;
  try {
    const safe = await containedPath(file);
    if (!safe) throw new Error("journal_unavailable_or_outside_roots");
    handle = await fs.open(safe.path, "r");
    const stat = await handle.stat();
    const head = Buffer.alloc(Math.min(256, stat.size));
    await handle.read(head, 0, head.length, 0);
    // Prefix ends at the first newline: append does not change an existing identity.
    const newline = head.indexOf(10);
    const prefix = newline >= 0 ? head.subarray(0, newline + 1) : head.length === 256 ? head : Buffer.alloc(0);
    journalIdentity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${createHash("sha256").update(prefix).digest("hex")}`;
    const [previousFile, previousOffset, previousAnchor] = (previousIdentity ?? "").split("|");
    const anchorAt = async (offset: number) => {
      const bytes = Buffer.alloc(Math.min(128, offset));
      await handle!.read(bytes, 0, bytes.length, offset - bytes.length);
      return createHash("sha256").update(bytes).digest("hex");
    };
    reset = cursor > stat.size || (!!previousIdentity && previousFile !== journalIdentity);
    if (!reset && previousAnchor && Number(previousOffset) === cursor) reset = await anchorAt(cursor) !== previousAnchor;
    if (reset) nextCursor = 0;
    if (nextCursor < stat.size) {
      const buffer = Buffer.alloc(Math.min(limits.bytes, stat.size - nextCursor));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, nextCursor);
      let start = 0, lines = 0;
      for (let i = 0; i < bytesRead && lines < limits.events; i++) {
        if (buffer[i] !== 10) continue;
        const line = buffer.subarray(start, i).toString("utf8");
        start = i + 1; lines++;
        if (line.trim()) try { events.push(JSON.parse(line)); } catch { diagnostics.push(`malformed_line_at_byte:${nextCursor + start - Buffer.byteLength(line) - 1}`); }
      }
      nextCursor += start;
      skippedPartial = start < bytesRead;
      hasMore = start > 0 && nextCursor < stat.size && (lines >= limits.events || bytesRead === limits.bytes);
      if (!start && bytesRead === limits.bytes) {
        diagnostics.push(`journal_line_exceeds_byte_limit_at_byte:${nextCursor}`);
        // Discard a complete oversized record using the same bounded buffer.
        // Keep an unterminated record's cursor until the writer completes it.
        let position = nextCursor + bytesRead;
        while (position < stat.size) {
          const chunk = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - position), position);
          if (!chunk.bytesRead) break;
          const end = buffer.subarray(0, chunk.bytesRead).indexOf(10);
          if (end >= 0) {
            nextCursor = position + end + 1;
            skippedPartial = false;
            hasMore = nextCursor < stat.size;
            break;
          }
          position += chunk.bytesRead;
        }
      }
    }
    journalIdentity += `|${nextCursor}|${await anchorAt(nextCursor)}`;
  } catch { diagnostics.push("journal_read_failed"); }
  finally { await handle?.close(); }
  return { events, nextCursor, skippedPartial, journalIdentity, reset, hasMore, diagnostics };
}
