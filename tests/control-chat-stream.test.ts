// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock("@/lib/server/chat/retrieval", async (original) => ({ ...await original<typeof import("@/lib/server/chat/retrieval")>(), retrieveChatContext: mocked.retrieve }));
import { POST } from "@/app/api/control/chat/route";

let root: string;
let marker: string;
const requestBody = { action: "send", target: "fixture", expectedModel: "fixture-model", effort: null, generateTitle: false, messages: [{ role: "user", content: "question" }] };
function request(signal?: AbortSignal) {
  return new Request("http://localhost:3000/api/control/chat", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(requestBody), signal });
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tesis-chat-stream-"));
  marker = path.join(root, "spawned");
  const fake = path.join(root, "fake-interpreter");
  await fs.writeFile(fake, `#!/usr/bin/env python3\nimport json, os, pathlib, sys\ndata = json.load(sys.stdin)\npathlib.Path(os.environ["MOCK_CHAT_MARKER"]).write_text("yes")\nprint(json.dumps({"type": "text", "text": data["excerpts"][0]["text"]}))\nprint(json.dumps({"type": "done"}))\n`, { mode: 0o700 });
  vi.stubEnv("TESIS_ROOT", root); vi.stubEnv("TESIS_WEB_STATE_DIR", path.join(root, "state")); vi.stubEnv("TESIS_PYTHON", fake); vi.stubEnv("MOCK_CHAT_MARKER", marker); vi.stubEnv("TESIS_CONTROL_DISABLED", "0");
  mocked.retrieve.mockReset();
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });

describe("chat source stream", () => {
  it("reports retrieval mode and supplies the selected excerpts to the bridge", async () => {
    mocked.retrieve.mockResolvedValue({ mode: "hybrid", excerpts: [{ id: "S1", source: "upload/notes.md", line: 1, text: "reference text" }] });
    const response = await POST(request());
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events).toEqual([
      { type: "retrieval", text: "Preparing local document search…" },
      { type: "sources", mode: "hybrid", sources: [{ id: "S1", source: "upload/notes.md", line: 1 }] },
      { type: "text", text: "reference text" }, { type: "done" },
    ]);
  });
  it("does not start the bridge after the user stops a pending retrieval", async () => {
    let finish!: (value: { mode: "hybrid"; excerpts: [] }) => void;
    mocked.retrieve.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const abort = new AbortController();
    const response = await POST(request(abort.signal));
    const body = response.text();
    abort.abort(); finish({ mode: "hybrid", excerpts: [] });
    await body;
    await expect(fs.stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
