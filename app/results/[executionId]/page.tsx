"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Tabs } from "@/components/ui/primitives";
import { fetchCoordinateResult, fetchResult } from "@/lib/api-client";
import { DetailTable } from "@/components/results/detail-table";
import { MetricsSummary, ScoringTable } from "@/components/results/scoring-table";
import { CoordinateIndex } from "@/components/results/coordinate-index";
import { EvidenceDrawer } from "@/components/results/evidence-drawer";
import { CopyButton } from "@/components/ui/copy-button";
import { fmtDuration, fmtIsoFromStr, normalizeRunStatus, prettyJson } from "@/lib/formatters";
import { ResultsSummary } from "@/components/results/status-details";
import { normalizeResult } from "@/lib/result-normalizer";
import { evidenceForReference } from "@/lib/evidence-ref";
import { useReadResource } from "@/lib/use-read-resource";
import styles from "./results.module.css";

async function loadSelectedCoordinate(query: string, signal: AbortSignal) {
  const [parent, coordinate] = JSON.parse(query) as [string, string | null];
  return coordinate === null ? null : fetchCoordinateResult(parent, coordinate, signal);
}

type Tab = "summary" | "evidence" | "scoring" | "matrix" | "json";

export default function ResultsPage() {
  const params = useParams<{ executionId: string }>();
  const executionId = params.executionId;
  return <Suspense fallback={<Loading />}><ResultsExplorer key={executionId} executionId={executionId} /></Suspense>;
}

function ResultsExplorer({ executionId }: { executionId: string }) {
  const [aggregate, setAggregate] = useState<NormalizedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter(), search = useSearchParams();
  const tabValue = search.get("tab") ?? "summary";
  const tab = tabValue as Tab;
  const coordRunId = search.get("coordinate");
  const coordinate = useReadResource(JSON.stringify([executionId, coordRunId]), loadSelectedCoordinate);
  const coordResult = coordinate.data ?? null;
  const coordLoading = coordRunId !== null && coordinate.busy;
  const navigate = useCallback((values: Record<string, string | null>) => {
    const query = new URLSearchParams(search.toString());
    for (const [key,value] of Object.entries(values)) {
      if (value === null) query.delete(key); else query.set(key,value);
    }
    router.push(`/results/${encodeURIComponent(executionId)}${query.size ? `?${query}` : ""}`, { scroll: false });
  }, [router, search, executionId]);
  const setTab = (value: Tab) => navigate({ tab: value });
  const [evidence, setEvidence] = useState<EvidenceRow | null>(null);
  const [evidenceOwner, setEvidenceOwner] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const coordinateBrowser = useRef<HTMLDetailsElement>(null);
  const tabsId = useId();

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    fetchResult(executionId, controller.signal)
      .then((result) => {
        if (stopped) return;
        if (result) setAggregate(result);
        else setError("No readable result was produced for this execution.");
      })
      .catch((cause: unknown) => {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Failed to load result");
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [executionId]);


  const pickCoordinate = useCallback((coord: CoordinateSummary) => {
    if (coordinateBrowser.current) {
      coordinateBrowser.current.open = false;
      coordinateBrowser.current.querySelector<HTMLElement>("summary")?.focus();
    }
    if (coord.executionId === coordRunId) return;
    navigate({ coordinate: coord.executionId });
    setEvidence(null);
    setDrawerOpen(false);
  }, [coordRunId, navigate]);

  const backToAggregate = useCallback(() => {
    navigate({ coordinate: null });
    setEvidence(null);
    setDrawerOpen(false);
  }, [navigate]);

  const viewResult = coordRunId ? coordResult : aggregate;
  const openReference = (ref: string) => {
    if (!viewResult) return;
    const row = evidenceForReference(viewResult, ref);
    if (row) {
      setEvidence(row);
      setEvidenceOwner(viewResult.executionId);
      setDrawerOpen(true);
    }
  };

  if (loading) return <Loading />;
  if (error || !aggregate) return <ErrorState message={error ?? "Result unavailable"} executionId={executionId} />;
  if (!["summary", "evidence", "scoring", "matrix", "json"].includes(tabValue) || (tabValue === "matrix" && !aggregate.isMatrix)) return <ErrorState message={`Unavailable result view: ${tabValue}`} executionId={executionId} />;
  if (coordRunId !== null && (!aggregate.isMatrix || !aggregate.coordinates.some(row => row.executionId === coordRunId))) return <div className="notice notice-error" role="alert"><h2>Selected coordinate unavailable</h2><p>The exact identity {coordRunId || "(empty)"} is not a member of this experiment. No other source is shown.</p><Button onClick={backToAggregate}>Return to aggregate</Button></div>;

  const selectedSummary = aggregate.coordinates.find((coordinate) => coordinate.executionId === coordRunId);
  const header = viewResult ?? (selectedSummary ? normalizeResult({
    execution_id: selectedSummary.executionId,
    run_id: selectedSummary.runId,
    status: selectedSummary.status,
    execution_status: selectedSummary.executionStatus,
    security_outcome: selectedSummary.securityOutcome,
    execution_reason: selectedSummary.executionReason,
    security_outcome_reason: selectedSummary.securityOutcomeReason,
    selected_method: selectedSummary.selectedMethod,
    target_method: selectedSummary.targetMethod,
    surface: selectedSummary.surface,
    security_level: selectedSummary.securityLevel,
    provider: selectedSummary.provider,
    model: selectedSummary.model,
    payload_mode: selectedSummary.payloadMode,
    repeat_index: selectedSummary.repeatIndex,
    experiment_condition: selectedSummary.experimentCondition,
  }) : aggregate);

  const tabs: Array<{ value: Tab; label: string; badge?: number }> = [
    { value: "summary", label: "Summary" },
    { value: "evidence", label: "Evidence", badge: viewResult?.evidenceRows.length },
    { value: "scoring", label: "Scoring" },
  ];
  if (aggregate.isMatrix) tabs.push({ value: "matrix", label: "Matrix", badge: aggregate.coordinates.length });
  tabs.push({ value: "json", label: "JSON" });

  return (
    <div className={`results-page ${styles.page} flex h-full min-h-0 flex-col`}>
      <header className="page-header results-page-header">
        <div className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/results" className="ui-link inline-flex items-center gap-1">
            <ArrowLeft size={14} aria-hidden="true" /> Experiments
          </Link>
          <span aria-hidden="true">/</span>
          <span>Results</span>
        </div>
        <div className="page-header-main flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title">Experiment results</h1>
              <StatusBadge status={header.executionStatus ?? "unknown"} />
              {header.isMatrix && <Badge variant="outline">Matrix · {header.coordinates.length} coordinates</Badge>}
              {header.taskResult && <Badge variant="outline">Legacy task · {readable(header.taskResult)}</Badge>}
            </div>
            <p className="page-description">
              {header.experimentCondition || "Execution record"}
              {header.surface && <> · {readable(header.surface)}{header.securityLevel ? ` · ${readable(header.securityLevel)}` : ""}</>}
              {header.payloadMode && <> · {readable(header.payloadMode)}</>}
              {(header.selectedMethod ?? header.targetMethod) && <> · Method {header.selectedMethod ?? header.targetMethod}</>}
            </p>
            <div className="execution-identifier"><span>Execution ID</span> <code>execution {header.executionId}</code><CopyButton value={header.executionId} label="execution ID" /></div>
          </div>
          <div className="page-actions">
            <Button variant="outline" onClick={() => setTab("json")}>
              <FileJson size={15} aria-hidden="true" /> View artifact
            </Button>
            <Link href="/" className="ui-button ui-button-secondary">
              <ArrowLeft size={15} aria-hidden="true" /> Return to live
            </Link>
          </div>
        </div>
        <dl className="metadata-grid execution-metadata mt-4">
          <Metadata label="Started" value={fmtIsoFromStr(header.startedAt)} />
          <Metadata label="Duration" value={fmtDuration(header.durationMs)} />
          <Metadata label="Provider" value={header.provider ?? "Unavailable"} />
          <Metadata label="Model" value={header.model ?? "Unavailable"} />
          <Metadata label="Target" value={header.targetUrl ?? "Unavailable"} />
          {coordRunId && <Metadata label="Selected coordinate" value={`#${(selectedSummary?.index ?? 0) + 1} · ${coordRunId}`} mono />}
        </dl>
      </header>

      {aggregate.isMatrix && (
        <section className="coordinate-browser flex flex-wrap items-start gap-3 border-b p-3" aria-label="Coordinate selection">
          <details ref={coordinateBrowser} className="min-w-0 flex-1">
            <summary>
              <span>Browse coordinates</span>
              <span className="muted-value">{coordRunId ? `Selected ${coordRunId}` : `${aggregate.coordinates.length} coordinates`}</span>
            </summary>
            <CoordinateIndex result={aggregate} selected={coordRunId} onSelect={pickCoordinate} />
          </details>
          {coordRunId && (
            <Button variant="ghost" onClick={backToAggregate} aria-label="Return to aggregate result">
              <ArrowLeft size={14} aria-hidden="true" /> Aggregate
            </Button>
          )}
          {coordLoading && <span role="status" className="inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading coordinate details</span>}
        </section>
      )}

      <nav className="results-tabs flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2" aria-label="Result views">
        <Tabs
          idPrefix={tabsId}
          panelId={`${tabsId}-panel`}
          tabs={tabs.map(({ value, label, badge }) => ({ value, label, badge }))}
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
        />
        {coordRunId && <span className="selected-coordinate-context">Viewing coordinate #{(selectedSummary?.index ?? 0) + 1}</span>}
      </nav>

      <div className="results-body min-h-0 flex-1" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} tabIndex={0}>
        {tab === "summary" && (
          <ResultsSummary
            result={viewResult ?? header}
            onEvidenceRef={openReference}
            loadingCoordinate={Boolean(coordRunId && coordLoading && !viewResult)}
            unavailableCoordinateId={coordRunId && !coordLoading && !viewResult ? coordRunId : undefined}
          />
        )}
        {tab === "evidence" && (viewResult ? (
          <DetailTable
            key={viewResult.executionId}
            rows={viewResult.evidenceRows}
            onOpen={(row) => { setEvidence(row); setEvidenceOwner(viewResult.executionId); setDrawerOpen(true); }}
          />
        ) : <UnavailableCoordinate executionId={coordRunId} loading={coordLoading} />)}
        {tab === "scoring" && (viewResult ? (
          <ScoringTab key={viewResult.executionId} result={viewResult} onEvidenceRef={openReference} />
        ) : <UnavailableCoordinate executionId={coordRunId} loading={coordLoading} />)}
        {tab === "matrix" && aggregate.isMatrix && (
          <MatrixTab result={aggregate} selectedCoordinateId={coordRunId} onPick={pickCoordinate} />
        )}
        {tab === "json" && (viewResult ? (
          <JsonTab key={viewResult.executionId} result={viewResult} />
        ) : <UnavailableCoordinate executionId={coordRunId} loading={coordLoading} />)}
      </div>

      <EvidenceDrawer
        row={evidence}
        open={drawerOpen && evidenceOwner === viewResult?.executionId}
        onClose={() => setDrawerOpen(false)}
        onSelectRelated={(id) => {
          const row = viewResult?.evidenceRows.find((candidate) => candidate.id === id);
          if (row) setEvidence(row);
        }}
      />
    </div>
  );
}

function Metadata({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "font-mono break-all" : "break-words"}>{value}</dd></div>;
}

function ScoringTab({ result, onEvidenceRef }: { result: NormalizedResult; onEvidenceRef: (ref: string) => void }) {
  return (
    <div className="results-panel-grid grid min-h-0 grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <Card className="results-panel min-h-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Score review</CardTitle>
          <Gauge size={16} aria-hidden="true" />
        </CardHeader>
        <CardContent className="h-full min-h-0 p-0">
          <ScoringTable result={result} onEvidenceRef={onEvidenceRef} />
        </CardContent>
      </Card>
      <Card className="results-panel min-h-0 overflow-hidden">
        <CardHeader><CardTitle>Provisional runtime metrics</CardTitle></CardHeader>
        <CardContent className="overflow-y-auto"><MetricsSummary result={result} /></CardContent>
      </Card>
    </div>
  );
}

function MatrixTab({
  result,
  selectedCoordinateId,
  onPick,
}: {
  result: NormalizedResult;
  selectedCoordinateId: string | null;
  onPick: (coordinate: CoordinateSummary) => void;
}) {
  return (
    <Card className="results-panel h-full overflow-hidden">
      <CardHeader>
        <CardTitle>Matrix coordinate comparison</CardTitle>
        <Grid3X3 size={16} aria-hidden="true" />
      </CardHeader>
      <CardContent className="h-full p-0">
        <ScoringTable
          result={result}
          coordinateMode
          selectedCoordinateId={selectedCoordinateId}
          onPickCoordinate={(_executionId, runId) => {
            const coordinate = result.coordinates.find((candidate) => candidate.executionId === runId);
            if (coordinate) onPick(coordinate);
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
  const downloadJson = () => download(`${result.executionId}.redacted.json`, JSON.stringify(result.raw, null, 2), "application/json");
  const downloadEvidence = () => {
    const lines = [
      "# TESIS evidence export",
      "",
      `- Execution: ${result.executionId}`,
      `- Execution status: ${result.executionStatus ?? "unknown"}`,
      `- Security outcome: ${result.securityOutcome ?? "unknown"}`,
      `- Legacy status: ${result.status}`,
      `- Source SHA-256: ${result.source?.sha256 ?? "unavailable"}`,
      `- Surface: ${result.surface ?? "—"}`,
      `- Selected method: ${result.selectedMethod ?? "—"}`,
      "",
      "| Time | Phase | Method | Action | Result | Safety |",
      "| --- | --- | --- | --- | --- | --- |",
      ...result.evidenceRows.map((row) =>
        `| ${row.timestamp || "—"} | ${escapeMarkdown(row.phase)} | ${escapeMarkdown(row.method ?? "—")} | ${escapeMarkdown(row.action)} | ${escapeMarkdown(row.result)} | ${escapeMarkdown(row.safety)} |`,
      ),
    ];
    download(`${result.executionId}.evidence.md`, lines.join("\n"), "text/markdown");
  };

  return (
    <Card className="results-panel h-full overflow-hidden">
      <CardHeader>
        <CardTitle>Redacted artifact</CardTitle>
        <div className="page-actions">
          <Button variant={showFormatted ? "default" : "outline"} aria-pressed={showFormatted} onClick={() => setShowFormatted(true)}>
            <List size={15} aria-hidden="true" /> Formatted
          </Button>
          <Button variant={!showFormatted ? "default" : "outline"} aria-pressed={!showFormatted} onClick={() => setShowFormatted(false)}>
            <FileJson size={15} aria-hidden="true" /> Raw
          </Button>
          <Button variant="outline" onClick={downloadJson}><Download size={15} aria-hidden="true" /> JSON</Button>
          <Button variant="outline" onClick={downloadEvidence}><Download size={15} aria-hidden="true" /> Evidence</Button>
        </div>
      </CardHeader>
      <CardContent className="h-full min-h-0 p-0">
        <pre className="artifact-json h-full overflow-auto p-4 font-mono text-sm leading-relaxed">{prettyJson(showFormatted ? summarizeJson(result.raw) : result.raw)}</pre>
      </CardContent>
    </Card>
  );
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function summarizeJson(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) out[`${key}[]`] = `${value.length} items`;
    else if (value && typeof value === "object") out[key] = `${Object.keys(value as object).length} keys`;
    else out[key] = value;
  }
  return out;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeRunStatus(status);
  const variant = normalized === "completed" ? "cyan" : normalized === "error" || normalized === "failed" ? "red" : normalized === "cancelled" || normalized === "interrupted" ? "amber" : "outline";
  return <Badge variant={variant}>{readable(status)}</Badge>;
}

function UnavailableCoordinate({ executionId, loading }: { executionId: string | null; loading: boolean }) {
  if (!executionId) return <div className="empty-state" role="status">This result view is unavailable.</div>;
  return (
    <div className="empty-state" role="status">
      <h2>{loading ? "Loading coordinate details" : "Coordinate details unavailable"}</h2>
      <p>{loading ? `Loading ${executionId}…` : `Detail unavailable for ${executionId}. Select another coordinate or return to the aggregate.`}</p>
    </div>
  );
}

function Loading() {
  return <div className="result-skeleton" role="status" aria-label="Loading result"><p>Loading result…</p><div className="catalog-skeleton" aria-hidden="true"><span /><span /><span /><span /></div></div>;
}

function ErrorState({ message, executionId }: { message: string; executionId: string }) {
  return (
    <div className="empty-state results-error-state" role="alert">
      <h1>Result unavailable</h1>
      <p>{message}</p>
      <p className="font-mono break-all">Execution ID: {executionId}</p>
      <Link href="/results" className="ui-link">Browse other results</Link>
      <Link href="/" className="ui-link"><ArrowLeft size={14} aria-hidden="true" /> Return to live</Link>
    </div>
  );
}

function readable(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
