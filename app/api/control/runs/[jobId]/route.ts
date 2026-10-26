import { cancelJob, getJob } from "@/lib/server/control/jobs";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { controlResponse } from "@/lib/server/control/response";
import { redact } from "@/lib/server/fs-util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

/** One job, including its parsed runtime summary once it finishes. */
export async function GET(_req: Request, { params }: Context) {
  return controlResponse(async () => {
    const { jobId } = await params;
    return redact({ job: await getJob(jobId) });
  });
}

/**
 * Request cancellation of a running experiment.
 * The first request is graceful (SIGINT ⇒ cancellation token); `force=1`
 * escalates to SIGKILL for a stuck provider call.
 */
export async function DELETE(req: Request, { params }: Context) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const { jobId } = await params;
    const force = new URL(req.url).searchParams.get("force") === "1";
    const job = await cancelJob(jobId, force);
    return redact({ job });
  });
}
