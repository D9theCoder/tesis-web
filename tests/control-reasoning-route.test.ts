import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/control/config/reasoning/route";
import { runBridge } from "@/lib/server/control/bridge";

vi.mock("@/lib/server/control/bridge", () => ({ runBridge: vi.fn() }));
vi.mock("@/lib/server/control/config-store", () => ({ ensureProfile: vi.fn() }));

function request(body: Record<string, unknown>, host = "127.0.0.1:3000", origin = "http://127.0.0.1:3000") {
  return new Request("http://127.0.0.1:3000/api/control/config/reasoning", {
    method: "POST", headers: { host, origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(runBridge).mockReset().mockResolvedValue({ ok: true, targets: [], fallbackEfforts: [] });
  vi.stubEnv("TESIS_CONTROL_DISABLED", "");
  vi.stubEnv("TESIS_CONTROL_ALLOWED_HOSTS", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("reasoning route", () => {
  it("uses a fixed bridge command and validates request fields", async () => {
    const response = await POST(request({ action: "describe", yaml: "models: {}" }));
    expect(response.status).toBe(200);
    expect(runBridge).toHaveBeenCalledWith("reasoning", { action: "describe", yaml: "models: {}" }, 45_000);
    expect((await response.json()).ok).toBeUndefined();
    const invalid = await POST(request({ action: "execute", yaml: "models: {}", path: "/etc/passwd" }));
    expect(invalid.status).toBe(400);
    expect(runBridge).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["remote host", "remote.invalid", "http://remote.invalid", ""],
    ["foreign origin", "127.0.0.1:3000", "https://foreign.invalid", ""],
    ["kill switch", "127.0.0.1:3000", "http://127.0.0.1:3000", "1"],
  ])("rejects %s before invoking the bridge", async (_name, host, origin, disabled) => {
    vi.stubEnv("TESIS_CONTROL_DISABLED", disabled);
    const response = await POST(request({ action: "check", yaml: "models: {}", effort: "high", target: "gpt" }, host, origin));
    expect(response.status).toBe(403);
    expect(runBridge).not.toHaveBeenCalled();
  });
});
