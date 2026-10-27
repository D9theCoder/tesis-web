// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/control/chat/knowledge/route";

let root: string;
const headers = { host: "localhost:3000", origin: "http://localhost:3000" };
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tesis-chat-upload-route-"));
  vi.stubEnv("TESIS_ROOT", root); vi.stubEnv("TESIS_WEB_STATE_DIR", path.join(root, "state"));
  vi.stubEnv("TESIS_CONTROL_DISABLED", "0"); vi.stubEnv("EXAMPLE_API_KEY", "local-secret-value");
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });

describe("shared document control routes", () => {
  it("uploads, lists, and removes a file without exposing its text", async () => {
    const form = new FormData(); form.set("file", new File(["hello local-secret-value"], "notes.txt"));
    const response = await POST(new Request("http://localhost:3000/api/control/chat/knowledge", { method: "POST", headers, body: form }));
    expect(response.status).toBe(200);
    const { file } = await response.json();
    expect(file.name).toBe("notes.txt");
    const listed = await GET(new Request("http://localhost:3000/api/control/chat/knowledge", { headers }));
    expect(await listed.text()).not.toContain("local-secret-value");
    const removed = await DELETE(new Request("http://localhost:3000/api/control/chat/knowledge", { method: "DELETE", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ id: file.id }) }));
    expect(removed.status).toBe(200);
    expect((await (await GET(new Request("http://localhost:3000/api/control/chat/knowledge", { headers }))).json()).files).toEqual([]);
  });
  it("rejects cross-origin uploads and disabled control", async () => {
    const cross = await POST(new Request("http://localhost:3000/api/control/chat/knowledge", { method: "POST", headers: { ...headers, origin: "http://localhost:3001" } }));
    expect(cross.status).toBe(403);
    vi.stubEnv("TESIS_CONTROL_DISABLED", "1");
    expect((await GET(new Request("http://localhost:3000/api/control/chat/knowledge", { headers }))).status).toBe(403);
  });
});
