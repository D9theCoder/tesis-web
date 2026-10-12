// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog, resolveRun, resolveCoordinate, summariseRun, clearCatalogCache } from "@/lib/server/resolve-run";
import { realInside, readJsonlFrom, redact, collectSecrets, isSecretKey } from "@/lib/server/fs-util";
import { receiptProblem, resolveReviews, clearReviewCache } from "@/lib/server/reviews";
import { resultBundle } from "@/lib/server/result-bundle";
import { normalizeResult } from "@/lib/result-normalizer";
import { GET as listRuns } from "@/app/api/runtime/runs/route";
import { GET as eventsRoute } from "@/app/api/runtime/runs/[executionId]/events/route";
import { GET as snapshotRoute } from "@/app/api/akg/route";
let root: string;
const primary = (id: string, extra = {}) => ({ schema_version: "tui.v1", execution_id: id, run_id: "shared-run-id", status: "success", selected_method: "method-a", config: { rubric_version: "scoring.v4" }, ...extra });
async function write(name: string, value: unknown) { const file = path.join(root,name); await fs.mkdir(path.dirname(file),{ recursive: true }); await fs.writeFile(file,JSON.stringify(value)); return file; }
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(),"tesis-web-artifacts-"));
  vi.stubEnv("TESIS_ROOT",root); vi.stubEnv("TESIS_ARTIFACT_ROOTS",JSON.stringify({ test: root }));
  vi.stubEnv("TESIS_REVIEW_ROOTS",""); vi.stubEnv("TESIS_COMPATIBILITY_FILES",""); vi.stubEnv("TESIS_REVIEW_INDEX_FILES","");
  vi.stubEnv("TESIS_PROJECTION_FILES", "");
  clearCatalogCache(); clearReviewCache();
});
afterEach(async () => { vi.unstubAllEnvs(); clearCatalogCache(); clearReviewCache(); await fs.rm(root,{ recursive: true, force: true }); });
describe("configured exact artifact catalog", () => {
  it.each(["single-run", "matrix"])("discovers a producer %s descriptor before the primary exists", async mode => {
    const descriptor = { schema_version: "runtime-descriptor.v1", execution_id: "live-execution",
      mode, status: "active", run_id: null, heartbeat_at: null, execution_status: null,
      security_outcome: null, started_at: new Date().toISOString(), updated_at: new Date().toISOString(), coordinates: {} };
    await write("live/runtime.json", descriptor);
    const line = JSON.stringify({ event_type: mode === "matrix" ? "matrix.started" : "run.started", execution_id: "live-execution" }) + "\n";
    await fs.writeFile(path.join(root, "live/runtime.events.jsonl"), line);
    const catalog = await getCatalog();
    expect(catalog.diagnostics).toEqual([]);
    const response = await listRuns(new Request("http://localhost/api/runtime/runs"));
    expect(await response.json()).toMatchObject({ runs: [{ executionId: "live-execution", mode, hasArtifact: false, hasJournal: true }] });
    const page = await eventsRoute(new Request("http://localhost/events?cursor=0"), { params: Promise.resolve({ executionId: "live-execution" }) });
    expect(await page.json()).toMatchObject({ events: [{ execution_id: "live-execution" }], nextCursor: Buffer.byteLength(line) });
    await write("live/runtime.json", { ...descriptor, heartbeat_at: new Date().toISOString() });
    clearCatalogCache();
    const refreshed = await listRuns(new Request("http://localhost/api/runtime/runs"));
    expect(await refreshed.json()).toMatchObject({ active: [{ executionId: "live-execution" }] });
  });
  it("discovers a flat source, normal run, matrix, exact child and embedded-only child without sidecars", async () => {
    await write("legacy.json", primary("old-id"));
    await write("dated/single.json", primary("single-a"));
    await write("matrix/child/a.json", primary("child-a", { repeat_index: 3, model: "model-a" }));
    await write("matrix/matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-a", runs: [primary("child-a"),primary("child-b",{ final_state: { response_evidence: [{ evidence_id: "embedded-proof" }] } })] });
    await write("matrix/experiment.manifest.json", { artifact_type: "experiment_manifest", mode: "matrix", aggregate: { execution_id: "matrix-a", artifact: "matrix.json" }, runs: [{ execution_id: "child-a", artifact: "child/a.json", index: 1, experiment_condition: "condition-a", target_method: "method-a" }] });
    await write("dated/runtime.json", { schema_version: "runtime-descriptor.v1", execution_id: "single-a", status: "finished", mode: "single-run" });
    await write("dated/single-a.rich.json", primary("fake-rich"));
    await write("dated/audit.json", { artifact_type: "audit", execution_id: "fake-audit", config: {}, status: "final" });
    const catalog = await getCatalog(); expect([...catalog.runs.keys()].sort()).toEqual(["child-a","child-b","matrix-a","old-id","single-a"]);
    const child = await resolveCoordinate("matrix-a","child-a"); expect(child?.dir).toBe(path.join(root,"matrix/child"));
    expect(summariseRun(child!)).toMatchObject({ matrixExecutionId: "matrix-a", coordinateIndex: 0, repeatIndex: 3, experimentCondition: "condition-a", model: "model-a", hasArtifact: true });
    expect(await resolveCoordinate("matrix-a","shared-run-id")).toBeNull();
    const embedded = await resolveCoordinate("matrix-a","child-b"); expect(embedded?.embedded).toBe(true);
    const bundle = normalizeResult(await resultBundle(embedded!)); expect(bundle.evidenceRows[0].id).toBe("embedded-proof");
    const matrix = normalizeResult(await resultBundle((await resolveRun("matrix-a"))!));
    expect(JSON.stringify(matrix.raw)).not.toContain("embedded-proof");
  });
  it("does not hide ambiguity, match prefixes, or invent missing primaries", async () => {
    await write("a/one.json",primary("exact-id")); await write("b/two.json",primary("exact-id"));
    await write("c/runtime.json",{ schema_version: "runtime-descriptor.v1", execution_id: "no-primary", status: "finished" });
    expect(await resolveRun("exact")).toBeNull(); await expect(resolveRun("exact-id")).rejects.toThrow("Ambiguous");
    expect(summariseRun((await resolveRun("no-primary"))!).hasArtifact).toBe(false);
    const response = await listRuns(new Request("http://localhost/api/runtime/runs?limit=1"));
    const page = await response.json(); expect(page.total).toBe(2); expect(page.nextCursor).toBe(1); expect(page.runs).toHaveLength(1);
  });
  it("requires path/hash binding for compatibility and preserves old totals", async () => {
    const file = await write("cohort/a.json",primary("child-a",{ status: "error", task_result: "INCOMPLETE" }));
    const hash = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    await write("cohort/matrix.json",{ schema_version: "stage8.v1", execution_id: "matrix-a", runs: [primary("child-a",{ status: "error" })], totals: { total_runs: 1, successful_runs: 0, error_runs: 1 } });
    const view = await write("compatibility.json",{ all_source_hashes_preserved: true, runs: [{ path: file, source_sha256: hash, execution_status: "completed", security_outcome: "fixture_limited" }] });
    vi.stubEnv("TESIS_COMPATIBILITY_FILES",JSON.stringify([view]));
    const child = await resolveRun("child-a"); expect(child?.sha256).toBe(hash); expect(summariseRun(child!).executionStatus).toBe("completed");
    const matrix = normalizeResult(await resultBundle((await resolveRun("matrix-a"))!));
    expect(matrix.coverage).toMatchObject({ completed: 1, failed: 0, legacyTotals: { error_runs: 1 } });
    await fs.writeFile(file,JSON.stringify(primary("child-a"))); clearCatalogCache();
    expect(summariseRun((await resolveRun("child-a"))!).securityOutcome).toBeNull();
  });
  it("switches captured snapshots and grants parent ownership only through membership", async () => {
    await write("a/a.json",primary("single-a")); await write("a/akg.snapshot.json",{ schema_version: "akg-snapshot.v1", nodes: [{ id: "only-a", surface: null }], edges: [] });
    await write("b/b.json",primary("single-b")); await write("b/akg.snapshot.json",{ nodes: [{ id: "only-b" }], edges: [] });
    const a = await (await snapshotRoute(new Request("http://localhost/api/akg?executionId=single-a"))).json();
    const b = await (await snapshotRoute(new Request("http://localhost/api/akg?executionId=single-b"))).json();
    expect(a.nodes[0].id).toBe("only-a"); expect(b.nodes[0].id).toBe("only-b"); expect(a.sha256).not.toBe(b.sha256);
    const fallback = await (await snapshotRoute(new Request("http://localhost/api/akg"))).json(); expect(fallback.source).toBe("static");
  });
});
describe("canonical matrix projections", () => {
  async function projectionFixture(execution: unknown = "completed", security: unknown = "confirmed") {
    const file = await write("matrix.json", { schema_version: "stage8.v1", execution_id: "matrix-projected", status: "success", runs: [], totals: { total_runs: 0 } });
    const sha256 = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    const binding = { root_id: "test", path: "matrix.json", sha256 };
    const executionReason = { code: "producer_execution", message: "canonical lifecycle" };
    const outcomeReason = { code: "producer_security", message: "canonical proof" };
    const projection = { schema_version: "observer-projection.v1", artifact_type: "observer_projection",
      generated_at: "2026-10-12T00:00:00Z", code_epoch: { "core/run_status.py": "a".repeat(64) },
      roots: [{ id: "test", kind: "source" }], sources: [binding], runs: [], diagnostics: [], matrices: [{
        identity: { execution_id: "matrix-projected" }, source: binding,
        execution: { status: execution, reason: executionReason }, security: { outcome: security, reason: outcomeReason },
        coverage: { total_runs: 0, completed_runs: 0 }, stored_legacy_totals: { total_runs: 0 }, groups: {}, detail: {},
      }] };
    const view = await write("projection.json", projection);
    vi.stubEnv("TESIS_PROJECTION_FILES", JSON.stringify([view]));
    return { file, sha256, view, projection, executionReason, outcomeReason };
  }
  it.each(["completed", null])("applies matrix statuses and reasons with execution %s", async execution => {
    const fixture = await projectionFixture(execution);
    const catalog = await getCatalog();
    expect(catalog.diagnostics).toEqual([]);
    const run = (await resolveRun("matrix-projected"))!;
    const result = normalizeResult(await resultBundle(run));
    expect(result).toMatchObject({ executionStatus: execution, securityOutcome: "confirmed",
      executionReason: fixture.executionReason, securityOutcomeReason: fixture.outcomeReason });
    expect(summariseRun(run)).toMatchObject({ executionStatus: execution, securityOutcome: "confirmed" });
    expect(run.sha256).toBe(fixture.sha256);
    expect(JSON.parse(await fs.readFile(fixture.file, "utf8"))).not.toHaveProperty("execution_status");
  });
  it.each([["executed", "confirmed"], ["completed", "success"]])("rejects invalid matrix enums %s / %s", async (execution, security) => {
    await projectionFixture(execution, security);
    const catalog = await getCatalog();
    expect(catalog.diagnostics.some(diagnostic => diagnostic.startsWith("projection_rejected"))).toBe(true);
    expect((await resolveRun("matrix-projected"))?.raw).not.toHaveProperty("observer_projection");
    expect(summariseRun((await resolveRun("matrix-projected"))!).securityOutcome).toBeNull();
  });
  it("preserves explicit null outcomes and rejects changed source bytes", async () => {
    const fixture = await projectionFixture(null, null);
    expect(summariseRun((await resolveRun("matrix-projected"))!)).toMatchObject({ executionStatus: null, securityOutcome: null });
    await fs.appendFile(fixture.file, "\n");
    clearCatalogCache();
    const catalog = await getCatalog();
    expect(catalog.diagnostics.some(diagnostic => diagnostic.startsWith("projection_rejected"))).toBe(true);
    expect((await resolveRun("matrix-projected"))?.raw).not.toHaveProperty("observer_projection");
  });
});
describe("containment and redaction", () => {
  it("redacts hyphenated credentials from result payloads and their copied evidence", async () => {
    await write("secret.json", primary("redacted-result", { config: { "api-key": "opaqueDownloadCredential" },
      request_evidence: [{ headers: { "X-API-Key": "opaqueHeaderCredential" } }],
      response_evidence: [{ evidence_id: "response-safe-id", response_excerpt: "opaqueDownloadCredential opaqueHeaderCredential" }],
      provider_usage: { total_tokens: 9 } }));
    const bundle = await resultBundle((await resolveRun("redacted-result"))!);
    expect(JSON.stringify(bundle)).not.toMatch(/opaqueDownloadCredential|opaqueHeaderCredential/);
    expect(JSON.stringify(bundle)).toContain("response-safe-id");
    expect(JSON.stringify(bundle)).toContain('"total_tokens":9');
  });
  it("normalizes secret separators and redacts opaque copies without hiding safe metadata", () => {
    const raw = { headers: { "X-API-Key": "opaqueCredential123" }, "api-key": "opaqueCredential456",
      apiKey: "opaqueCredential789", "access token": "opaqueCredentialABC",
      output: "opaqueCredential123 opaqueCredential456 opaqueCredential789 opaqueCredentialABC",
      "credential-pair-id": "safe-id", "api-key-fingerprint": "safe-hash", "token-count": 9 };
    expect([...collectSecrets(raw)]).toHaveLength(4);
    expect(isSecretKey("X-API-Key")).toBe(true);
    expect(JSON.stringify(redact(raw))).not.toContain("opaqueCredential");
    expect(redact(raw)).toMatchObject({ "credential-pair-id": "safe-id", "api-key-fingerprint": "safe-hash", "token-count": 9 });
  });
  it("rejects traversal and escaped symlinks for primary/manifest references", async () => {
    await fs.symlink("/etc/passwd",path.join(root,"escape.json"));
    expect(await realInside(root,"../outside")).toBeNull(); expect(await realInside(root,"escape.json")).toBeNull();
    const catalog = await getCatalog(); expect(catalog.diagnostics).toContain("path_rejected:test/escape.json");
  });
  it("redacts free text and request secrets while preserving IDs, hashes and usage", () => {
    const safe = redact({ api_key: "a-secret-key", output: "key a-secret-key; Bearer a.b.c; PHPSESSID=123456; password=hunter2", credential_pair_id: "credential-safe", source_sha256: "a".repeat(64), provider_usage: { total_tokens: 9 }, token_cost_per_success: null });
    expect(JSON.stringify(safe)).not.toMatch(/a-secret-key|a\.b\.c|123456|hunter2/);
    expect(safe).toMatchObject({ credential_pair_id: "credential-safe", source_sha256: "a".repeat(64), provider_usage: { total_tokens: 9 }, token_cost_per_success: null });
  });
});
describe("bounded journal pages", () => {
  it("skips a complete record over 512 KiB and reaches later traversal and terminal events", async () => {
    const file = path.join(root, "oversized.jsonl");
    const huge = JSON.stringify({ event_type: "llm.completed", message: "日".repeat(200000) }) + "\n";
    const later = [{ event_type: "graph.state" }, { event_type: "run.finished" }];
    await fs.writeFile(file, huge + later.map(event => JSON.stringify(event) + "\n").join(""));
    const first = await readJsonlFrom(file, 0);
    expect(first.nextCursor).toBe(Buffer.byteLength(huge));
    expect(first.hasMore).toBe(true);
    expect(first.diagnostics).toContain("journal_line_exceeds_byte_limit_at_byte:0");
    const second = await readJsonlFrom(file, first.nextCursor, first.journalIdentity);
    expect(second.reset).toBe(false);
    expect(second.events).toEqual(later);
    expect(second.hasMore).toBe(false);
  });
  it("retains an oversized partial record until its newline arrives, then advances", async () => {
    const file = path.join(root, "partial.jsonl");
    const line = JSON.stringify({ event_type: "llm.completed", message: "x".repeat(800) });
    await fs.writeFile(file, line);
    const partial = await readJsonlFrom(file, 0, null, { bytes: 128, events: 5 });
    expect(partial).toMatchObject({ nextCursor: 0, hasMore: false, skippedPartial: true });
    await fs.appendFile(file, "\n" + JSON.stringify({ event_type: "run.finished" }) + "\n");
    const complete = await readJsonlFrom(file, partial.nextCursor, partial.journalIdentity, { bytes: 128, events: 5 });
    expect(complete).toMatchObject({ nextCursor: Buffer.byteLength(line) + 1, hasMore: true, reset: false });
    expect((await readJsonlFrom(file, complete.nextCursor, complete.journalIdentity)).events).toEqual([{ event_type: "run.finished" }]);
  });
  it("preserves multibyte offsets, event pages and partial-line completion", async () => {
    const file = path.join(root,"journal.jsonl"), line = JSON.stringify({ event_type: "run.started", message: "日本語" })+"\n";
    await fs.writeFile(file,line+line+'{"event_type":"partial"');
    const first = await readJsonlFrom(file,0,null,{ bytes: 1024, events: 1 });
    expect(first.nextCursor).toBe(Buffer.byteLength(line)); expect(first.hasMore).toBe(true);
    const second = await readJsonlFrom(file,first.nextCursor,first.journalIdentity,{ bytes: 1024, events: 5 });
    expect(second.nextCursor).toBe(Buffer.byteLength(line)*2); expect(second.events).toHaveLength(1); expect(second.skippedPartial).toBe(true);
    await fs.appendFile(file,'}\n');
    const third = await readJsonlFrom(file,second.nextCursor,second.journalIdentity); expect(third.events).toHaveLength(1); expect(third.reset).toBe(false);
  });
  it("diagnoses malformed lines and resets on truncation/replacement", async () => {
    const file = path.join(root,"journal.jsonl"); await fs.writeFile(file,'{bad}\n'+JSON.stringify({ event_type: "run.finished" })+'\n');
    const first = await readJsonlFrom(file,0); expect(first.diagnostics[0]).toContain("malformed_line");
    await fs.writeFile(file,'{}\n'); const truncated = await readJsonlFrom(file,first.nextCursor,first.journalIdentity); expect(truncated.reset).toBe(true);
    const replacement = path.join(root,"replacement"); await fs.writeFile(replacement,'{}\n{}\n'); await fs.rename(replacement,file);
    expect((await readJsonlFrom(file,0,truncated.journalIdentity)).reset).toBe(true);
  });
  it("filters a parent journal to a selected child while advancing the original cursor", async () => {
    await write("matrix.json",{ schema_version: "stage8.v1", execution_id: "matrix-a", runs: [primary("child-a",{ final_state: {} })] });
    const lines = [
      { event_type: "matrix.started", execution_id: "matrix-a" },
      { event_type: "graph.state", execution_id: "child-b" },
      { event_type: "matrix.run.finished", execution_id: "matrix-a", data: { coordinate_execution_id: "child-a" } },
    ].map(e => JSON.stringify(e)+'\n').join("");
    await fs.writeFile(path.join(root,"runtime.events.jsonl"),lines);
    const response = await eventsRoute(new Request("http://localhost/events?cursor=0"),{ params: Promise.resolve({ executionId: "child-a" }) });
    const page = await response.json(); expect(page.events).toHaveLength(1); expect(page.nextCursor).toBe(Buffer.byteLength(lines)); expect(page.status).toBe("completed");
  });
});
async function receiptFixture() {
  const file = await write("source.json",primary("receipt-source")), run = (await resolveRun("receipt-source"))!;
  return { run, receipt: { artifact_type: "thesis_score_receipt", execution_id: run.executionId, run_id: "shared-run-id", source_path: file, source_sha256: run.sha256,
    rubric_version: "scoring.v4", scoring_mode: "ai", status: "final", generated_at: "2026-10-12T00:00:00Z", method: "method-a", config: { rubric_version: "scoring.v4" },
    components: { Smethod: 2.5, Spayload: 1.5, Sexploit: 2, Schain: 1, Soutput: 4 }, Spayload_final: 1.5, Srun_final: 2.3,
    formula: { Smethod: .2, Spayload: .2, Sexploit: .3, Schain: .1, Soutput: .2 }, numerator: 3, denominator: 2,
    candidate_grades: [{ candidate_id: "candidate-a", score: 1 },{ candidate_id: "candidate-b", score: 2 }], component_evidence_refs: {} } };
}
describe("source-bound independent reviews", () => {
  it("accepts fractional finals and rejects each binding/arithmetic mismatch", async () => {
    const { run,receipt } = await receiptFixture(); expect(await receiptProblem(receipt,run)).toBeNull();
    for (const patch of [{ source_sha256: "0".repeat(64) },{ execution_id: "wrong-id" },{ method: "wrong-method" },{ config: {} },{ rubric_version: "scoring.v2" },{ denominator: 3 },{ numerator: 4 },{ Srun_final: 0 },{ source_path: "/etc/passwd" }]) {
      expect(await receiptProblem({ ...receipt, ...patch },run)).not.toBeNull();
    }
  });
  it("keeps Human/AI separate and does not let unrelated newer receipts suppress a valid final", async () => {
    const { run,receipt } = await receiptFixture();
    await write("reviews/valid.ai-verified.json",receipt);
    await write("reviews/stale.ai-verified.json",{ ...receipt, source_sha256: "0".repeat(64), generated_at: "2026-10-13T00:00:00Z" });
    const bundle = await resolveReviews(run,[]); expect(bundle.ai.status).toBe("final"); expect(bundle.ai.components?.Smethod).toBe(2.5);
    expect(bundle.human.status).toBe("missing"); expect(bundle.history).toHaveLength(2); expect(bundle.ai.SrunFinal).toBe(2.3);
  });
  it("joins legacy pending status only through an explicitly selected source-bound index and ledger", async () => {
    const { run,receipt } = await receiptFixture(); const ledger = await write("external/ledger.decisions.json",[]);
    const status = await write("external/source.review-status.json",{ artifact_type: "thesis_review_status", source_sha256: run.sha256, config: receipt.config,
      method: "method-a", rubric_version: "scoring.v4", decision_ledger_path: ledger, workflows: { ai: { status: "pending", reason: "no_assessable_candidates", component_pending_reasons: { Spayload: "none" } } } });
    vi.stubEnv("TESIS_REVIEW_ROOTS",JSON.stringify({ current: path.join(root,"external") }));
    expect((await resolveReviews(run,[])).ai.status).toBe("missing");
    const index = await write("index.json",{ sources: [{ execution_id: run.executionId, source_sha256: run.sha256, review_status: status }] });
    vi.stubEnv("TESIS_REVIEW_INDEX_FILES",JSON.stringify([index]));
    const reviews = await resolveReviews(run,[]); expect(reviews.ai.status).toBe("pending"); expect(reviews.ai.SrunFinal).toBeNull(); expect(reviews.ai.componentPendingReasons).toEqual({ Spayload: "none" });
  });
});
