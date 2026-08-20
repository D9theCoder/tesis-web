import { NextResponse } from "next/server";
import { readJson, redact, isSafeId } from "@/lib/server/fs-util";
import { resolveCoordinate } from "@/lib/server/resolve-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { executionId: string; runId: string } },
): Promise<NextResponse> {
  const executionId = decodeURIComponent(params.executionId || "");
  const runId = decodeURIComponent(params.runId || "");
  if (!isSafeId(executionId) || !isSafeId(runId)) {
    return NextResponse.json({ error: "invalid identifier" }, { status: 400 });
  }
  const resolved = await resolveCoordinate(executionId, runId);
  if (!resolved) {
    return NextResponse.json({ error: "coordinate not found" }, { status: 404 });
  }
  const raw = await readJson<Record<string, unknown>>(resolved.artifactPath);
  if (!raw) {
    return NextResponse.json({ error: "coordinate artifact unreadable" }, { status: 422 });
  }
  const payload = redact({ ...raw, mode: "single-run" });
  return NextResponse.json(payload);
}
