import path from "node:path";
import {
  isRunCoordinateDir,
  listDirectories,
  listFiles,
  pathExists,
  readJson,
  runsRoot,
  isExecutionJson,
} from "@/lib/server/fs-util";

export interface ResolvedRun {
  dir: string;
  descriptorPath?: string;
  journalPath?: string;
  manifestPath?: string;
  artifactPaths: string[]; // candidate exec-*.json / exec-*.matrix.json in dir
  executionId: string;
  isMatrixDir: boolean;
  directArtifact: boolean;
}

function dirHasIdMatch(dir: string, executionId: string): boolean {
  return dir.includes(executionId.slice(0, 12));
}

/**
 * Locate every directory that could own a run with `executionId`. Checks the
 * descriptor field, artifact filename, and manifest index. Returns an ordered
 * list (most relevant first).
 */
export async function resolveRun(executionId: string): Promise<ResolvedRun | null> {
  const root = runsRoot();
  const topDirs = await listDirectories(root);
  const candidates: ResolvedRun[] = [];

  for (const top of topDirs) {
    const topPath = path.join(root, top);

    // Experiment dir itself (single run / matrix aggregate / descriptor).
    const resolved = await examineDir(topPath, executionId, true);
    if (resolved) candidates.push(resolved);

    // Matrix child dirs.
    for (const child of await listDirectories(topPath)) {
      if (!isRunCoordinateDir(child)) continue;
      const childPath = path.join(topPath, child);
      const childResolved = await examineDir(childPath, executionId, false);
      if (childResolved) candidates.push(childResolved);
    }
  }

  // Prefer the directory that directly owns the artifact, then descriptors.
  return candidates.sort((a, b) => {
    const score = (r: ResolvedRun) =>
      (r.directArtifact ? 100 : 0) +
      (r.descriptorPath ? 4 : 0) +
      (r.journalPath ? 2 : 0) +
      (dirHasIdMatch(r.dir, executionId) ? 1 : 0);
    return score(b) - score(a);
  })[0] ?? null;
}

async function examineDir(
  dir: string,
  executionId: string,
  treatAsExperiment: boolean,
): Promise<ResolvedRun | null> {
  const files = await listFiles(dir);
  const artifactPaths: string[] = [];
  let matched = dirHasIdMatch(dir, executionId);

  for (const f of files) {
    const full = path.join(dir, f);
    if (isExecutionJson(f) && path.basename(f).startsWith(executionId)) {
      artifactPaths.push(full);
      matched = true;
    }
  }
  const directArtifact = artifactPaths.some((p) => {
    const base = path.basename(p);
    return base === `${executionId}.json` || base === `${executionId}.matrix.json`;
  });

  const descriptorPath = path.join(dir, "runtime.json");
  const hasDescriptor = await pathExists(descriptorPath);
  let descriptorMatch = false;
  if (hasDescriptor) {
    const raw = await readJson<Record<string, unknown>>(descriptorPath);
    if (raw && (raw.execution_id === executionId || raw.exec_id === executionId)) {
      descriptorMatch = true;
      matched = true;
    }
  }

  const journalPath = path.join(dir, "runtime.events.jsonl");
  const hasJournal = await pathExists(journalPath);
  const manifestPath = path.join(dir, "experiment.manifest.json");
  const hasManifest = await pathExists(manifestPath);
  if (hasManifest) {
    const manifest = await readJson<Record<string, unknown>>(manifestPath);
    if (manifest) {
      const agg = manifest.aggregate as Record<string, unknown> | undefined;
      if (agg && agg.execution_id === executionId) matched = true;
      if (Array.isArray(manifest.runs)) {
        for (const r of manifest.runs as Record<string, unknown>[]) {
          if (r.execution_id === executionId) matched = true;
        }
      }
    }
  }

  if (!matched && !descriptorMatch && artifactPaths.length === 0) {
    return null;
  }

  return {
    dir,
    descriptorPath: hasDescriptor ? descriptorPath : undefined,
    journalPath: hasJournal ? journalPath : undefined,
    manifestPath: hasManifest ? manifestPath : undefined,
    artifactPaths,
    executionId,
    isMatrixDir: treatAsExperiment,
    directArtifact,
  };
}

/** Resolve a single matrix coordinate artifact by run/execution id. */
export async function resolveCoordinate(
  executionId: string,
  runId: string,
): Promise<{ dir: string; artifactPath: string } | null> {
  const root = runsRoot();
  for (const top of await listDirectories(root)) {
    const topPath = path.join(root, top);
    const aggregateFiles = (await listFiles(topPath)).filter(
      (file) => file === `${executionId}.matrix.json`,
    );
    if (aggregateFiles.length === 0) continue;

    for (const child of await listDirectories(topPath)) {
      if (!isRunCoordinateDir(child)) continue;
      const childPath = path.join(topPath, child);
      for (const f of await listFiles(childPath)) {
        if (!isExecutionJson(f)) continue;
        const full = path.join(childPath, f);
        const artifact = await readJson<Record<string, unknown>>(full);
        if (!artifact) continue;
        if (artifact.run_id === runId || artifact.execution_id === runId) {
          return { dir: childPath, artifactPath: full };
        }
      }
    }
  }
  return null;
}
