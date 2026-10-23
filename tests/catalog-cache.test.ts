// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCatalogCache, getCatalog, resolveRun } from "@/lib/server/resolve-run";
import { clearReviewCache } from "@/lib/server/reviews";
import { resultBundle } from "@/lib/server/result-bundle";

let root: string;
const primary = (id: string) => ({ schema_version: "tui.v1", execution_id: id, run_id: "shared-run-id", status: "success", selected_method: "method-a", config: {} });
async function write(name: string, value: unknown) {
  const file = path.join(root, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}
const ids = async () => [...(await getCatalog()).runs.keys()].sort();

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tesis-web-catalog-cache-"));
  vi.stubEnv("TESIS_ROOT", root);
  vi.stubEnv("TESIS_ARTIFACT_ROOTS", JSON.stringify({ test: root }));
  vi.stubEnv("TESIS_REVIEW_ROOTS", "");
  vi.stubEnv("TESIS_COMPATIBILITY_FILES", "");
  vi.stubEnv("TESIS_REVIEW_INDEX_FILES", "");
  vi.stubEnv("TESIS_PROJECTION_FILES", "");
  clearCatalogCache();
  clearReviewCache();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  clearCatalogCache();
  clearReviewCache();
  await fs.rm(root, { recursive: true, force: true });
});

describe("catalog snapshots", () => {
  it("reuses a fresh snapshot but lets an explicit refresh observe new sources", async () => {
    await write("one.json", primary("first"));
    expect(await ids()).toEqual(["first"]);

    await write("two.json", primary("second"));
    expect(await ids()).toEqual(["first"]);

    expect([...(await getCatalog({ fresh: true })).runs.keys()].sort()).toEqual(["first", "second"]);
  });

  it("serves the last snapshot while a stale scan runs, then replaces it", async () => {
    await write("one.json", primary("first"));
    await getCatalog();
    await write("two.json", primary("second"));
    await new Promise(resolve => setTimeout(resolve, 2050));

    const stale = await getCatalog();
    expect([...stale.runs.keys()]).toEqual(["first"]);
    await expect.poll(ids, { timeout: 5000 }).toEqual(["first", "second"]);
  }, 15000);

  it("refuses a snapshot whose source changed, then recovers on refresh", async () => {
    await write("one.json", primary("first"));
    const run = await resolveRun("first");
    expect(run).not.toBeNull();

    await write("one.json", { ...primary("first"), status: "error", changed: "different-bytes" });
    await expect(resultBundle(run!)).rejects.toMatchObject({ status: 409 });

    const refreshed = await resolveRun("first");
    expect(refreshed?.sha256).not.toBe(run!.sha256);
    const bundle = await resultBundle(refreshed!) as { source: { sha256: string } };
    expect(bundle.source.sha256).toBe(refreshed!.sha256);
  }, 15000);
});
