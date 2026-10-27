// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addLibraryFile } from "@/lib/server/chat/library";
import { retrieveChatContext, retrieveDocumentation } from "@/lib/server/chat/retrieval";

const modelCache = process.env.TESIS_WEB_TEST_MODEL_CACHE;
let root = "";
afterEach(async () => { vi.unstubAllEnvs(); if (root) await fs.rm(root, { recursive: true, force: true }); });

describe.skipIf(!modelCache)("local multilingual model", () => {
  it("retrieves English sources for Indonesian questions without calling a provider", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "tesis-semantic-model-"));
    const web = path.join(root, "web"), runtime = path.join(root, "runtime"), state = path.join(root, "state");
    await fs.mkdir(web); await fs.mkdir(path.join(runtime, "docs", "reference"), { recursive: true }); await fs.mkdir(state);
    await fs.symlink(modelCache!, path.join(state, "chat-models"), "dir");
    vi.stubEnv("TESIS_WEB_STATE_DIR", state);
    await fs.writeFile(path.join(web, "README.md"), "The dashboard shows attack graph nodes, execution progress and security outcomes for a completed experiment.");
    await fs.writeFile(path.join(runtime, "README.md"), "The final thesis score is calculated from the scoring rubric and the validated evidence for each experiment.");
    await fs.writeFile(path.join(runtime, "docs", "reference", "providers.md"), "To select an AI provider and model, configure a model profile in Settings and save the selected model.");
    const uploaded = await addLibraryFile(new File(["When a target applies rate limiting, reduce the request rate and inspect the retry delay."], "rate-limits.txt"));
    const baseline = await retrieveDocumentation("Bagaimana skor akhir penelitian dihitung dari bukti?", web, runtime);
    expect(baseline.some((item) => item.source === "tesis/README.md")).toBe(false);
    for (const [question, expected] of [
      ["Bagaimana skor akhir penelitian dihitung dari bukti?", "tesis/README.md"],
      ["Bagaimana memilih penyedia dan model AI?", "tesis/docs/reference/providers.md"],
      ["Bagaimana cara mengurangi laju permintaan saat dibatasi?", `upload/rate-limits.txt [${uploaded.id}]`],
    ]) {
      const result = await retrieveChatContext(question, { webRoot: web, runtimeRoot: runtime });
      expect(result.mode).toBe("hybrid");
      expect(result.excerpts.slice(0, 2).map((item) => item.source)).toContain(expected);
    }
  }, 120_000);
});
