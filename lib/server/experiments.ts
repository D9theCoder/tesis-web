import path from "node:path";
import { coverage, canonicalStatus, mergeArtifact, record, text } from "@/lib/artifact-contract";
import { experimentListSchema, experimentOverviewSchema, inventoryQuerySchema, resultHref, inventoryHref, type ExperimentEntry, type InventoryQuery, type ReadinessState, type ExperimentOverview } from "@/lib/experiment-contract";
import { sourceBindingSchema, type SourceBinding } from "@/lib/schemas";
import { getCatalog, uniqueRun, summariseRun, hasExactMatrixMembership, RetrievalError, type Catalog, type ResolvedRun } from "@/lib/server/resolve-run";
import { resolveReviews } from "@/lib/server/reviews";
import { cachedSourceSecrets, redact } from "@/lib/server/fs-util";

const REVIEW_LIMIT = 100;
const DETAIL_LIMIT = 100;
const OUTCOMES = ["confirmed", "no_finding", "unconfirmed", "fixture_limited"] as const;

function sourceBinding(run: ResolvedRun): SourceBinding | null {
  if (!run.primaryPath || !run.sha256) return null;
  return sourceBindingSchema.parse({ rootId: run.root.id, path: path.relative(run.root.path, run.primaryPath), sha256: run.sha256,
    schema: text(run.raw?.schema_version), embeddedExecutionId: run.embedded ? run.executionId : null,
    projection: run.raw?.observer_projection ?? null });
}

/** Membership is resolved once, by exact identity and declared source relationship. */
function indexCatalog(catalog: Catalog) {
  const resolved = new Map<string, ResolvedRun>();
  const problems = new Map<string, string[]>();
  for (const [id, sources] of catalog.runs) {
    try { const run = uniqueRun(catalog, id); if (run) resolved.set(id, run); }
    catch { problems.set(id, ["ambiguous_execution_or_membership", ...sources.map(run => `${run.root.id}/${path.relative(run.root.path, run.primaryPath ?? run.dir)}`)]); }
  }
  const members = new Map<string, ResolvedRun[]>();
  const declared = new Map([...resolved.values()].filter(run => run.mode === "matrix").map(run => [
    run.executionId, new Set(Array.isArray(run.raw?.runs) ? run.raw.runs.map(row => text(record(row).execution_id)).filter((id): id is string => id !== null) : []),
  ]));
  for (const run of resolved.values()) {
    if (!run.matrixExecutionId) continue;
    const parent = resolved.get(run.matrixExecutionId);
    if (!parent || !hasExactMatrixMembership(parent, run, declared.get(parent.executionId))) {
      problems.set(run.executionId, ["unresolved_parent_membership", `declared_parent:${run.matrixExecutionId}`]);
      continue;
    }
    const list = members.get(parent.executionId) ?? [];
    list.push(run); members.set(parent.executionId, list);
  }
  for (const list of members.values()) list.sort((a,b) => (a.coordinateIndex ?? Infinity) - (b.coordinateIndex ?? Infinity) || a.executionId.localeCompare(b.executionId));
  return { resolved, members, problems };
}

function entryFor(run: ResolvedRun, members: ResolvedRun[], problems: string[] = [], level: "experiment" | "execution" = "experiment"): ExperimentEntry {
  const summary = summariseRun(run), diagnostics = [...run.diagnostics, ...problems];
  const ambiguous = problems.includes("ambiguous_execution_or_membership");
  let contextFromMembers = false;
  const childSummaries = members.map(summariseRun);
  for (const key of ["experimentCondition", "targetMethod", "surface", "provider", "model", "securityLevel", "payloadMode"] as const) {
    const value = childSummaries[0]?.[key];
    if (!summary[key] && value && childSummaries.every(child => child[key] === value)) {
      summary[key] = value; contextFromMembers = true;
    }
  }
  const matrix = run.mode === "matrix";
  const aggregate = matrix && level === "experiment" && problems.length === 0;
  let scopedCoverage = null;
  if (aggregate && run.raw) {
    const seen = new Set<string>();
    const rows = Array.isArray(run.raw.runs) ? run.raw.runs.map(record).filter(child => {
      const id = text(child.execution_id);
      if (!id || seen.has(id)) { diagnostics.push("unresolved_or_duplicate_aggregate_coordinate"); return false; }
      seen.add(id); return true;
    }) : [];
    const byId = new Map(members.map(child => [child.executionId, child]));
    const projected: Record<string, unknown>[] = rows.map(child => {
      const resolved = byId.get(String(child.execution_id));
      // Never use another source's data, or fallback around an intentional projection null.
      return resolved?.raw ? { ...child, status: mergeArtifact(resolved.raw).status, ...canonicalStatusFields(resolved.raw) } : child;
    });
    if (!diagnostics.includes("unresolved_or_duplicate_aggregate_coordinate")) {
      scopedCoverage = coverage({ ...run.raw, runs: projected,
        observer_derived_counts: !run.raw.observer_projection && record(run.raw.totals).completed_runs === undefined });
    }
  }
  const lifecycle: Record<string, number> = scopedCoverage ? { ...scopedCoverage.executionCounts, unknown: scopedCoverage.unknown, skipped: scopedCoverage.skipped } : {
    completed: summary.executionStatus === "completed" ? 1 : 0, failed: summary.executionStatus === "failed" ? 1 : 0,
    interrupted: summary.executionStatus === "interrupted" ? 1 : 0, unknown: summary.executionStatus ? 0 : 1,
  };
  const unavailable = ambiguous || !run.raw || (aggregate && !scopedCoverage);
  const outcomes = unavailable ? {} : Object.fromEntries(OUTCOMES.map(outcome => [outcome, scopedCoverage ? scopedCoverage.outcomeCounts[outcome] ?? 0 : summary.securityOutcome === outcome ? 1 : 0]));
  const represented = scopedCoverage?.represented ?? 1;
  return { run: ambiguous ? { executionId: run.executionId, mode: "unresolved", status: "unknown", directory: "Unresolved source identity", matrixExecutionId: run.matrixExecutionId, hasArtifact: false } : summary,
    kind: problems.length ? "unresolved" : matrix ? "matrix" : run.matrixExecutionId ? "coordinate" : "standalone",
    unit: aggregate ? "coordinates" : "execution",
    memberCount: members.length, contextFromMembers: problems.length ? false : contextFromMembers, coverage: scopedCoverage, lifecycle: unavailable ? {} : lifecycle,
    outcomes, unknownOutcomes: unavailable ? null : Math.max(0, represented - Object.values(outcomes).reduce((sum,n) => sum+n,0)), diagnostics };
}

function canonicalStatusFields(raw: Record<string, unknown>) {
  const status = canonicalStatus(raw);
  return { execution_status: status.executionStatus, security_outcome: status.securityOutcome };
}

function prepare(catalog: Catalog) {
  const index = indexCatalog(catalog);
  const entries = [...catalog.runs].map(([id, sources]) => entryFor(index.resolved.get(id) ?? sources[0], index.members.get(id) ?? [], index.problems.get(id)));
  return { ...index, entries };
}

/** Catalog snapshots are immutable between scans, so their derived views can live as long as they do. */
const preparedCatalogs = new WeakMap<Catalog, ReturnType<typeof prepare>>();
function preparedCatalog(catalog: Catalog) {
  let prepared = preparedCatalogs.get(catalog);
  if (!prepared) { prepared = prepare(catalog); preparedCatalogs.set(catalog, prepared); }
  return prepared;
}
const catalogSecrets = new WeakMap<Catalog, string[]>();
function secretsFor(catalog: Catalog) {
  let secrets = catalogSecrets.get(catalog);
  if (!secrets) {
    secrets = [...catalog.runs.values()].flatMap(runs => runs.flatMap(run => run.raw ? cachedSourceSecrets(run.raw) : []));
    catalogSecrets.set(catalog, secrets);
  }
  return secrets;
}

export async function listExperiments(params: URLSearchParams, options: { fresh?: boolean } = {}) {
  if ([...params.keys()].some(key => params.getAll(key).length > 1)) throw new RetrievalError("Ambiguous repeated experiment query parameter", 400);
  const parsed = inventoryQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new RetrievalError("Invalid experiment query; check view, scope, filters, sort and pagination", 400);
  const query = parsed.data, catalog = await getCatalog(options), index = preparedCatalog(catalog);
  let scopedIds: Set<string> | null = null;
  if (query.scope) {
    const selected = uniqueRun(catalog, query.scope);
    if (!selected) throw new RetrievalError(`Selected experiment unavailable: ${query.scope}`, 404);
    scopedIds = new Set([query.scope, ...index.entries.filter(entry => catalog.runs.get(entry.run.executionId)?.some(source => source.matrixExecutionId === query.scope)).map(entry => entry.run.executionId)]);
  }
  const experiments = index.entries.filter(entry => entry.kind === "matrix" || entry.kind === "standalone");
  const unresolved = index.entries.filter(entry => entry.kind === "unresolved");
  const base = query.view === "experiments" ? experiments : query.view === "unresolved" ? unresolved : index.entries.map(entry =>
    entry.kind === "matrix" ? entryFor(index.resolved.get(entry.run.executionId)!, index.members.get(entry.run.executionId) ?? [], [], "execution") : entry);
  const needle = query.q.trim().toLowerCase();
  const filtered = base.filter(entry => {
    const run = entry.run;
    const children = query.view === "experiments" ? index.members.get(run.executionId) ?? [] : [];
    const context = [run, ...children.map(summariseRun)];
    return (!scopedIds || scopedIds.has(run.executionId)) &&
      (query.artifacts === "all" || (query.artifacts === "available" ? run.hasArtifact : !run.hasArtifact)) &&
      (!needle || context.some(row => [row.executionId, row.provider, row.model, row.surface, row.securityLevel, row.experimentCondition, row.targetMethod, row.startedAt, row.executionStatus, row.securityOutcome].filter(Boolean).join(" ").toLowerCase().includes(needle))) &&
      (query.execution === "all" || (query.execution === "unknown" && !Object.keys(entry.lifecycle).length) || (entry.lifecycle[query.execution] ?? 0) > 0) &&
      (query.outcome === "all" || (query.outcome === "unknown" ? entry.unknownOutcomes === null || entry.unknownOutcomes > 0 : (entry.outcomes[query.outcome] ?? 0) > 0));
  });
  filtered.sort((a,b) => compareEntries(a,b,query));
  return redact(experimentListSchema.parse({ entries: filtered.slice(query.cursor, query.cursor + query.limit), total: filtered.length,
    nextCursor: query.cursor + query.limit < filtered.length ? query.cursor + query.limit : null,
    experiments: experiments.length, executions: index.entries.length, unresolved: unresolved.length,
    refreshedAt: new Date().toISOString(), partial: catalog.diagnostics.length > 0,
    diagnostics: catalog.diagnostics.slice(0, DETAIL_LIMIT) }), true, secretsFor(catalog));
}

function compareEntries(a: ExperimentEntry, b: ExperimentEntry, query: InventoryQuery) {
  if (query.sort === "identity") return a.run.executionId.localeCompare(b.run.executionId);
  const left = Date.parse(a.run.startedAt ?? ""), right = Date.parse(b.run.startedAt ?? "");
  if (Number.isFinite(left) !== Number.isFinite(right)) return Number.isFinite(left) ? -1 : 1;
  return (Number.isFinite(left) && Number.isFinite(right) ? (query.sort === "oldest" ? left-right : right-left) : 0) || a.run.executionId.localeCompare(b.run.executionId);
}

export async function experimentOverview(scope?: string, previous?: string, options: { fresh?: boolean } = {}) {
  const catalog = await getCatalog(options), index = preparedCatalog(catalog);
  const defaultQuery = inventoryQuerySchema.parse({});
  const choices = index.entries.filter(entry => (entry.kind === "matrix" || entry.kind === "standalone") && entry.run.hasArtifact).sort((a,b) => compareEntries(a,b,defaultQuery));
  // Explicit identity is never substituted; a stale remembered identity may fall back.
  let selected = scope;
  if (selected === undefined && previous && index.entries.some(entry => entry.run.executionId === previous && ["matrix", "standalone"].includes(entry.kind))) selected = previous;
  selected ??= choices[0]?.run.executionId;
  const run = selected !== undefined ? uniqueRun(catalog, selected) : null;
  if (selected !== undefined && !run) throw new RetrievalError(`Selected experiment unavailable: ${selected}`, 404);
  if (run && index.problems.has(run.executionId)) throw new RetrievalError("Selected source has unresolved matrix membership", 409);
  if (run?.matrixExecutionId) throw new RetrievalError(`Select its parent experiment: ${run.matrixExecutionId}`, 409);
  const members = run ? run.mode === "matrix" ? index.members.get(run.executionId) ?? [] : [run] : [];
  const experiment = run ? entryFor(run, index.members.get(run.executionId) ?? []) : null;
  const states: ReadinessState[] = ["final", "pending", "stale", "missing", "unavailable", "not_selected", "not_scanned"];
  const workflow = () => ({ eligible: 0, eligibilityUnknown: 0, scanned: 0, total: members.length,
    states: Object.fromEntries(states.map(state => [state, 0])) as Record<ReadinessState, number> });
  const reviews = { human: workflow(), ai: workflow(), complete: members.length <= REVIEW_LIMIT, limit: REVIEW_LIMIT };
  const groups = new Map<string, { title: string; description: string; items: Map<string, { executionId: string; source: string; href: string; diagnostics: string[] }> }>();
  const groupDefinitions = {
    missing: ["Missing primary artifacts", "Declared executions have no readable primary evidence."],
    attribution: ["Unknown attribution", "Lifecycle or security outcomes are not attributable. Unknown does not mean no finding."],
    pending: ["Pending review work", "A source-bound saved review status declares pending work."],
    stale: ["Stale or mismatched receipts", "Saved receipts do not match the current source or review contract."],
    retrieval: ["Retrieval and membership problems", "Inspect source-specific diagnostics before drawing a conclusion."],
    reviewMissing: ["Missing or unavailable reviews", "No accepted final or pending status is available; this is not inferred pending work."],
  };
  function attention(id: keyof typeof groupDefinitions, member: ResolvedRun, diagnostics: string[], tab = "summary") {
    let group = groups.get(id);
    if (!group) { const [title, description] = groupDefinitions[id]; group = { title, description, items: new Map() }; groups.set(id, group); }
    const prior = group.items.get(member.executionId);
    const href = run ? resultHref(run.executionId, run.mode === "matrix" && member.executionId !== run.executionId ? member.executionId : undefined, tab) : resultHref(member.executionId);
    group.items.set(member.executionId, { executionId: member.executionId, source: `${member.root.id}/${path.relative(member.root.path, member.primaryPath ?? member.dir)}`, href,
      diagnostics: [...prior?.diagnostics ?? [], ...diagnostics] });
  }
  for (const [i, member] of members.entries()) {
    const summary = summariseRun(member), saved = mergeArtifact(member.raw ?? {});
    const mode = text(record(saved.config).scoring_mode) ?? text(saved.scoring_mode);
    if (!member.raw) { reviews.complete = false; attention("missing", member, ["primary_unavailable"]); }
    if (!summary.executionStatus || !summary.securityOutcome) attention("attribution", member, [!summary.executionStatus ? "execution_status_unknown" : "", !summary.securityOutcome ? "security_outcome_unknown" : ""].filter(Boolean));
    const diagnostics = member.diagnostics.filter(d => d !== "embedded_child_source" && d !== "primary_unavailable");
    if (diagnostics.length) attention("retrieval", member, diagnostics);
    for (const key of ["human", "ai"] as const) {
      if (mode === key || mode === "both") reviews[key].eligible++;
      else if (!mode) reviews[key].eligibilityUnknown++;
      if (i >= REVIEW_LIMIT) reviews[key].states[mode && mode !== "both" && mode !== key ? "not_selected" : "not_scanned"]++;
    }
  }
  // Bounded receipt-only adapter scan; never fetch child evidence bundles or run evaluators.
  for (let offset = 0; offset < Math.min(members.length, REVIEW_LIMIT); offset += 4) {
    await Promise.all(members.slice(offset, Math.min(offset + 4, REVIEW_LIMIT)).map(async member => {
      const diagnostics: string[] = [];
      let bundle = null;
      try { if (member.raw) bundle = await resolveReviews(member, diagnostics); }
      catch { diagnostics.push("review_retrieval_unavailable"); }
      for (const key of ["human", "ai"] as const) {
        const saved = bundle?.[key];
        const state: ReadinessState = saved?.reason === "workflow_not_selected" ? "not_selected" : saved?.status ?? "unavailable";
        reviews[key].states[state]++; reviews[key].scanned++;
        if (state === "pending") attention("pending", member, [`${key}: ${saved?.reason ?? "pending"}`], "scoring");
        if (state === "stale") attention("stale", member, [`${key}: ${saved?.reason}`], "scoring");
        if (state === "missing" || state === "unavailable") attention("reviewMissing", member, [`${key}: ${saved?.reason ?? "source_unavailable"}`], "scoring");
      }
      if (diagnostics.length) { reviews.complete = false; attention("retrieval", member, diagnostics); }
    }));
  }
  const represented = experiment?.coverage?.represented;
  const diagnostics = [...catalog.diagnostics];
  if (run?.mode === "matrix" && (represented === undefined || represented !== members.length)) {
    reviews.complete = false;
    const reason = `represented_coverage_and_bound_members_differ:${represented ?? "unavailable"}/${members.length}`;
    diagnostics.push(reason); attention("retrieval", run, [reason]);
  }
  if (run?.mode === "matrix") {
    const unresolved = index.entries.filter(entry => entry.run.matrixExecutionId === run.executionId && entry.kind === "unresolved");
    if (unresolved.length) {
      reviews.complete = false;
      diagnostics.push(`${unresolved.length} unresolved coordinate identities; inspect All executions`);
      for (const entry of unresolved) attention("retrieval", catalog.runs.get(entry.run.executionId)![0], entry.diagnostics);
    }
    if (!run.raw) attention("missing", run, ["matrix_primary_unavailable"]);
    if (experiment?.diagnostics.length) attention("retrieval", run, experiment.diagnostics);
  }
  const payload: ExperimentOverview = {
    experiment, source: run ? sourceBinding(run) : null, refreshedAt: new Date().toISOString(),
    partial: diagnostics.length > 0 || !reviews.complete || !!experiment?.diagnostics.length || !!run && !run.raw,
    unit: run?.mode === "matrix" ? "coordinates" : "standalone execution", coverage: experiment?.coverage ?? null,
    lifecycle: experiment?.lifecycle ?? {}, outcomes: experiment?.outcomes ?? {}, unknownOutcomes: experiment?.unknownOutcomes ?? null,
    reviews,
    attention: [...groups].sort(([left],[right]) => left.localeCompare(right)).map(([id, group]) => ({ id, title: group.title, description: group.description, unit: "executions",
      affected: group.items.size, messages: [...group.items.values()].reduce((sum,item) => sum+item.diagnostics.length,0),
      href: run ? inventoryHref({ scope: run.executionId, view: "executions", ...(id === "missing" ? { artifacts: "missing" } : {}) }) : "/results",
      items: [...group.items.values()].sort((a,b) => a.executionId.localeCompare(b.executionId)).slice(0,DETAIL_LIMIT), omitted: Math.max(0,group.items.size-DETAIL_LIMIT) })),
    diagnostics: diagnostics.slice(0,DETAIL_LIMIT),
  };
  const secrets = [run, ...members].flatMap(member => member?.raw ? cachedSourceSecrets(member.raw) : []);
  return redact(experimentOverviewSchema.parse(payload), true, secrets);
}
