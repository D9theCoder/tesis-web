"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, ExternalLink, FlaskConical, Radio } from "lucide-react";
import type { AkgSnapshot, LiveRunState, RunSummary } from "@/lib/schemas";
import { Badge, Button, ScrollArea } from "@/components/ui/primitives";
import { initialState, reduceEvents } from "@/lib/event-reducer";
import {
  fetchAkg,
  fetchAkgMock,
  fetchEvents,
  fetchResult,
  fetchRuns,
} from "@/lib/api-client";
import { CoordinatePanel } from "@/components/runtime/coordinate-panel";
import { ConversationPanel } from "@/components/runtime/conversation-panel";
import { OutcomePanel } from "@/components/runtime/outcome-panel";
import { fmtClock, normalizeRunStatus } from "@/lib/formatters";
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

  const invalidate = useCallback(() => {
    epoch.current += 1;
    for (const request of requests.current) request.abort();
    requests.current.clear();
    clearTimeout(replayTimer.current);
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
    artifact.current = false;
    setActiveRun(run);
    setLiveState(stateForRun(run));
    setHasArtifact(false);
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
        setRuns(result.runs);
        const candidate =
          result.active?.[0] ??
          (!following.current
            ? result.runs.find((run) => run.hasJournal || run.hasArtifact)
            : null);
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
      const executionId = following.current;
      try {
        if (!executionId || !valid()) return;
        const result = await fetchEvents(
          executionId,
          cursor.current,
          controller.signal,
        );
        if (!valid() || following.current !== executionId) return;
        cursor.current = result.nextCursor;
        const status = normalizeRunStatus(result.status);
        setLiveState((previous) =>
          reduceEvents(previous, result.events, {
            status,
            connection:
              status === "active" ||
              status === "completed" ||
              status === "cancelled" ||
              status === "error" ||
              status === "stale"
                ? status
                : "waiting",
          }),
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
          }
        }
      } catch {
        /* Retry transient journal errors on the next poll. */
      } finally {
        if (valid()) pollTimer = setTimeout(poll, POLL_MS);
      }
    };
    void discover();
    void poll();
    void fetchAkg(controller.signal)
      .then((raw) => {
        if (valid()) setAkg(normalizeAkgSnapshot(raw));
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      controller.abort();
      activeRequests.delete(controller);
      clearTimeout(discoverTimer);
      clearTimeout(pollTimer);
    };
  }, [generation, adopt]);

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
      <div className="runtime-toolbar">
        <div className="flex items-center gap-3">
          <Radio size={16} className="text-signal-400" />
          <span className="font-display uppercase tracking-widest">
            Runtime Monitor
          </span>
          <Badge variant="outline">
            <Activity size={9} />
            {mock ? "simulation" : state.connection}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mock && (
            <span role="status" className={`mock-status ${mock.phase}`}>
              {mock.phase === "passed"
                ? "✓ AKG verified"
                : mock.phase === "failed"
                  ? "✕ AKG mismatch"
                  : mock.phase === "loading"
                    ? "◷ Loading mock / layout"
                    : "◷ Running mock"}
            </span>
          )}
          <Button
            onClick={runMockTest}
            aria-label="Run seeded AKG traversal test"
          >
            <FlaskConical size={12} />
            {mock ? "Rerun mock" : "Mock AKG test"}
          </Button>
          {mock && <Button onClick={returnToLive}>Return to live</Button>}
          {!mock && hasArtifact && activeId && (
            <Link
              href={`/results/${activeId}`}
              className="flex items-center gap-1 text-sm"
            >
              <ExternalLink size={12} />
              Open detailed results
            </Link>
          )}
        </div>
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
      {!activeId && !mock && (
        <details className="shrink-0 border-t border-graphite-700 px-4 py-2 text-xs text-graphite-400">
          <summary>Waiting for a live run · {runs.length} recent runs</summary>
          <WaitingState
            runs={runs}
            onPick={(run) => adopt(run.executionId, run)}
          />
        </details>
      )}
    </div>
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
            <span className="rounded-sm bg-graphite-800 px-1 py-0.5 text-signal-300">
              python -m tesis run --config config.yaml
            </span>{" "}
            or the headless CLI. This observer will auto-adopt the newest active
            run and tail its redacted journal.
          </p>
          <Badge variant="outline" className="mt-1">
            TESIS_ROOT=
            {process.env.NEXT_PUBLIC_TESIS_ROOT ?? "/home/kevin/coding/tesis"}
          </Badge>
        </div>

        {runs.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-label">recent runs on this machine</span>
              <span className="font-mono text-[10px] text-graphite-500">
                {runs.length}
              </span>
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
                        <Badge
                          variant={
                            r.connection === "active" ? "cyan" : "outline"
                          }
                        >
                          {r.connection ?? r.status}
                        </Badge>
                        <span className="truncate font-mono text-[11px] text-graphite-200">
                          {r.mode} · {r.surface ?? "—"} ·{" "}
                          {r.securityLevel ?? "—"}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[9px] text-graphite-500">
                        {r.executionId}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[9px] text-graphite-500">
                        {fmtClock(
                          r.startedAt ? Date.parse(r.startedAt) / 1000 : null,
                        )}
                      </span>
                      {r.connection === "completed" && (
                        <Link
                          href={`/results/${r.executionId}`}
                          className="text-signal-400 hover:text-signal-300"
                          onClick={(e) => e.stopPropagation()}
                        >
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
