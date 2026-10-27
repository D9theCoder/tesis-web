import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/control/chat/route";

const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/control/chat", { method: "POST", headers: { host: "localhost:3000", origin, "content-type": "application/json" }, body: JSON.stringify(body) });
afterEach(() => { vi.unstubAllEnvs(); });

describe("chat control boundary", () => {
  it("rejects a different origin even when both hosts are loopback", async () => {
    const response = await POST(request({ action: "models" }, "http://localhost:3001"));
    expect(response.status).toBe(403);
  });
  it("honors the control kill switch", async () => {
    vi.stubEnv("TESIS_CONTROL_DISABLED", "1");
    expect((await POST(request({ action: "models" }))).status).toBe(403);
  });
  it("rejects requests that contain connection settings or invalid message history", async () => {
    expect((await POST(request({ action: "send", target: "model", effort: null, generateTitle: false, messages: [{ role: "user", content: "hello" }], baseUrl: "https://example.invalid" }))).status).toBe(400);
    expect((await POST(request({ action: "send", target: "model", effort: null, generateTitle: false, messages: [{ role: "assistant", content: "hello" }] }))).status).toBe(400);
  });
});
