import { NextResponse } from "next/server";
import path from "node:path";
import { readJson, runsRoot, tesisRoot } from "@/lib/server/fs-util";
import { AKG_SNAPSHOT } from "@/lib/akg-static";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  // Prefer a snapshot shipped with the selected run directory; otherwise fall
  // back to the static checked-in snapshot mirroring core/knowledge_graph.py.
  const direct = path.join(tesisRoot(), "akg_snapshot.json");
  const embedded = await readJson<Record<string, unknown>>(direct);
  if (embedded && Array.isArray(embedded.nodes) && Array.isArray(embedded.edges)) {
    return NextResponse.json({ ...embedded, source: embedded.schema_version ? "run" : "static" });
  }
  // Look inside results/runs experiment dirs for a checked-in snapshot.
  const root = runsRoot();
  const { listDirectories, listFiles } = await import("@/lib/server/fs-util");
  for (const top of await listDirectories(root)) {
    const topPath = path.join(root, top);
    for (const f of await listFiles(topPath)) {
      if (f === "akg.snapshot.json" || f === "akg_snapshot.json" || f === "akg.json") {
        const s = await readJson<Record<string, unknown>>(path.join(topPath, f));
        if (s && Array.isArray(s.nodes) && Array.isArray(s.edges)) {
          return NextResponse.json({ ...s, source: "run" });
        }
      }
    }
  }
  return NextResponse.json({ ...AKG_SNAPSHOT, source: "static" });
}
