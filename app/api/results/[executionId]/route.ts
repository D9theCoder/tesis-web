import { isSafeId } from "@/lib/server/fs-util";
import { resolveRun, RetrievalError } from "@/lib/server/resolve-run";
import { resultBundle } from "@/lib/server/result-bundle";
import { retrievalResponse } from "@/lib/server/api-response";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ executionId: string }> }) {
  return retrievalResponse(async () => {
    const { executionId } = await params;
    if (!isSafeId(executionId)) throw new RetrievalError("Invalid execution ID", 400);
    const run = await resolveRun(executionId);
    if (!run) throw new RetrievalError("Result artifact not found", 404);
    return resultBundle(run);
  });
}
