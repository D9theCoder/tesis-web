import { NextResponse } from "next/server";
import fs from "node:fs";
import { readJsonlFrom, redact, isSafeId } from "@/lib/server/fs-util";
import { resolveRun } from "@/lib/server/resolve-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { executionId: string } },
): Promise<NextResponse> {
  const executionId = decodeURIComponent(params.executionId || "");
  if (!isSafeId(executionId)) {
    return NextResponse.json({ error: "invalid execution id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const cursorRaw = Number(url.searchParams.get("cursor") ?? "0");
  const cursor = Number.isFinite(cursorRaw) && cursorRaw >= 0 ? Math.floor(cursorRaw) : 0;

  const resolved = await resolveRun(executionId);
  if (!resolved) {
    return NextResponse.json(
      { error: "journal not found" },
      { status: 404 },
    );
  }

  // Prefer the new-format runtime.events.jsonl; fall back to the enriched
  // legacy events.jsonl written next to older single/matrix artifacts.
  let journal = resolved.journalPath ?? "";
  if (!journal || !fs.existsSync(journal)) {
    const legacy = resolved.artifactPaths
      .map((p) => p.replace(/\.json$/, ".events.jsonl"))
      .find((p) => fs.existsSync(p));
    if (legacy) journal = legacy;
  }
  if (!journal || !fs.existsSync(journal)) {
    return NextResponse.json({ error: "journal not found" }, { status: 404 });
  }

  const { events, nextCursor, skippedPartial } = await readJsonlFrom(journal, cursor);

  // Terminal status from descriptor when available.
  let status = "running";
  if (resolved.descriptorPath && fs.existsSync(resolved.descriptorPath)) {
    try {
      const desc = JSON.parse(fs.readFileSync(resolved.descriptorPath, "utf-8"));
      if (desc && typeof desc.status === "string") status = desc.status;
    } catch {
      /* ignore descriptor parse errors */
    }
  }

  const payload = redact({
    executionId,
    events,
    nextCursor,
    status,
    // A partial trailing line is intentionally not "more" data. It becomes
    // readable on the next poll only after its newline is written.
    hasMore: false,
  });
  return NextResponse.json(payload);
}
