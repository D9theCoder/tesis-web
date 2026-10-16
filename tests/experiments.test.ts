// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as inventory } from "@/app/api/experiments/route";
import { GET as overview } from "@/app/api/experiments/overview/route";
import { clearCatalogCache, resolveCoordinate, resolveRun } from "@/lib/server/resolve-run";
import { resultBundle } from "@/lib/server/result-bundle";
import { clearReviewCache } from "@/lib/server/reviews";
import { experimentListSchema, experimentOverviewSchema } from "@/lib/experiment-contract";

let root: string;
const source = (id: string, extra: Record<string, unknown> = {}) => ({ schema_version: "tui.v1", execution_id: id, run_id: "nonunique", status: "success", execution_status: "completed", security_outcome: "no_finding", selected_method: "saved-method", config: { scoring_mode: "both", rubric_version: "scoring.v4" }, ...extra });
async function save(name: string, raw: unknown) {
  const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(raw)); return file;
}
async function list(query = "") { return experimentListSchema.parse(await (await inventory(new Request(`http://localhost/api/experiments?${query}`))).json()); }
async function summary(query = "") { return experimentOverviewSchema.parse(await (await overview(new Request(`http://localhost/api/experiments/overview?${query}`))).json()); }
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tesis-web-experiments-"));
  vi.stubEnv("TESIS_ROOT", root); vi.stubEnv("TESIS_ARTIFACT_ROOTS", JSON.stringify({ fixture: root }));
  for (const key of ["TESIS_REVIEW_ROOTS", "TESIS_REVIEW_INDEX_FILES", "TESIS_PROJECTION_FILES", "TESIS_COMPATIBILITY_FILES"]) vi.stubEnv(key, "");
  clearCatalogCache(); clearReviewCache();
});
afterEach(async () => { clearCatalogCache(); clearReviewCache(); vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });

async function matrixFixture() {
  const a = source("child-a", { provider: "saved-provider", model: "saved-model", execution_status: "failed", security_outcome: "confirmed", timing: { started_at: "2026-10-16T00:00:00Z" } });
  const b = source("child-b", { execution_status: "interrupted", security_outcome: null });
  await save("a.json", a); await save("b.json", b);
  await save("matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a", runs: [a,b], cancellation: { total_runs: 3, not_started_runs: 1 }, created_at: "2026-10-17T00:00:00Z" });
  await save("standalone.json", source("standalone-a", { created_at: "2026-10-15T00:00:00Z" }));
}

describe("experiment inventory and exact identity", () => {
  it("groups only validated matrix children, searches children before paging, and keeps all raw identities", async () => {
    await matrixFixture();
    const page = await list("limit=1");
    expect(page).toMatchObject({ experiments: 2, executions: 4, total: 2, nextCursor: 1, entries: [{ kind: "matrix", memberCount: 2, run: { executionId: "matrix-a" } }] });
    const next = await list("limit=1&cursor=1"); expect(next.entries[0].run.executionId).toBe("standalone-a");
    const childSearch = await list("q=child-b&limit=1");
    expect(childSearch.entries.map(row => row.run.executionId)).toEqual(["matrix-a"]);
    expect((await list("view=executions&scope=matrix-a")).entries.map(row => row.run.executionId).sort()).toEqual(["child-a", "child-b", "matrix-a"]);
    expect((await list("view=executions&scope=matrix-a&outcome=confirmed")).entries.map(row => row.run.executionId)).toEqual(["child-a"]);
    const rawParent = (await list("view=executions&q=matrix-a")).entries[0];
    expect(rawParent).toMatchObject({ unit: "execution", outcomes: { confirmed: 0 }, unknownOutcomes: 1 });
    const filtered = await list("execution=failed&outcome=confirmed"); expect(filtered.entries.map(row => row.run.executionId)).toEqual(["matrix-a"]);
    expect((await list("q=nonunique")).total).toBe(0);
  });
  it("preserves ambiguous and unavailable identities without grouping by ID resemblance or run ID", async () => {
    await matrixFixture();
    await save("unrelated.json", source("matrix-a-looks-like-child"));
    await save("one/duplicate.json", source("ambiguous")); await save("two/duplicate.json", source("ambiguous"));
    await save("missing/runtime.json", { schema_version: "runtime-descriptor.v1", execution_id: "missing-primary", mode: "single-run", status: "finished" });
    const page = await list();
    expect(page.experiments).toBe(4); expect(page.unresolved).toBe(1);
    expect(page.entries.some(entry => entry.run.executionId === "missing-primary" && !entry.run.hasArtifact)).toBe(true);
    const unresolved = await list("view=unresolved"); expect(unresolved.entries[0]).toMatchObject({ kind: "unresolved", run: { executionId: "ambiguous", hasArtifact: false }, outcomes: {}, unknownOutcomes: null });
    expect((await overview(new Request("http://localhost/overview?scope=ambiguous"))).status).toBe(409);
  });
  it("surfaces conflicting manifest membership instead of accepting the last parent", async () => {
    await save("child.json", source("child-a"));
    for (const id of ["matrix-a", "matrix-b"]) {
      await save(`${id}.json`, { schema_version: "stage8.v1", execution_id: id, matrix: true, runs: [] });
      await save(`${id}.manifest.json`, { artifact_type: "experiment_manifest", aggregate: { execution_id: id, artifact: `${id}.json` }, runs: [{ execution_id: "child-a", artifact: "child.json" }] });
    }
    expect((await list("view=unresolved")).entries.map(row => row.run.executionId)).toEqual(["child-a"]);
    expect((await overview(new Request("http://localhost/overview?scope=child-a"))).status).toBe(409);
  });
  it("retains orphaned declared children in the unresolved inventory", async () => {
    await save("orphan.json", source("orphan-a", { matrix_execution_id: "missing-parent" }));
    expect((await list()).entries).toEqual([]);
    expect((await list("view=unresolved")).entries[0]).toMatchObject({ kind: "unresolved", unit: "execution", run: { executionId: "orphan-a", hasArtifact: true }, outcomes: { no_finding: 1 } });
    expect((await overview(new Request("http://localhost/overview?scope=orphan-a"))).status).toBe(409);
  });
  it("does not grant coordinate detail through a child-declared parent ID from another root", async () => {
    await save("parent/matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a",
      runs: [{ execution_id: "child-a", execution_status: "completed", security_outcome: "no_finding" }] });
    await save("foreign/child.json", source("child-a", { matrix_execution_id: "matrix-a", provider: "foreign-source-marker" }));
    vi.stubEnv("TESIS_ARTIFACT_ROOTS", JSON.stringify({ parent: path.join(root, "parent"), foreign: path.join(root, "foreign") }));
    expect(await resolveCoordinate("matrix-a", "child-a")).toBeNull();
    const bundle = await resultBundle((await resolveRun("matrix-a"))!);
    expect(JSON.stringify(bundle)).not.toContain("foreign-source-marker");
    expect((await list("view=unresolved")).entries.map(entry => entry.run.executionId)).toEqual(["child-a"]);
  });
  it("rejects repeated explicit scope parameters rather than selecting either source", async () => {
    await matrixFixture();
    expect((await inventory(new Request("http://localhost/inventory?scope=matrix-a&scope=standalone-a"))).status).toBe(400);
    expect((await overview(new Request("http://localhost/overview?scope=matrix-a&scope=standalone-a"))).status).toBe(400);
  });
  it.each(["view=bogus", "outcome=success", "limit=101", "cursor=-1", "scope="])("rejects invalid query %s without defaulting to another scope", async query => {
    expect((await inventory(new Request(`http://localhost/inventory?${query}`))).status).toBe(400);
  });
});

describe("scoped coverage, conclusions, and selection", () => {
  it("counts coordinates once, preserves failed-confirmed independence and unknown attribution", async () => {
    await matrixFixture();
    const data = await summary("scope=matrix-a");
    expect(data).toMatchObject({ unit: "coordinates", coverage: { represented: 2, planned: 3, unstarted: 1, completed: 0, failed: 1, interrupted: 1 }, lifecycle: { failed: 1, interrupted: 1 }, outcomes: { confirmed: 1, no_finding: 0 }, unknownOutcomes: 1 });
    expect(data.reviews.human.total).toBe(2); expect(data.reviews.ai.total).toBe(2);
    expect(data.attention.find(group => group.id === "attribution")).toMatchObject({ affected: 1, unit: "executions", items: [{ executionId: "child-b" }] });
    const childLink = data.attention.find(group => group.id === "attribution")!.items[0].href;
    expect(childLink).toBe("/results/matrix-a?coordinate=child-b&tab=summary");
    expect(data.source?.sha256).toBe(createHash("sha256").update(await fs.readFile(path.join(root, "matrix.json"))).digest("hex"));
  });
  it("selects URL, valid remembered scope, then stored timestamp; missing URL selection never falls back", async () => {
    await matrixFixture();
    expect((await summary()).experiment?.run.executionId).toBe("matrix-a");
    expect((await summary("previous=standalone-a")).experiment?.run.executionId).toBe("standalone-a");
    expect((await summary("scope=matrix-a&previous=standalone-a")).experiment?.run.executionId).toBe("matrix-a");
    expect((await summary("previous=expired")).experiment?.run.executionId).toBe("matrix-a");
    expect((await overview(new Request("http://localhost/overview?scope=expired&previous=standalone-a"))).status).toBe(404);
    const standalone = await summary("scope=standalone-a");
    expect(standalone.coverage).toBeNull(); expect(standalone.unit).toBe("standalone execution");
  });
  it("does not turn declared-but-unaggregated coordinates into represented evidence", async () => {
    await save("matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a", runs: [{ execution_id: "child-a", execution_status: "failed", security_outcome: "confirmed" }] });
    await save("manifest.json", { artifact_type: "experiment_manifest", aggregate: { execution_id: "matrix-a", artifact: "matrix.json" },
      runs: [{ execution_id: "child-a", artifact: "missing-a.json" }, { execution_id: "not-aggregated", artifact: "missing-b.json" }] });
    const data = await summary("scope=matrix-a");
    expect(data.coverage).toMatchObject({ represented: 1, failed: 1, planned: null });
    expect(data.outcomes.confirmed).toBe(1);
    expect(data.experiment?.memberCount).toBe(2);
    expect(data.reviews.complete).toBe(false);
    expect(data.attention.find(group => group.id === "missing")?.affected).toBe(2);
  });
  it("retains canonical producer outcome exclusions and marks unresolved review denominators incomplete", async () => {
    await matrixFixture();
    await save("matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a", runs: [source("child-a"), source("missing-coordinate", { config: undefined })], totals: { total_runs: 2, completed_runs: 0, execution_unknown_runs: 2, security_outcome_counts: { confirmed: 0, no_finding: 0, unconfirmed: 0, fixture_limited: 0 } } });
    clearCatalogCache();
    const data = await summary("scope=matrix-a");
    expect(data.coverage).toMatchObject({ represented: 2, planned: null, completed: 0, unknown: 2 });
    expect(data.outcomes.confirmed).toBe(0); expect(data.unknownOutcomes).toBe(2);
    expect(data.reviews.complete).toBe(false); expect(data.partial).toBe(true);
  });
  it("does not convert unavailable matrix coverage to zero or count duplicate IDs twice", async () => {
    await save("matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a", runs: [source("child-a"), source("child-a")] });
    const data = await summary("scope=matrix-a");
    expect(data.coverage).toBeNull(); expect(data.outcomes).toEqual({}); expect(data.unknownOutcomes).toBeNull(); expect(data.reviews.complete).toBe(false);
  });
});

describe("source-bound review readiness", () => {
  it("keeps final, pending, stale, missing, and not-selected independent with explicit eligibility", async () => {
    const a = source("review-a"), file = await save("review-a.json", a);
    const hash = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    await save("review-human-only.json", source("human-only", { config: { scoring_mode: "human" } }));
    await save("matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a", runs: [a, source("human-only", { config: { scoring_mode: "human" } })] });
    await save("reviews/ai.ai-verified.json", { artifact_type: "thesis_score_receipt", execution_id: "review-a", run_id: "nonunique", source_path: file, source_sha256: hash, scoring_mode: "ai", rubric_version: "scoring.v4", status: "final", generated_at: "2026-10-17T00:00:00Z", method: "saved-method", config: a.config,
      components: { Smethod: 2.5, Spayload: 1.5, Sexploit: 2, Schain: 1, Soutput: 4 }, Spayload_final: 1.5, Srun_final: 2.3,
      formula: { Smethod: .2, Spayload: .2, Sexploit: .3, Schain: .1, Soutput: .2 },
      numerator: 3, denominator: 2, candidate_grades: [{ candidate_id: "a", score: 1 }, { candidate_id: "b", score: 2 }], component_evidence_refs: {} });
    await save("reviews/human.review-status.json", { artifact_type: "thesis_review_status", execution_id: "review-a", source_path: file, source_sha256: hash, generated_at: "2026-10-17T00:00:00Z", rubric_version: "scoring.v4", method: "saved-method", config: a.config, workflows: { human: { status: "pending", reason: "pending_saved_work" } } });
    vi.stubEnv("TESIS_REVIEW_ROOTS", JSON.stringify({ reviews: path.join(root, "reviews") }));
    let data = await summary("scope=matrix-a");
    expect(data.reviews.human).toMatchObject({ eligible: 2, total: 2, states: { pending: 1, missing: 1 } });
    expect(data.reviews.ai).toMatchObject({ eligible: 1, states: { final: 1, not_selected: 1, pending: 0 } });
    expect(data.attention.find(group => group.id === "pending")).toMatchObject({ affected: 1, messages: 1 });
    await save("review-a.json", { ...a, changed: true }); clearCatalogCache(); clearReviewCache();
    data = await summary("scope=matrix-a");
    expect(data.reviews.ai.states.stale).toBe(1); expect(data.reviews.ai.states.final).toBe(0);
    expect(data.reviews.human.states.pending).toBe(0);
  });
  it("limits receipt scans without reporting unscanned sources as missing or pending", async () => {
    const children = Array.from({ length: 101 }, (_,i) => source(`bounded-${i}`, { final_state: {} }));
    await save("matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a", runs: children });
    const data = await summary("scope=matrix-a");
    expect(data.reviews).toMatchObject({ complete: false, limit: 100, human: { total: 101, scanned: 100, states: { missing: 100, pending: 0, not_scanned: 1 } } });
    expect(data.partial).toBe(true);
  });
  it("preserves incomplete retrieval diagnostics across cached receipt discovery", async () => {
    await save("single.json", source("single-a"));
    await save("reviews/bad.ai-verified.json", {});
    await fs.writeFile(path.join(root, "reviews/bad.ai-verified.json"), "{bad");
    vi.stubEnv("TESIS_REVIEW_ROOTS", JSON.stringify({ reviews: path.join(root, "reviews") }));
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await summary("scope=single-a");
      expect(data.reviews.complete).toBe(false);
      expect(data.attention.find(group => group.id === "retrieval")?.items[0].diagnostics.join(" ")).toContain("review_unreadable");
    }
  });
});
