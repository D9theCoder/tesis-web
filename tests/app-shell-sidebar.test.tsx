import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import sidebarStyles from "@/components/app-shell.module.css";
import { resetSidebarPreference, SIDEBAR_STORAGE_KEY } from "@/lib/sidebar";
import { THEME_TRANSITION_CLASS } from "@/lib/theme";

vi.mock("next/navigation", () => ({ usePathname: () => "/results/execution-a" }));

function renderShell() {
  return render(<AppShell><h1>Execution</h1></AppShell>);
}

function shellElement(container: HTMLElement): HTMLElement {
  const shell = container.querySelector<HTMLElement>(".app-shell");
  if (!shell) throw new Error("AppShell did not render");
  return shell;
}

function pressActivationKey(control: HTMLElement, key: "Enter" | " ") {
  fireEvent.keyDown(control, { key });
  // Browsers turn Enter/Space on a native <button> into a click. jsdom stops
  // after the key event, so dispatch the click a browser would synthesize.
  fireEvent.click(control);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetSidebarPreference();
  document.documentElement.dataset.theme = "light";
  document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
  delete document.documentElement.dataset.themeIcon;
  document.body.style.overflow = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("collapsible desktop sidebar", () => {
  it("renders expanded with an action-named toggle and collapses on click", () => {
    const { container } = renderShell();
    const shell = shellElement(container);
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });

    expect(shell).not.toHaveClass(sidebarStyles.collapsed);
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("title", "Collapse sidebar");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");

    toggle.focus();
    fireEvent.click(toggle);

    expect(shell).toHaveClass(sidebarStyles.collapsed);
    expect(toggle).toHaveAttribute("aria-label", "Expand sidebar");
    expect(toggle).toHaveAccessibleName("Expand sidebar");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("collapsed");

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Live monitor" })).toHaveAttribute("title", "Live monitor");
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute("title", "Settings");
  });

  it("keeps keyboard activation and focus stable across both directions", () => {
    renderShell();
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });

    toggle.focus();
    pressActivationKey(toggle, "Enter");
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAccessibleName("Expand sidebar");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("collapsed");

    pressActivationKey(toggle, " ");
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAccessibleName("Collapse sidebar");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("expanded");
  });

  it("renders expanded on the server and restores a stored collapse after mount", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");

    const serverMarkup = renderToStaticMarkup(<AppShell><h1>Execution</h1></AppShell>);
    expect(serverMarkup).toContain("Collapse sidebar");
    expect(serverMarkup).not.toContain(sidebarStyles.collapsed);

    const { container } = renderShell();
    expect(shellElement(container)).toHaveClass(sidebarStyles.collapsed);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("keeps full labels in the mobile drawer while the desktop rail is collapsed", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    renderShell();

    const collapsedNav = screen.getByRole("navigation", { name: "Main navigation" });
    const collapsedLinks = within(collapsedNav).getAllByRole("link");
    expect(collapsedLinks.map(link => link.textContent)).toEqual([
      "Live monitor",
      "Overview",
      "Results",
      "Guide",
      "Settings",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = screen.getByRole("dialog", { name: "TESIS navigation" });
    const drawerNav = within(dialog).getByRole("navigation", { name: "Main navigation" });
    expect(within(drawerNav).getByRole("link", { name: "Live monitor" })).toHaveTextContent("Live monitor");
    expect(within(drawerNav).getByRole("link", { name: "Settings" })).toHaveTextContent("Settings");
    expect(within(drawerNav).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(within(drawerNav).getByRole("link", { name: "Settings" })).not.toHaveAttribute("title");
  });

  it("still toggles and remembers the in-memory fallback when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    const { container } = renderShell();
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });

    expect(() => fireEvent.click(toggle)).not.toThrow();
    expect(shellElement(container)).toHaveClass(sidebarStyles.collapsed);
    expect(toggle).toHaveAccessibleName("Expand sidebar");

    cleanup();
    const remounted = renderShell();
    expect(shellElement(remounted.container)).toHaveClass(sidebarStyles.collapsed);
  });

  it("follows a preference change written by another tab", () => {
    const { container } = renderShell();
    const shell = shellElement(container);

    act(() => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
      window.dispatchEvent(new StorageEvent("storage", {
        key: SIDEBAR_STORAGE_KEY,
        newValue: "collapsed",
      }));
    });

    expect(shell).toHaveClass(sidebarStyles.collapsed);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();

    act(() => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, "expanded");
      window.dispatchEvent(new StorageEvent("storage", {
        key: SIDEBAR_STORAGE_KEY,
        newValue: "expanded",
      }));
    });

    expect(shell).not.toHaveClass(sidebarStyles.collapsed);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});
