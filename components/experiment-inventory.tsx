"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { fetchExperiments } from "@/lib/api-client";
import { experimentLabel, inventoryQuerySchema, inventoryHref, resultHref, type InventoryQuery, type ExperimentEntry } from "@/lib/experiment-contract";
import { useReadResource } from "@/lib/use-read-resource";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/copy-button";
import { fmtProvider, fmtIsoFromStr } from "@/lib/formatters";
import { LEVEL_LABELS, PAYLOAD_MODE_LABELS, labelFor } from "@/lib/control-options";
import styles from "./experiment-inventory.module.css";

export function ExperimentInventoryPage() {
  const search = useSearchParams(), router = useRouter();
  const raw = search.toString();
  const parsed = inventoryQuerySchema.safeParse(Object.fromEntries(search));
  const query = parsed.success ? parsed.data : { ...inventoryQuerySchema.parse({}), scope: search.get("scope") ?? undefined, q: search.get("q") ?? "" };
  const resource = useReadResource(raw, fetchExperiments);
  const data = resource.data;
  function change(values: Partial<InventoryQuery>) {
    router.push(inventoryHref({ cursor: 0, ...values }, raw), { scroll: false });
  }
  return <div className={`experiment-inventory-page ${styles.page}`}>
    <header className="page-header"><div><h1 className="page-title">Experiment results</h1><p className="page-description">Find a saved experiment. Open its coordinates to compare scores and inspect evidence.</p></div><Button disabled={resource.busy} onClick={resource.refresh}><RefreshCw size={15} aria-hidden="true" />{resource.busy ? "Refreshing…" : "Refresh inventory"}</Button></header>
    <nav className="inventory-views" aria-label="Inventory level">{([ ["experiments", "Experiments"], ["executions", "All executions"], ["unresolved", "Unresolved identities"] ] as const).map(([view,label]) => <Link key={view} href={inventoryHref({ view, cursor: 0 }, raw)} aria-current={query.view === view ? "page" : undefined}>{label}<span>{data ? view === "experiments" ? data.experiments : view === "executions" ? data.executions : data.unresolved : "—"}</span></Link>)}</nav>
    <p className="inventory-explanation">{query.view === "experiments" ? "One row per matrix or standalone experiment. Coordinates stay inside their parent; unresolved identities remain accessible above." : query.view === "executions" ? "Raw identity inventory, including matrix parents, coordinates, and unresolved sources. These totals are not a research denominator." : "Ambiguous sources and unresolved parent relationships. These records are not silently grouped into an experiment."}</p>
    {query.scope && <div className="scope-filter notice"><span>Experiment scope: <code>{query.scope}</code></span><Link className="ui-link" href={inventoryHref({ scope: undefined, cursor: 0 }, raw)}>Clear scope</Link><Link className="ui-link" href={`/overview?${new URLSearchParams({ scope: query.scope })}`}>Research overview</Link></div>}
    <Card className={query.density === "compact" ? "density-compact" : "density-comfortable"} aria-busy={resource.busy}>
      <form className="filter-bar inventory-search" key={query.q} onSubmit={event => { event.preventDefault(); change({ q: String(new FormData(event.currentTarget).get("q") ?? "") }); }}><label className="field search-field"><span>Search experiments and exact IDs</span><span className="search-control"><Search size={16} aria-hidden="true" /><input className="form-control" name="q" type="search" defaultValue={query.q} placeholder="Condition, method, model, execution ID…" /></span></label><Button type="submit">Search</Button><label className="field">Security outcome<select className="form-control" value={query.outcome} onChange={event => change({ outcome: event.target.value as InventoryQuery["outcome"] })}><option value="all">All outcomes</option>{["confirmed", "no_finding", "unconfirmed", "fixture_limited", "unknown"].map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}</select></label></form>
      <div className="inventory-toolbar"><span className="helper-copy" role="status">{resource.busy ? "Loading inventory…" : data ? `${data.total} matching ${query.view === "experiments" ? "experiments" : "execution identities"}` : "Inventory unavailable"}</span><details className="inventory-options"><summary>Filters and display</summary><div className="filter-bar"><label className="field">Execution lifecycle<select className="form-control" value={query.execution} onChange={event => change({ execution: event.target.value as InventoryQuery["execution"] })}><option value="all">All lifecycle states</option>{["completed", "failed", "interrupted", "unknown"].map(value => <option key={value}>{value}</option>)}</select></label><label className="field">Artifact availability<select className="form-control" value={query.artifacts} onChange={event => change({ artifacts: event.target.value as InventoryQuery["artifacts"] })}><option value="all">All declared identities</option><option value="available">Saved artifacts</option><option value="missing">Missing primaries</option></select></label><label className="field">Sort experiments<select className="form-control" value={query.sort} onChange={event => change({ sort: event.target.value as InventoryQuery["sort"] })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="identity">Execution ID</option></select></label><label className="field">Row density<select className="form-control" value={query.density} onChange={event => change({ density: event.target.value as InventoryQuery["density"] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><Link className="ui-button ui-button-ghost" href={inventoryHref({ view: query.view, scope: query.scope })}>Reset filters</Link></div></details></div>
      {resource.error && <div role="alert" className="notice notice-error inventory-error"><h2>Inventory unavailable</h2><p>{resource.error}</p><Button onClick={resource.refresh} disabled={resource.busy}>Retry</Button>{!parsed.success && <Link className="ui-link" href="/results">Reset invalid query</Link>}</div>}
      {!data && resource.busy ? <div className="catalog-skeleton" role="status" aria-label="Loading experiment inventory"><span /><span /><span /></div> : data && <>
        <div className="table-container"><table className="data-table experiment-table" aria-label={query.view === "experiments" ? "Experiment inventory" : "Execution inventory"} role="table"><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Experiment / source identity</th><th scope="col" role="columnheader">Provider / model / date</th><th scope="col" role="columnheader">Coverage & lifecycle</th><th scope="col" role="columnheader">Security outcomes</th><th scope="col" role="columnheader">Inspect</th></tr></thead><tbody role="rowgroup">{data.entries.map(entry => <ExperimentRow key={entry.run.executionId} entry={entry} />)}</tbody></table></div>
        {!data.entries.length && <div className="empty-state"><h2>{data.executions ? "No matching experiments" : "No saved experiments available"}</h2><p>{query.scope ? "No identities match this scope and its filters. The selected source has not been substituted." : "Change the search or filters, or inspect All executions for unresolved sources."}</p><Link className="ui-link" href={inventoryHref({ view: query.view, scope: query.scope })}>Reset search and filters</Link></div>}
        <div className="table-footer"><span>{data.entries.length ? `${query.cursor + 1}–${query.cursor + data.entries.length} of ${data.total}` : `0 of ${data.total}`} · server-filtered before pagination</span><div className="table-actions"><Button variant="ghost" disabled={query.cursor === 0 || resource.busy} onClick={() => change({ cursor: Math.max(0,query.cursor-query.limit) })}>Previous</Button><Button variant="ghost" disabled={data.nextCursor === null || resource.busy} onClick={() => change({ cursor: data.nextCursor ?? 0 })}>Next</Button></div></div>
      </>}
    </Card>
    {data && <details className="source-disclosure"><summary>Inventory attribution and retrieval diagnostics{data.partial ? " · incomplete discovery" : ""}</summary><div className="source-disclosure-body"><p className="helper-copy">Refreshed {fmtIsoFromStr(data.refreshedAt)}. Bounded discovery across configured roots; counts describe inventory, not a cohort. Search includes exact validated child identities at experiment level. Lifecycle/outcome filters match any represented member, independently; a matching experiment may contain other states. Review readiness is not inferred from inventory — open Research overview for a bounded source-bound receipt scan.</p>{data.diagnostics.length > 0 && <ul>{data.diagnostics.map((diagnostic,i) => <li key={i}>{diagnostic}</li>)}</ul>}</div></details>}
  </div>;
}

function ExperimentRow({ entry }: { entry: ExperimentEntry }) {
  const { run } = entry;
  return <tr role="row">
    <td role="cell">
      <span className="experiment-cell-label" aria-hidden="true">Experiment</span>
      <div className="experiment-row-title">
        {run.hasArtifact ? <Link href={resultHref(run.executionId)}>{experimentLabel(run)}</Link> : <strong>{entry.kind === "unresolved" ? "Unresolved execution identity" : experimentLabel(run)}</strong>}
        <Badge variant="outline">{entry.kind}</Badge>
      </div>
      <div className="table-secondary">{[run.securityLevel && labelFor(LEVEL_LABELS, run.securityLevel), run.payloadMode && labelFor(PAYLOAD_MODE_LABELS, run.payloadMode)].filter(Boolean).join(" · ") || "Security / payload context unavailable"}</div>
      {entry.contextFromMembers && <div className="table-secondary">Shared coordinate context</div>}
      <div className="inventory-identity">
        <code>{run.executionId}</code><CopyButton value={run.executionId} label={`execution ID ${run.executionId}`} />
      </div>
      {entry.kind === "coordinate" && run.matrixExecutionId && <Link className="ui-link" href={resultHref(run.matrixExecutionId, run.executionId)}>Within parent experiment</Link>}
      {entry.diagnostics.length > 0 && <details className="row-diagnostics">
        <summary>{entry.diagnostics.length} source diagnostics</summary><p>{run.directory}</p>
        <ul>{entry.diagnostics.map((diagnostic,i) => <li key={i}>{diagnostic}</li>)}</ul>
      </details>}
    </td>
    <td role="cell">
      <span className="experiment-cell-label" aria-hidden="true">Provider / model / date</span>
      <span>{fmtProvider(run.provider) ?? "Provider unavailable"}</span>
      <div className="table-secondary">{run.model ?? "Model unavailable"}</div>
      <div className="table-secondary">{fmtIsoFromStr(run.startedAt)}</div>
      <div className="table-secondary">{run.mode}</div>
    </td>
    <td role="cell">
      <span className="experiment-cell-label" aria-hidden="true">Coverage & lifecycle</span>
      <strong className="inventory-coverage">{entry.unit === "coordinates" ? `${entry.coverage?.represented ?? "Unknown"} represented · ${entry.memberCount} bound` : "1 execution identity"}</strong>
      <div className="table-secondary">{entry.unit === "coordinates" ? `Planned: ${entry.coverage?.planned ?? "unavailable"}` : entry.kind === "matrix" ? "Matrix aggregate; not a coordinate" : entry.kind === "coordinate" ? "Coordinate; not a separate experiment" : entry.kind === "unresolved" ? "Unresolved source" : "Standalone scope"}</div>
      <ul className="inventory-distribution">
        {Object.entries(entry.lifecycle).filter(([,count]) => count > 0).map(([state,count]) => <li key={state}>{count} {state}</li>)}
        {!Object.keys(entry.lifecycle).length && <li>Lifecycle unavailable</li>}
      </ul>
    </td>
    <td role="cell">
      <span className="experiment-cell-label" aria-hidden="true">Security outcomes</span>
      <ul className="inventory-distribution">
        {Object.entries(entry.outcomes).filter(([,count]) => count > 0).map(([state,count]) => <li key={state}><Badge variant={state === "confirmed" ? "lime" : state === "unconfirmed" ? "amber" : "outline"}>{count} {state.replace(/_/g, " ")}</Badge></li>)}
        {entry.unknownOutcomes !== null && entry.unknownOutcomes > 0 && <li>{entry.unknownOutcomes} unknown / unattributed</li>}
        {entry.unknownOutcomes === null && <li>Outcome distribution unavailable</li>}
      </ul>
      <span className="table-secondary">{entry.unit === "coordinates" ? "Per represented coordinate" : "Execution outcome"}</span>
    </td>
    <td role="cell">
      <span className="experiment-cell-label" aria-hidden="true">Inspect</span>
      <div className="inventory-row-actions">
        {run.hasArtifact ? <Link className="ui-button ui-button-primary" href={resultHref(run.executionId)}>Open results <ArrowRight size={14} aria-hidden="true" /></Link> : <span className="helper-copy">Primary unavailable</span>}
        {["matrix", "standalone"].includes(entry.kind) && <Link className="ui-link" href={`/overview?${new URLSearchParams({ scope: run.executionId })}`}>Research overview</Link>}
        <Link className="ui-link" href={`/?execution=${encodeURIComponent(run.executionId)}`}>Monitor history</Link>
      </div>
    </td>
  </tr>;
}
