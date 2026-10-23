import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { THEME_SWAP_MS, THEME_TRANSITION_CLASS, THEME_TRANSITION_MS } from "@/lib/theme";

vi.mock("next/navigation", () => ({ usePathname: () => "/results/execution-a" }));
beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new Event("storage"));
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
    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
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
    vi.advanceTimersByTime(THEME_TRANSITION_MS);
    expect(document.documentElement).not.toHaveClass(THEME_TRANSITION_CLASS);
  });
  it("opens mobile navigation, closes with Escape, and restores focus", () => {
    render(<AppShell><h1>Execution</h1></AppShell>);
    const opener = screen.getByRole("button", { name: "Open navigation" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "TESIS navigation" })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
