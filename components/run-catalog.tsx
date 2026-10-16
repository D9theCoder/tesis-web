"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ExternalLink, Search } from "lucide-react";
import type { RunSummary } from "@/lib/schemas";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtIsoFromStr } from "@/lib/formatters";

function readable(value: string) { return value.replace(/_/g, " "); }

export function RunCatalog({ runs, selected, onPick, onFiltersChange }: {
  runs: RunSummary[]; selected?: string | null; onPick?: (run: RunSummary) => void;
  onFiltersChange?: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [execution, setExecution] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    onFiltersChange?.(new URLSearchParams({ q: query, execution, outcome, sort }).toString());
  }, [query, execution, outcome, sort, onFiltersChange]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter(run => (!needle || [run.executionId, run.provider, run.model, run.surface, run.securityLevel, run.experimentCondition, run.targetMethod].filter(Boolean).join(" ").toLowerCase().includes(needle))
      && (execution === "all" || (run.executionStatus ?? "unknown") === execution)
      && (outcome === "all" || (run.securityOutcome ?? "unknown") === outcome)).sort((a, b) => {
        if (sort === "identity") return a.executionId.localeCompare(b.executionId);
        const aTime = a.startedAt ? Date.parse(a.startedAt) : NaN;
        const bTime = b.startedAt ? Date.parse(b.startedAt) : NaN;
        if (!Number.isFinite(aTime) && Number.isFinite(bTime)) return 1;
        if (Number.isFinite(aTime) && !Number.isFinite(bTime)) return -1;
        return (Number.isFinite(aTime) && Number.isFinite(bTime) ? (sort === "oldest" ? aTime - bTime : bTime - aTime) : 0) || a.executionId.localeCompare(b.executionId);
      });
  }, [runs, query, execution, outcome, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * 25, (current + 1) * 25);
  const reset = () => { setQuery(""); setExecution("all"); setOutcome("all"); setSort("newest"); setPage(0); };
  return <div className={`run-catalog ${compact ? "density-compact" : "density-comfortable"}`}>
    <div className="filter-bar">
      <label className="field search-field"><span>{onFiltersChange ? "Search workspace" : "Search loaded runs"}</span><span className="search-control"><Search size={16} /><input className="form-control" type="search" placeholder="Execution, model, method…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></span></label>
      <label className="field"><span>Execution</span><select className="form-control" value={execution} onChange={event => { setExecution(event.target.value); setPage(0); }}><option value="all">All executions</option>{["completed", "failed", "interrupted", "unknown"].map(value => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
      <label className="field"><span>Security outcome</span><select className="form-control" value={outcome} onChange={event => { setOutcome(event.target.value); setPage(0); }}><option value="all">All outcomes</option>{["confirmed", "no_finding", "unconfirmed", "fixture_limited", "unknown"].map(value => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
      <label className="field"><span>Sort</span><select className="form-control" value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="identity">Execution ID</option></select></label>
      <Button variant="ghost" onClick={reset}>Reset filters</Button>
      <Button variant="outline" aria-pressed={compact} onClick={() => setCompact(!compact)}><ArrowUpDown size={14} /> {compact ? "Compact" : "Comfortable"}</Button>
    </div>
    <div className="table-container"><table role="table" className="data-table run-table" aria-label="Run catalog">
      <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Execution</th><th scope="col" role="columnheader">Condition</th><th scope="col" role="columnheader">Provider / model</th><th scope="col" role="columnheader">Execution status</th><th scope="col" role="columnheader">Security outcome</th><th scope="col" role="columnheader">Started</th><th scope="col" role="columnheader">Inspect</th></tr></thead>
      <tbody role="rowgroup">{visible.map(run => <tr role="row" key={run.executionId} className={selected === run.executionId ? "selected" : undefined}>
        <td role="cell"><span className="catalog-cell-label" aria-hidden="true">Execution</span>{onPick ? <button className="catalog-identity" onClick={() => onPick(run)} aria-label={`Monitor ${run.executionId}`}>{run.executionId}</button> : <Link className="catalog-identity" href={run.hasArtifact ? `/results/${encodeURIComponent(run.executionId)}` : `/?execution=${encodeURIComponent(run.executionId)}`}>{run.executionId}</Link>}<div className="table-secondary">{run.mode}{run.connection === "active" ? " · Active journal" : ""}</div></td>
        <td role="cell"><span className="catalog-cell-label" aria-hidden="true">Condition</span>{run.experimentCondition ?? run.surface ?? "Unavailable"}<div className="table-secondary">{[run.securityLevel, run.targetMethod].filter(Boolean).join(" · ") || "—"}</div></td>
        <td role="cell"><span className="catalog-cell-label" aria-hidden="true">Provider / model</span>{run.provider ?? "Unavailable"}<div className="table-secondary">{run.model ?? "—"}</div></td>
        <td role="cell"><span className="catalog-cell-label" aria-hidden="true">Execution status</span><Badge variant={run.executionStatus === "failed" ? "red" : run.executionStatus === "interrupted" ? "amber" : run.executionStatus === "completed" ? "cyan" : "outline"}>{readable(run.executionStatus ?? "unknown")}</Badge></td>
        <td role="cell"><span className="catalog-cell-label" aria-hidden="true">Security outcome</span><Badge variant={run.securityOutcome === "confirmed" ? "lime" : run.securityOutcome === "unconfirmed" ? "amber" : "outline"}>{readable(run.securityOutcome ?? "unknown")}</Badge></td>
        <td role="cell" className="tabular-nums whitespace-nowrap"><span className="catalog-cell-label" aria-hidden="true">Started</span>{fmtIsoFromStr(run.startedAt)}</td>
        <td role="cell"><span className="catalog-cell-label" aria-hidden="true">Inspect</span><div className="table-actions">{onPick ? <Button variant="ghost" onClick={() => onPick(run)} aria-label={`Open monitor for ${run.executionId}`}>Monitor</Button> : <Link className="ui-button ui-button-ghost" href={`/?execution=${encodeURIComponent(run.executionId)}`}>Monitor</Link>}{run.hasArtifact && <Link className="ui-button ui-button-ghost" aria-label={`Results for ${run.executionId}`} href={`/results/${encodeURIComponent(run.executionId)}`}><ExternalLink size={14} /> Results</Link>}</div></td>
      </tr>)}{!visible.length && <tr role="row"><td role="cell" colSpan={7}><div className="empty-state"><h3>{runs.length ? "No matching runs" : "No runs available"}</h3><p>{runs.length ? "Change the search or reset the filters to see more executions." : "Runs appear here when TESIS publishes runtime descriptors or saved artifacts."}</p>{runs.length > 0 && <Button onClick={reset}>Reset filters</Button>}</div></td></tr>}</tbody>
    </table></div>
    <div className="table-footer"><span>{filtered.length} matching · {runs.length} loaded runs</span><div className="table-actions"><Button variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button><span>Page {current + 1} of {pages}</span><Button variant="ghost" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</Button></div></div>
  </div>;
}
