"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, RefreshCw } from "lucide-react";
import { fetchRuns } from "@/lib/api-client";
import type { RunSummary } from "@/lib/schemas";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui/primitives";
import { RunCatalog } from "@/components/run-catalog";

export function CatalogPage({ overview = false }: { overview?: boolean }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [total, setTotal] = useState<number | undefined>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const load = useCallback((nextCursor = 0) => {
    const id = ++epoch.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return fetchRuns(controller.signal, nextCursor).then(result => {
      if (id !== epoch.current || controller.signal.aborted) return;
      setRuns(previous => nextCursor === 0 ? result.runs : [...new Map([...previous, ...result.runs].map(run => [run.executionId, run])).values()]);
      setCursor(result.nextCursor ?? null);
      setTotal(result.total);
      setError(null);
    }).catch(cause => {
      if (id === epoch.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the run catalog.");
    }).finally(() => {
      if (id === epoch.current && !controller.signal.aborted) setBusy(false);
    });
  }, []);
  const cancel = useCallback(() => { epoch.current++; request.current?.abort(); }, []);
  useEffect(() => { void load(); return cancel; }, [load, cancel]);
  const refresh = () => { setBusy(true); void load(); };
  const initialLoading = busy && runs.length === 0;
  const unavailable = runs.length === 0 && (busy || error !== null);
  const counts = [
    ["Loaded executions", runs.length], ["Active journals", runs.filter(run => run.connection === "active").length],
    ["Completed executions", runs.filter(run => run.executionStatus === "completed").length], ["Available artifacts", runs.filter(run => run.hasArtifact).length],
  ] as const;
  return <div>
    <header className="page-header"><div><h1 className="page-title">{overview ? "Workspace overview" : "Experiment results"}</h1><p className="page-description">{overview ? "A read-only view of your experiment workspace. Open the live monitor to follow the current run." : "Find an execution, compare its coordinates, and inspect the evidence behind its results."}</p></div><div className="page-actions"><Button onClick={refresh} disabled={busy}><RefreshCw size={15} />{busy ? "Loading…" : "Refresh catalog"}</Button><Link href="/" className="ui-button ui-button-primary"><Activity size={15} /> Live monitor</Link></div></header>
    {error && <div className="notice notice-error mb-5" role="alert">{error} <Button variant="ghost" onClick={refresh} disabled={busy}>Retry</Button></div>}
    {overview && <><div className="summary-grid">{counts.map(([label, value]) => <div key={label} className="summary-item"><span>{label}</span><strong>{unavailable ? "—" : value}</strong></div>)}</div><p className="helper-copy mb-5">Counts reflect the loaded catalog only. Execution completion and a confirmed security finding are independent outcomes.</p></>}
    <Card aria-busy={busy}><CardHeader><CardTitle>{overview ? "Recent executions" : "Run catalog"}</CardTitle><span className="helper-copy">{initialLoading ? "Loading catalog…" : unavailable ? "Unavailable" : `${runs.length} loaded${total !== undefined ? ` of ${total}` : ""}`}</span></CardHeader>
      {initialLoading ? <div className="catalog-skeleton" role="status" aria-label="Loading run catalog"><span /><span /><span /><span /></div> : unavailable ? <div className="empty-state"><h2>Run catalog unavailable</h2><p>Retry loading the catalog to see your executions.</p></div> : <RunCatalog runs={runs} />}
      {cursor !== null && <div className="table-footer"><span>Load another page to extend your search.</span><Button onClick={() => { setBusy(true); void load(cursor); }} disabled={busy}>{busy ? "Loading…" : "Load older runs"}</Button></div>}
    </Card>
  </div>;
}
