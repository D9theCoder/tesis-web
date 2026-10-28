import type { ReactNode } from "react";
import type { NormalizedResult, ReviewWorkflow, StatusReason } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/copy-button";
import { fmtProvider, fmtDuration, fmtIsoFromStr, fmtNumber, fmtScore, prettyJson } from "@/lib/formatters";
import { CONDITION_LABELS, LEVEL_LABELS, PAYLOAD_MODE_LABELS, SURFACE_LABELS, labelFor } from "@/lib/control-options";

export function ResultsSummary({
  result,
  onEvidenceRef,
  loadingCoordinate = false,
  unavailableCoordinateId,
}: {
  result: NormalizedResult;
  onEvidenceRef?: (reference: string) => void;
  loadingCoordinate?: boolean;
  unavailableCoordinateId?: string;
}) {
  const coverage = result.coverage;
  return (
    <div className="results-summary-view space-y-4 p-4">
      {loadingCoordinate && (
        <p className="notice" role="status">Loading full details for {result.executionId}. The summary below reflects catalog fields until the coordinate artifact is available.</p>
      )}
      {unavailableCoordinateId && (
        <p className="notice" role="status">Detail unavailable for {unavailableCoordinateId}. The summary below reflects catalog fields only.</p>
      )}
      <div className="summary-grid">
        <SummarySection title="Execution">
          <SummaryValue label="Execution status"><ExecutionBadge value={result.executionStatus ?? "unknown"} /></SummaryValue>
          <SummaryValue label="Started">{fmtIsoFromStr(result.startedAt)}</SummaryValue>
          <SummaryValue label="Duration">{fmtDuration(result.durationMs)}</SummaryValue>
          <SummaryValue label="Condition">{result.experimentCondition ? labelFor(CONDITION_LABELS, result.experimentCondition) : "Unavailable"}</SummaryValue>
          <SummaryValue label="Surface and level">{[result.surface && labelFor(SURFACE_LABELS, result.surface), result.securityLevel && labelFor(LEVEL_LABELS, result.securityLevel)].filter(isPresentString).join(" · ") || "Unavailable"}</SummaryValue>
          <SummaryValue label="Method">{result.selectedMethod ?? result.targetMethod ?? "Unavailable"}</SummaryValue>
          <SummaryValue label="Provider and model">{[fmtProvider(result.provider), result.model].filter(Boolean).join(" · ") || "Unavailable"}</SummaryValue>
          <SummaryValue label="Payload mode">{result.payloadMode ? labelFor(PAYLOAD_MODE_LABELS, result.payloadMode) : "Unavailable"}</SummaryValue>
          {result.workflow && <>
            <SummaryValue label="Stop policy">{readable(result.workflow.stop_policy)}</SummaryValue>
            <SummaryValue label="Method visits">{result.workflow.iteration_count} / {result.workflow.max_iterations}</SummaryValue>
            <SummaryValue label="Method coverage">{result.workflow.method_coverage.attempted} / {result.workflow.method_coverage.total} ({Math.round(result.workflow.method_coverage.ratio * 100)}%)</SummaryValue>
            {result.workflow.stop_policy === "coverage" && <SummaryValue label="Coverage target">{Math.round(result.workflow.coverage_target * 100)}%</SummaryValue>}
            <SummaryValue label="Stop reason">{result.workflow.stop_reason ? readable(result.workflow.stop_reason) : "Not recorded"}</SummaryValue>
          </>}
          <SummaryValue label="Repeat">{result.repeatIndex == null ? "Unavailable" : fmtNumber(result.repeatIndex)}</SummaryValue>
        </SummarySection>

        <SummarySection title="Security outcome">
          <SummaryValue label="Outcome"><OutcomeBadge value={result.securityOutcome ?? "unknown"} /></SummaryValue>
          <SummaryValue label="Experiment outcome">{result.experimentOutcome ? readable(result.experimentOutcome) : "Unavailable"}</SummaryValue>
          <SummaryValue label="Confirmed vulnerabilities">
            {result.confirmedVulns.length ? <ValueList values={result.confirmedVulns} /> : "None recorded"}
          </SummaryValue>
          <SummaryValue label="Achieved outcomes">
            {result.achievedOutcomes.length ? <ValueList values={result.achievedOutcomes} /> : "None recorded"}
          </SummaryValue>
          <Reason label="Execution reason" reason={result.executionReason} onEvidenceRef={onEvidenceRef} />
          <Reason label="Security outcome reason" reason={result.securityOutcomeReason} onEvidenceRef={onEvidenceRef} />
        </SummarySection>

        <SummarySection title="Coverage">
          {coverage ? (
            <SummaryValue label="Coordinate counts">
              <dl className="coverage-counts grid grid-cols-2 gap-x-4 gap-y-2">
                <SummaryValue label="Represented">{fmtNumber(coverage.represented)}</SummaryValue>
                <SummaryValue label="Planned">{coverage.planned == null ? "Unavailable" : fmtNumber(coverage.planned)}</SummaryValue>
                <SummaryValue label="Unstarted">{coverage.unstarted == null ? "Unavailable" : fmtNumber(coverage.unstarted)}</SummaryValue>
                <SummaryValue label="Completed">{fmtNumber(coverage.completed)}</SummaryValue>
                <SummaryValue label="Failed">{fmtNumber(coverage.failed)}</SummaryValue>
                <SummaryValue label="Interrupted">{fmtNumber(coverage.interrupted)}</SummaryValue>
                <SummaryValue label="Confirmed">{fmtNumber(coverage.confirmed)}</SummaryValue>
                <SummaryValue label="Unknown">{fmtNumber(coverage.unknown)}</SummaryValue>
                <SummaryValue label="Skipped">{fmtNumber(coverage.skipped)}</SummaryValue>
              </dl>
            </SummaryValue>
          ) : (
            <p className="empty-state compact-empty-state">Coverage is unavailable in this result artifact.</p>
          )}
        </SummarySection>

        <SummarySection title="Review state">
          <SummaryValue label="Runtime score origin"><span className="score-origin-value">{result.scoreOrigin}</span></SummaryValue>
          <SummaryValue label="Provisional runtime Srun"><span className="numeric-value">{fmtScore(result.scores.Srun, 4)}</span></SummaryValue>
          <ReviewSummary label="Human review" workflow={result.reviews?.human} />
          <ReviewSummary label="AI review" workflow={result.reviews?.ai} />
          {!result.reviews && <SummaryValue label="Independent reviews">No Human or AI review bundle is available in this artifact.</SummaryValue>}
        </SummarySection>
      </div>

      <details className="result-details-disclosure">
        <summary>Full coverage, reasons, and source details</summary>
        <StatusDetails result={result} onEvidenceRef={onEvidenceRef} />
      </details>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="summary-item space-y-4 rounded-md border p-4">
      <h2 className="section-heading">{title}</h2>
      <dl className="summary-values grid grid-cols-[minmax(7rem,0.42fr)_minmax(0,1fr)] gap-x-3 gap-y-3">{children}</dl>
    </section>
  );
}

function SummaryValue({ label, children }: { label: string; children: ReactNode }) {
  return <><dt>{label}</dt><dd>{children}</dd></>;
}

function ReviewSummary({ label, workflow }: { label: string; workflow: ReviewWorkflow | undefined }) {
  if (!workflow) return <SummaryValue label={label}><span>Unavailable</span></SummaryValue>;
  const final = workflow.status === "final";
  return (
    <SummaryValue label={label}>
      <span className="review-summary-line flex flex-wrap items-center gap-3">
        <Badge variant={final ? "lime" : workflow.status === "stale" ? "amber" : "outline"}>{readable(workflow.status)}</Badge>
        <span className="numeric-value">Srun {fmtScore(workflow.SrunFinal, 4)}</span>
      </span>
      {workflow.rubric && <small>Rubric {workflow.rubric}</small>}
      {workflow.reason && <small>{workflow.reason}</small>}
      {workflow.source?.sha256 && <small className="source-hash">Source SHA-256 <code>{workflow.source.sha256}</code></small>}
    </SummaryValue>
  );
}

function ValueList({ values }: { values: string[] }) {
  return <ul className="summary-value-list">{values.map((value) => <li key={value}>{readable(value)}</li>)}</ul>;
}

export function StatusDetails({ result, onEvidenceRef }: { result: NormalizedResult; onEvidenceRef?: (reference: string) => void }) {
  const coverage = result.coverage;
  return (
    <div className="status-details space-y-4 pt-4">
      <dl className="metadata-grid status-metadata">
        <div><dt>Execution status value</dt><dd><code>{result.executionStatus ?? "unknown"}</code></dd></div>
        <div><dt>Security outcome value</dt><dd><code>{result.securityOutcome ?? "unknown"}</code></dd></div>
        <div><dt>Run ID</dt><dd><code>{result.runId ?? "Unavailable"}</code></dd></div>
        <div><dt>Matrix execution ID</dt><dd><code>{result.matrixExecutionId ?? "Unavailable"}</code></dd></div>
        <div><dt>Target URL</dt><dd>{result.targetUrl ?? "Unavailable"}</dd></div>
        <div><dt>Ended</dt><dd>{fmtIsoFromStr(result.endedAt)}</dd></div>
      </dl>

      {(result.executionReason || result.securityOutcomeReason) && (
        <dl className="status-reasons space-y-3">
          <Reason label="Execution reason" reason={result.executionReason} onEvidenceRef={onEvidenceRef} />
          <Reason label="Security outcome reason" reason={result.securityOutcomeReason} onEvidenceRef={onEvidenceRef} />
        </dl>
      )}

      <details className="result-details-disclosure">
        <summary>Legacy artifact fields</summary>
        <p>Legacy status: <code>{result.status}</code></p>
        <p>Legacy task result: {result.taskResult ? readable(result.taskResult) : "Unavailable"}</p>
      </details>

      {result.historicalAnalysis && (
        <details className="result-details-disclosure">
          <summary>Historical analysis · {readable(result.historicalAnalysis.classification)}</summary>
          <p>Source <code>{result.historicalAnalysis.source}</code> · epoch <code>{result.historicalAnalysis.epoch}</code></p>
          <p>SHA-256 <code>{result.historicalAnalysis.sha256}</code></p>
        </details>
      )}

      {coverage && (
        <details className="result-details-disclosure">
          <summary>Execution and outcome counts</summary>
          <CountTable title="Execution status counts" values={coverage.executionCounts} />
          <CountTable title="Security outcome counts" values={coverage.outcomeCounts} />
          {Object.entries(result.groupCoverages).length > 0 && (
            <section>
              <h3 className="section-heading">Provider and group coverage</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th scope="col">Group</th><th scope="col" className="numeric-column">Represented</th><th scope="col" className="numeric-column">Completed</th><th scope="col" className="numeric-column">Failed</th><th scope="col" className="numeric-column">Interrupted</th><th scope="col" className="numeric-column">Confirmed</th><th scope="col" className="numeric-column">Unknown</th><th scope="col" className="numeric-column">Skipped</th></tr></thead>
                  <tbody>{Object.entries(result.groupCoverages).map(([key, group]) => <tr key={key}><th scope="row">{key}</th><td className="numeric-column">{group.represented}</td><td className="numeric-column">{group.completed}</td><td className="numeric-column">{group.failed}</td><td className="numeric-column">{group.interrupted}</td><td className="numeric-column">{group.confirmed}</td><td className="numeric-column">{group.unknown}</td><td className="numeric-column">{group.skipped}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          {coverage.legacyTotals && (
            <details className="result-details-disclosure"><summary>Preserved legacy matrix totals</summary><pre>{prettyJson(coverage.legacyTotals)}</pre></details>
          )}
        </details>
      )}

      {result.source && (
        <details className="result-details-disclosure">
          <summary>Original artifact source binding</summary>
          <p>{result.source.rootId}/<code>{result.source.path}</code></p>
          <p>SHA-256 <code>{result.source.sha256}</code> <CopyButton value={result.source.sha256} label="original source SHA-256" /></p>
          {result.source.projection && (
            <div>
              <p>Compatibility projection · {result.source.projection.epoch}</p>
              <p><code>{result.source.projection.path}</code></p>
              <p>SHA-256 <code>{result.source.projection.sha256}</code></p>
            </div>
          )}
        </details>
      )}

      {result.diagnostics.length > 0 && (
        <details className="result-details-disclosure">
          <summary>Retrieval diagnostics ({result.diagnostics.length})</summary>
          <ul>{result.diagnostics.map((diagnostic, index) => <li key={`${index}-${diagnostic}`}>{diagnostic}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function Reason({ label, reason, onEvidenceRef }: { label: string; reason: StatusReason | null; onEvidenceRef?: (reference: string) => void }) {
  if (!reason) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className="status-reason space-y-1"><code>{reason.code}</code>{reason.detail && <> · {reason.detail}</>}
      {reason.evidence_refs.length > 0 && (
        <div className="evidence-references">
          <span>Evidence references</span>
          {reason.evidence_refs.map((reference) => onEvidenceRef ? (
            <button key={reference} type="button" className="ui-link" onClick={() => onEvidenceRef(reference)}>{reference}</button>
          ) : <code key={reference}>{reference}</code>)}
        </div>
      )}
      </dd>
    </>
  );
}

function CountTable({ title, values }: { title: string; values: Record<string, number> }) {
  if (!Object.keys(values).length) return null;
  return (
    <section className="coverage-count-table">
      <h3 className="section-heading">{title}</h3>
      <dl className="metrics-list">{Object.entries(values).map(([label, value]) => <div key={label}><dt>{readable(label)}</dt><dd className="numeric-value">{fmtNumber(value)}</dd></div>)}</dl>
    </section>
  );
}

function ExecutionBadge({ value }: { value: string }) {
  const variant = value === "completed" ? "cyan" : value === "failed" ? "red" : value === "interrupted" ? "amber" : "outline";
  return <Badge variant={variant}>{readable(value)} <code className="status-code">{value}</code></Badge>;
}

function OutcomeBadge({ value }: { value: string }) {
  const variant = value === "confirmed" ? "lime" : value === "fixture_limited" ? "amber" : "outline";
  return <Badge variant={variant}>{readable(value)} <code className="status-code">{value}</code></Badge>;
}

function readable(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPresentString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
