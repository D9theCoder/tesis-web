import { readJsonlFrom, redact, isSafeId, collectSecrets } from "@/lib/server/fs-util";
import { resolveRun, summariseRun, RetrievalError } from "@/lib/server/resolve-run";
import { runEventSchema, eventCursorResponseSchema } from "@/lib/schemas";
import { eventExecutionId } from "@/lib/event-reducer";
import { retrievalResponse } from "@/lib/server/api-response";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{ executionId: string }> }) {
  return retrievalResponse(async () => {
    const { executionId } = await params;
    if (!isSafeId(executionId)) throw new RetrievalError("Invalid execution ID", 400);
    const url = new URL(req.url), cursor = Number(url.searchParams.get("cursor") ?? 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new RetrievalError("Invalid byte cursor", 400);
    const run = await resolveRun(executionId);
    if (!run) throw new RetrievalError("Run not found", 404);
    const summary = summariseRun(run);
    const page = run.journalPath ? await readJsonlFrom(run.journalPath, cursor, url.searchParams.get("journal")) :
      { events: [], nextCursor: 0, hasMore: false, reset: cursor > 0, journalIdentity: `missing:${executionId}`, diagnostics: ["journal_unavailable"] };
    const events = [];
    for (const raw of page.events) {
      const parsed = runEventSchema.safeParse(raw);
      if (!parsed.success) { page.diagnostics.push("event_schema_invalid"); continue; }
      const event = parsed.data;
      if (run.journalOwnerExecutionId !== run.executionId && !eventExecutionId(event)) { page.diagnostics.push("shared_journal_event_identity_missing"); continue; }
      if (run.journalOwnerExecutionId === run.executionId || eventExecutionId(event) === executionId) events.push(event);
    }
    return redact(eventCursorResponseSchema.parse({ ...page, executionId, events, status: summary.connection ?? summary.status,
      executionStatus: summary.executionStatus, securityOutcome: summary.securityOutcome,
      executionReason: summary.executionReason, securityOutcomeReason: summary.securityOutcomeReason }), true,
      [...collectSecrets(run.raw), ...collectSecrets(run.descriptor)]);
  });
}
