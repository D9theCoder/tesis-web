import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { THEME_SWAP_MS, THEME_TRANSITION_CLASS, THEME_TRANSITION_MS } from "@/lib/theme";
import { setTheme } from "@/lib/use-theme";

vi.mock("next/navigation", () => ({ usePathname: () => "/results/execution-a" }));
vi.mock("@/components/hacker/hacker-chrome", () => ({ HackerChrome: () => null }));
beforeEach(() => {
  setTheme("light", false);
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
  delete document.documentElement.dataset.themeIcon;
  document.querySelectorAll(".theme-canvas-fade").forEach(element => element.remove());
});
afterEach(() => { vi.useRealTimers(); });
describe("observer application shell", () => {
  it("marks results active independently of live runtime status and changes theme", () => {
    render(<AppShell><h1>Execution</h1></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Results" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Live monitor" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    const toggle = screen.getByRole("button", { name: "Theme: light. Switch to dark." });
    expect(toggle.querySelector(".theme-icon-sun")).toBeInTheDocument();
    expect(toggle.querySelector(".theme-icon-moon")).toBeInTheDocument();
    vi.useFakeTimers();
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeIcon).toBe("dark");
    expect(document.documentElement).toHaveClass(THEME_TRANSITION_CLASS);
    expect(localStorage.getItem("tesis-theme:v1")).toBe("dark");
    vi.advanceTimersByTime(THEME_SWAP_MS);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Theme: dark. Switch to light." })).toBeInTheDocument();
    vi.advanceTimersByTime(THEME_TRANSITION_MS);
    expect(document.documentElement).not.toHaveClass(THEME_TRANSITION_CLASS);
  });
  it("removes the header theme control and read-only chrome in hacker mode", () => {
    setTheme("hacker", false);
    render(<AppShell><h1>Execution</h1></AppShell>);
    expect(screen.queryByRole("button", { name: /^Theme:/ })).toBeNull();
    expect(screen.queryByText("Read-only")).toBeNull();
    expect(screen.queryByText("Read-only observer")).toBeNull();
  });
  it("opens mobile navigation, closes with Escape, and restores focus", () => {    render(<AppShell><h1>Execution</h1></AppShell>);
    const opener = screen.getByRole("button", { name: "Open navigation" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "TESIS navigation" })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
