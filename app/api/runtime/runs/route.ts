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
    const workspace = { identities: ordered.length, artifacts: ordered.filter(r => r.hasArtifact).length,
      active: ordered.filter(r => r.connection === "active").length, unavailable: ordered.filter(r => !r.hasArtifact).length,
      diagnostics: diagnostics.length + ordered.reduce((n,r) => n + (r.diagnostics?.length ?? 0),0),
      confirmed: ordered.filter(r => r.securityOutcome === "confirmed").length };
    const needle = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const filtered = ordered.filter(run =>
      (url.searchParams.get("artifacts") !== "available" || run.hasArtifact) &&
      (!needle || [run.executionId, run.provider, run.model, run.surface, run.securityLevel, run.experimentCondition, run.targetMethod].filter(Boolean).join(" ").toLowerCase().includes(needle)) &&
      (!url.searchParams.get("execution") || url.searchParams.get("execution") === "all" || (run.executionStatus ?? "unknown") === url.searchParams.get("execution")) &&
      (!url.searchParams.get("outcome") || url.searchParams.get("outcome") === "all" || (run.securityOutcome ?? "unknown") === url.searchParams.get("outcome")));
    if (url.searchParams.get("sort") === "oldest") filtered.sort((a,b) => {
      const left = Date.parse(a.startedAt ?? ""), right = Date.parse(b.startedAt ?? "");
      if (!Number.isFinite(left) && Number.isFinite(right)) return 1;
      if (Number.isFinite(left) && !Number.isFinite(right)) return -1;
      return (Number.isFinite(left) && Number.isFinite(right) ? left - right : 0) || a.executionId.localeCompare(b.executionId);
    });
    if (url.searchParams.get("sort") === "identity") filtered.sort((a,b) => a.executionId.localeCompare(b.executionId));
    const payload = runListResponseSchema.parse({ runs: filtered.slice(cursor, cursor + limit), active: ordered.filter(r => r.connection === "active"),
      tesisRoot: tesisRoot(), total: filtered.length, nextCursor: cursor + limit < filtered.length ? cursor + limit : null, diagnostics, workspace });
    return redact(payload);
  });
}
