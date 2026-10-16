"use client";

import { useEffect, useRef, useState } from "react";
import { fetchEvents } from "@/lib/api-client";
import { eventExecutionId } from "@/lib/event-reducer";
import type { EventCursorResponse, RunEvent } from "@/lib/schemas";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui/primitives";
import { fmtClock } from "@/lib/formatters";

export function ActivityTimeline({ executionId, simulationEvents }: { executionId: string | null; simulationEvents?: RunEvent[] }) {
  const [response, setResponse] = useState<EventCursorResponse | null>(null);
  const [cursors, setCursors] = useState([0]);
  const [batch, setBatch] = useState(0);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const journal = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!executionId || simulationEvents) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A new journal request must expose its loading state, including automatic refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    fetchEvents(executionId, cursors[batch], controller.signal, journal.current).then(result => {
      if (!controller.signal.aborted) {
        journal.current = result.journalIdentity ?? null;
        if (result.reset && batch > 0) { setCursors([0]); setBatch(0); setPage(0); }
        setResponse(result); setError(null);
        if (!result.hasMore) timer = setTimeout(() => setRefresh(value => value + 1), 4000);
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Activity unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [executionId, simulationEvents, batch, cursors, refresh]);
  const events = simulationEvents ?? response?.events ?? [];
  const localPages = Math.max(1, Math.ceil(events.length / 25));
  const current = Math.min(page, localPages - 1);
  const next = () => {
    if (current + 1 < localPages) setPage(current + 1);
    else if (response?.hasMore) {
      setCursors(previous => [...previous.slice(0, batch + 1), response.nextCursor]);
      setResponse(null); setBusy(true); setBatch(batch + 1); setPage(0);
    }
  };
  return <Card className="activity-timeline" aria-busy={busy}>
    <CardHeader><div><CardTitle>Experiment activity</CardTitle><p className="helper-copy">Recorded steps, oldest first. Events are observations, not inferred progress.</p></div>
      {!simulationEvents && <Button disabled={!executionId || busy} onClick={() => setRefresh(value => value + 1)}>Refresh activity</Button>}
    </CardHeader>
    {!executionId ? <p className="empty-state">Select an execution to inspect its recorded steps.</p> : <>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      {response?.diagnostics?.map(item => <p key={item} className="notice">{item}</p>)}
      <div className="table-footer"><span>Journal batch {batch + 1} · page {current + 1} of {localPages}{busy ? " · Loading…" : ""}</span><div className="table-actions">
        <Button disabled={busy || (batch === 0 && current === 0)} onClick={() => { if (current > 0) setPage(current - 1); else { setResponse(null); setBusy(true); setBatch(batch - 1); setPage(19); } }}>Previous steps</Button>
        <Button disabled={busy || (current + 1 >= localPages && !response?.hasMore)} onClick={next}>Next steps</Button>
      </div></div>
      <ol className="activity-list" start={current * 25 + 1}>{events.slice(current * 25, (current + 1) * 25).map((event, index) => <li key={`${response?.nextCursor}-${current}-${index}`}>
        <time>{event.timestamp ? fmtClock(event.timestamp) : "Time unavailable"}</time>
        <div><strong>{event.event_type.replaceAll(".", " · ")}</strong><p>{event.message ?? "No event message recorded"}</p>
          <small>Execution <code>{eventExecutionId(event) ?? executionId}</code>{event.node && <> · Node {event.node}</>}{event.method && <> · Method {event.method}</>}</small>
          <details><summary>Inspect recorded evidence</summary><pre>{JSON.stringify(event.data ?? {}, null, 2)}</pre></details>
        </div>
      </li>)}</ol>
      {!events.length && <p className="empty-state">{busy ? "Loading recorded activity…" : "No events recorded in this journal page."}</p>}
    </>}
  </Card>;
}
