import { validateConfig } from "@/lib/server/control/config-store";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { controlValidateRequest } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Resolve a draft document exactly the way the headless runtime will. */
export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const body = await readJsonBody(req, controlValidateRequest);
    const result = await validateConfig(body.yaml, body.form, body.overrides ?? {});
    return { ...result, ok: undefined };
  });
}
