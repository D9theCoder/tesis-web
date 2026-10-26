import { promises as fs } from "node:fs";

import { tesisRoot } from "@/lib/server/fs-util";
import { profileEnvPath } from "@/lib/server/control/paths";

/**
 * Environment handling for spawned TESIS processes.
 *
 * Provider keys stay where TESIS already keeps them: the checkout `.env` for
 * existing `${VAR}` placeholders, and the web profile `.env` for keys entered
 * through this UI. Neither file is ever returned to the browser.
 */

const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

/** Minimal dotenv reader: no interpolation, quotes stripped, comments ignored. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = ENV_LINE.exec(rawLine);
    if (!match) continue;
    const [, name, rawValue] = match;
    let value = rawValue.trim();
    const quoted = /^(['"])(.*)\1$/s.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "").trim();
    values[name] = value;
  }
  return values;
}

async function readEnvFile(file: string): Promise<Record<string, string>> {
  try {
    return parseEnvFile(await fs.readFile(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Process environment, then the checkout `.env`, then the web profile `.env`.
 *
 * Later files only fill in names the earlier layers did not define, so an
 * operator's explicit shell override keeps winning, matching the loader's
 * `override=False` dotenv behaviour.
 */
export async function tesisProcessEnv(extra: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  const merged: NodeJS.ProcessEnv = { ...process.env };
  const checkout = await readEnvFile(`${tesisRoot()}/.env`);
  const profile = await readEnvFile(profileEnvPath());
  for (const layer of [checkout, profile]) {
    for (const [name, value] of Object.entries(layer)) {
      if (merged[name] === undefined) merged[name] = value;
    }
  }
  merged.PYTHONUNBUFFERED = "1";
  merged.TESIS_ROOT = tesisRoot();
  return { ...merged, ...extra };
}
