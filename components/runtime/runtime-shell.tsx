"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ExternalLink, Radio, RefreshCw, ServerOff } from "lucide-react";
import type { LiveRunState, RunSummary } from "@/lib/schemas";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ScrollArea } from "@/components/ui/primitives";
import { initialState, reduceEvents } from "@/lib/event-reducer";
import { fetchAkg, fetchEvents, fetchResult, fetchRuns } from "@/lib/api-client";
import { AkgGraph } from "@/components/runtime/akg-graph";
import { CoordinatePanel } from "@/components/runtime/coordinate-panel";
import { ConversationPanel } from "@/components/runtime/conversation-panel";
import { OutcomePanel } from "@/components/runtime/outcome-panel";
import { fmtClock, normalizeRunStatus } from "@/lib/formatters";
import type { AkgSnapshot } from "@/lib/schemas";
import { AKG_SNAPSHOT } from "@/lib/akg-static";
import { cn } from "@/lib/utils";

const DISCOVER_MS = 4000;
const POLL_MS = Number(process.env.NEXT_PUBLIC_TESIS_POLL_MS ?? 2000);

export function RuntimeShell() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<RunSummary | null>(null);
  const [state, setState] = useState<LiveRunState>(initialState());
  const [hasArtifact, setHasArtifact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [akg, setAkg] = useState<AkgSnapshot>(AKG_SNAPSHOT);

  const cursorRef = useRef(0);
  const followingRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hasArtifactRef = useRef(false);

  const adopt = useCallback((executionId: string, run: RunSummary) => {
    if (followingRef.current === executionId) return;
    followingRef.current = executionId;
    cursorRef.current = 0;
    setActiveId(executionId);
    setActiveRun(run);
    const next = initialState(executionId);
    next.runId = run.runId ?? null;
    next.mode = run.mode;
    next.surface = run.surface ?? null;
    next.securityLevel = run.securityLevel ?? null;
    next.provider = run.provider ?? null;
    next.model = run.model ?? null;
    next.payloadMode = run.payloadMode ?? null;
    next.experimentCondition = run.experimentCondition ?? null;
    next.targetMethod = run.targetMethod ?? null;
    next.targetUrl = run.targetUrl ?? null;
    next.metrics.generationBudget = run.candidateBudget ?? 0;
    next.metrics.remainingBudget = run.candidateBudget ?? 0;
    next.metrics.maxIterations = run.maxIterations ?? 0;
    next.metrics.remainingIterations = run.maxIterations ?? 0;
    setState(next);
    setHasArtifact(false);
    hasArtifactRef.current = false;
    setReplaying(true);
  }, []);

  // Discovery loop: prefer the newest active descriptor. If the experiment
  // already finished before the browser opened, replay the newest journaled
  // or artifact-backed run instead of leaving the observer in standby.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const discovery = async () => {
      try {
        const res = await fetchRuns();
        if (stopped) return;
        setRuns(res.runs);
        const active = res.active && res.active.length ? res.active[0] : null;
        const replayable =
          !followingRef.current
            ? res.runs.find((run) => run.hasJournal || run.hasArtifact) ?? null
            : null;
        const candidate = active ?? replayable;
        if (candidate && followingRef.current !== candidate.executionId) {
          adopt(candidate.executionId, candidate);
        }
        setError(null);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "discovery failed");
      }
    };

    void discovery();
    timer = setInterval(() => void discovery(), DISCOVER_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [adopt]);

  // Event polling loop for the adopted run.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      if (!followingRef.current) return;
      const executionId = followingRef.current;
      try {
        const res = await fetchEvents(executionId, cursorRef.current);
        if (stopped || followingRef.current !== executionId) return;
        cursorRef.current = res.nextCursor;
        setState((prev) => {
          const next = reduceEvents(prev, res.events, {
            nowEpochSec: Date.now() / 1000,
            status: res.status,
            connection: connectionFromStatus(res.status),
          });
          return next;
        });
        setReplaying(false);
        const terminal = ["completed", "cancelled", "error"].includes(normalizeRunStatus(res.status));
        if (terminal && !hasArtifactRef.current) {
          const result = await fetchResult(executionId);
          if (result && !stopped && followingRef.current === executionId) {
            setHasArtifact(true);
            hasArtifactRef.current = true;
          }
        }
      } catch {
        /* transient failures are retried on the next tick */
      }
    };

    void poll();
    timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    void fetchAkg()
      .then((raw) => {
        if (stopped) return;
        const nodes = Array.isArray(raw.nodes)
          ? raw.nodes.map((node) => {
              const n = node as Record<string, unknown>;
              const type = typeof n.type === "string" ? n.type : "node";
              return {
                id: String(n.id ?? ""),
                kind: (typeof n.kind === "string" ? n.kind : type) as AkgSnapshot["nodes"][number]["kind"],
                type,
                surface: typeof n.surface === "string" ? n.surface : undefined,
                method: typeof n.method === "string" ? n.method : undefined,
                label: String(n.label ?? String(n.id ?? "").replace(/_/g, " ")),
                payloadProfile: (n.payloadProfile ?? n.payload_profile) as AkgSnapshot["nodes"][number]["payloadProfile"],
              };
            })
          : [];
        const edges = Array.isArray(raw.edges)
          ? raw.edges.map((edge, index) => {
              const e = edge as Record<string, unknown>;
              return {
                id: String(e.id ?? `akg-e-${index}`),
                source: String(e.source ?? ""),
                target: String(e.target ?? ""),
                isChain: Boolean(e.isChain ?? e.is_chain),
                preconditions: Array.isArray(e.preconditions) ? e.preconditions.map(String) : [],
                targetAgent: typeof (e.targetAgent ?? e.target_agent) === "string" ? String(e.targetAgent ?? e.target_agent) : undefined,
                priority: typeof e.priority === "number" ? e.priority : 100,
              };
            })
          : [];
        if (nodes.length && edges.length) {
          setAkg({ schema_version: String(raw.schema_version ?? "akg.v1"), nodes, edges, source: typeof raw.source === "string" ? raw.source : undefined });
        }
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, []);

  const connectionFromStatus = (status: string): LiveRunState["connection"] => {
    const s = normalizeRunStatus(status);
    if (s === "active" || s === "stale" || s === "completed" || s === "cancelled" || s === "error") return s;
    return "waiting";
  };

  const akgProps = useMemo(
    () => ({
      currentNode: state.currentNode,
      selectedMethod: state.selectedMethod,
      akgPath: state.akgPath,
      confirmedVulns: state.confirmedVulns,
      achievedOutcomes: state.achievedOutcomes,
      viableMethods: state.viableMethods,
    }),
    [state],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="noise relative flex flex-wrap items-center justify-between gap-2 border-b border-graphite-700/70 bg-graphite-900/70 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-signal-400" />
            <span className="font-display text-[14px] font-semibold uppercase tracking-[0.15em] text-graphite-100">
              Runtime Monitor
            </span>
          </div>
          {activeRun ? (
            <Badge variant={state.connection === "active" ? "cyan" : state.connection === "completed" ? "lime" : "amber"}>
              <Activity size={9} /> {state.connection}
            </Badge>
          ) : (
            <Badge variant="outline">standby</Badge>
          )}
          {activeId && (
            <span className="hidden font-mono text-[10px] text-graphite-500 lg:inline">
              {activeId.slice(0, 30)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {replaying && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-ember-300">
              <RefreshCw size={10} className="animate-spin" /> replaying…
            </span>
          )}
          {hasArtifact && activeId && (
            <Button variant="amber" className="h-7">
              <Link href={`/results/${activeId}`} className="flex items-center gap-1.5">
                <ExternalLink size={12} /> Open detailed results
              </Link>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b border-danger-500/40 bg-danger-500/10 px-4 py-1.5 font-mono text-[11px] text-danger-400">
          <ServerOff size={12} /> {error} — retrying discovery…
        </div>
      )}

      {!activeId ? (
        <WaitingState runs={runs} onPick={(r) => adopt(r.executionId, r)} />
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-2 overflow-hidden p-2 md:grid-cols-2 md:grid-rows-2">
          <Quadrant title="AKG Traversal" id="akg">
            <AkgGraph {...akgProps} snapshot={akg} />
          </Quadrant>
          <Quadrant title="Coordinate" id="coord">
            <CoordinatePanel state={state} />
          </Quadrant>
          <Quadrant title="Conversation" id="conv">
            <ConversationPanel state={state} />
          </Quadrant>
          <Quadrant title="Outcomes" id="outcome">
            <OutcomePanel state={state} />
          </Quadrant>
        </div>
      )}
    </div>
  );
}

function Quadrant({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-h-0 flex-col min-w-0 overflow-hidden" data-quadrant={id}>
      <CardHeader className="shrink-0">
        <CardTitle>{title}</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-graphite-600">{id}</span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden p-0">{children}</CardContent>
    </Card>
  );
}

function WaitingState({
  runs,
  onPick,
}: {
  runs: RunSummary[];
  onPick: (r: RunSummary) => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="mx-auto flex flex-col items-center gap-3 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-graphite-700">
            <Radio size={28} className="text-graphite-500" />
            <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-ember-400/60" />
          </div>
          <h2 className="font-display text-lg font-semibold uppercase tracking-[0.15em] text-graphite-200">
            Waiting for a live run
          </h2>
          <p className="max-w-md font-mono text-[11px] leading-relaxed text-graphite-500">
            Start an experiment from the TESIS repo with{" "}
            <span className="rounded-sm bg-graphite-800 px-1 py-0.5 text-signal-300">python -m tesis run --config config.yaml</span>{" "}
            or the headless CLI. This observer will auto-adopt the newest active
            run and tail its redacted journal.
          </p>
          <Badge variant="outline" className="mt-1">TESIS_ROOT={process.env.NEXT_PUBLIC_TESIS_ROOT ?? "/home/kevin/coding/tesis"}</Badge>
        </div>

        {runs.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-label">recent runs on this machine</span>
              <span className="font-mono text-[10px] text-graphite-500">{runs.length}</span>
            </div>
            <ScrollArea className="max-h-64">
              <div className="flex flex-col gap-1.5">
                {runs.slice(0, 30).map((r) => (
                  <button
                    key={r.executionId}
                    onClick={() => onPick(r)}
                    className="flex items-center justify-between gap-3 rounded-sm border border-graphite-700/60 bg-graphite-900/40 px-3 py-2 text-left transition-colors hover:border-graphite-500 hover:bg-graphite-800"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={r.connection === "active" ? "cyan" : "outline"}>{r.connection ?? r.status}</Badge>
                        <span className="truncate font-mono text-[11px] text-graphite-200">
                          {r.mode} · {r.surface ?? "—"} · {r.securityLevel ?? "—"}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[9px] text-graphite-500">
                        {r.executionId}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[9px] text-graphite-500">{fmtClock(r.startedAt ? Date.parse(r.startedAt) / 1000 : null)}</span>
                      {r.connection === "completed" && (
                        <Link href={`/results/${r.executionId}`} className="text-signal-400 hover:text-signal-300" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={13} />
                        </Link>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
