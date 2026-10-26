import { beforeEach, describe, expect, it, vi } from "vitest";

/** Re-imported per test: the memo lives in module scope. */
let loadControlSchema: typeof import("@/lib/server/control/schema").loadControlSchema;

/**
 * The schema comes from a bridge subprocess, and both the Control and Settings
 * pages need it. One read must serve both until a document it derives from
 * changes, so the pages never pay for the interpreter twice.
 */

const readSchema = vi.fn();
const stat = vi.fn();

vi.mock("node:fs/promises", () => {
  const statMock = (...args: unknown[]) => stat(...args);
  return { stat: statMock, default: { stat: statMock } };
});
vi.mock("@/lib/server/control/config-store", () => ({
  readSchema: () => readSchema(),
  ensureProfile: async () => "/tmp/profile/config.yaml",
}));
vi.mock("@/lib/server/control/guard", () => ({
  controlAvailability: () => ({ enabled: true, reason: null }),
}));
vi.mock("@/lib/server/control/jobs", () => ({ activeRun: async () => null }));
vi.mock("@/lib/server/control/paths", () => ({
  profileConfigPath: () => "/tmp/profile/config.yaml",
  profileEnvPath: () => "/tmp/profile/.env",
  sourceConfigPath: () => "/tmp/tesis/config.yaml",
}));

const payload = {
  ok: true,
  providers: [],
  scoring: {},
  llmRuntime: {},
  guardrails: {},
  target: {},
  configPath: "/tmp/profile/config.yaml",
  sourceConfigPath: "/tmp/tesis/config.yaml",
  profileExists: true,
  yaml: "target_url: http://127.0.0.1/dvwa\n",
  preservedSecretCount: 0,
  fields: [],
  forms: {},
  categories: [],
  modelProfiles: [],
  resolved: null,
  resolvedError: null,
  fieldErrors: {},
  warnings: [],
};

beforeEach(async () => {
  readSchema.mockReset();
  stat.mockReset();
  readSchema.mockResolvedValue(payload);
  stat.mockResolvedValue({ mtimeMs: 1, size: 10 });
  vi.resetModules();
  ({ loadControlSchema } = await import("@/lib/server/control/schema"));
});

describe("loadControlSchema", () => {
  it("runs the bridge once for concurrent readers", async () => {
    const [first, second] = await Promise.all([loadControlSchema(), loadControlSchema()]);

    expect(first.configPath).toBe("/tmp/profile/config.yaml");
    expect(second.configPath).toBe("/tmp/profile/config.yaml");
    expect(readSchema).toHaveBeenCalledTimes(1);
  });

  it("keeps serving the memoised payload while the documents are unchanged", async () => {
    await loadControlSchema();
    await loadControlSchema();

    expect(readSchema).toHaveBeenCalledTimes(1);
  });

  it("rebuilds after a document changes, so a save is never served stale", async () => {
    await loadControlSchema();
    stat.mockResolvedValue({ mtimeMs: 2, size: 10 });

    await loadControlSchema();

    expect(readSchema).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed read instead of caching the failure", async () => {
    readSchema.mockRejectedValueOnce(new Error("Python interpreter not found"));
    await expect(loadControlSchema()).rejects.toThrow("Python interpreter not found");

    await expect(loadControlSchema()).resolves.toMatchObject({ configPath: "/tmp/profile/config.yaml" });
    expect(readSchema).toHaveBeenCalledTimes(2);
  });
});
