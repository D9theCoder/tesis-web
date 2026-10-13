import path from "node:path";
import { readSource, isSafeId, redact } from "@/lib/server/fs-util";
import { AKG_SNAPSHOT } from "@/lib/akg-static";
import { resolveRun, RetrievalError } from "@/lib/server/resolve-run";
import { retrievalResponse } from "@/lib/server/api-response";
import { record } from "@/lib/artifact-contract";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return retrievalResponse(async () => {
    const executionId = new URL(req.url).searchParams.get("executionId");
    if (executionId && !isSafeId(executionId)) throw new RetrievalError("Invalid execution ID", 400);
    const run = executionId ? await resolveRun(executionId) : null;
    if (executionId && !run) throw new RetrievalError("Run not found", 404);
    if (run?.snapshotPath) {
      const source = await readSource(run.snapshotPath), raw = record(source.raw);
      if (Array.isArray(raw.nodes) && Array.isArray(raw.edges)) return redact({ ...raw, source: "captured", executionId,
        ownerExecutionId: run.snapshotOwnerExecutionId ?? run.executionId, sha256: source.sha256,
        sourcePath: `${source.root.id}/${path.relative(source.root.path, source.path)}` });
    }
    return { ...AKG_SNAPSHOT, source: "static", executionId, ownerExecutionId: null, diagnostics: ["captured_snapshot_unavailable; static fallback"] };
  });
}
