"use client";

import { useMemo, useState } from "react";
import type { CoordinateSummary, NormalizedResult } from "@/lib/schemas";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtProvider, fmtScore } from "@/lib/formatters";
import { CONDITION_LABELS, LEVEL_LABELS, PAYLOAD_MODE_LABELS, SURFACE_LABELS, labelFor } from "@/lib/control-options";

type SortKey = "index" | "execution" | "outcome" | "condition" | "method" | "score";

/** Searchable, filterable coordinate chooser with stable execution identity. */
export function CoordinateIndex({
  result,
  selected,
  onSelect,
}: {
  result: NormalizedResult;
  selected: string | null;
  onSelect: (coordinate: CoordinateSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [execution, setExecution] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [historical, setHistorical] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const historicalValues = useMemo(
    () => Array.from(new Set(result.coordinates.flatMap((coordinate) => coordinate.historicalAnalysis ? [coordinate.historicalAnalysis.classification] : []))).sort(),
    [result.coordinates],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = result.coordinates.filter((coordinate) => {
      const searchable = [
        coordinate.executionId,
        coordinate.runId,
        coordinate.experimentCondition,
        coordinate.surface,
        coordinate.securityLevel,
        coordinate.payloadMode,
        coordinate.provider,
        coordinate.model,
        coordinate.selectedMethod,
        coordinate.targetMethod,
      ].filter(Boolean).join(" ").toLowerCase();
      return (!needle || searchable.includes(needle))
        && (execution === "all" || (coordinate.executionStatus ?? "unknown") === execution)
        && (outcome === "all" || (coordinate.securityOutcome ?? "unknown") === outcome)
        && (historical === "all" || coordinate.historicalAnalysis?.classification === historical);
    });
    rows.sort((left, right) => {
      let order = 0;
      let nullableNumericSort = false;
      switch (sortKey) {
        case "index": order = left.index - right.index; break;
        case "execution": order = compare(left.executionStatus ?? "unknown", right.executionStatus ?? "unknown"); break;
        case "outcome": order = compare(left.securityOutcome ?? "unknown", right.securityOutcome ?? "unknown"); break;
        case "condition": order = compare(condition(left), condition(right)); break;
        case "method": order = compare(left.selectedMethod ?? left.targetMethod ?? "", right.selectedMethod ?? right.targetMethod ?? ""); break;
        case "score": order = compareNullableNumber(left.scores.Srun, right.scores.Srun, descending); nullableNumericSort = true; break;
      }
      return (nullableNumericSort ? order : descending ? -order : order) || left.index - right.index;
    });
    return rows;
  }, [result.coordinates, query, execution, outcome, historical, sortKey, descending]);

  if (!result.isMatrix) return null;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const reset = () => {
    setQuery("");
    setExecution("all");
    setOutcome("all");
    setHistorical("all");
    setSortKey("index");
    setDescending(false);
    setPage(0);
  };

  return (
    <div className="coordinate-index flex flex-col gap-3 p-3">
      <div className="filter-bar coordinate-filters flex flex-wrap items-end gap-3">
        <label className="field coordinate-search min-w-[16rem] flex-1">
          <span className="label">Search coordinates</span>
          <input
            className="form-control"
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder="Execution, method, condition…"
          />
        </label>
        <FilterSelect label="Execution" value={execution} onChange={(value) => { setExecution(value); setPage(0); }} options={uniqueOptions(result.coordinates.map((coordinate) => coordinate.executionStatus ?? "unknown"))} />
        <FilterSelect label="Security outcome" value={outcome} onChange={(value) => { setOutcome(value); setPage(0); }} options={uniqueOptions(result.coordinates.map((coordinate) => coordinate.securityOutcome ?? "unknown"))} />
        <label className="field">
          <span className="label">Sort by</span>
          <select className="form-control" aria-label="Sort coordinates" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="index">Coordinate order</option>
            <option value="execution">Execution status</option>
            <option value="outcome">Security outcome</option>
            <option value="condition">Condition</option>
            <option value="method">Method</option>
            <option value="score">Provisional Srun</option>
          </select>
        </label>
        <Button variant="outline" onClick={() => setDescending((value) => !value)} aria-label={descending ? "Sort ascending" : "Sort descending"}>
          {descending ? "Descending" : "Ascending"}
        </Button>
        <Button variant="ghost" onClick={reset} disabled={!query && execution === "all" && outcome === "all" && historical === "all" && sortKey === "index" && !descending}>
          Reset filters
        </Button>
      </div>

      <details className="advanced-filters space-y-3 rounded-md border p-3">
        <summary>Advanced filters</summary>
        <label className="field">
          <span className="label">Historical analysis</span>
          <select className="form-control" aria-label="Filter historical analysis" value={historical} onChange={(event) => { setHistorical(event.target.value); setPage(0); }}>
            <option value="all">All classifications</option>
            {historicalValues.map((value) => <option key={value} value={value}>{readable(value)}</option>)}
          </select>
        </label>
      </details>

      <p className="results-count" aria-live="polite">Showing {pageRows.length} of {filtered.length} matching coordinates · {result.coordinates.length} total</p>

      <div className="table-container coordinate-table-container max-h-[32rem] overflow-auto">
        <table className="data-table coordinate-table" aria-label="Matrix coordinates">
          <thead>
            <tr>
              <th scope="col">Coordinate</th>
              <th scope="col">Condition</th>
              <th scope="col">Method and provider</th>
              <th scope="col">Execution</th>
              <th scope="col">Security outcome</th>
              <th scope="col" className="numeric-column">Repeat</th>
              <th scope="col" className="numeric-column">Provisional Srun</th>
              <th scope="col">Score origin</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((coordinate) => {
              const active = selected === coordinate.executionId;
              const executionStatus = coordinate.executionStatus ?? "unknown";
              const securityOutcome = coordinate.securityOutcome ?? "unknown";
              return (
                <tr key={coordinate.executionId} className={active ? "selected" : undefined} aria-current={active ? "true" : undefined}>
                  <td>
                    <button
                      type="button"
                      aria-label={`Coordinate ${coordinate.index + 1}: ${executionStatus}, ${securityOutcome}, ${coordinate.executionId}`}
                      aria-pressed={active}
                      className="coordinate-select ui-link"
                      onClick={() => onSelect(coordinate)}
                    >
                      <span>Coordinate {coordinate.index + 1}</span>
                      <code>{coordinate.executionId}</code>
                    </button>
                  </td>
                  <td>
                    <span>{condition(coordinate)}</span>
                    <small>{[
                      coordinate.surface && labelFor(SURFACE_LABELS, coordinate.surface),
                      coordinate.securityLevel && labelFor(LEVEL_LABELS, coordinate.securityLevel),
                      coordinate.payloadMode && labelFor(PAYLOAD_MODE_LABELS, coordinate.payloadMode),
                    ].filter(isPresentString).join(" · ") || "Condition details unavailable"}</small>
                  </td>
                  <td>
                    <span>{coordinate.selectedMethod ?? coordinate.targetMethod ?? "Unavailable"}</span>
                    <small>{[fmtProvider(coordinate.provider), coordinate.model].filter(Boolean).join(" · ") || "Provider details unavailable"}</small>
                  </td>
                  <td><StatusBadge value={executionStatus} /></td>
                  <td><StatusBadge value={securityOutcome} outcome /></td>
                  <td className="numeric-column tabular-nums">{coordinate.repeatIndex == null ? "Unavailable" : coordinate.repeatIndex}</td>
                  <td className="numeric-column tabular-nums">{coordinate.scores.Srun == null ? "Unavailable" : fmtScore(coordinate.scores.Srun, 4)}</td>
                  <td>{coordinate.scores.Srun == null ? "Unavailable" : "Provisional runtime"}</td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr><td colSpan={8}><div className="empty-state">No coordinates match these filters. Reset filters or change the search.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-pagination flex flex-wrap items-center justify-end gap-3" aria-label="Coordinate pages">
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
      <p className="helper-copy">Final Human and AI review details load when a coordinate is selected. Scores listed here are provisional runtime values.</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select className="form-control" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{readable(option)}</option>)}
      </select>
    </label>
  );
}

function StatusBadge({ value, outcome = false }: { value: string; outcome?: boolean }) {
  const variant = value === "confirmed" ? "lime" : value === "completed" ? "cyan" : value === "failed" || value === "error" ? "red" : value === "interrupted" || value === "fixture_limited" ? "amber" : "outline";
  return <Badge variant={variant}>{readable(value)}{outcome ? <code className="status-code">{value}</code> : null}</Badge>;
}

function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function condition(coordinate: CoordinateSummary): string {
  return coordinate.experimentCondition ? labelFor(CONDITION_LABELS, coordinate.experimentCondition) : "Unavailable";
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareNullableNumber(left: number | undefined, right: number | undefined, descending: boolean): number {
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
