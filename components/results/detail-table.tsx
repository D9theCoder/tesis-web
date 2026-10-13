"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import type { EvidenceRow } from "@/lib/schemas";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtClockMs, truncate } from "@/lib/formatters";

type SortKey = "time" | "phase" | "node" | "method" | "action" | "result" | "status" | "safety";
type Density = "comfortable" | "compact";

const STATUS_VARIANT: Record<EvidenceRow["status"], "lime" | "red" | "amber" | "violet" | "outline"> = {
  success: "lime",
  failure: "red",
  safety: "red",
  model: "violet",
  info: "outline",
};

export function DetailTable({ rows, onOpen }: { rows: EvidenceRow[]; onOpen: (row: EvidenceRow) => void }) {
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nodeFilter, setNodeFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [density, setDensity] = useState<Density>("comfortable");
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const phases = useMemo(() => unique(rows.map((row) => row.phase)), [rows]);
  const nodes = useMemo(() => unique(rows.flatMap((row) => row.node ? [row.node] : [])), [rows]);
  const methods = useMemo(() => unique(rows.flatMap((row) => row.method ? [row.method] : [])), [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromEpoch = parseDateTime(fromTime);
    const toEpoch = parseDateTime(toTime);
    const indexed = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      const searchable = [row.id, row.phase, row.node, row.method, row.route, row.action, row.result, row.signal, row.safety, safeString(row.candidate)]
        .filter(Boolean).join(" ").toLowerCase();
      return (!needle || searchable.includes(needle))
        && (phaseFilter === "all" || row.phase === phaseFilter)
        && (statusFilter === "all" || row.status === statusFilter)
        && (nodeFilter === "all" || (row.node ?? "") === nodeFilter)
        && (methodFilter === "all" || (row.method ?? "") === methodFilter)
        && (fromEpoch == null || row.timestampEpoch >= fromEpoch)
        && (toEpoch == null || row.timestampEpoch <= toEpoch);
    });
    indexed.sort((left, right) => {
      const order = compareRows(left.row, right.row, sortKey);
      return (sortDirection === "asc" ? order : -order) || left.index - right.index;
    });
    return indexed.map(({ row }) => row);
  }, [rows, query, phaseFilter, statusFilter, nodeFilter, methodFilter, fromTime, toTime, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const hasFilters = Boolean(query || phaseFilter !== "all" || statusFilter !== "all" || nodeFilter !== "all" || methodFilter !== "all" || fromTime || toTime);

  const resetFilters = () => {
    setQuery("");
    setPhaseFilter("all");
    setStatusFilter("all");
    setNodeFilter("all");
    setMethodFilter("all");
    setFromTime("");
    setToTime("");
    setPage(0);
  };

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(key === "time" ? "asc" : "asc"); }
    setPage(0);
  };

  return (
    <section className="evidence-review flex h-full min-h-0 flex-col gap-3 p-3" aria-label="Execution evidence">
      <div className="filter-bar evidence-filter-bar flex flex-wrap items-end gap-3">
        <label className="field evidence-search min-w-[16rem] flex-1">
          <span className="label">Search evidence</span>
          <input
            className="form-control"
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder="Search actions, results, methods, or references…"
          />
        </label>
        <FilterSelect label="Phase" value={phaseFilter} onChange={(value) => { setPhaseFilter(value); setPage(0); }} options={phases} />
        <FilterSelect label="Status" value={statusFilter} onChange={(value) => { setStatusFilter(value); setPage(0); }} options={["success", "failure", "safety", "model", "info"]} />
        <label className="field">
          <span className="label">Density</span>
          <select className="form-control" value={density} onChange={(event) => setDensity(event.target.value as Density)}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <Button variant="outline" disabled={!hasFilters} onClick={resetFilters}>Reset filters</Button>
      </div>

      <details className="advanced-filters evidence-advanced-filters space-y-3 rounded-md border p-3">
        <summary>Advanced filters</summary>
        <div className="filter-bar flex flex-wrap items-end gap-3 pt-3">
          <FilterSelect label="Node" value={nodeFilter} onChange={(value) => { setNodeFilter(value); setPage(0); }} options={nodes} />
          <FilterSelect label="Method" value={methodFilter} onChange={(value) => { setMethodFilter(value); setPage(0); }} options={methods} />
          <label className="field">
            <span className="label">From timestamp</span>
            <input className="form-control" type="datetime-local" aria-label="Filter events from timestamp" value={fromTime} onChange={(event) => { setFromTime(event.target.value); setPage(0); }} />
          </label>
          <label className="field">
            <span className="label">Through timestamp</span>
            <input className="form-control" type="datetime-local" aria-label="Filter events through timestamp" value={toTime} onChange={(event) => { setToTime(event.target.value); setPage(0); }} />
          </label>
        </div>
      </details>

      <p className="results-count" aria-live="polite">Showing {pageRows.length} of {filtered.length} matching evidence records · {rows.length} total</p>
      <div className={`table-container evidence-table-container min-h-0 flex-1 overflow-auto density-${density}`}>
        <table className="data-table evidence-table" aria-label="Evidence records">
          <thead>
            <tr>
              <SortHeader label="Time" value="time" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortHeader label="Node" value="node" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortHeader label="Phase" value="phase" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortHeader label="Method and route" value="method" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortHeader label="Action" value="action" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <th scope="col">Candidate</th>
              <SortHeader label="Result" value="result" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <th scope="col">Signal</th>
              <SortHeader label="Status" value="status" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortHeader label="Safety" value="safety" active={sortKey} direction={sortDirection} onSort={changeSort} />
              <th scope="col"><span className="sr-only">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                <td className="tabular-nums whitespace-nowrap">{row.timestampEpoch ? fmtClockMs(row.timestampEpoch * 1000) : "—"}</td>
                <td>
                  <span>{row.node ?? "Unavailable"}</span>
                </td>
                <td>{readable(row.phase)}</td>
                <td>
                  <span>{row.method ?? "Unavailable"}</span>
                  <small>{row.route ?? "Route unavailable"}</small>
                </td>
                <td><span title={row.action}>{truncate(row.action, 64)}</span></td>
                <td><span title={safeString(row.candidate)}>{row.candidate == null ? "—" : truncate(safeString(row.candidate), 52)}</span></td>
                <td><span title={row.result}>{truncate(row.result, 64)}</span></td>
                <td>{row.signal && row.signal !== "—" ? row.signal : "—"}</td>
                <td><Badge variant={STATUS_VARIANT[row.status]}>{readable(row.status)}</Badge></td>
                <td><SafetyBadge level={row.safety} /></td>
                <td>
                  <Button variant="outline" className="inspect-evidence" aria-label={`Inspect evidence ${row.id}`} onClick={() => onOpen(row)}>
                    Inspect <ChevronRight size={14} aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={11}><div className="empty-state"><h2>{rows.length === 0 ? "No evidence records" : "No matching evidence"}</h2><p>{hasFilters ? "Reset filters or change the search to see other execution records." : "This result artifact does not include evidence records."}</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-pagination flex flex-wrap items-center justify-end gap-3" aria-label="Evidence pages">
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
      <p className="helper-copy">Select Inspect to read the full record, including structured data, related event IDs, and any linked evidence.</p>
    </section>
  );
}

function SortHeader({ label, value, active, direction, onSort }: {
  label: string;
  value: SortKey;
  active: SortKey;
  direction: "asc" | "desc";
  onSort: (value: SortKey) => void;
}) {
  const current = active === value;
  return (
    <th scope="col" aria-sort={current ? direction === "asc" ? "ascending" : "descending" : "none"}>
      <button type="button" className="table-sort" onClick={() => onSort(value)} aria-label={`Sort by ${label}${current ? direction === "asc" ? ", ascending" : ", descending" : ""}`}>
        {label}{current ? direction === "asc" ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" /> : <ArrowUpDown size={14} aria-hidden="true" />}
      </button>
    </th>
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

function SafetyBadge({ level }: { level: string }) {
  const variant = level === "danger" ? "red" : level === "high" ? "amber" : "outline";
  const label = level === "danger" ? "Containment" : level === "high" ? "Guardrail" : level === "medium" ? "Scoped" : "Low";
  return <Badge variant={variant}>{label}<code className="status-code">{level}</code></Badge>;
}

function compareRows(left: EvidenceRow, right: EvidenceRow, key: SortKey): number {
  if (key === "time") return left.timestampEpoch - right.timestampEpoch;
  const leftValue = key === "phase" ? left.phase
    : key === "node" ? left.node ?? ""
      : key === "method" ? left.method ?? ""
        : key === "action" ? left.action
          : key === "result" ? left.result
            : key === "status" ? left.status : left.safety;
  const rightValue = key === "phase" ? right.phase
    : key === "node" ? right.node ?? ""
      : key === "method" ? right.method ?? ""
        : key === "action" ? right.action
          : key === "result" ? right.result
            : key === "status" ? right.status : right.safety;
  return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function parseDateTime(value: string): number | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : null;
}

function readable(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
