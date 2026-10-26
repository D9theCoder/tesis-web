import { discoverModels } from "@/lib/server/control/config-store";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { controlModelsRequest } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Fetch a provider model catalogue from an API endpoint (network call). */
export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const body = await readJsonBody(req, controlModelsRequest);
    const result = await discoverModels(body);
    return { ...result, ok: undefined };
  });
}
