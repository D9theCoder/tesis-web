import { controlReasoningRequest } from "@/lib/control-contract";
import { runBridge } from "@/lib/server/control/bridge";
import { ensureProfile } from "@/lib/server/control/config-store";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const body = await readJsonBody(req, controlReasoningRequest);
    await ensureProfile();
    return { ...await runBridge("reasoning", body, 45_000), ok: undefined };
  });
}
