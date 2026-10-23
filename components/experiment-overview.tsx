"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { fetchExperimentOverview, fetchExperiments } from "@/lib/api-client";
import { experimentLabel, inventoryHref, resultHref, type ExperimentOverview } from "@/lib/experiment-contract";
import { useReadResource } from "@/lib/use-read-resource";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/copy-button";
import { fmtIsoFromStr } from "@/lib/formatters";
import styles from "./experiment-overview.module.css";

const MEMORY_KEY = "tesis.overview.scope.v1";
const subscribe = () => () => {};
function rememberedScope() { try { return sessionStorage.getItem(MEMORY_KEY) ?? ""; } catch { return ""; } }
const serverScope = () => "";

export function ExperimentOverviewPage() {
  const search = useSearchParams();
  const remembered = useSyncExternalStore(subscribe, rememberedScope, serverScope);
  const explicit = search.get("scope");
  const query = explicit !== null ? search.toString() : new URLSearchParams(remembered ? { previous: remembered } : {}).toString();
  const resource = useReadResource(query, fetchExperimentOverview);
  const data = resource.data;
  const selected = data?.experiment?.run;
  useEffect(() => {
    if (selected) { try { sessionStorage.setItem(MEMORY_KEY, selected.executionId); } catch { /* Storage is optional. */ } }
  }, [selected]);
  return <div className={`overview-page ${styles.root}`}>
    <header className="page-header"><div><h1 className="page-title">Research overview</h1><p className="page-description">Interpret one experiment’s coverage, security outcomes, and saved review state.</p></div><Button onClick={resource.refresh} disabled={resource.busy}><RefreshCw size={15} aria-hidden="true" />{resource.busy ? "Refreshing…" : "Refresh summary"}</Button></header>
    <ScopeSelector selected={selected?.executionId ?? explicit ?? ""} />
    {resource.error && <div role="alert" className="notice notice-error"><h2>Selected scope unavailable</h2><p>{resource.error}</p><p>No other experiment has been substituted. Choose a scope above or inspect the source in Results.</p><div className="page-actions"><Button onClick={resource.refresh} disabled={resource.busy}>Retry</Button><Link className="ui-link" href={inventoryHref({ view: "executions", q: explicit ?? "" })}>Find this identity in Results</Link></div></div>}
    {!data && resource.busy && <div className="catalog-skeleton" role="status" aria-label="Loading experiment summary"><span /><span /><span /></div>}
    {data && !selected && <div className="empty-state"><h2>No experiments available</h2><p>No supported experiment or cohort source was discovered. Configured folders are not treated as a study.</p><Link className="ui-link" href="/results?view=executions">Inspect all execution identities</Link></div>}
    {data && selected && <div aria-busy={resource.busy}>
      <section className="scope-context" aria-labelledby="scope-title">
        <div>
          <h2 id="scope-title">{experimentLabel(selected)}</h2>
          <p>{selected.mode === "matrix" ? "Matrix experiment" : selected.hasArtifact ? "Standalone evidence" : "Declared standalone execution"} · {[selected.provider, selected.model].filter(Boolean).join(" / ") || "Provider / model unavailable"} · {selected.startedAt ? fmtIsoFromStr(selected.startedAt) : "Stored date unavailable"}</p>
          <div className="scope-meta-row">
            <div className="execution-identifier"><code>{selected.executionId}</code><CopyButton value={selected.executionId} label="execution ID" /></div>
            <p className="scope-freshness">Refreshed {fmtIsoFromStr(data.refreshedAt)} · {data.partial ? "Incomplete summary — inspect limitations below" : "Saved-source summary"}</p>
          </div>
        </div>
        {selected.hasArtifact ? <Link className="ui-button ui-button-primary" href={resultHref(selected.executionId)}>Open results <ArrowRight size={15} aria-hidden="true" /></Link> : <Link className="ui-button" href={inventoryHref({ scope: selected.executionId, view: "executions" })}>Inspect declared identity</Link>}
      </section>
      <section className="research-conclusion" aria-label="Interpretation">
        <h2>{!selected.hasArtifact ? "Primary evidence unavailable — conclusions cannot be established" : data.unit === "coordinates" ? `${data.coverage?.represented ?? "Unknown"} represented coordinates; ${data.outcomes.confirmed ?? "unavailable"} attributed confirmed` : `Standalone outcome: ${selected.securityOutcome?.replace(/_/g, " ") ?? "unknown / unattributed"}`}</h2>
        <p>{data.unknownOutcomes !== null && data.unknownOutcomes > 0 ? `Unknown or excluded attribution: ${data.unknownOutcomes} ${data.unknownOutcomes === 1 && data.unit === "coordinates" ? "coordinate" : data.unit}. ` : ""}Execution completion is not exploit success. Human and AI finals are independent of runtime scores.</p>
      </section>
      <div className="overview-evidence-grid">
        <Card><CardHeader><CardTitle>Coverage</CardTitle><Link className="ui-link" href={inventoryHref({ scope: selected.executionId, view: "executions" })}>Inspect scope</Link></CardHeader><CardContent><p className="helper-copy">Counting unit: {data.unit}. {data.unit === "coordinates" ? "The matrix parent is not another coordinate." : "No planned matrix is inferred."}</p><dl className="metrics-list overview-counts">
          {[
            ["Recorded planned", data.coverage?.planned ?? null], ["Represented", data.unit === "coordinates" ? data.coverage?.represented ?? null : selected.hasArtifact ? 1 : null],
            ["Completed", data.lifecycle.completed ?? null], ["Failed", data.lifecycle.failed ?? null], ["Interrupted", data.lifecycle.interrupted ?? null],
            ["Skipped (represented)", data.coverage?.skipped ?? null], ["Unstarted (planned)", data.coverage?.unstarted ?? null], ["Unknown lifecycle", data.lifecycle.unknown ?? null],
          ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "Unavailable"}</dd></div>)}
        </dl><p className="helper-copy">Lifecycle counts use represented evidence; planned and unstarted values exist only when recorded. Skipped and unstarted are not added together.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Security outcomes</CardTitle><Link className="ui-link" href="/help#coverage">How to interpret</Link></CardHeader><CardContent><p className="helper-copy">Producer-attributed outcomes · denominator: {data.unit === "coordinates" ? data.coverage?.represented ?? "unavailable" : selected.hasArtifact ? 1 : "unavailable"} represented {data.unit}.</p><dl className="metrics-list overview-counts">
          {(["confirmed", "no_finding", "unconfirmed", "fixture_limited"] as const).map(outcome => <div key={outcome}><dt><Link href={inventoryHref({ scope: selected.executionId, view: "executions", outcome })}>{outcome.replace(/_/g, " ")}</Link></dt><dd>{data.outcomes[outcome] ?? "Unavailable"}</dd></div>)}
          <div className="unattributed-count"><dt>Unknown / unattributed / excluded</dt><dd>{data.unknownOutcomes ?? "Unavailable"}</dd></div>
        </dl><p className="helper-copy">Unknown is not a fifth canonical outcome. Producer exclusions remain intact; failed or interrupted executions may retain confirmed findings.</p></CardContent></Card>
      </div>
      <ReviewReadiness data={data} />
      <section className="attention-section" aria-labelledby="attention-title"><div className="overview-section-heading"><div><h2 id="attention-title">Attention before interpretation</h2><p className="helper-copy">Affected executions are counted once per group; diagnostic messages are shown separately.</p></div></div>
        {!data.attention.length && <p className="notice">No attention groups were found in the scanned scope.{!data.reviews.complete ? " The review scan is incomplete; this is not complete readiness." : ""}</p>}
        {data.attention.map(group => <details key={group.id} className="attention-group">
          <summary>
            <span><strong>{group.title}</strong><span className="helper-copy">{group.description}</span></span>
            <span className="attention-count">{group.affected} {group.affected === 1 ? group.unit.slice(0,-1) : group.unit}<small>{group.messages} diagnostic {group.messages === 1 ? "message" : "messages"}</small></span>
          </summary>
          <div className="attention-body">
            <Link className="ui-link" href={group.href}>Inspect affected experiment in Results <ArrowRight size={14} aria-hidden="true" /></Link>
            <ul>{group.items.map(item => <li key={item.executionId}>
              <Link className="ui-link" href={item.href}>{item.executionId}</Link><code>{item.source}</code>
              <ul>{item.diagnostics.map((diagnostic,i) => <li key={i}>{diagnostic}</li>)}</ul>
            </li>)}</ul>
            {group.omitted > 0 && <p>{group.omitted} additional identities; open the scoped execution inventory.</p>}
          </div>
        </details>)}
      </section>
      <details className="source-disclosure">
        <summary>Source attribution and summary limitations</summary>
        <div className="source-disclosure-body">
          {data.source ? <dl className="metrics-list">
            <div><dt>Original source</dt><dd><code>{data.source.rootId}/{data.source.path}</code></dd></div>
            <div><dt>SHA-256</dt><dd><code>{data.source.sha256}</code></dd></div>
            <div><dt>Projection / code epoch</dt><dd>{data.source.projection ? <><code>{data.source.projection.path}</code><pre>{data.source.projection.epoch}</pre></> : "No bound projection supplied"}</dd></div>
          </dl> : <p>No readable primary source binding is available.</p>}
          {data.experiment?.contextFromMembers && <p className="helper-copy">Missing parent context is supplemented only by metadata shared by every bound coordinate.</p>}
          <p className="helper-copy">Filesystem discovery is bounded and served from a two-second snapshot while it revalidates; Refresh waits for a fresh scan. Reviews scan at most {data.reviews.limit} exact member sources. No cohort definition is available; this summary describes only the named experiment. The observer cannot repair artifacts or run reviews.</p>
          {[...data.diagnostics, ...data.experiment?.diagnostics ?? []].length > 0 && <ul>{[...data.diagnostics, ...data.experiment?.diagnostics ?? []].map((message,i) => <li key={i}>{message}</li>)}</ul>}
          <Link className="ui-link" href="/results?view=unresolved">Inspect unresolved identities</Link>
        </div>
      </details>
    </div>}
  </div>;
}

function ScopeSelector({ selected }: { selected: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const resource = useReadResource(new URLSearchParams({ view: "experiments", q: query, limit: "100" }).toString(), fetchExperiments);
  const entries = resource.data?.entries ?? [];
  return <section className="scope-selector" aria-label="Research scope"><label className="field"><span>Selected experiment</span><select className="form-control" value={selected} onChange={event => router.push(`/overview?${new URLSearchParams({ scope: event.target.value })}`, { scroll: false })}><option value="" disabled>{resource.busy ? "Loading scopes…" : "Choose an experiment"}</option>{selected && !entries.some(entry => entry.run.executionId === selected) && <option value={selected}>{selected}</option>}{entries.map(entry => <option key={entry.run.executionId} value={entry.run.executionId}>{experimentLabel(entry.run)} · {entry.run.executionId}</option>)}</select></label><details className="scope-search"><summary>Find another experiment</summary><form onSubmit={event => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("q") ?? "")); }}><input className="form-control" name="q" type="search" defaultValue={query} placeholder="Search recorded context or exact ID" aria-label="Search recorded context or exact ID" /><Button type="submit"><Search size={15} aria-hidden="true" /> Find scopes</Button></form><p className="helper-copy">{resource.data ? `${resource.data.total} matching experiments; up to 100 choices shown. Narrow the search to find any exact identity.` : "Searching saved experiments…"}</p>{resource.error && <p role="alert">{resource.error} <Button onClick={resource.refresh}>Retry scope list</Button></p>}</details></section>;
}

function ReviewReadiness({ data }: { data: ExperimentOverview }) {
  return <section className="review-readiness" aria-labelledby="readiness-title"><div className="overview-section-heading"><div><h2 id="readiness-title">Independent review readiness</h2><p className="helper-copy">{data.reviews.complete ? "Receipt scan completed for resolved members." : "Incomplete receipt scan — not complete readiness."} No score origins are averaged.</p></div><Link className="ui-link" href={resultHref(data.experiment!.run.executionId, undefined, data.unit === "coordinates" ? "matrix" : "scoring")}>Inspect reviews and compare</Link></div><div className="review-workflows">{(["human", "ai"] as const).map(mode => {
    const workflow = data.reviews[mode];
    return <div key={mode}><h3>{mode === "human" ? "Human" : "AI"} workflow</h3><p className="helper-copy">{workflow.eligible} declared eligible / {workflow.total} {data.unit} · {workflow.eligibilityUnknown} eligibility unknown · {workflow.scanned} scanned</p><dl className="readiness-counts" aria-label={`${mode === "human" ? "Human" : "AI"} review states`}>{Object.entries(workflow.states).map(([state,count]) => <div key={state} className={count === 0 ? styles.emptyReviewState : undefined}><dt>{state.replace(/_/g, " ")}</dt><dd>{count}</dd></div>)}</dl></div>;
  })}</div><p className="helper-copy readiness-note">Each workflow counts the same member scope independently, not additional executions. Missing means no accepted saved workflow evidence; not selected requires the source’s scoring-mode declaration.</p></section>;
}
