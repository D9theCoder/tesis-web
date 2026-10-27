// @vitest-environment node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachedRunChunks, recentRuns } from "@/lib/server/chat/runs";
import { clearCatalogCache } from "@/lib/server/resolve-run";
import { clearReviewCache } from "@/lib/server/reviews";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tesis-chat-runs-"));
  vi.stubEnv("TESIS_ROOT", root); vi.stubEnv("TESIS_ARTIFACT_ROOTS", JSON.stringify({ fixture: root }));
  for (const key of ["TESIS_REVIEW_ROOTS", "TESIS_REVIEW_INDEX_FILES", "TESIS_PROJECTION_FILES", "TESIS_COMPATIBILITY_FILES"]) vi.stubEnv(key, "");
  clearCatalogCache(); clearReviewCache();
});
afterEach(async () => { clearCatalogCache(); clearReviewCache(); vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });

describe("chat run attachments", () => {
  it("matches recorded dates, execution status, and security outcome before paginating", async () => {
    await Promise.all(Array.from({ length: 55 }, (_, index) => fs.writeFile(path.join(root, `run-${String(index).padStart(2, "0")}.json`), JSON.stringify({
      schema_version: "tui.v1", execution_id: `run-${String(index).padStart(2, "0")}`, status: index < 3 ? "success" : "failed",
      execution_status: index < 3 ? "completed" : "failed", security_outcome: index < 3 ? "no_finding" : "confirmed",
      created_at: index < 3 ? "2026-10-21T10:00:00Z" : "2026-10-20T10:00:00Z",
    }))));
    for (const query of ["failed", "2026-10-20", "confirmed"]) {
      const first = await recentRuns(0, query);
      expect(first.runs).toHaveLength(50);
      expect(first.nextCursor).toBe(50);
      expect(first.runs.every((run) => run.executionStatus === "failed" && run.startedAt?.startsWith("2026-10-20"))).toBe(true);
      const second = await recentRuns(first.nextCursor!, query);
      expect(second.runs).toHaveLength(2);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.runs, ...second.runs].map((run) => run.executionId)).size).toBe(52);
    }
    expect((await recentRuns(0, "COMPLETED")).runs).toHaveLength(3);
  });

  it("lists recent selectable runs and binds the chosen artifact to its hash and recorded outcome", async () => {
    const saved = { schema_version: "tui.v1", execution_id: "run-example", status: "failed", execution_status: "failed", security_outcome: "confirmed", selected_method: "sqli_union", model: "fixture-model", created_at: "2026-10-20T10:00:00Z", config: { api_key: "artifactsecretvalue", scoring_evaluator: { model: "private-scorer-model" } } };
    const source = JSON.stringify(saved); await fs.writeFile(path.join(root, "result.json"), source);
    const listing = await recentRuns();
    expect(listing.runs[0]).toMatchObject({ executionId: "run-example", sha256: createHash("sha256").update(source).digest("hex"), executionStatus: "failed", securityOutcome: "confirmed", model: "fixture-model" });
    const chosen = listing.runs[0];
    const chunks = await attachedRunChunks({ executionId: chosen.executionId, sha256: chosen.sha256! }, []);
    expect(chunks[0]).toMatchObject({ required: true });
    expect(chunks[0].text).toContain('"execution_status": "failed"');
    expect(chunks[0].text).toContain('"security_outcome": "confirmed"');
    expect(JSON.stringify(chunks)).not.toContain("artifactsecretvalue");
    expect(JSON.stringify(chunks)).not.toContain("private-scorer-model");
    await fs.writeFile(path.join(root, "result.json"), JSON.stringify({ ...saved, status: "changed" }));
    clearCatalogCache();
    await expect(attachedRunChunks({ executionId: chosen.executionId, sha256: chosen.sha256! }, [])).rejects.toMatchObject({ status: 409 });
  });

  it("does not offer or substitute an ambiguous execution identity", async () => {
    const first = JSON.stringify({ schema_version: "tui.v1", execution_id: "duplicate-run", status: "success" });
    await fs.mkdir(path.join(root, "a")); await fs.mkdir(path.join(root, "b"));
    await fs.writeFile(path.join(root, "a", "result.json"), first);
    await fs.writeFile(path.join(root, "b", "result.json"), JSON.stringify({ schema_version: "tui.v1", execution_id: "duplicate-run", status: "failed" }));
    expect((await recentRuns()).runs).toEqual([]);
    await expect(attachedRunChunks({ executionId: "duplicate-run", sha256: createHash("sha256").update(first).digest("hex") }, [])).rejects.toMatchObject({ status: 409 });
  });
});
