"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, ExternalLink, FlaskConical } from "lucide-react";
import type { AkgSnapshot, LiveRunState, RunSummary } from "@/lib/schemas";
import { Badge, Button } from "@/components/ui/primitives";
import { RunCatalog } from "@/components/run-catalog";
import { canonicalStatus } from "@/lib/artifact-contract";
import { initialState, reduceEvents } from "@/lib/event-reducer";
import {
  fetchAkg,
  fetchAkgMock,
  fetchEvents,
  fetchResult,
  fetchRunSummary,
  fetchRuns,
} from "@/lib/api-client";
import { CoordinatePanel } from "@/components/runtime/coordinate-panel";
import { ConversationPanel } from "@/components/runtime/conversation-panel";
import { OutcomePanel } from "@/components/runtime/outcome-panel";
import { fmtDuration, normalizeRunStatus } from "@/lib/formatters";
import { AKG_SNAPSHOT } from "@/lib/akg-static";
import { normalizeAkgSnapshot } from "@/lib/akg-snapshot";
import {
  verifyAkgMockState,
  type AkgMockSimulation,
  type AkgMockVerification,
} from "@/lib/akg-mock";

const AkgGraph = dynamic(
  () => import("./akg-graph").then((module) => module.AkgGraph),
  { ssr: false },
);
const DISCOVER_MS = 4000;
const POLL_MS = Number(process.env.NEXT_PUBLIC_TESIS_POLL_MS ?? 2000);

type MockSession = {
  id: number;
  phase: "loading" | "running" | "passed" | "failed";
  snapshot: AkgSnapshot;
  simulation?: AkgMockSimulation;
  state: LiveRunState;
  index: number;
  ready: boolean;
  verification?: AkgMockVerification;
  error?: string;
};

function stateForRun(run: RunSummary) {
  const state = initialState(run.executionId);
  Object.assign(state, {
    ...canonicalStatus({ execution_status: run.executionStatus, security_outcome: run.securityOutcome,
      execution_reason: run.executionReason, security_outcome_reason: run.securityOutcomeReason }),
    status: run.status, connection: run.connection ?? "waiting",
    startedAt: run.startedAt ? Date.parse(run.startedAt) / 1000 : null,
    endedAt: run.endedAt ? Date.parse(run.endedAt) / 1000 : null,
    hasArtifact: !!run.hasArtifact,
    runId: run.runId ?? null,
    mode: run.mode,
    surface: run.surface ?? null,
    securityLevel: run.securityLevel ?? null,
    provider: run.provider ?? null,
    model: run.model ?? null,
    payloadMode: run.payloadMode ?? null,
    experimentCondition: run.experimentCondition ?? null,
    targetMethod: run.targetMethod ?? null,
    targetUrl: run.targetUrl ?? null,
  });
  state.metrics.generationBudget = state.metrics.remainingBudget =
    run.candidateBudget ?? 0;
  state.metrics.maxIterations = state.metrics.remainingIterations =
    run.maxIterations ?? 0;
  return state;
}

export function RuntimeShell() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRun, setActiveRun] = useState<RunSummary | null>(null);
  const [liveState, setLiveState] = useState<LiveRunState>(initialState);
  const [hasArtifact, setHasArtifact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [akg, setAkg] = useState<AkgSnapshot>(AKG_SNAPSHOT);
  const [mock, setMock] = useState<MockSession | null>(null);
  const [generation, setGeneration] = useState(0);
  const epoch = useRef(0);
  const mockRef = useRef<MockSession | null>(null);
  const requests = useRef(new Set<AbortController>());
  const replayTimer = useRef<ReturnType<typeof setTimeout>>();
  const following = useRef<string | null>(null);
  const cursor = useRef(0);
  const artifact = useRef(false);
  const activeRunRef = useRef<RunSummary | null>(null);
  const journalIdentity = useRef<string | null>(null);
  const [nextRunCursor, setNextRunCursor] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadedThrough = useRef(0);
  const requestedExecution = useRef<string | null>(null);
  useEffect(() => {
    requestedExecution.current = new URLSearchParams(window.location.search).get("execution");
  }, []);

  const invalidate = useCallback(() => {
    epoch.current += 1;
    for (const request of requests.current) request.abort();
    requests.current.clear();
    clearTimeout(replayTimer.current);
    setLoadingOlder(false);
    return epoch.current;
  }, []);
  useEffect(
    () => () => {
      invalidate();
    },
    [invalidate],
  );

  const adopt = useCallback((executionId: string, run: RunSummary) => {
    if (mockRef.current || following.current === executionId) return;
    following.current = executionId;
    cursor.current = 0;
    journalIdentity.current = null;
    artifact.current = false;
    activeRunRef.current = run;
    setActiveRun(run);
    setLiveState(stateForRun(run));
    setHasArtifact(!!run.hasArtifact);
    setAkg({ ...AKG_SNAPSHOT, source: "static" });
  }, []);

  // Both loops serialize their own requests. Every continuation checks the epoch,
  // including artifact fetches and failures that arrive after mock mode starts.
  useEffect(() => {
    if (mockRef.current) return;
    const id = epoch.current;
    const controller = new AbortController();
    const activeRequests = requests.current;
    activeRequests.add(controller);
    let stopped = false;
    const valid = () => !stopped && epoch.current === id && !mockRef.current;
    let discoverTimer: ReturnType<typeof setTimeout>;
    let pollTimer: ReturnType<typeof setTimeout>;
    const discover = async () => {
      try {
        const result = await fetchRuns(controller.signal);
        if (!valid()) return;
        const incomingIds = new Set(result.runs.map(run => run.executionId));
        setRuns(previous => [...result.runs, ...previous.filter(run => !incomingIds.has(run.executionId))]);
        loadedThrough.current = Math.max(loadedThrough.current, result.runs.length);
        setNextRunCursor(result.total !== undefined && result.total > loadedThrough.current ? loadedThrough.current : null);
        const requested = requestedExecution.current;
        const requestedRun = requested && !following.current
          ? result.runs.find(run => run.executionId === requested) ?? await fetchRunSummary(requested, controller.signal)
          : null;
        if (!valid()) return;
        const candidate = requested
          ? requestedRun
          : result.active?.[0] ?? (!following.current ? result.runs.find(run => run.hasJournal || run.hasArtifact) : null);
        if (candidate) adopt(candidate.executionId, candidate);
        setError(null);
      } catch (cause) {
        if (valid())
          setError(cause instanceof Error ? cause.message : "Discovery failed");
      } finally {
        if (valid()) discoverTimer = setTimeout(discover, DISCOVER_MS);
      }
    };
    const poll = async () => {
      let pollDelay = POLL_MS;
      const executionId = following.current;
      try {
        if (!executionId || !valid()) return;
        const result = await fetchEvents(
          executionId,
          cursor.current,
          controller.signal,
          journalIdentity.current,
        );
        if (!valid() || following.current !== executionId) return;
        pollDelay = result.hasMore ? 0 : POLL_MS;
        journalIdentity.current = result.journalIdentity ?? null;
        cursor.current = result.nextCursor;
        const status = normalizeRunStatus(result.status);
        setLiveState((previous) =>
          ({ ...reduceEvents(result.reset ? stateForRun(activeRunRef.current ?? { executionId, mode: "single-run", directory: "", status: result.status }) : previous, result.events, {
            status,
            canonical: canonicalStatus({ execution_status: result.executionStatus, security_outcome: result.securityOutcome,
              execution_reason: result.executionReason, security_outcome_reason: result.securityOutcomeReason }),
            connection:
              status === "active" ||
              status === "completed" ||
              status === "cancelled" ||
              status === "error" ||
              status === "stale"
                ? status
                : "waiting",
          }), cursor: result.nextCursor, journalIdentity: result.journalIdentity ?? null, diagnostics: result.diagnostics ?? [] }),
        );
        if (
          ["completed", "cancelled", "error"].includes(status) &&
          !artifact.current
        ) {
          const resultArtifact = await fetchResult(
            executionId,
            controller.signal,
          );
          if (!valid() || following.current !== executionId) return;
          if (resultArtifact) {
            artifact.current = true;
            setHasArtifact(true);
            setLiveState(previous => ({ ...previous,
              executionStatus: resultArtifact.executionStatus, securityOutcome: resultArtifact.securityOutcome,
              executionReason: resultArtifact.executionReason, securityOutcomeReason: resultArtifact.securityOutcomeReason,
              confirmedVulns: [...new Set([...previous.confirmedVulns, ...resultArtifact.confirmedVulns])],
              achievedOutcomes: [...new Set([...previous.achievedOutcomes, ...resultArtifact.achievedOutcomes])],
            }));
          }
        }
      } catch (cause) {
        if (valid() && following.current === executionId) setError(cause instanceof Error ? cause.message : "Journal retrieval failed");
      } finally {
        if (valid()) pollTimer = setTimeout(poll, pollDelay);
      }
    };
    void discover();
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      activeRequests.delete(controller);
      clearTimeout(discoverTimer);
      clearTimeout(pollTimer);
    };
  }, [generation, adopt]);

  useEffect(() => {
    if (mock) return;
    const controller = new AbortController();
    let stopped = false;
    fetchAkg(controller.signal, activeRun?.executionId).then(raw => {
      if (!stopped && !mockRef.current) setAkg(normalizeAkgSnapshot(raw));
    }).catch(() => undefined);
    return () => { stopped = true; controller.abort(); };
  }, [activeRun?.executionId, mock]);
  const loadOlder = async () => {
    if (nextRunCursor === null || loadingOlder) return;
    const id = epoch.current;
    const controller = new AbortController();
    requests.current.add(controller);
    setLoadingOlder(true);
    try {
      const page = await fetchRuns(controller.signal, nextRunCursor);
      if (epoch.current !== id || mockRef.current) return;
      setRuns(previous => {
        const existingIds = new Set(previous.map(run => run.executionId));
        return [...previous, ...page.runs.filter(run => !existingIds.has(run.executionId))];
      });
      loadedThrough.current = nextRunCursor + page.runs.length;
      setNextRunCursor(page.nextCursor ?? null);
    } catch (cause) { if (epoch.current === id) setError(cause instanceof Error ? cause.message : "Catalog page failed"); }
    finally {
      controller.abort();
      requests.current.delete(controller);
      if (epoch.current === id) setLoadingOlder(false);
    }
  };

  const publishMock = useCallback((session: MockSession) => {
    mockRef.current = session;
    setMock(session);
  }, []);

  const runMockTest = useCallback(async () => {
    const id = invalidate();
    const session: MockSession = {
      id,
      phase: "loading",
      snapshot: akg,
      state: initialState(),
      index: 0,
      ready: false,
    };
    publishMock(session);
    // Tear down scheduled live callbacks as soon as mock mode starts, in
    // addition to invalidating/aborting any requests already in flight.
    setGeneration((value) => value + 1);
    setError(null);
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const [simulation, rawSnapshot] = await Promise.all([
        fetchAkgMock(controller.signal),
        fetchAkg(controller.signal).catch(() => null),
      ]);
      if (epoch.current !== id) return;
      // Capture once; layout, filtering and verification all share this object.
      publishMock({
        ...session,
        simulation,
        snapshot: rawSnapshot ? normalizeAkgSnapshot(rawSnapshot) : akg,
        state: stateForRun(simulation.run),
      });
    } catch (cause) {
      if (epoch.current === id)
        publishMock({
          ...session,
          phase: "failed",
          error: cause instanceof Error ? cause.message : "Mock loading failed",
        });
    } finally {
      controller.abort();
      requests.current.delete(controller);
    }
  }, [akg, invalidate, publishMock]);

  const layoutReady = useCallback(() => {
    const session = mockRef.current;
    if (
      session?.simulation &&
      session.phase === "loading" &&
      epoch.current === session.id
    ) {
      publishMock({ ...session, ready: true, phase: "running" });
    }
  }, [publishMock]);

  useEffect(() => {
    if (!mock?.ready || mock.phase !== "running" || !mock.simulation) return;
    const id = mock.id;
    replayTimer.current = setTimeout(() => {
      const session = mockRef.current;
      if (
        !session ||
        session.id !== id ||
        epoch.current !== id ||
        !session.simulation
      )
        return;
      const event = session.simulation.events[session.index];
      const index = session.index + 1;
      const done = index === session.simulation.events.length;
      const state = reduceEvents(session.state, [event], {
        nowEpochSec: event.timestamp,
        status: done ? "completed" : "active",
        connection: done ? "completed" : "active",
      });
      const verification = done
        ? verifyAkgMockState(
            state,
            session.simulation.assertions,
            session.snapshot,
          )
        : undefined;
      publishMock({
        ...session,
        state,
        index,
        verification,
        phase: verification
          ? verification.passed
            ? "passed"
            : "failed"
          : "running",
      });
    }, mock.simulation.seed.intervalMs);
    return () => clearTimeout(replayTimer.current);
  }, [mock, publishMock]);

  const returnToLive = () => {
    invalidate();
    mockRef.current = null;
    setMock(null);
    following.current = null;
    requestedExecution.current = null;
    cursor.current = 0;
    setActiveRun(null);
    setLiveState(initialState());
    setHasArtifact(false);
    setGeneration((value) => value + 1);
  };
  const state = mock?.state ?? liveState;
  const activeId = mock?.simulation?.executionId ?? activeRun?.executionId;
  return (
    <div className="runtime-shell">
      <header className="runtime-toolbar">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Live monitor</h1><Badge variant={state.connection === "active" ? "cyan" : "outline"}><Activity size={13} />{mock ? "Simulation" : state.connection}</Badge></div>
          <p className="page-description">Follow the current execution, model activity, and knowledge graph traversal.</p>
        </div>
        <div className="page-actions">
          {mock && <span role="status" className={`mock-status ${mock.phase}`}>{mock.phase === "passed" ? "AKG verified" : mock.phase === "failed" ? "AKG mismatch" : mock.phase === "loading" ? "Loading mock / layout" : "Running mock"}</span>}
          {mock && <><Button onClick={runMockTest} aria-label="Run seeded AKG traversal test"><FlaskConical size={14} />Rerun mock</Button><Button onClick={returnToLive}>Return to live</Button></>}
          {!mock && hasArtifact && activeId && <Link href={`/results/${encodeURIComponent(activeId)}`} className="ui-button ui-button-primary"><ExternalLink size={15} />Open detailed results</Link>}
          <Link href="/results" className="ui-button">Browse results</Link>
        </div>
      </header>
      <div className="summary-grid runtime-summary" aria-label="Current execution summary">
        <div className="summary-item"><span>Execution</span><strong>{(state.executionStatus ?? "unknown").replace(/_/g, " ")}</strong><small>{activeId ?? "Waiting for a run"}</small></div>
        <div className="summary-item"><span>Security outcome</span><strong>{(state.securityOutcome ?? "unknown").replace(/_/g, " ")}</strong><small>Independent of execution completion</small></div>
        <div className="summary-item"><span>Model</span><strong>{state.model ?? "Unavailable"}</strong><small>{state.provider ?? "Provider not recorded"}</small></div>
        <div className="summary-item"><span>Elapsed</span><strong>{fmtDuration(state.elapsedMs)}</strong><small>{mock ? "Mock replay" : "Runtime journal"}</small></div>
      </div>

      {error && !mock && (
        <div role="alert" className="runtime-error">
          {error} — retrying discovery…
        </div>
      )}
      {mock && (
        <div className="mock-summary">
          <span>{mock.simulation?.seed.name ?? "Loading fixture"}</span>
          <span data-testid="replay-count">
            {mock.index}/{mock.simulation?.events.length ?? "…"} events reduced
          </span>
          {mock.verification && (
            <span>
              {mock.verification.transitions} transitions ·{" "}
              {mock.verification.checks.filter((check) => check.passed).length}/
              {mock.verification.checks.length} checks passed
            </span>
          )}
          {mock.error && <span role="alert">{mock.error}</span>}
          {mock.verification && !mock.verification.passed && (
            <details open className="verification-details">
              <summary>Verification mismatches</summary>
              {mock.verification.checks
                .filter((check) => !check.passed)
                .map((check) => (
                  <p key={check.id}>
                    <strong>{check.label}</strong> — {check.detail}
                  </p>
                ))}
            </details>
          )}
        </div>
      )}
      <div className="runtime-dashboard">
        <section className="akg-panel" aria-label="AKG Traversal">
          <div className="snapshot-context">Snapshot: {mock ? "mock capture" : akg.source ?? "static fallback"} <code>{activeRun?.executionId}</code></div>
          {state.mode === "matrix" && Object.keys(state.children).length > 0 && <div className="flex flex-wrap gap-2 p-2 text-xs">
            {Object.values(state.children).map(child => <button key={child.executionId} className="text-signal-300 underline" onClick={() => {
              const run = runs.find(r => r.executionId === child.executionId);
              if (run) adopt(run.executionId,run);
            }}>{child.executionId} · {child.executionStatus ?? child.status}</button>)}
          </div>}
          <AkgGraph
            key={mock ? `mock-${mock.id}-${!!mock.simulation}` : "live"}
            snapshot={mock?.snapshot ?? akg}
            currentNode={state.currentNode}
            selectedMethod={state.selectedMethod}
            akgPath={state.akgPath}
            confirmedVulns={state.confirmedVulns}
            achievedOutcomes={state.achievedOutcomes}
            viableMethods={state.viableMethods}
            onLayoutReady={mock?.simulation ? layoutReady : undefined}
          />
        </section>
        <aside className="runtime-sidebar">
          <section aria-label="Coordinate">
            <CoordinatePanel state={state} />
          </section>
          <section aria-label="Conversation">
            <ConversationPanel state={state} />
          </section>
          <section aria-label="Outcomes">
            <OutcomePanel state={state} />
          </section>
        </aside>
      </div>
      {!mock && <details className="runtime-demonstration"><summary>Demonstration replay</summary><div className="page-actions"><Button onClick={runMockTest} aria-label="Run seeded AKG traversal test"><FlaskConical size={14} />Mock AKG test</Button><span className="helper-copy">Replay the local fixture to inspect graph behavior.</span></div></details>}
      {!mock && <details className="runtime-catalog"><summary>Run catalog · {runs.length} loaded</summary><RunCatalog runs={runs} selected={activeRun?.executionId} onPick={run => { requestedExecution.current = run.executionId; adopt(run.executionId, run); }} />{nextRunCursor !== null && <div className="table-footer"><span>Search more executions by loading another page.</span><Button onClick={loadOlder} disabled={loadingOlder}>Load older runs</Button></div>}</details>}
      {!activeId && !mock && <div className="notice mt-5" role="status">Waiting for a live run. Open the results catalog to review saved executions, or ask the workspace owner to check the TESIS source configuration.</div>}

    </div>
  );
}
