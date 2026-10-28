"use client";

import type { ReactNode } from "react";
import { Drawer, Badge } from "@/components/ui/primitives";
import type { EvidenceRow } from "@/lib/schemas";
import { fmtClockMs, prettyJson } from "@/lib/formatters";

/** Full redacted detail behind an evidence row. */
export function EvidenceDrawer({
  row,
  open,
  onClose,
  onSelectRelated,
}: {
  row: EvidenceRow | null;
  open: boolean;
  onClose: () => void;
  onSelectRelated?: (id: string) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Evidence detail" side="right">
      {!row ? (
        <p className="empty-state compact-empty-state">No evidence record is selected.</p>
      ) : (
        <div className="evidence-detail flex flex-col gap-5">
          <section className="space-y-3">
            <h3 className="section-heading">Record</h3>
            <dl className="evidence-record-fields grid gap-3">
              <KV label="Evidence ID" value={<code>{row.id}</code>} />
              <KV label="Phase" value={readable(row.phase)} />
              <KV label="Node" value={row.node} />
              <KV label="Method" value={row.method} />
              <KV label="Route" value={row.route} />
              <KV label="Action" value={row.action} />
              <KV label="Result" value={row.result} />
              <KV label="Timestamp" value={row.timestampEpoch ? fmtClockMs(row.timestampEpoch * 1000) : "—"} />
            </dl>
          </section>

          <section className="evidence-safety-summary space-y-3">
            <h3 className="section-heading">Status and safety</h3>
            <div className="badge-row">
              <Badge variant={row.status === "success" ? "lime" : row.status === "failure" || row.status === "safety" ? "red" : row.status === "model" ? "violet" : "outline"}>
                {readable(row.status)}
              </Badge>
              <SafetyBadge level={row.safety} />
              {row.signal && row.signal !== "—" && <Badge variant="outline">Signal · {row.signal}</Badge>}
            </div>
          </section>

          {row.candidate != null && (
            <section>
              <h3 className="section-heading">Candidate or parameter</h3>
              <pre className="structured-value max-h-64 overflow-auto rounded-md border p-3 font-mono text-sm">{typeof row.candidate === "string" ? row.candidate : prettyJson(row.candidate)}</pre>
            </section>
          )}

          <section className="space-y-3">
            <details className="structured-disclosure">
              <summary>Structured data</summary>
              <pre className="structured-value max-h-96 overflow-auto rounded-md border p-3 font-mono text-sm">{prettyJson(row.details)}</pre>
            </details>
          </section>

          {row.relatedEventIds.length > 0 && (
            <section className="space-y-3">
              <h3 className="section-heading">Related event IDs</h3>
              <div className="related-event-list">
                {row.relatedEventIds.map((id) => (
                  <button key={id} type="button" className="ui-link" onClick={event => {
                    // The related-record button may disappear after navigation.
                    // Move focus to the stable header before replacing its body.
                    event.currentTarget.closest('[role="dialog"]')
                      ?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.focus();
                    onSelectRelated?.(id);
                  }}>{id}</button>
                ))}
              </div>
            </section>
          )}

          <p className="helper-copy evidence-redaction-note">
            Prompt and response content is redacted by the journal and adapter layers. Credentials and session data are not returned by the observer API.
          </p>
        </div>
      )}
    </Drawer>
  );
}

function KV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value == null || value === "" ? "Unavailable" : value}</dd>
    </div>
  );
}

function SafetyBadge({ level }: { level: string }) {
  const variant = level === "danger" ? "red" : level === "high" ? "amber" : "outline";
  return <Badge variant={variant}>Safety · {readable(level)}</Badge>;
}

function readable(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
