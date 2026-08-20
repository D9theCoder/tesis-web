"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { EvidenceRow } from "@/lib/schemas";
import { Badge, Button, ScrollArea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { fmtClockMs, truncate } from "@/lib/formatters";

const STATUS_ROW: Record<EvidenceRow["status"], { cls: string; label: string }> = {
  success: { cls: "bg-confirm-500/10", label: "success" },
  failure: { cls: "bg-danger-500/10", label: "failure" },
  safety: { cls: "bg-danger-500/15", label: "safety" },
  model: { cls: "bg-violet-500/10", label: "model" },
  info: { cls: "bg-graphite-800/30", label: "info" },
};

const STATUS_BADGE: Record<EvidenceRow["status"], "lime" | "red" | "amber" | "violet" | "outline"> = {
  success: "lime",
  failure: "red",
  safety: "red",
  model: "violet",
  info: "outline",
};

export function DetailTable({
  rows,
  onOpen,
}: {
  rows: EvidenceRow[];
  onOpen: (row: EvidenceRow) => void;
}) {
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [nodeFilter, setNodeFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");

  const phases = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.phase));
    return ["all", ...Array.from(set)].sort();
  }, [rows]);
  const statuses = ["all", "success", "failure", "safety", "model", "info"];
  const nodes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.node && set.add(r.node));
    return ["all", ...Array.from(set)].sort();
  }, [rows]);
  const methods = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.method && set.add(r.method));
    return ["all", ...Array.from(set)].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const fromEpoch = fromTime ? Date.parse(fromTime) / 1000 : null;
    const toEpoch = toTime ? Date.parse(toTime) / 1000 : null;
    return rows
      .filter((r) => phaseFilter === "all" || r.phase === phaseFilter)
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => nodeFilter === "all" || (r.node ?? "") === nodeFilter)
      .filter((r) => methodFilter === "all" || (r.method ?? "") === methodFilter)
      .filter((r) => fromEpoch == null || r.timestampEpoch >= fromEpoch)
      .filter((r) => toEpoch == null || r.timestampEpoch <= toEpoch)
      .sort((a, b) => a.timestampEpoch - b.timestampEpoch);
  }, [rows, phaseFilter, statusFilter, nodeFilter, methodFilter, fromTime, toTime]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-graphite-700/60 px-3 py-2">
        <FilterSelect label="phase" value={phaseFilter} onChange={setPhaseFilter} options={phases} />
        <FilterSelect label="status" value={statusFilter} onChange={setStatusFilter} options={statuses} />
        <FilterSelect label="node" value={nodeFilter} onChange={setNodeFilter} options={nodes} />
        <FilterSelect label="method" value={methodFilter} onChange={setMethodFilter} options={methods} />
        <label className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
          from
          <input
            type="datetime-local"
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
            className="w-[150px] rounded-sm border border-graphite-700 bg-graphite-900 px-1.5 py-0.5 font-mono text-[10px] text-graphite-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50"
            aria-label="Filter events from timestamp"
          />
        </label>
        <label className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
          to
          <input
            type="datetime-local"
            value={toTime}
            onChange={(e) => setToTime(e.target.value)}
            className="w-[150px] rounded-sm border border-graphite-700 bg-graphite-900 px-1.5 py-0.5 font-mono text-[10px] text-graphite-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50"
            aria-label="Filter events through timestamp"
          />
        </label>
        <span className="ml-auto font-mono text-[10px] text-graphite-500">{filtered.length} rows</span>
      </div>
      <ScrollArea className="flex-1">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-graphite-850">
            <tr className="text-label">
              <th className="px-2 py-1.5">Time</th>
              <th className="px-2 py-1.5">Node / Phase</th>
              <th className="hidden px-2 py-1.5 md:table-cell">Method / Route</th>
              <th className="px-2 py-1.5">Action</th>
              <th className="hidden px-2 py-1.5 lg:table-cell">Candidate</th>
              <th className="px-2 py-1.5">Result</th>
              <th className="hidden px-2 py-1.5 sm:table-cell">Signal</th>
              <th className="px-2 py-1.5">Safety</th>
              <th className="w-8 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const sr = STATUS_ROW[row.status];
              return (
                <tr
                  key={row.id}
                  onClick={() => onOpen(row)}
                  className={cn(
                    "cursor-pointer border-t border-graphite-700/40 transition-colors hover:bg-graphite-800/60",
                    sr.cls,
                  )}
                >
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-graphite-400">
                    {row.timestampEpoch ? fmtClockMs(row.timestampEpoch * 1000) : "—"}
                  </td>
                  <td className="max-w-[140px] px-2 py-1.5">
                    <div className="truncate font-mono text-[10px] text-graphite-200">{row.node ?? "—"}</div>
                    <div className="truncate font-mono text-[9px] text-graphite-500">{row.phase}</div>
                  </td>
                  <td className="hidden max-w-[150px] px-2 py-1.5 md:table-cell">
                    <div className="truncate font-mono text-[10px] text-graphite-300">{row.method ?? "—"}</div>
                    {row.route && <div className="truncate font-mono text-[9px] text-graphite-500">{row.route}</div>}
                  </td>
                  <td className="max-w-[200px] px-2 py-1.5">
                    <span className="truncate font-mono text-[10px] text-graphite-200" title={row.action}>
                      {truncate(row.action, 48)}
                    </span>
                  </td>
                  <td className="hidden max-w-[160px] px-2 py-1.5 lg:table-cell">
                    <span className="truncate font-mono text-[10px] text-signal-300" title={String(row.candidate ?? "")}>
                      {row.candidate != null ? truncate(String(row.candidate), 36) : "—"}
                    </span>
                  </td>
                  <td className="max-w-[140px] px-2 py-1.5">
                    <span className="truncate font-mono text-[10px] text-graphite-300" title={row.result}>
                      {truncate(row.result, 32)}
                    </span>
                  </td>
                  <td className="hidden max-w-[120px] px-2 py-1.5 sm:table-cell">
                    {row.signal && row.signal !== "—" ? (
                      <span className="truncate font-mono text-[10px] text-confirm-400">{truncate(row.signal, 24)}</span>
                    ) : (
                      <span className="font-mono text-[10px] text-graphite-600">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <SafetyBadge level={row.safety} />
                  </td>
                  <td className="px-2 py-1.5">
                    <ChevronRight size={12} className="text-graphite-600" />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center font-mono text-[11px] text-graphite-500">
                  No matching execution records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-graphite-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-graphite-700 bg-graphite-900 px-1.5 py-0.5 font-mono text-[10px] text-graphite-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function SafetyBadge({ level }: { level: string }) {
  if (level === "danger") return <Badge variant="red">containment</Badge>;
  if (level === "high") return <Badge variant="amber">guardrail</Badge>;
  if (level === "medium") return <Badge variant="outline">scope</Badge>;
  return <Badge variant="outline">ok</Badge>;
}

export { Button };
