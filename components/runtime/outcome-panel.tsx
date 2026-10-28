"use client";

import {
  Ban,
  CheckCircle2,
  FileWarning,
  Repeat,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  ExecutionStatus,
  LiveRunState,
  SecurityOutcome,
  StatusReason,
} from "@/lib/schemas";
import { Badge, Progress } from "@/components/ui/primitives";
import { fmtCost, fmtNumber, fmtPercent } from "@/lib/formatters";

function Metric({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  return (
    <div className={`outcome-metric outcome-metric--${tone}`}>
      <span className="outcome-metric-label">
        {icon}
        {label}
      </span>
      <strong>{typeof value === "number" ? fmtNumber(value) : value}</strong>
    </div>
  );
}

function StatusReason({ label, reason }: { label: string; reason: StatusReason | null }) {
  if (!reason) return null;

  return (
    <div className="outcome-reason">
      <h4>{label}</h4>
      <p>
        <code>{reason.code}</code>
        {reason.detail && <span> · {reason.detail}</span>}
      </p>
      {reason.evidence_refs.length > 0 && (
        <p className="outcome-evidence-refs">
          Evidence references: {reason.evidence_refs.join(", ")}
        </p>
      )}
    </div>
  );
}

function executionVariant(
  status: ExecutionStatus | null,
): "outline" | "cyan" | "amber" | "red" {
  if (status === "completed") return "cyan";
  if (status === "failed") return "red";
  if (status === "interrupted") return "amber";
  return "outline";
}

function securityVariant(
  outcome: SecurityOutcome | null,
): "outline" | "lime" | "amber" {
  if (outcome === "confirmed") return "lime";
  if (outcome === "unconfirmed" || outcome === "fixture_limited") return "amber";
  return "outline";
}

function displayStatus(value: string | null): string {
  return value ? value.replace(/_/g, " ") : "Unknown";
}

export function OutcomePanel({ state }: { state: LiveRunState }) {
  const metrics = state.metrics;
  const hasReason = Boolean(state.executionReason || state.securityOutcomeReason);
  const hasDiagnostics = state.diagnostics.length > 0;
  const generationBudgetSet = metrics.generationBudget > 0;
  const generatedCount = metrics.generatedCandidates || metrics.attempts;
  const candidateUsed = generationBudgetSet
    ? Math.min(metrics.generationBudget, generatedCount)
    : metrics.attempts;
  const iterationLimitSet = metrics.maxIterations > 0;
  const iterationUsed = iterationLimitSet
    ? Math.min(metrics.maxIterations, metrics.iterationCount)
    : metrics.iterationCount;
  const guardrailRate =
    metrics.iterationCount > 0
      ? metrics.guardrailCount / metrics.iterationCount
      : 0;

  return (
    <div className="runtime-panel">
      <header className="runtime-panel-header">
        <div className="runtime-panel-title">
          <Sparkles aria-hidden="true" size={17} />
          <h2>Outcomes and budget</h2>
        </div>
      </header>

      <div className="runtime-panel-body outcome-panel-body overflow-y-auto overscroll-contain">
        <section className="panel-section outcome-status" aria-label="Execution and security status">
          <div className="outcome-status-field">
            <span>Execution</span>
            <Badge variant={executionVariant(state.executionStatus)}>
              {displayStatus(state.executionStatus)}
            </Badge>
          </div>
          <div className="outcome-status-field">
            <span>Security outcome</span>
            <Badge variant={securityVariant(state.securityOutcome)}>
              {displayStatus(state.securityOutcome)}
            </Badge>
          </div>
          {hasReason || hasDiagnostics ? (
            <details className="outcome-details">
              <summary>
                Reasons and diagnostics
                {hasDiagnostics && <span>{state.diagnostics.length}</span>}
              </summary>
              <div className="outcome-details-content">
                <StatusReason label="Execution reason" reason={state.executionReason} />
                <StatusReason label="Security reason" reason={state.securityOutcomeReason} />
                {hasDiagnostics && (
                  <div className="outcome-diagnostics">
                    <h4>Diagnostics</h4>
                    <ul>
                      {state.diagnostics.map((diagnostic, index) => (
                        <li key={`${index}-${diagnostic}`}>{diagnostic}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          ) : (
            <p className="outcome-no-details">No status reasons or diagnostics recorded.</p>
          )}
        </section>

        <section
          className={`notice containment-notice ${metrics.containmentCount > 0 ? "notice--danger" : "notice--neutral"}`}
          aria-label="Containment events"
        >
          <ShieldAlert aria-hidden="true" size={17} />
          <span>Containment events</span>
          <strong>{fmtNumber(metrics.containmentCount)}</strong>
        </section>
        {metrics.containmentViolations > 0 && (
          <section className="notice notice--danger containment-notice" aria-label="Blocked external target violations">
            <Ban aria-hidden="true" size={16} />
            <span>External target violations blocked</span>
            <strong>{fmtNumber(metrics.containmentViolations)}</strong>
          </section>
        )}

        <section className="panel-section" aria-labelledby="outcome-counts-heading">
          <h3 id="outcome-counts-heading">Run counts</h3>
          <div className="outcome-metrics">
            <Metric
              label="Positive events"
              value={metrics.successes}
              icon={<CheckCircle2 aria-hidden="true" size={15} />}
              tone="good"
            />
            <Metric
              label="Negative events"
              value={metrics.failures}
              icon={<XCircle aria-hidden="true" size={15} />}
              tone="bad"
            />
            <Metric
              label="Guardrails"
              value={metrics.guardrailCount}
              icon={<ShieldAlert aria-hidden="true" size={15} />}
              tone="warn"
            />
            <Metric
              label="Invalid JSON"
              value={metrics.invalidJson}
              icon={<FileWarning aria-hidden="true" size={15} />}
              tone="warn"
            />
            <Metric
              label="Fallbacks"
              value={metrics.fallbacks}
              icon={<Repeat aria-hidden="true" size={15} />}
            />
            <Metric
              label="Attempts"
              value={metrics.attempts}
              icon={<Sparkles aria-hidden="true" size={15} />}
            />
          </div>
        </section>

        <section className="panel-section outcome-budget" aria-labelledby="outcome-budget-heading">
          <h3 id="outcome-budget-heading">Budget and iteration use</h3>
          <div className="outcome-budget-row">
            <div className="outcome-budget-heading">
              <span>Candidate budget</span>
              <strong>
                {generationBudgetSet
                  ? `${fmtNumber(candidateUsed)} / ${fmtNumber(metrics.generationBudget)}`
                  : `${fmtNumber(candidateUsed)} attempts · no limit set`}
              </strong>
            </div>
            {generationBudgetSet && (
              <Progress
                value={candidateUsed}
                max={metrics.generationBudget}
                color="signal"
                className="outcome-progress"
              />
            )}
          </div>
          <div className="outcome-budget-row">
            <div className="outcome-budget-heading">
              <span>{state.workflow ? "Method visits" : "Iterations"}</span>
              <strong>
                {iterationLimitSet
                  ? `${fmtNumber(iterationUsed)} / ${fmtNumber(metrics.maxIterations)}`
                  : `${fmtNumber(iterationUsed)} · no limit set`}
              </strong>
            </div>
            {iterationLimitSet && (
              <Progress
                value={iterationUsed}
                max={metrics.maxIterations}
                color="amber"
                className="outcome-progress"
              />
            )}
          </div>
          <div className="outcome-budget-row">
            <div className="outcome-budget-heading">
              <span>Guardrail rate</span>
              <strong>
                {fmtPercent(guardrailRate, 1)} · {fmtNumber(metrics.guardrailCount)} / {fmtNumber(metrics.iterationCount)} {state.workflow ? "method visits" : "iterations"}
              </strong>
            </div>
            {metrics.iterationCount > 0 && (
              <Progress
                value={metrics.guardrailCount}
                max={metrics.iterationCount}
                color="red"
                className="outcome-progress"
              />
            )}
          </div>
        </section>

        <section className="panel-section outcome-resource-use" aria-label="Token use and cost">
          <Metric
            label="Tokens"
            value={fmtNumber(metrics.tokenCount)}
            icon={<Sparkles aria-hidden="true" size={15} />}
          />
          <Metric
            label="Cost"
            value={fmtCost(metrics.tokenCost)}
            icon={<Sparkles aria-hidden="true" size={15} />}
          />
        </section>

        <section className="panel-section outcome-findings" aria-labelledby="outcome-findings-heading">
          <h3 id="outcome-findings-heading">Findings</h3>
          <div className="outcome-finding-group">
            <h4>Confirmed vulnerabilities</h4>
            {state.confirmedVulns.length ? (
              <ul>
                {state.confirmedVulns.map((finding) => (
                  <li key={finding} title={finding}>
                    <CheckCircle2 aria-hidden="true" size={14} />
                    {finding.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">No confirmed vulnerabilities recorded.</p>
            )}
          </div>
          <div className="outcome-finding-group">
            <h4>Achieved outcomes</h4>
            {state.achievedOutcomes.length ? (
              <ul>
                {state.achievedOutcomes.map((outcome) => (
                  <li key={outcome} title={outcome}>
                    <CheckCircle2 aria-hidden="true" size={14} />
                    {outcome.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">No achieved outcomes recorded.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
