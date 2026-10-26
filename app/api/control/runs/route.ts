import { ControlError } from "@/lib/server/control/errors";
import { saveConfig } from "@/lib/server/control/config-store";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { activeRun, listJobs, startJob } from "@/lib/server/control/jobs";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { redact } from "@/lib/server/fs-util";
import { controlStartRequest } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Recent supervised jobs, newest first. */
export async function GET(req: Request) {
  return controlResponse(async () => {
    const raw = new URL(req.url).searchParams.get("limit") ?? "25";
    const limit = Number(raw);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ControlError("Invalid limit (1–100).", 400);
    }
    const jobs = await listJobs(limit);
    return redact({ jobs, active: await activeRun() });
  });
}

/**
 * Start a single run or a matrix.
 *
 * A reviewed draft is saved first so the exact document under review is the
 * document the runtime resolves — the same freeze-then-start ordering the TUI
 * uses, except the profile is persisted rather than held in memory.
 */
export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const body = await readJsonBody(req, controlStartRequest);
    if (body.yaml) {
      const result = await saveConfig(body.yaml, body.secrets ?? {}, body.overrides ?? {}, body.apiProviderKeys ?? {});
      if (!result.saved) {
        throw new ControlError(result.error ?? "The configuration could not be saved.", 422);
      }
    }
    const job = await startJob("run", body.mode);
    return redact({ job, saved: Boolean(body.yaml) });
  });
}
