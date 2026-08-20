import { NextResponse } from "next/server";
import { redact, isSafeId } from "@/lib/server/fs-util";
import { relativeToTesisRoot } from "@/lib/server/fs-util";
import { resolveRun } from "@/lib/server/resolve-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { executionId: string } },
): Promise<NextResponse> {
  const executionId = decodeURIComponent(params.executionId || "");
  if (!isSafeId(executionId)) {
    return NextResponse.json({ error: "invalid execution id" }, { status: 400 });
  }
  const resolved = await resolveRun(executionId);
  if (!resolved) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  const payload = redact({
    executionId,
    directory: relativeToTesisRoot(resolved.dir),
    hasDescriptor: !!resolved.descriptorPath,
    hasJournal: !!resolved.journalPath,
    hasManifest: !!resolved.manifestPath,
    artifactCount: resolved.artifactPaths.length,
  });
  return NextResponse.json(payload);
}
