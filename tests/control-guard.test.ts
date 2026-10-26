import { describe, expect, it } from "vitest";

import { assertControlAllowed, isLocalHost } from "@/lib/server/control/guard";
import { ControlError } from "@/lib/server/control/errors";

/** Minimal request stub: the guard only reads the URL and two headers. */
function request(url: string, headers: Record<string, string> = {}): Request {
  return { url, headers: new Headers(headers) } as unknown as Request;
}

describe("isLocalHost", () => {
  it("accepts loopback names", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "0.0.0.0"]) {
      expect(isLocalHost(host)).toBe(true);
    }
  });

  it("rejects remote names and missing hosts", () => {
    expect(isLocalHost("192.168.1.20")).toBe(false);
    expect(isLocalHost(null)).toBe(false);
  });
});

describe("assertControlAllowed", () => {
  const originalEnv = { ...process.env };

  function restore() {
    process.env = { ...originalEnv };
  }

  it("allows a loopback Host header", () => {
    process.env.TESIS_CONTROL_ALLOWED_HOSTS = "";
    process.env.TESIS_CONTROL_DISABLED = "";
    expect(() => assertControlAllowed(request("http://127.0.0.1:3000/api/control/runs", { host: "127.0.0.1:3000" }))).not.toThrow();
    restore();
  });

  it("rejects a remote Host even when the URL is local", () => {
    process.env.TESIS_CONTROL_ALLOWED_HOSTS = "";
    process.env.TESIS_CONTROL_DISABLED = "";
    expect(() => assertControlAllowed(request("http://127.0.0.1:3000/api/control/runs", { host: "evil.example" }))).toThrow(
      ControlError,
    );
    restore();
  });

  it("allows an explicitly allowlisted host", () => {
    process.env.TESIS_CONTROL_ALLOWED_HOSTS = "workstation.lan";
    process.env.TESIS_CONTROL_DISABLED = "";
    expect(() =>
      assertControlAllowed(request("http://workstation.lan:3000/api/control/runs", { host: "workstation.lan:3000" })),
    ).not.toThrow();
    restore();
  });

  it("rejects cross-origin browser requests", () => {
    process.env.TESIS_CONTROL_ALLOWED_HOSTS = "";
    process.env.TESIS_CONTROL_DISABLED = "";
    expect(() =>
      assertControlAllowed(
        request("http://127.0.0.1:3000/api/control/runs", {
          host: "127.0.0.1:3000",
          origin: "https://evil.example",
        }),
      ),
    ).toThrow(ControlError);
    restore();
  });

  it("accepts a same-origin request", () => {
    process.env.TESIS_CONTROL_ALLOWED_HOSTS = "";
    process.env.TESIS_CONTROL_DISABLED = "";
    expect(() =>
      assertControlAllowed(
        request("http://127.0.0.1:3000/api/control/runs", {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
        }),
      ),
    ).not.toThrow();
    restore();
  });

  it("honours the disable switch", () => {
    process.env.TESIS_CONTROL_DISABLED = "1";
    expect(() =>
      assertControlAllowed(request("http://127.0.0.1:3000/api/control/runs", { host: "127.0.0.1:3000" })),
    ).toThrow(/disabled/i);
    restore();
  });
});
