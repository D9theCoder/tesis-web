import { NextResponse } from "next/server";
import path from "node:path";
import {
  isSafeId,
  listDirectories,
  listFiles,
  readJson,
  redact,
  runsRoot,
  isExecutionJson,
  isMatrixAggregate,
} from "@/lib/server/fs-util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ArtifactHit {
  path: string;
  mode: "single-run" | "matrix";
  coordinateIndex?: number | null;
}

async function findArtifact(executionId: string): Promise<ArtifactHit | null> {
  const root = runsRoot();
  const hits: ArtifactHit[] = [];

  const aggregateName = `${executionId}.matrix.json`;
  const singleName = `${executionId}.json`;

  for (const top of await listDirectories(root)) {
    const topPath = path.join(root, top);
    for (const f of await listFiles(topPath)) {
      if (f === aggregateName) {
        hits.push({ path: path.join(topPath, f), mode: "matrix" });
      } else if (f === singleName) {
        hits.push({ path: path.join(topPath, f), mode: "single-run" });
      } else if (isMatrixAggregate(f) && f.startsWith(executionId)) {
        hits.push({ path: path.join(topPath, f), mode: "matrix" });
      } else if (isExecutionJson(f) && f.startsWith(executionId)) {
        hits.push({ path: path.join(topPath, f), mode: "single-run" });
      }
    }
    // Coordinate children under matrix dirs.
    for (const child of await listDirectories(topPath)) {
      const childPath = path.join(topPath, child);
      for (const f of await listFiles(childPath)) {
        if (isExecutionJson(f) && f.startsWith(executionId)) {
          const idx = /^run-(\d+)-/.exec(child);
          hits.push({
            path: path.join(childPath, f),
            mode: "single-run",
            coordinateIndex: idx ? Number(idx[1]) - 1 : null,
          });
        }
      }
    }
  }

  // Prefer matrix aggregates first (so the results page gets the full matrix),
  // then single runs.
  hits.sort((a, b) => {
    const rank = (h: ArtifactHit) => (h.mode === "matrix" ? 0 : h.coordinateIndex == null ? 1 : 2);
    return rank(a) - rank(b);
  });
  return hits[0] ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: { executionId: string } },
): Promise<NextResponse> {
  const executionId = decodeURIComponent(params.executionId || "");
  if (!isSafeId(executionId)) {
    return NextResponse.json({ error: "invalid execution id" }, { status: 400 });
  }
  const hit = await findArtifact(executionId);
  if (!hit) {
    return NextResponse.json({ error: "result artifact not found" }, { status: 404 });
  }
  const raw = await readJson<Record<string, unknown>>(hit.path);
  if (!raw) {
    return NextResponse.json({ error: "result artifact unreadable" }, { status: 422 });
  }
  const payload = redact({
    ...raw,
    mode: hit.mode,
  }) as Record<string, unknown>;
  return NextResponse.json(payload);
}
