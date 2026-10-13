// @vitest-environment node
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { getCatalog, clearCatalogCache, uniqueRun } from "@/lib/server/resolve-run";
import { resolveReviews, clearReviewCache } from "@/lib/server/reviews";
import { resultBundle } from "@/lib/server/result-bundle";
import { normalizeResult } from "@/lib/result-normalizer";
import { record } from "@/lib/artifact-contract";
const cohort = process.env.TESIS_ACCEPTANCE_EPOCH_ROOT;
afterEach(() => { vi.unstubAllEnvs(); clearCatalogCache(); clearReviewCache(); });
it.skipIf(!cohort)("retrieves the immutable 108-coordinate epoch with hash-bound outcomes and current review workflows", async () => {
  const root = cohort!, tesis = path.resolve(root,"../../..");
  vi.stubEnv("TESIS_ROOT",tesis);
  vi.stubEnv("TESIS_ARTIFACT_ROOTS",JSON.stringify({ epoch7: root }));
  vi.stubEnv("TESIS_REVIEW_ROOTS",JSON.stringify({ epoch1: path.join(root,"ai-review-epoch1"), epoch2: path.join(root,"ai-review-epoch2"), epoch3: path.join(root,"ai-review-epoch3") }));
  vi.stubEnv("TESIS_REVIEW_INDEX_FILES",JSON.stringify([path.join(root,"ai-review-audit-v2.json")]));
  vi.stubEnv("TESIS_COMPATIBILITY_FILES", process.env.TESIS_ACCEPTANCE_PROJECTION ? "" : JSON.stringify([path.join(tesis,"results/validation/execution-security-status-2026-10-12-review/historical-compatibility.json")]));
  if (process.env.TESIS_ACCEPTANCE_PROJECTION) { vi.stubEnv("TESIS_PROJECTION_FILES",JSON.stringify([process.env.TESIS_ACCEPTANCE_PROJECTION])); vi.stubEnv("TESIS_REVIEW_INDEX_FILES", ""); }
  clearCatalogCache(); clearReviewCache();
  const catalog = await getCatalog();
  const parent = [...catalog.runs.values()].flat().find(r => r.mode === "matrix")!;
  expect(catalog.runs.size).toBe(109);
  expect(catalog.diagnostics.filter(d => d.startsWith("projection_rejected"))).toEqual([]);
  const result = normalizeResult(await resultBundle(parent));
  if (process.env.TESIS_ACCEPTANCE_PROJECTION) {
    expect(result.executionStatus).toBeNull();
    expect(result.securityOutcome).toBe("confirmed");
  }
  expect(result.coverage).toMatchObject({ completed: 108, failed: 0, unknown: 0, outcomeCounts: { confirmed: 57, no_finding: 10, unconfirmed: 9, fixture_limited: 32 }, legacyTotals: { successful_runs: 61, error_runs: 47 } });
  const workflows: Record<string,number> = {}, classifications: Record<string,number> = {}, hashes: Record<string,string> = {}, problems: { id: string; status: string; reason: string | null }[] = [];
  for (const coordinate of result.coordinates) {
    const child = uniqueRun(catalog,coordinate.executionId)!;
    const reviews = await resolveReviews(child,[]);
    workflows[reviews.ai.status] = (workflows[reviews.ai.status] ?? 0) + 1;
    if (!["final","pending"].includes(reviews.ai.status)) problems.push({ id: child.executionId, status: reviews.ai.status, reason: reviews.ai.reason });
    if (child.historicalAnalysis) classifications[child.historicalAnalysis.classification] = (classifications[child.historicalAnalysis.classification] ?? 0) + 1;
    hashes[child.executionId] = child.sha256!;
  }
  expect(problems).toEqual([]);
  expect(workflows).toEqual({ final: 97, pending: 11 });
  expect(classifications).toEqual({ executed_without_candidate_confirmation: 36, executed_unconfirmed_weak_or_partial_signal: 4, fixture_permission_oracle_unavailable: 7 });
  const matrixBytes = await fs.readFile(parent.primaryPath!);
  const original = record(JSON.parse(matrixBytes.toString("utf8")));
  expect(record(original.totals).error_runs).toBe(47);
  if (process.env.TESIS_ACCEPTANCE_REPORT) {
    const report = path.resolve(process.env.TESIS_ACCEPTANCE_REPORT);
    if (!report.startsWith(path.resolve("results/validation") + path.sep)) throw new Error("Acceptance report must stay in this web repository's results/validation");
    await fs.mkdir(path.dirname(report),{ recursive: true });
    await fs.writeFile(report,JSON.stringify({ scope: "read-only saved-artifact consumer acceptance; no DVWA/providers/experiments", matrixSourceHash: parent.sha256,
      sourceHashes: hashes, coverage: result.coverage, workflows, historicalClassifications: classifications, diagnostics: catalog.diagnostics },null,2)+"\n");
  }
},60000);
