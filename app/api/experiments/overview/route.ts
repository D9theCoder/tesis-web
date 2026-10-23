import { z } from "zod";
import { experimentOverview } from "@/lib/server/experiments";
import { retrievalResponse } from "@/lib/server/api-response";
import { RetrievalError } from "@/lib/server/resolve-run";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return retrievalResponse(async () => {
    const params = new URL(request.url).searchParams;
    const fresh = params.get("fresh") === "1";
    if (params.getAll("scope").length > 1 || params.getAll("previous").length > 1) throw new RetrievalError("Ambiguous repeated experiment scope", 400);
    const parsed = z.object({ scope: z.string().min(1).max(512).optional(), previous: z.string().min(1).max(512).optional() }).safeParse(Object.fromEntries(params));
    if (!parsed.success) throw new RetrievalError("Invalid experiment scope", 400);
    return experimentOverview(parsed.data.scope, parsed.data.previous, { fresh });
  });
}
