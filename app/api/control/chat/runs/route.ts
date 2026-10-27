import { recentRuns } from "@/lib/server/chat/runs";
import { ControlError } from "@/lib/server/control/errors";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { controlResponse } from "@/lib/server/control/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) throw new ControlError("Cross-origin chat requests are not allowed.", 403);
    const params = new URL(req.url).searchParams;
    const raw = params.get("cursor") ?? "0";
    const query = params.get("q") ?? "";
    if ([...params.keys()].some((key) => key !== "cursor" && key !== "q") || params.getAll("cursor").length > 1 || params.getAll("q").length > 1 || !/^\d{1,6}$/.test(raw) || query.length > 512) throw new ControlError("Invalid run search.", 400);
    return recentRuns(Number(raw), query);
  });
}
