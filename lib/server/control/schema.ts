import { stat } from "node:fs/promises";

import { controlSchemaResponse, type ControlSchema } from "@/lib/control-contract";
import {
  ensureProfile,
  readSchema,
  type SchemaPayload,
} from "@/lib/server/control/config-store";
import { controlAvailability } from "@/lib/server/control/guard";
import { activeRun } from "@/lib/server/control/jobs";
import {
  profileConfigPath,
  profileEnvPath,
  sourceConfigPath,
} from "@/lib/server/control/paths";

/**
 * The one read of the settings schema, shared by the schema route and by the
 * server-rendered Control and Settings pages.
 *
 * The bridge starts the TESIS interpreter, so a read costs the better part of a
 * second. The payload only changes when one of the three documents it is
 * derived from changes, so it is memoised against their file fingerprints: a
 * save made here and an edit made in a terminal both move an mtime, and the
 * next read rebuilds. Concurrent readers share a single bridge call, so the two
 * pages (and React's double effects) never pay for it twice.
 *
 * `control` and `activeJob` are not cached: they are cheap, and they change
 * without touching any of those documents.
 */

let memo: { fingerprint: string; payload: SchemaPayload } | null = null;
let pending: { fingerprint: string; payload: Promise<SchemaPayload> } | null = null;

/** Identity of the documents the schema is derived from; changes on any write. */
async function fingerprint(): Promise<string> {
  const targets = [profileConfigPath(), profileEnvPath(), sourceConfigPath()];
  const stamps = await Promise.all(
    targets.map(async (target) => {
      try {
        const info = await stat(target);
        return `${info.mtimeMs}-${info.size}`;
      } catch {
        return "absent";
      }
    }),
  );
  return stamps.join("|");
}

function readOnce(key: string): Promise<SchemaPayload> {
  if (pending?.fingerprint === key) return pending.payload;
  const payload = readSchema().then((schema) => {
    memo = { fingerprint: key, payload: schema };
    return schema;
  });
  pending = { fingerprint: key, payload };
  const settle = () => {
    if (pending?.fingerprint === key) pending = null;
  };
  payload.then(settle, settle);
  return payload;
}

export async function loadControlSchema(): Promise<ControlSchema> {
  await ensureProfile();
  const key = await fingerprint();
  const payload = memo?.fingerprint === key ? memo.payload : await readOnce(key);
  return controlSchemaResponse.parse({
    ...payload,
    control: controlAvailability(),
    activeJob: await activeRun(),
  });
}
