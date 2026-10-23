import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  persistTheme,
  THEME_INIT_SCRIPT,
  THEME_KEY,
  THEME_SWAP_MS,
  THEME_TRANSITION_CLASS,
  THEME_TRANSITION_MS,
} from "@/lib/theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
  delete document.documentElement.dataset.themeIcon;
  document.querySelectorAll(".theme-canvas-fade").forEach(element => element.remove());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
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
  it("follows the system preference on a first visit and never auto-selects hacker", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    window.eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("restores a stored hacker theme over the system preference", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    localStorage.setItem(THEME_KEY, "hacker");
    window.eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.dataset.theme).toBe("hacker");
  });
  it("ignores an unrecognized stored value and follows the system preference", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    localStorage.setItem(THEME_KEY, "midnight");
    window.eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("theme switching", () => {
  it("persists the versioned preference", () => {
    persistTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });
  it("cross-dissolves the workspace and swaps the theme at the midpoint", () => {
    vi.useFakeTimers();
    applyTheme("dark", true);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeIcon).toBe("dark");
    expect(document.documentElement).toHaveClass(THEME_TRANSITION_CLASS);
    expect(document.querySelector(".theme-canvas-fade")).toBeInTheDocument();

    vi.advanceTimersByTime(THEME_SWAP_MS);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement).toHaveClass(THEME_TRANSITION_CLASS);

    vi.advanceTimersByTime(THEME_TRANSITION_MS - THEME_SWAP_MS + 100);
    expect(document.documentElement).not.toHaveClass(THEME_TRANSITION_CLASS);
    expect(document.documentElement.dataset.themeIcon).toBeUndefined();
    expect(document.querySelector(".theme-canvas-fade")).toBeNull();
  });
  it("skips the cross-dissolve when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    applyTheme("dark", true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement).not.toHaveClass(THEME_TRANSITION_CLASS);
    expect(document.querySelector(".theme-canvas-fade")).toBeNull();
  });
  it("replaces an in-flight dissolve when another mode is chosen", () => {
    vi.useFakeTimers();
    applyTheme("dark", true);
    applyTheme("hacker", true);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeIcon).toBe("hacker");
    vi.advanceTimersByTime(THEME_SWAP_MS);
    expect(document.documentElement.dataset.theme).toBe("hacker");
  });
  it("applies hacker instantly and persists it", () => {
    applyTheme("hacker");
    persistTheme("hacker");
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(localStorage.getItem(THEME_KEY)).toBe("hacker");
  });
});
