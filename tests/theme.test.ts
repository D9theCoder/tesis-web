import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_KEY } from "@/lib/theme";

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });
describe("theme before hydration", () => {
  it("initializes a saved dark theme and prefers the versioned preference", () => {
    localStorage.setItem("tesis-theme", "light");
    localStorage.setItem(THEME_KEY, "dark");
    window.eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("accepts the legacy preference and defaults safely when storage is blocked", () => {
    localStorage.setItem("tesis-theme", "dark");
    window.eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.dataset.theme).toBe("dark");
    const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked storage"); });
    window.eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.dataset.theme).toBe("light");
    blocked.mockRestore();
  });
});
