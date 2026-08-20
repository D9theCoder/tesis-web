"use client";

import { Drawer } from "@/components/ui/primitives";
import type { EvidenceRow } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { fmtClockMs, prettyJson, truncate } from "@/lib/formatters";

/**
 * Evidence drawer: renders the full redacted detail behind a table row —
 * prompt/response, structured LLM data, payload provenance, validation
 * decision, response/timing evidence, verifier decision and related events.
 */
export function EvidenceDrawer({
  row,
  open,
  onClose,
}: {
  row: EvidenceRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Evidence Detail" side="right">
      {!row ? (
        <p className="font-mono text-[11px] text-graphite-500">No record selected.</p>
      ) : (
        <div className="space-y-4">
          <section>
            <SectionTitle>Record</SectionTitle>
            <div className="space-y-1 rounded-sm border border-graphite-700/60 bg-graphite-900/50 p-2">
              <KV k="phase" v={row.phase} />
              <KV k="node" v={row.node} />
              <KV k="method" v={row.method} />
              <KV k="route" v={row.route} />
              <KV k="action" v={row.action} />
              <KV k="result" v={row.result} />
              <KV k="timestamp" v={row.timestampEpoch ? fmtClockMs(row.timestampEpoch * 1000) : "—"} />
            </div>
          </section>

          {row.candidate != null && (
            <section>
              <SectionTitle>Candidate / Parameter</SectionTitle>
              <pre className="overflow-auto rounded-sm border border-graphite-700/60 bg-graphite-900/50 p-2 font-mono text-[11px] text-signal-300">
                {typeof row.candidate === "string" ? row.candidate : prettyJson(row.candidate)}
              </pre>
            </section>
          )}

          <section>
            <SectionTitle>Structured Data</SectionTitle>
            <pre className="max-h-64 overflow-auto rounded-sm border border-graphite-700/60 bg-graphite-900/50 p-2 font-mono text-[10px] leading-snug text-graphite-300">
              {prettyJson(row.details)}
            </pre>
          </section>

          <section>
            <SectionTitle>Safety markers</SectionTitle>
            <div className="flex gap-2">
              <SafetyChip level={row.safety} />
              <Badge variant={row.status === "success" ? "lime" : row.status === "safety" ? "red" : "outline"}>
                status: {row.status}
              </Badge>
              {row.signal && row.signal !== "—" && <Badge variant="cyan">signal: {row.signal}</Badge>}
            </div>
          </section>

          {row.relatedEventIds.length > 0 && (
            <section>
              <SectionTitle>Related event IDs</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {row.relatedEventIds.map((id) => (
                  <code key={id} className="rounded-sm bg-graphite-800 px-1 py-0.5 font-mono text-[9px] text-graphite-400">{id}</code>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Provenance note</SectionTitle>
            <p className="font-mono text-[10px] leading-relaxed text-graphite-500">
              All prompt/response content shown here has been redacted at the
              journal and adapter layers. No credentials or session data are
              returned by the API.
            </p>
          </section>
        </div>
      )}
    </Drawer>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1.5 text-label">{children}</h4>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-graphite-500">{k}</span>
      <span className="truncate text-right font-mono text-[11px] text-graphite-200">
        {v == null || v === "" ? "—" : typeof v === "string" ? truncate(v, 240) : v}
      </span>
    </div>
  );
}

function SafetyChip({ level }: { level: string }) {
  const map: Record<string, string> = {
    danger: "bg-danger-500/15 text-danger-400 border-danger-500/50",
    high: "bg-ember-500/15 text-ember-300 border-ember-500/50",
    medium: "bg-graphite-800 text-graphite-300 border-graphite-600",
    low: "bg-graphite-800 text-graphite-400 border-graphite-600",
  };
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase ${map[level] ?? map.low}`}>
      safety: {level}
    </span>
  );
}
