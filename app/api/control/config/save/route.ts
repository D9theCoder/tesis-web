import { saveConfig } from "@/lib/server/control/config-store";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { controlSaveRequest } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Persist the web profile (atomically, validated) plus any staged API keys. */
export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const body = await readJsonBody(req, controlSaveRequest);
    const result = await saveConfig(body.yaml, body.secrets ?? {}, body.overrides ?? {}, body.apiProviderKeys ?? {});
    return { ...result, ok: undefined };
  });
}
