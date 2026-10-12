import { redact, tesisRoot } from "@/lib/server/fs-util";
import { getCatalog, summariseRun, uniqueRun, RetrievalError } from "@/lib/server/resolve-run";
import { runListResponseSchema } from "@/lib/schemas";
import { retrievalResponse } from "@/lib/server/api-response";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return retrievalResponse(async () => {
    const url = new URL(req.url), cursor = Number(url.searchParams.get("cursor") ?? 0), limit = Number(url.searchParams.get("limit") ?? 100);
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new RetrievalError("Invalid pagination (limit 1–200)", 400);
    const catalog = await getCatalog(), diagnostics = [...catalog.diagnostics];
    const ordered = [...catalog.runs.keys()].map(id => {
      try { return summariseRun(uniqueRun(catalog, id)!); }
      catch { const run = summariseRun(catalog.runs.get(id)![0]); return { ...run, hasArtifact: false, hasJournal: false, diagnostics: [...run.diagnostics ?? [], "ambiguous_execution_identity"] }; }
    }).sort((a,b) => (Date.parse(b.startedAt ?? "") || 0) - (Date.parse(a.startedAt ?? "") || 0) || a.executionId.localeCompare(b.executionId));
    const payload = runListResponseSchema.parse({ runs: ordered.slice(cursor, cursor + limit), active: ordered.filter(r => r.connection === "active"),
      tesisRoot: tesisRoot(), total: ordered.length, nextCursor: cursor + limit < ordered.length ? cursor + limit : null, diagnostics });
    return redact(payload);
  });
}
