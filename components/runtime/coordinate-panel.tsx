"use client";

import { Activity, ArrowRight, Clock3, Route, Target } from "lucide-react";
import type { LiveRunState, RunConnectionStatus } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { fmtProvider, fmtClock, fmtDuration } from "@/lib/formatters";

const CONNECTION_STYLE: Record<
  RunConnectionStatus,
  { label: string; variant: "default" | "cyan" | "amber" | "lime" | "red" }
> = {
  waiting: { label: "Waiting", variant: "default" },
  active: { label: "Active", variant: "cyan" },
  stale: { label: "Stale", variant: "amber" },
  completed: { label: "Completed", variant: "cyan" },
  cancelled: { label: "Cancelled", variant: "red" },
  error: { label: "Error", variant: "red" },
};

function MetadataField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const title = typeof value === "string" ? value : undefined;
  return (
    <div className="metadata-field">
      <dt>{label}</dt>
      <dd className={mono ? "metadata-value font-mono" : "metadata-value"} title={title}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function CoordinatePanel({ state }: { state: LiveRunState }) {
  const connection = CONNECTION_STYLE[state.connection];
  const path = state.akgPath.length ? state.akgPath : state.chain;

  return (
    <div className="runtime-panel">
      <header className="runtime-panel-header">
        <div className="runtime-panel-title">
          <Activity aria-hidden="true" size={17} />
          <h2>Runtime coordinate</h2>
        </div>
        <Badge
          variant={connection.variant}
          className={`runtime-status runtime-status--${state.connection}`}
          aria-label={`Connection ${connection.label.toLowerCase()}`}
        >
          <span className="runtime-status-indicator" aria-hidden="true" />
          {connection.label}
        </Badge>
      </header>

      <div className="runtime-panel-body coordinate-panel-body overflow-y-auto overscroll-contain">
        <section className="panel-section coordinate-overview" aria-label="Run timing and status">
          <div className="coordinate-elapsed">
            <span className="coordinate-elapsed-label">
              <Clock3 aria-hidden="true" size={14} /> Elapsed
            </span>
            <strong>{fmtDuration(state.elapsedMs)}</strong>
          </div>
          <dl className="metadata-list">
            <MetadataField label="Status" value={state.status || "Unknown"} />
            <MetadataField
              label="Started"
              value={state.startedAt !== null ? fmtClock(state.startedAt) : "—"}
            />
            <MetadataField
              label="Ended"
              value={state.endedAt !== null ? fmtClock(state.endedAt) : "—"}
            />
          </dl>
        </section>

        <details className="panel-section coordinate-details">
          <summary>Run identifiers and configuration</summary>
          <dl className="metadata-list">
            <MetadataField label="Execution ID" value={state.executionId ?? "—"} mono />
            <MetadataField label="Run ID" value={state.runId ?? "—"} mono />
            <MetadataField label="Mode" value={state.mode} />
            <MetadataField label="Condition" value={state.experimentCondition ?? "—"} />
            <MetadataField label="Surface" value={state.surface ?? "—"} />
            <MetadataField label="Security level" value={state.securityLevel ?? "—"} />
            <MetadataField label="Provider" value={fmtProvider(state.provider) ?? "—"} />
            <MetadataField label="Model" value={state.model ?? "—"} mono />
            <MetadataField label="Payload mode" value={state.payloadMode ?? "—"} />
            <MetadataField label="Target method" value={state.targetMethod ?? "—"} mono />
          </dl>
        </details>

        <section className="panel-section" aria-labelledby="coordinate-traversal-heading">
          <h3 id="coordinate-traversal-heading">Traversal</h3>
          <dl className="metadata-list">
            <MetadataField
              label="Current node"
              value={
                state.currentNode ? (
                  <Badge variant="amber" title={state.currentNode}>
                    {state.currentNode.replace(/_/g, " ")}
                  </Badge>
                ) : (
                  "—"
                )
              }
            />
            <MetadataField label="Selected method" value={state.selectedMethod ?? "—"} mono />
            <MetadataField
              label="Viable methods"
              value={
                state.viableMethods.length ? (
                  <span className="coordinate-method-list">
                    {state.viableMethods.map((method) => (
                      <Badge key={method} variant="cyan" title={method}>
                        {method.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <MetadataField label={state.workflow ? "Method visits" : "Iteration"} value={state.metrics.iterationCount} mono />
            {state.workflow && <>
              <MetadataField label="Stop policy" value={state.workflow.stop_policy} />
              <MetadataField label="Method coverage" value={`${state.workflow.method_coverage.attempted} / ${state.workflow.method_coverage.total}`} />
              <MetadataField label="Stop reason" value={state.workflow.stop_reason?.replace(/_/g, " ") ?? "Pending"} />
            </>}
          </dl>
          <div className="coordinate-path">
            <h4>
              <Route aria-hidden="true" size={14} /> Chain / path
            </h4>
            <PathCrumbs items={path} />
          </div>
        </section>

        <section className="panel-section coordinate-target" aria-labelledby="coordinate-target-heading">
          <div className="coordinate-target-heading">
            <h3 id="coordinate-target-heading">
              <Target aria-hidden="true" size={15} /> Target scope
            </h3>
          </div>
          <p className="coordinate-target-value" title={state.targetUrl ?? undefined}>
            {state.targetUrl ?? "—"}
          </p>
        </section>
      </div>
    </div>
  );
}

function PathCrumbs({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="empty-state coordinate-empty-path">No route has been recorded yet.</p>;
  }

  return (
    <ol className="coordinate-path-list" aria-label="Recorded route">
      {items.map((nodeId, index) => (
        <li key={`${nodeId}-${index}`}>
          {index > 0 && (
            <ArrowRight
              className="coordinate-path-arrow"
              aria-hidden="true"
              size={13}
            />
          )}
          <span
            className={index === items.length - 1 ? "coordinate-path-node is-current" : "coordinate-path-node"}
            title={nodeId}
          >
            {nodeId.replace(/_/g, " ")}
            <span className="sr-only">{nodeId}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
