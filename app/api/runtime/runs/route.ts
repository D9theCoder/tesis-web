import { NextResponse } from "next/server";
import path from "node:path";
import {
  collectRuns,
  isRunCoordinateDir,
  listDirectories,
  listFiles,
  pathExists,
  readJson,
  redact,
  runsRoot,
  tesisRoot,
  isExecutionJson,
  isMatrixAggregate,
  relativeToTesisRoot,
} from "@/lib/server/fs-util";
import type { RunDescriptor, RunSummary } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CashedRun {
  executionId: string;
  runId: string | null;
  mode: string;
  directory: string;
  status: string;
  provider?: string;
  model?: string;
  surface?: string;
  securityLevel?: string;
  payloadMode?: string;
  experimentCondition?: string;
  targetMethod?: string;
  startedAt?: string;
  endedAt?: string;
  coordinateIndex?: number | null;
  matrixExecutionId?: string | null;
  isMatrixAggregate?: boolean;
}

function safeRedacted<T extends Record<string, unknown>>(obj: T): T {
  return redact(obj, true) as T;
}

function connectionFor(status: string, stale: boolean): RunSummary["connection"] {
  const s = status.toLowerCase();
  if (s === "running" || s === "active" || s === "in-progress" || s === "in_progress") {
    return stale ? "stale" : "active";
  }
  if (s === "completed" || s === "success" || s === "finished" || s === "complete") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "error" || s === "failed") return "error";
  return "waiting";
}

function isStale(
  heartbeatAt: number | string | undefined,
  startedAt: string | undefined,
): boolean {
  const now = Date.now() / 1000;
  const ref =
    (typeof heartbeatAt === "number"
      ? heartbeatAt
      : typeof heartbeatAt === "string"
        ? Date.parse(heartbeatAt) / 1000
        : undefined) ??
    (startedAt ? Date.parse(startedAt) / 1000 : NaN);
  if (Number.isFinite(ref)) {
    return now - ref > 90;
  }
  return true;
}

async function summariseFromDescriptor(
  dir: string,
  raw: Record<string, unknown>,
): Promise<RunSummary | null> {
  const d = raw as unknown as RunDescriptor;
  const executionId = d.execution_id ?? d.exec_id ?? d.executionId ?? null;
  const id = typeof executionId === "string" ? executionId : null;
  if (!id) return null;
  const coordinate =
    raw.coordinates && typeof raw.coordinates === "object"
      ? (raw.coordinates as Record<string, unknown>)
      : {};
  const value = (key: string): unknown => raw[key] ?? coordinate[key];
  const startedAt = d.started_at ?? (d.start_timestamp != null ? new Date((d.start_timestamp as number) * 1000).toISOString() : undefined);
  const status = typeof d.status === "string" ? d.status : "running";
  const journalPath = path.join(dir, "runtime.events.jsonl");
  const manifestPath = path.join(dir, "experiment.manifest.json");
  const [hasJournal, hasManifest] = await Promise.all([
    pathExists(journalPath),
    pathExists(manifestPath),
  ]);
  const stale = isStale(
    typeof d.heartbeat_at === "number" || typeof d.heartbeat_at === "string"
      ? d.heartbeat_at
      : undefined,
    startedAt as string | undefined,
  );
  return {
    executionId: id,
    runId: typeof d.run_id === "string" ? d.run_id : null,
    mode: typeof d.mode === "string" ? d.mode : "single-run",
    directory: relativeToTesisRoot(dir),
    status,
    connection: connectionFor(status, stale),
    provider: typeof value("provider") === "string" ? String(value("provider")) : undefined,
    model: typeof value("model") === "string" ? String(value("model")) : undefined,
    surface: typeof value("surface") === "string" ? String(value("surface")) : undefined,
    securityLevel: typeof value("security_level") === "string" ? String(value("security_level")) : undefined,
    payloadMode: typeof value("payload_mode") === "string" ? String(value("payload_mode")) : undefined,
    experimentCondition:
      typeof value("experiment_condition") === "string" ? String(value("experiment_condition")) : undefined,
    targetMethod: typeof value("target_method") === "string" ? String(value("target_method")) : undefined,
    targetUrl: typeof value("target_url") === "string" ? String(value("target_url")) : undefined,
    candidateBudget:
      typeof value("candidate_budget") === "number" ? Number(value("candidate_budget")) : undefined,
    maxIterations:
      typeof value("max_iterations") === "number" ? Number(value("max_iterations")) : undefined,
    startedAt,
    endedAt: typeof d.ended_at === "string" ? d.ended_at : undefined,
    hasJournal,
    hasManifest,
  };
}

async function summariseFromManifestAndArtifacts(
  dir: string,
): Promise<RunSummary[]> {
  const manifestPath = path.join(dir, "experiment.manifest.json");
  const manifest = await readJson<Record<string, unknown>>(manifestPath);
  const out: RunSummary[] = [];

  if (manifest && typeof manifest === "object") {
    const mode = typeof manifest.mode === "string" ? manifest.mode : "single-run";
    const aggregate = manifest.aggregate as Record<string, unknown> | undefined;
    if (aggregate && typeof aggregate.artifact === "string") {
      const execId = typeof aggregate.execution_id === "string" ? aggregate.execution_id : null;
      if (execId) {
        const status = typeof (aggregate.status as unknown) === "string" ? (aggregate.status as string) : "unknown";
        out.push({
          executionId: execId,
          runId: typeof aggregate.run_id === "string" ? (aggregate.run_id as string) : null,
          mode,
          directory: path.relative(tesisRoot(), dir) || dir,
          status,
          connection: connectionFor(status, false),
          hasManifest: true,
          isMatrixAggregate: true,
        });
      }
    }
    const runs = Array.isArray(manifest.runs) ? (manifest.runs as Record<string, unknown>[]) : [];
    for (const r of runs) {
      const execId = typeof r.execution_id === "string" ? r.execution_id : null;
      if (!execId) continue;
      const status = typeof r.status === "string" ? r.status : "unknown";
      out.push({
        executionId: execId,
        runId: typeof r.run_id === "string" ? (r.run_id as string) : null,
        mode,
        directory: path.relative(tesisRoot(), dir) || dir,
        status,
        connection: connectionFor(status, false),
        provider: typeof r.provider === "string" ? (r.provider as string) : undefined,
        surface: typeof r.surface === "string" ? (r.surface as string) : undefined,
        securityLevel:
          typeof r.security_level === "string" ? (r.security_level as string) : undefined,
        payloadMode: typeof r.payload_mode === "string" ? (r.payload_mode as string) : undefined,
        experimentCondition:
          typeof r.experiment_condition === "string"
            ? (r.experiment_condition as string)
            : undefined,
        targetMethod:
          typeof r.target_method === "string" ? (r.target_method as string) : undefined,
        coordinateIndex: typeof r.index === "number" ? (r.index as number) - 1 : undefined,
        matrixExecutionId: execId,
        hasManifest: true,
      });
    }
  }
  return out;
}

export async function GET(): Promise<NextResponse> {
  const root = runsRoot();
  const tRoot = tesisRoot();
  const summaries: RunSummary[] = [];
  const seen = new Set<string>();

  const add = (s: RunSummary) => {
    if (seen.has(s.executionId)) return;
    seen.add(s.executionId);
    summaries.push(s);
  };

  try {
    const topDirs = await listDirectories(root);
    for (const top of topDirs) {
      const topPath = path.join(root, top);

      // 1) Live-run descriptor, if present.
      const descriptorPath = path.join(topPath, "runtime.json");
      if (await pathExists(descriptorPath)) {
        const raw = await readJson<Record<string, unknown>>(descriptorPath);
        if (raw) {
          const s = await summariseFromDescriptor(topPath, raw);
          if (s) add(s);
        }
      }

      // 2) Manifest + artifacts (completed / pre-descriptor runs).
      const manifestSummaries = await summariseFromManifestAndArtifacts(topPath);
      for (const s of manifestSummaries) add(s);

      // 3) Direct single artifacts and matrix aggregates.
      const files = await listFiles(topPath);
      for (const f of files) {
        if (isMatrixAggregate(f)) {
          const artifact = await readJson<Record<string, unknown>>(path.join(topPath, f));
          const execId =
            artifact && typeof artifact.execution_id === "string"
              ? artifact.execution_id
              : f.replace(/\.matrix\.json$/, "");
          const status =
            artifact && typeof artifact.status === "string" ? artifact.status : "completed";
          add({
            executionId: execId,
            runId: artifact && typeof artifact.run_id === "string" ? (artifact.run_id as string) : null,
            mode: "matrix",
            directory: path.relative(tRoot, topPath) || topPath,
            status,
            connection: connectionFor(status, false),
            isMatrixAggregate: true,
            hasArtifact: true,
          });
        } else if (isExecutionJson(f)) {
          const artifact = await readJson<Record<string, unknown>>(path.join(topPath, f));
          if (artifact) {
            const execId =
              typeof artifact.execution_id === "string"
                ? artifact.execution_id
                : f.replace(/\.json$/, "");
            const status =
              typeof artifact.status === "string" ? artifact.status : "completed";
            const config =
              artifact.config && typeof artifact.config === "object"
                ? (artifact.config as Record<string, unknown>)
                : {};
            add({
              executionId: execId,
              runId: typeof artifact.run_id === "string" ? (artifact.run_id as string) : null,
              mode: "single-run",
              directory: path.relative(tRoot, topPath) || topPath,
              status,
              connection: connectionFor(status, false),
              provider:
                typeof artifact.provider === "string"
                  ? (artifact.provider as string)
                  : typeof config.provider === "string"
                    ? (config.provider as string)
                    : undefined,
              surface:
                typeof artifact.surface === "string"
                  ? (artifact.surface as string)
                  : typeof config.surface === "string"
                    ? (config.surface as string)
                    : undefined,
              securityLevel:
                typeof artifact.security_level === "string"
                  ? (artifact.security_level as string)
                  : typeof config.security_level === "string"
                    ? (config.security_level as string)
                    : undefined,
              payloadMode:
                typeof artifact.payload_mode === "string"
                  ? (artifact.payload_mode as string)
                  : typeof config.payload_mode === "string"
                    ? (config.payload_mode as string)
                    : undefined,
              experimentCondition:
                typeof artifact.experiment_condition === "string"
                  ? (artifact.experiment_condition as string)
                  : typeof config.experiment_condition === "string"
                    ? (config.experiment_condition as string)
                    : undefined,
              targetMethod: typeof config.target_method === "string" ? (config.target_method as string) : undefined,
              hasArtifact: true,
            });
          }
        }
      }

      // 4) Matrix child coordinates (single run inside a matrix dir).
      for (const child of await listDirectories(topPath)) {
        if (!isRunCoordinateDir(child)) continue;
        const childPath = path.join(topPath, child);
        const childFiles = await listFiles(childPath);
        for (const f of childFiles) {
          if (isExecutionJson(f)) {
            const artifact = await readJson<Record<string, unknown>>(path.join(childPath, f));
            if (artifact) {
              const execId =
                typeof artifact.execution_id === "string"
                  ? artifact.execution_id
                  : f.replace(/\.json$/, "");
              const status =
                typeof artifact.status === "string" ? artifact.status : "completed";
              const idx = /^run-(\d+)-/.exec(child);
              add({
                executionId: execId,
                runId: typeof artifact.run_id === "string" ? (artifact.run_id as string) : null,
                mode: "single-run",
                directory: path.relative(tRoot, childPath) || childPath,
                status,
                connection: connectionFor(status, false),
                provider: typeof artifact.provider === "string" ? (artifact.provider as string) : undefined,
                surface: typeof artifact.surface === "string" ? (artifact.surface as string) : undefined,
                securityLevel:
                  typeof artifact.security_level === "string"
                    ? (artifact.security_level as string)
                    : undefined,
                payloadMode:
                  typeof artifact.payload_mode === "string"
                    ? (artifact.payload_mode as string)
                    : undefined,
                coordinateIndex: idx ? Number(idx[1]) - 1 : null,
                matrixExecutionId: null,
                hasArtifact: true,
              });
            }
            break;
          }
        }
      }
    }
  } catch {
    /* scanning failures degrade to an empty registry */
  }

  // Order newest-first by startedAt.
  const ordered = summaries.sort((a, b) => {
    const ta = a.startedAt ? Date.parse(a.startedAt) : 0;
    const tb = b.startedAt ? Date.parse(b.startedAt) : 0;
    return tb - ta;
  });

  const active = ordered.filter((s) => s.connection === "active");
  const payload = safeRedacted({
    runs: ordered.slice(0, 200),
    tesisRoot: tRoot,
    active,
  });
  return NextResponse.json(payload);
}
