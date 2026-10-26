import { readJobLog } from "@/lib/server/control/jobs";
import { controlResponse } from "@/lib/server/control/response";
import { redact } from "@/lib/server/fs-util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

/** Incremental tail of the runtime's redacted progress log. */
export async function GET(req: Request, { params }: Context) {
  return controlResponse(async () => {
    const { jobId } = await params;
    const raw = new URL(req.url).searchParams.get("offset") ?? "0";
    const offset = Number(raw);
    const log = await readJobLog(jobId, Number.isSafeInteger(offset) && offset >= 0 ? offset : 0);
    return redact(log);
  });
}
