import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "@/components/settings/settings-panel";
import {
  THEME_KEY,
  THEME_SWAP_MS,
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

  it("selects hacker directly, applies it, persists it, and keeps focus on the radio", () => {
    vi.useFakeTimers();
    render(<SettingsPanel />);

    const hacker = screen.getByRole("radio", { name: "Hacker" });
    fireEvent.click(hacker);

    expect(hacker).toBeChecked();
    expect(hacker).toHaveFocus();
    expect(localStorage.getItem(THEME_KEY)).toBe("hacker");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeIcon).toBe("hacker");
    expect(document.documentElement).toHaveClass(THEME_TRANSITION_CLASS);
    expect(screen.getByRole("group", { name: "Theme: hacker" })).toBeInTheDocument();
    expect(hacker).toHaveFocus();

    act(() => {
      vi.advanceTimersByTime(THEME_SWAP_MS);
    });
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(document.documentElement).toHaveClass(THEME_TRANSITION_CLASS);
    expect(hacker).toHaveFocus();

    act(() => {
      vi.advanceTimersByTime(THEME_TRANSITION_MS + 100);
    });
    expect(document.documentElement).not.toHaveClass(THEME_TRANSITION_CLASS);
    expect(document.querySelector(".theme-canvas-fade")).toBeNull();
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

    const firstRender = render(<SettingsPanel />);
    const hacker = screen.getByRole("radio", { name: "Hacker" });
    fireEvent.click(hacker);
    expect(hacker).toHaveFocus();

    act(() => {
      vi.advanceTimersByTime(THEME_SWAP_MS);
    });
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();

    firstRender.unmount();
    render(<SettingsPanel />);
    expect(screen.getByRole("radio", { name: "Hacker" })).toBeChecked();
    expect(screen.getByRole("group", { name: "Theme: hacker" })).toBeInTheDocument();
  });
});
