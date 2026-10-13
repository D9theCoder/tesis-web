import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/results/execution-a" }));
beforeEach(() => { localStorage.clear(); window.dispatchEvent(new Event("storage")); delete document.documentElement.dataset.theme; });
describe("observer application shell", () => {
  it("marks results active independently of live runtime status and changes theme", () => {
    render(<AppShell><h1>Execution</h1></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Results" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Live monitor" })).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("tesis-theme:v1")).toBe("dark");
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
