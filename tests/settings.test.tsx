import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HackerCinema } from "@/components/hacker/hacker-cinema";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { hasActiveHackerCinema, cancelHackerCinema } from "@/lib/hacker-cinema";
import {
  THEME_KEY,
  THEME_TRANSITION_CLASS,
  THEME_TRANSITION_MS,
} from "@/lib/theme";
import { setTheme } from "@/lib/use-theme";

function clearThemeArtifacts() {
  document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
  delete document.documentElement.dataset.themeIcon;
  document.documentElement.style.removeProperty("--theme-old-surface");
  document.querySelectorAll(".theme-canvas-fade").forEach(element => element.remove());
}

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  clearThemeArtifacts();
  document.documentElement.dataset.theme = "light";
  setTheme("light", false);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  // No run may outlive a test: the module store is global.
  cancelHackerCinema();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  clearThemeArtifacts();
  document.documentElement.dataset.theme = "light";
});

describe("settings appearance", () => {
  it("names the radio group with the current theme and offers all three modes", () => {
    render(<SettingsPanel />);

    const group = screen.getByRole("group", { name: "Theme: light" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group).toHaveAttribute("aria-label", "Theme: light");

    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: "Light" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Dark" })).not.toBeChecked();
    expect(within(group).getByRole("radio", { name: "Hacker" })).not.toBeChecked();
    expect(within(group).queryAllByRole("button")).toHaveLength(0);

    expect(within(group).getByRole("radio", { name: "Hacker" })).toHaveAccessibleDescription(
      "Terminal palette with rain and scanlines.",
    );
  });

  it("selects hacker behind the splash overlay, applies it at once, and keeps focus", () => {
    vi.useFakeTimers();
    render(
      <>
        <SettingsPanel />
        <HackerCinema />
      </>,
    );

    const hacker = screen.getByRole("radio", { name: "Hacker" });
    fireEvent.click(hacker);

    // Selecting hacker arms the session splash: the palette is applied
    // immediately and hides underneath the opaque overlay until it dissolves.
    expect(hacker).toBeChecked();
    expect(hacker).toHaveFocus();
    expect(localStorage.getItem(THEME_KEY)).toBe("hacker");
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(document.documentElement).not.toHaveClass(THEME_TRANSITION_CLASS);
    expect(document.documentElement.dataset.themeIcon).toBeUndefined();
    expect(hasActiveHackerCinema()).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Hacker mode enabled.");
    expect(screen.getByRole("group", { name: "Theme: hacker" })).toBeInTheDocument();
    expect(hacker).toHaveFocus();

    // The run ends on its own; the palette was never partially applied.
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(hasActiveHackerCinema()).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(hacker).toHaveFocus();
    expect(hacker).toBeChecked();
  });

  it("switches directly between modes, updating the group name", () => {
    vi.useFakeTimers();
    render(<SettingsPanel />);

    const dark = screen.getByRole("radio", { name: "Dark" });
    fireEvent.click(dark);
    expect(dark).toBeChecked();
    expect(dark).toHaveFocus();
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(screen.getByRole("group", { name: "Theme: dark" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(THEME_TRANSITION_MS + 100);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");

    const light = screen.getByRole("radio", { name: "Light" });
    fireEvent.click(light);
    expect(light).toBeChecked();
    expect(light).toHaveFocus();
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(screen.getByRole("group", { name: "Theme: light" })).toBeInTheDocument();
  });

  it("keeps the selection for the session when storage is blocked", () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    render(<SettingsPanel />);
    const hacker = screen.getByRole("radio", { name: "Hacker" });
    fireEvent.click(hacker);
    expect(hacker).toHaveFocus();

    // The session splash arms even without storage; the theme still applies
    // at once underneath the overlay.
    expect(hasActiveHackerCinema()).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
});
