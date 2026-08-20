"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { selectedCoordinate } from "@/lib/result-normalizer";

type Tab = "detail" | "scoring" | "matrix" | "json";

export default function ResultsPage() {
  const params = useParams<{ executionId: string }>();
  const executionId = decodeURIComponent(params.executionId);

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
    let stopped = false;
    setLoading(true);
    fetchResult(executionId)
      .then((r) => {
        if (stopped) return;
        if (r) {
          setAggregate(r);
          const matrixExecId = r.isMatrix ? r.coordinates[0]?.executionId : null;
          if (r.coordinates.length === 1 && r.isMatrix) {
            setCoordRunId(r.coordinates[0].runId ?? r.coordinates[0].executionId);
            const childId = r.coordinates[0].executionId;
            fetchCoordinateResult(executionId, matrixExecId ?? childId).then((cr) => {
              if (!stopped && cr) setCoordResult(cr);
            });
          }
        } else {
          setError("No normalized result was produced for this execution.");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load result"))
      .finally(() => !stopped && setLoading(false));
    return () => {
      stopped = true;
    };
  }, [executionId]);

  const pickCoordinate = useCallback(
    (coord: CoordinateSummary) => {
      setCoordRunId(coord.runId ?? coord.executionId);
      setCoordLoading(true);
      const target = coord.executionId;
      fetchCoordinateResult(executionId, target)
        .then((cr) => {
          if (cr) setCoordResult(cr);
          else setCoordResult(null);
        })
        .catch(() => setCoordResult(null))
        .finally(() => setCoordLoading(false));
    },
    [executionId],
  );

  const backToAggregate = useCallback(() => {
    setCoordRunId(null);
    setCoordResult(null);
  }, []);

  // The result used by the detail/scoring tables: coordinate when selected.
  const viewResult = useMemo(
    () => coordResult ?? (coordRunId && aggregate ? selectedCoordinate(aggregate, coordRunId) : aggregate),
    [coordResult, coordRunId, aggregate],
  );

  if (loading) {
    return <Loading />;
  }
  if (error || !aggregate) {
    return <ErrorState message={error ?? "Result unavailable"} executionId={executionId} />;
  }

  const header = aggregate;
  const tabs: Array<{ value: Tab; label: string; badge?: number }> = [
    { value: "detail", label: "Detailed", badge: viewResult?.evidenceRows.length },
    { value: "scoring", label: "Scoring" },
  ];
  if (header.isMatrix) tabs.push({ value: "matrix", label: "Matrix"} );
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
              <StatusBadge status={header.status} />
              {header.isMatrix && <Badge variant="violet">matrix · {header.coordinates.length} coords</Badge>}
              {header.taskResult && <Badge variant={header.taskResult === "SUCCESS" ? "lime" : "outline"}>{header.taskResult}</Badge>}
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
            <div className="mt-1 font-mono text-[9px] text-graphite-600">execution {header.executionId}</div>
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
      {header.isMatrix && (
        <div className="flex items-center gap-2 border-b border-graphite-700/60 bg-graphite-900/40 px-4 py-1.5">
          <span className="text-label shrink-0">coordinate</span>
          <CoordinateIndex
            result={header}
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
      <div className="flex items-center justify-between gap-2 border-b border-graphite-700/60 px-4 py-1.5">
        <Tabs
          tabs={tabs.map((t) => ({ value: t.value, label: t.label, badge: t.badge }))}
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
        />
        {coordRunId && (
          <span className="font-mono text-[9px] text-graphite-500">
            viewing coordinate #{(header.coordinates.find((c) => c.runId === coordRunId || c.executionId === coordRunId)?.index ?? 0) + 1}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "detail" && (
          <DetailTab
            result={viewResult ?? aggregate}
            onOpenEvidence={(row) => {
              setEvidence(row);
              setDrawerOpen(true);
            }}
          />
        )}
        {tab === "scoring" && header.isMatrix && coordRunId && (
          <ScoringTab result={viewResult ?? header} />
        )}
        {tab === "scoring" && (!header.isMatrix || !coordRunId) && (
          <ScoringTab result={header} />
        )}
        {tab === "matrix" && header.isMatrix && (
          <MatrixTab result={header} onPick={(c) => pickCoordinate(c)} />
        )}
        {tab === "json" && <JsonTab result={viewResult ?? header} />}
      </div>

      <EvidenceDrawer row={evidence} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
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
  return <DetailTable rows={evidenceRows} onOpen={onOpenEvidence} />;
}

function combinedEvidence(result: NormalizedResult): EvidenceRow[] {
  // Fallback: derive minimal rows from final_state lists already exposed in
  // coordinates by reusing the normalizer's evidence builder via raw fields.
  return result.evidenceRows;
}

function ScoringTab({ result }: { result: NormalizedResult }) {
  return (
    <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1fr_340px]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Thesis Scoring</CardTitle>
          <Gauge size={14} className="text-graphite-500" />
        </CardHeader>
        <CardContent className="h-full min-h-0 p-0">
          <ScoringTable result={result} />
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
      `- Status: ${result.status}`,
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
