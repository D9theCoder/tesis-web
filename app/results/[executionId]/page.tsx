"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileJson,
  Gauge,
  Grid3X3,
  List,
  Loader2,
} from "lucide-react";
import type { CoordinateSummary, EvidenceRow, NormalizedResult } from "@/lib/schemas";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
} from "@/components/ui/primitives";
import { fetchCoordinateResult, fetchResult } from "@/lib/api-client";
import { DetailTable } from "@/components/results/detail-table";
import { ScoringTable, MetricsSummary } from "@/components/results/scoring-table";
import { CoordinateIndex } from "@/components/results/coordinate-index";
import { EvidenceDrawer } from "@/components/results/evidence-drawer";
import { fmtDuration, fmtIsoFromStr, prettyJson } from "@/lib/formatters";
import { normalizeRunStatus } from "@/lib/formatters";
import { StatusDetails } from "@/components/results/status-details";
import { normalizeResult } from "@/lib/result-normalizer";
import { evidenceForReference } from "@/lib/evidence-ref";

type Tab = "detail" | "scoring" | "matrix" | "json";

export default function ResultsPage() {
  const params = useParams<{ executionId: string }>();
  const executionId = params.executionId;
  return <ResultsExplorer key={executionId} executionId={executionId} />;
}

function ResultsExplorer({ executionId }: { executionId: string }) {
  const [aggregate, setAggregate] = useState<NormalizedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("detail");
  const [coordRunId, setCoordRunId] = useState<string | null>(null);
  const [coordResult, setCoordResult] = useState<NormalizedResult | null>(null);
  const [coordLoading, setCoordLoading] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    fetchResult(executionId, controller.signal).then(result => {
      if (stopped) return;
      if (result) setAggregate(result);
      else setError("No readable result was produced for this execution.");
    }).catch(cause => { if (!stopped) setError(cause instanceof Error ? cause.message : "Failed to load result"); })
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; controller.abort(); };
  }, [executionId]);
  useEffect(() => {
    if (!coordRunId) return;
    const controller = new AbortController();
    let stopped = false;
    fetchCoordinateResult(executionId, coordRunId, controller.signal).then(result => {
      if (!stopped) setCoordResult(result);
    }).finally(() => { if (!stopped) setCoordLoading(false); });
    return () => { stopped = true; controller.abort(); };
  }, [executionId, coordRunId]);
  const pickCoordinate = useCallback((coord: CoordinateSummary) => {
    if (coord.executionId === coordRunId) return;
    setCoordRunId(coord.executionId); setCoordResult(null); setCoordLoading(true);
    setEvidence(null); setDrawerOpen(false);
  }, [coordRunId]);
  const backToAggregate = useCallback(() => {
    setCoordRunId(null); setCoordResult(null); setCoordLoading(false); setEvidence(null); setDrawerOpen(false);
  }, []);
  const viewResult = coordRunId ? coordResult : aggregate;
  const openReference = (ref: string) => {
    if (!viewResult) return;
    const row = evidenceForReference(viewResult, ref);
    if (row) { setEvidence(row); setDrawerOpen(true); }
  };

  if (loading) {
    return <Loading />;
  }
  if (error || !aggregate) {
    return <ErrorState message={error ?? "Result unavailable"} executionId={executionId} />;
  }

  const selectedSummary = aggregate.coordinates.find(c => c.executionId === coordRunId);
  const header = viewResult ?? (selectedSummary ? normalizeResult({
    execution_id: selectedSummary.executionId, run_id: selectedSummary.runId, status: selectedSummary.status,
    execution_status: selectedSummary.executionStatus, security_outcome: selectedSummary.securityOutcome,
    execution_reason: selectedSummary.executionReason, security_outcome_reason: selectedSummary.securityOutcomeReason,
    selected_method: selectedSummary.selectedMethod, target_method: selectedSummary.targetMethod,
    surface: selectedSummary.surface, security_level: selectedSummary.securityLevel, provider: selectedSummary.provider,
    model: selectedSummary.model, payload_mode: selectedSummary.payloadMode, repeat_index: selectedSummary.repeatIndex,
    experiment_condition: selectedSummary.experimentCondition,
  }) : aggregate);
  const tabs: Array<{ value: Tab; label: string; badge?: number }> = [
    { value: "detail", label: "Detailed", badge: viewResult?.evidenceRows.length },
    { value: "scoring", label: "Scoring" },
  ];
  if (aggregate.isMatrix) tabs.push({ value: "matrix", label: "Matrix"} );
  tabs.push({ value: "json", label: "JSON" });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative border-b border-graphite-700/70 bg-graphite-900/70 px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-graphite-500 hover:text-graphite-200">
            <ArrowLeft size={12} /> Live
          </Link>
          <span className="text-graphite-700">/</span>
          <span className="font-display text-[12px] uppercase tracking-wider text-graphite-400">Results</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-bold uppercase tracking-[0.12em] text-graphite-100">
                Experiment Results
              </h1>
              <StatusBadge status={header.executionStatus ?? "unknown"} />
              {header.isMatrix && <Badge variant="violet">matrix · {header.coordinates.length} coords</Badge>}
              {header.taskResult && <Badge variant="outline">Legacy task: {header.taskResult}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-graphite-500">
              <span>{header.experimentCondition}</span>
              <span>·</span>
              <span>{header.surface ?? "—"} · {header.securityLevel ?? "—"}</span>
              <span>·</span>
              <span>{header.payloadMode}</span>
              <span>·</span>
              <span>method: {header.selectedMethod ?? header.targetMethod ?? "—"}</span>
            </div>
            <div className="mt-1 break-all font-mono text-[9px] text-graphite-600">execution {header.executionId}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-[10px] text-graphite-500">
              started <span className="text-graphite-300">{fmtIsoFromStr(header.startedAt)}</span>
            </div>
            <div className="font-mono text-[10px] text-graphite-500">
              duration <span className="text-graphite-300">{fmtDuration(header.durationMs)}</span>
            </div>
            <div className="font-mono text-[10px] text-graphite-500">
              target <span className="text-signal-300">{header.targetUrl ?? "—"}</span>
            </div>
          </div>
        </div>

        <StatusDetails result={header} onEvidenceRef={openReference} />

        {/* Findings strip */}
        {(header.confirmedVulns.length > 0 || header.achievedOutcomes.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-graphite-700/40 pt-2">
            <span className="text-label">confirmed</span>
            {header.confirmedVulns.map((v) => <Badge key={v} variant="lime">{v.replace(/_/g, " ")}</Badge>)}
            <span className="text-label ml-2">outcomes</span>
            {header.achievedOutcomes.map((v) => <Badge key={v} variant="cyan">{v.replace(/_/g, " ")}</Badge>)}
            {header.akgPath.length > 0 && (
              <span className="ml-auto flex items-center gap-1 font-mono text-[9px] text-graphite-500">
                path: {header.akgPath.join(" → ")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Matrix coordinate bar */}
      {aggregate.isMatrix && (
        <div className="flex max-h-44 shrink-0 items-start gap-2 overflow-y-auto border-b border-graphite-700/60 bg-graphite-900/40 px-4 py-1.5">
          <span className="text-label shrink-0">coordinate</span>
          <CoordinateIndex
            result={aggregate}
            selected={coordRunId}
            onSelect={pickCoordinate}
          />
          {coordRunId && (
            <Button variant="ghost" className="px-2 py-0.5 text-[10px]" onClick={backToAggregate}>
              ← aggregate
            </Button>
          )}
          {coordLoading && <Loader2 size={12} className="animate-spin text-ember-300" />}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite-700/60 px-4 py-1.5">
        <Tabs
          tabs={tabs.map((t) => ({ value: t.value, label: t.label, badge: t.badge }))}
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
        />
        {coordRunId && (
          <span className="font-mono text-[9px] text-graphite-500">
            viewing coordinate #{(aggregate.coordinates.find((c) => c.executionId === coordRunId)?.index ?? 0) + 1}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {coordRunId && !viewResult && (tab !== "matrix") ? (
          <div role="status" className="p-4 text-sm">{coordLoading ? `Loading ${coordRunId}…` : `Detail unavailable for ${coordRunId}. Select another coordinate or return to the aggregate.`}</div>
        ) : <>
          {tab === "detail" && viewResult && <DetailTab result={viewResult} onOpenEvidence={row => { setEvidence(row); setDrawerOpen(true); }} />}
          {tab === "scoring" && viewResult && <ScoringTab result={viewResult} onEvidenceRef={openReference} />}
          {tab === "json" && viewResult && <JsonTab result={viewResult} />}
        </>}
        {tab === "matrix" && aggregate.isMatrix && <MatrixTab result={aggregate} onPick={pickCoordinate} />}

      </div>

      <EvidenceDrawer row={evidence} open={drawerOpen} onClose={() => setDrawerOpen(false)}
        onSelectRelated={id => { const row = viewResult?.evidenceRows.find(r => r.id === id); if (row) setEvidence(row); }} />
    </div>
  );
}

function DetailTab({
  result,
  onOpenEvidence,
}: {
  result: NormalizedResult;
  onOpenEvidence: (row: EvidenceRow) => void;
}) {
  const evidenceRows =
    result.evidenceRows.length > 0
      ? result.evidenceRows
      : combinedEvidence(result);
  return <DetailTable key={result.executionId} rows={evidenceRows} onOpen={onOpenEvidence} />;
}

function combinedEvidence(result: NormalizedResult): EvidenceRow[] {
  // Fallback: derive minimal rows from final_state lists already exposed in
  // coordinates by reusing the normalizer's evidence builder via raw fields.
  return result.evidenceRows;
}

function ScoringTab({ result, onEvidenceRef }: { result: NormalizedResult; onEvidenceRef: (ref: string)=>void }) {
  return (
    <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1fr_340px]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Thesis Scoring</CardTitle>
          <Gauge size={14} className="text-graphite-500" />
        </CardHeader>
        <CardContent className="h-full min-h-0 p-0">
          <ScoringTable key={result.executionId} result={result} onEvidenceRef={onEvidenceRef} />
        </CardContent>
      </Card>
      <Card className="min-h-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Thesis Metrics</CardTitle>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          <MetricsSummary result={result} />
        </CardContent>
      </Card>
    </div>
  );
}

function MatrixTab({
  result,
  onPick,
}: {
  result: NormalizedResult;
  onPick: (c: CoordinateSummary) => void;
}) {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader>
        <CardTitle>Matrix Coordinate Comparison</CardTitle>
        <Grid3X3 size={13} className="text-graphite-500" />
      </CardHeader>
      <CardContent className="h-full p-0">
        <ScoringTable
          result={result}
          coordinateMode
          onPickCoordinate={(_execId, runId) => {
            const coord = result.coordinates.find(
              (c) => c.runId === runId || c.executionId === runId,
            );
            if (coord) onPick(coord);
          }}
        />
      </CardContent>
    </Card>
  );
}

function JsonTab({ result }: { result: NormalizedResult }) {
  const [showFormatted, setShowFormatted] = useState(true);
  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const downloadJson = () =>
    download(
      `${result.executionId}.redacted.json`,
      JSON.stringify(result.raw, null, 2),
      "application/json",
    );
  const downloadEvidence = () => {
    const lines = [
      `# TESIS evidence export`,
      ``,
      `- Execution: ${result.executionId}`,
      `- Execution: ${result.executionStatus ?? "unknown"}`,
      `- Security outcome: ${result.securityOutcome ?? "unknown"}`,
      `- Legacy status: ${result.status}`,
      `- Source SHA-256: ${result.source?.sha256 ?? "unavailable"}`,
      `- Surface: ${result.surface ?? "—"}`,
      `- Selected method: ${result.selectedMethod ?? "—"}`,
      ``,
      `| Time | Phase | Method | Action | Result | Safety |`,
      `| --- | --- | --- | --- | --- | --- |`,
      ...result.evidenceRows.map((row) =>
        `| ${row.timestamp || "—"} | ${escapeMarkdown(row.phase)} | ${escapeMarkdown(row.method ?? "—")} | ${escapeMarkdown(row.action)} | ${escapeMarkdown(row.result)} | ${escapeMarkdown(row.safety)} |`,
      ),
    ];
    download(
      `${result.executionId}.evidence.md`,
      lines.join("\n"),
      "text/markdown",
    );
  };
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader>
        <CardTitle>Redacted Artifact</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant={showFormatted ? "amber" : "ghost"} onClick={() => setShowFormatted(true)} className="px-2 py-0.5 text-[10px]"><List size={11} /> Formatted</Button>
          <Button variant={!showFormatted ? "amber" : "ghost"} onClick={() => setShowFormatted(false)} className="px-2 py-0.5 text-[10px]"><FileJson size={11} /> Raw</Button>
          <Button variant="ghost" onClick={downloadJson} className="px-2 py-0.5 text-[10px]"><Download size={11} /> JSON</Button>
          <Button variant="ghost" onClick={downloadEvidence} className="px-2 py-0.5 text-[10px]"><Download size={11} /> Evidence</Button>
        </div>
      </CardHeader>
      <CardContent className="h-full p-0">
        <pre className="h-full overflow-auto bg-graphite-900/40 p-3 font-mono text-[10px] leading-relaxed text-graphite-300">
          {prettyJson(showFormatted ? summarizeJson(result.raw) : result.raw)}
        </pre>
      </CardContent>
    </Card>
  );
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function summarizeJson(raw: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(raw);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = raw[k];
    if (Array.isArray(v)) out[`${k}[]`] = `${v.length} items`;
    else if (v && typeof v === "object") out[k] = `${Object.keys(v as object).length} keys`;
    else out[k] = v;
  }
  return out;
}

function StatusBadge({ status }: { status: string }) {
  const s = normalizeRunStatus(status);
  return (
    <Badge variant={s === "completed" ? "lime" : s === "error" ? "red" : s === "cancelled" ? "amber" : "cyan"}>
      {status}
    </Badge>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 font-mono text-[12px] text-graphite-400">
      <Loader2 size={16} className="animate-spin text-signal-400" /> loading result…
    </div>
  );
}

function ErrorState({ message, executionId }: { message: string; executionId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="font-display text-lg uppercase tracking-wider text-graphite-200">Result unavailable</h2>
      <p className="max-w-md font-mono text-[11px] text-danger-400">{message}</p>
      <p className="font-mono text-[10px] text-graphite-600">execution: {executionId}</p>
      <Link href="/" className="text-signal-400 hover:text-signal-300">
        ← back to runtime monitor
      </Link>
    </div>
  );
}
