import { isSafeId } from "@/lib/server/fs-util";
import { resolveCoordinate, RetrievalError } from "@/lib/server/resolve-run";
import { resultBundle } from "@/lib/server/result-bundle";
import { retrievalResponse } from "@/lib/server/api-response";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ executionId: string; runId: string }> }) {
  return retrievalResponse(async () => {
    const { executionId, runId } = await params;
    if (!isSafeId(executionId) || !isSafeId(runId)) throw new RetrievalError("Invalid execution ID", 400);
    const run = await resolveCoordinate(executionId, runId);
    if (!run) throw new RetrievalError("Coordinate detail unavailable or not a member of this matrix", 404);
    return resultBundle(run);
  });
}
