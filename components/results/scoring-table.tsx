"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CoordinateSummary, NormalizedResult, ScoreRow } from "@/lib/schemas";
import { Badge, Button } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/copy-button";
import { buildScoreRows, compositeFormula } from "@/lib/result-normalizer";
import { fmtProvider, fmtCost, fmtNumber, fmtPercent, fmtScore } from "@/lib/formatters";

type ScoreOrigin = "runtime" | "human" | "ai";
type MatrixSortKey = "index" | "condition" | "method" | "execution" | "outcome" | "repeat" | "score";

export function ScoringTable({
  result,
  coordinateMode = false,
  selectedCoordinateId = null,
  onPickCoordinate,
  onEvidenceRef,
}: {
  result: NormalizedResult;
  coordinateMode?: boolean;
  selectedCoordinateId?: string | null;
  onPickCoordinate?: (executionId: string, runId: string) => void;
  onEvidenceRef?: (ref: string) => void;
}) {
  const search = useSearchParams(), router = useRouter(), pathname = usePathname();
  const originValue = search.get("origin") ?? "runtime";
  const origin = originValue as ScoreOrigin;
  function setOrigin(value: ScoreOrigin) {
    const query = new URLSearchParams(search.toString());
    query.set("origin", value);
    router.push(`${pathname}?${query}`, { scroll: false });
  }
  if (coordinateMode) {
    return <MatrixComparison result={result} selectedCoordinateId={selectedCoordinateId} onPickCoordinate={onPickCoordinate} />;
  }
  if (!["runtime", "human", "ai"].includes(originValue)) return <div role="alert" className="notice notice-error">Unavailable score origin: {originValue}. <Button onClick={() => setOrigin("runtime")}>Show provisional runtime</Button></div>;

  const workflow = origin === "runtime" ? null : result.reviews?.[origin];
  const rows = origin === "runtime"
    ? result.scoringRows
    : workflow?.components
      ? buildScoreRows({ ...workflow.components, Srun: workflow.SrunFinal ?? undefined }, true, workflow.evidenceRefs)
      : [];
  const scoreLabel = origin === "runtime" ? "Provisional runtime" : `${origin === "human" ? "Human" : "AI"} review`;
  const selectedOriginText = origin === "runtime"
    ? result.scoreOrigin
    : `${workflow?.rubric ?? "scoring.v4"} · ${readable(workflow?.status ?? "missing")}`;

  return (
    <div className="score-review flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
      <div className="score-origin-controls flex flex-wrap gap-2" role="group" aria-label="Score origin">
        {(["runtime", "human", "ai"] as const).map((mode) => {
          const label = mode === "runtime" ? "Provisional runtime" : `${mode === "human" ? "Human" : "AI"} review`;
          return (
            <Button
              key={mode}
              variant={origin === mode ? "default" : "outline"}
              className={`score-origin${origin === mode ? " selected" : ""}`}
              aria-pressed={origin === mode}
              onClick={() => setOrigin(mode)}
            >
              {label}
            </Button>
          );
        })}
      </div>

      <section className="score-provenance space-y-3 rounded-md border p-4" aria-label={`${scoreLabel} provenance`}>
        <div className="score-provenance-heading flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3>{scoreLabel}</h3>
            <p>{selectedOriginText}</p>
          </div>
          <Badge variant={origin === "runtime" ? "outline" : workflow?.status === "final" ? "lime" : workflow?.status === "stale" ? "amber" : "outline"}>
            {origin === "runtime" ? "Provisional" : readable(workflow?.status ?? "missing")}
          </Badge>
        </div>
        {origin === "runtime" ? (
          <p className="helper-copy">Runtime scores remain provisional. Human and AI reviews are shown with their own source and evidence bindings.</p>
        ) : workflow ? (
          <div className="score-provenance-details">
            <p><strong>Final Srun</strong> <span className="numeric-value">{fmtScore(workflow.SrunFinal, 4)}</span></p>
            <p><strong>Candidate numerator / denominator</strong> <span className="numeric-value">{fmtNumber(workflow.numerator, 4)} / {fmtNumber(workflow.denominator)}</span></p>
            {workflow.reason && <p className="notice" role="status">{workflow.reason}</p>}
            {Object.entries(workflow.componentPendingReasons).map(([dimension, reason]) => (
              <p key={dimension}><strong>{dimension}</strong> · {renderUnknown(reason)}</p>
            ))}
            {workflow.source && (
              <div className="source-binding">
                <p>Review source</p>
                <code>{workflow.source.rootId}/{workflow.source.path}</code>
                <p>SHA-256 <code>{workflow.source.sha256}</code> <CopyButton value={workflow.source.sha256} label="review source SHA-256" /></p>
              </div>
            )}
          </div>
        ) : <p className="notice">No independent review bundle is present in this artifact.</p>}
        <details className="formula-disclosure">
          <summary>Scoring formula</summary>
          <code>{compositeFormula()}</code>
        </details>
      </section>
      {origin !== "runtime" && <section aria-label={`${scoreLabel} metrics`} className="review-metrics">
        <h3>{scoreLabel} metrics</h3>
        {workflow?.metrics ? <>
          <dl className="metrics-list">{Object.entries(workflow.metrics.values).map(([key, value]) => <div key={key}>
            <dt>{readable(key)}</dt><dd>{workflow.metrics!.availability[key] && value !== null ? fmtNumber(value, 4) : "Unavailable"}
              {(!workflow.metrics!.availability[key] || value === null) && <p>{workflow.metrics!.unavailable_reason[key] ?? "Not established by this receipt"}</p>}
            </dd>
          </div>)}</dl>
          <h4>Recorded denominators</h4>
          <dl className="metrics-list">{Object.entries(workflow.metrics.denominators).map(([key, value]) => <div key={key}><dt>{readable(key)}</dt><dd>{fmtNumber(value)}</dd></div>)}</dl>
        </> : <p className="notice">No metric vector is recorded for this review. Runtime metrics are not substituted.</p>}
      </section>}

      {rows.length > 0 ? (
        <DimensionScoring rows={rows} refs={workflow?.evidenceRefs} onEvidenceRef={onEvidenceRef} />
      ) : (
        <div className="empty-state compact-empty-state">
          {origin === "runtime" ? "No runtime score dimensions are available." : `No ${origin.toUpperCase()} component scores are available for this review.`}
        </div>
      )}

      {workflow?.candidateGrades.length ? (
        <details className="review-disclosure">
          <summary>Candidate grades and denominator</summary>
          <pre>{JSON.stringify(workflow.candidateGrades, null, 2)}</pre>
        </details>
      ) : null}
      {!!result.reviews?.history.length && (
        <details className="review-disclosure">
          <summary>Saved review receipts ({result.reviews.history.length})</summary>
          {result.reviews.history.map((receipt) => (
            <details key={`${receipt.sha256}${receipt.path}`}>
              <summary>{readable(receipt.workflow)} · {receipt.accepted ? "Eligible" : readable(receipt.reason ?? "unavailable")} · {receipt.path}</summary>
              <p>SHA-256 <code>{receipt.sha256}</code></p>
              <pre>{JSON.stringify(receipt.receipt, null, 2)}</pre>
            </details>
          ))}
        </details>
      )}
    </div>
  );
}

function MatrixComparison({
  result,
  selectedCoordinateId,
  onPickCoordinate,
}: {
  result: NormalizedResult;
  selectedCoordinateId: string | null;
  onPickCoordinate?: (executionId: string, runId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<MatrixSortKey>("index");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const coordinates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = result.coordinates.filter((coordinate) => [
      coordinate.executionId, coordinate.runId, coordinate.experimentCondition, coordinate.surface,
      coordinate.securityLevel, coordinate.payloadMode, coordinate.selectedMethod, coordinate.targetMethod,
      coordinate.provider, coordinate.model, coordinate.executionStatus, coordinate.securityOutcome,
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
    filtered.sort((left, right) => {
      let order = 0;
      let nullableNumericSort = false;
      switch (sortKey) {
        case "index": order = left.index - right.index; break;
        case "condition": order = compare(condition(left), condition(right)); break;
        case "method": order = compare(left.selectedMethod ?? left.targetMethod ?? "", right.selectedMethod ?? right.targetMethod ?? ""); break;
        case "execution": order = compare(left.executionStatus ?? "unknown", right.executionStatus ?? "unknown"); break;
        case "outcome": order = compare(left.securityOutcome ?? "unknown", right.securityOutcome ?? "unknown"); break;
        case "repeat": order = compareNullableNumber(left.repeatIndex, right.repeatIndex, descending); nullableNumericSort = true; break;
        case "score": order = compareNullableNumber(left.scores.Srun, right.scores.Srun, descending); nullableNumericSort = true; break;
      }
      return (nullableNumericSort ? order : descending ? -order : order) || left.index - right.index;
    });
    return filtered;
  }, [result.coordinates, query, sortKey, descending]);

  const pageCount = Math.max(1, Math.ceil(coordinates.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = coordinates.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return (
    <div className="matrix-comparison flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="filter-bar matrix-filter-bar flex flex-wrap items-end gap-3">
        <label className="field matrix-search min-w-[16rem] flex-1">
          <span className="label">Search matrix</span>
          <input className="form-control" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Coordinate, condition, method…" />
        </label>
        <label className="field">
          <span className="label">Sort by</span>
          <select className="form-control" aria-label="Sort matrix coordinates" value={sortKey} onChange={(event) => setSortKey(event.target.value as MatrixSortKey)}>
            <option value="index">Coordinate order</option>
            <option value="condition">Condition</option>
            <option value="method">Method</option>
            <option value="execution">Execution status</option>
            <option value="outcome">Security outcome</option>
            <option value="repeat">Repeat</option>
            <option value="score">Provisional Srun</option>
          </select>
        </label>
        <Button variant="outline" onClick={() => setDescending((value) => !value)} aria-label={descending ? "Sort ascending" : "Sort descending"}>
          {descending ? "Descending" : "Ascending"}
        </Button>
        <span className="results-count" aria-live="polite">{coordinates.length} of {result.coordinates.length} coordinates</span>
      </div>
      <p className="helper-copy">Matrix scores are the values stored in the aggregate artifact. Selecting a coordinate loads its source-bound Human and AI review state.</p>
      <div className="table-container matrix-table-container min-h-0 flex-1 overflow-auto">
        <table className="data-table matrix-table" aria-label="Scoring matrix">
          <thead>
            <tr>
              <th scope="col">Coordinate</th>
              <th scope="col">Condition</th>
              <th scope="col">Method</th>
              <th scope="col">Execution</th>
              <th scope="col">Security outcome</th>
              <th scope="col" className="numeric-column">Repeat</th>
              <th scope="col" className="numeric-column">Provisional runtime Srun</th>
              <th scope="col">Review state</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((coordinate) => {
              const selected = coordinate.executionId === selectedCoordinateId;
              return (
                <tr key={coordinate.executionId} className={selected ? "selected" : undefined} aria-current={selected ? "true" : undefined}>
                  <td>
                    <button
                      type="button"
                      className="coordinate-select ui-link"
                      aria-label={`Coordinate ${coordinate.index + 1}: ${coordinate.executionStatus ?? "unknown"}, ${coordinate.securityOutcome ?? "unknown"}, ${coordinate.executionId}`}
                      aria-pressed={selected}
                      onClick={() => onPickCoordinate?.(coordinate.executionId, coordinate.executionId)}
                    >
                      <span>Coordinate {coordinate.index + 1}</span>
                      <code>{coordinate.executionId}</code>
                    </button>
                  </td>
                  <td>
                    <span>{condition(coordinate) || "Unavailable"}</span>
                    <small>{[coordinate.surface, coordinate.securityLevel, coordinate.payloadMode].filter(isPresentString).map(readable).join(" · ") || "Condition details unavailable"}</small>
                  </td>
                  <td>
                    <span>{coordinate.selectedMethod ?? coordinate.targetMethod ?? "Unavailable"}</span>
                    <small>{[fmtProvider(coordinate.provider), coordinate.model].filter(Boolean).join(" · ") || "Provider details unavailable"}</small>
                  </td>
                  <td><Badge variant={coordinate.executionStatus === "completed" ? "lime" : coordinate.executionStatus === "failed" ? "red" : "outline"}>{readable(coordinate.executionStatus ?? "unknown")}</Badge></td>
                  <td><OutcomeBadge value={coordinate.securityOutcome ?? "unknown"} /></td>
                  <td className="numeric-column tabular-nums">{coordinate.repeatIndex == null ? "Unavailable" : coordinate.repeatIndex}</td>
                  <td className="numeric-column tabular-nums">{coordinate.scores.Srun == null ? "Unavailable" : fmtScore(coordinate.scores.Srun, 4)}</td>
                  <td>{coordinate.hasArtifact === false ? "Artifact unavailable" : "Load reviews on selection"}</td>
                </tr>
              );
            })}
            {pageRows.length === 0 && <tr><td colSpan={8}><div className="empty-state">No coordinates match this search. Clear the search to see all rows.</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-pagination flex flex-wrap items-center justify-end gap-3" aria-label="Scoring matrix pages">
        <label className="field page-size-field">
          <span className="label">Rows per page</span>
          <select className="form-control" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <span>Page {currentPage + 1} of {pageCount}</span>
        <Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <Button variant="outline" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
      </div>
    </div>
  );
}

function DimensionScoring({ rows, refs, onEvidenceRef }: { rows: ScoreRow[]; refs?: Record<string, string[]>; onEvidenceRef?: (ref: string) => void }) {
  return (
    <div className="table-container score-table-container overflow-auto">
      <table className="data-table score-dimension-table" aria-label="Score dimensions">
        <thead>
          <tr><th scope="col">Dimension</th><th scope="col" className="numeric-column">Score / 4</th><th scope="col">Evidence and interpretation</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension}>
              <th scope="row">
                <span>{dimensionLabel(row.dimension)}</span>
                <code>{row.dimension}</code>
              </th>
              <td className="numeric-column tabular-nums">{fmtScore(row.score, 4)}</td>
              <td>
                <details className="score-interpretation" open>
                  <summary>Interpretation</summary>
                  <p>{row.interpretation}</p>
                  {refs?.[row.dimension]?.length ? (
                    <div className="evidence-references" aria-label={`${row.dimension} evidence references`}>
                      <span>Evidence references</span>
                      {refs[row.dimension].map((ref) => <EvidenceReference key={ref} reference={ref} onClick={onEvidenceRef} />)}
                    </div>
                  ) : <p>{row.evidenceBasis}</p>}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MetricsSummary({ result }: { result: NormalizedResult }) {
  const metrics = result.metrics;
  const values: Array<[string, string]> = [
    ["Payload validity", fmtPercent(metrics.payloadValidityRate)],
    ["Payload execution success", fmtPercent(metrics.payloadExecutionSuccessRate)],
    ["Payload improvement", fmtPercent(metrics.payloadImprovementRate)],
    ["Method selection accuracy", fmtPercent(metrics.methodSelectionAccuracy)],
    ["Adaptation", fmtPercent(metrics.adaptationRate)],
    ["Guardrail activation", fmtPercent(metrics.guardrailActivationRate)],
    ["Containment events", fmtNumber(metrics.containmentCount)],
    ["Invalid JSON events", fmtNumber(metrics.invalidJson)],
    ["Fallback events", fmtNumber(metrics.fallbacks)],
    ["Attempts to success", fmtNumber(metrics.attemptsToSuccess)],
    ["Tokens", fmtNumber(metrics.tokenCount)],
    ["LLM calls", fmtNumber(metrics.llmCalls)],
  ];
  return (
    <div className="metrics-summary">
      <dl className="metrics-list">
        {values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="numeric-value">{value}</dd></div>)}
      </dl>
      {Object.keys(result.metricReadings).length > 0 && (
        <section className="metric-readings">
          <h3>Additional recorded metrics</h3>
          <dl className="metrics-list">
            {Object.entries(result.metricReadings).map(([key, reading]) => (
              <div key={key}>
                <dt>{readable(key)}</dt>
                <dd>
                  <span className="numeric-value">{reading.available ? key.includes("cost") ? fmtCost(reading.value) : fmtNumber(reading.value, 4) : "Unavailable"}</span>
                  {!reading.available && reading.reason && <p>{reading.reason}</p>}
                  {reading.nAvailable !== undefined && <p>Available {reading.nAvailable} · unavailable {reading.nUnavailable ?? "—"}</p>}
                  {Object.entries(reading.unavailableReasons ?? {}).map(([reason, count]) => <p key={reason}>{readable(reason)} · {count}</p>)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

function OutcomeBadge({ value }: { value: string }) {
  const variant = value === "confirmed" ? "lime" : value === "no_finding" ? "outline" : value === "fixture_limited" ? "amber" : "outline";
  return <Badge variant={variant}>{readable(value)} <code className="status-code">{value}</code></Badge>;
}

function EvidenceReference({ reference, onClick }: { reference: string; onClick?: (reference: string) => void }) {
  if (!onClick) return <code className="evidence-reference">{reference}</code>;
  return <button type="button" className="ui-link evidence-reference" onClick={() => onClick(reference)}>{reference}</button>;
}

function condition(coordinate: CoordinateSummary): string {
  return coordinate.experimentCondition || [coordinate.surface, coordinate.securityLevel, coordinate.payloadMode].filter(isPresentString).map(readable).join(" · ");
}

function dimensionLabel(dimension: string): string {
  const labels: Record<string, string> = {
    Smethod: "Method selection",
    Spayload: "Payload quality",
    Sexploit: "Exploit execution",
    Schain: "Attack chain",
    Soutput: "Evidence and output",
    Srun: "Overall run score",
  };
  return labels[dimension] ?? dimension;
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareNullableNumber(left: number | null | undefined, right: number | null | undefined, descending: boolean): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return descending ? right - left : left - right;
}

function isPresentString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function readable(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
