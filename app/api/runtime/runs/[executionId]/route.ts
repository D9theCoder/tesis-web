import { isSafeId, redact } from "@/lib/server/fs-util";
import { resolveRun, summariseRun, RetrievalError } from "@/lib/server/resolve-run";
import { runSummarySchema } from "@/lib/schemas";
import { retrievalResponse } from "@/lib/server/api-response";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ executionId: string }> }) {
  return retrievalResponse(async () => {
    const { executionId } = await params;
    if (!isSafeId(executionId)) throw new RetrievalError("Invalid execution ID", 400);
    const run = await resolveRun(executionId);
    if (!run) throw new RetrievalError("Run not found", 404);
    return redact(runSummarySchema.parse(summariseRun(run)));
  });
}
