import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsPanel } from "@/components/settings/settings-panel";
import {
  cancelHackerCinema,
  getHackerCinema,
  hasActiveHackerCinema,
} from "@/lib/hacker-cinema";
import {
  advanceCheatBuffer,
  CHEAT_CODE_KEY,
  CHEAT_CODE_PHRASE,
  CHEAT_EXIT_KEY,
  HACKER_RETURN_THEME_KEY,
  readCheatCodeEnabled,
  readCheatExitEnabled,
  resetHackerSessionFlags,
} from "@/lib/hacker-settings";
import { resetThemeSessionStateForTests, setTheme } from "@/lib/use-theme";
import { useCheatCodeListener, useCheatCodeToggle, useCheatExitToggle } from "@/lib/use-hacker";

function typePhrase() {
  for (const key of CHEAT_CODE_PHRASE.split("")) {
    fireEvent.keyDown(document.body, { key });
  }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetHackerSessionFlags();
  resetThemeSessionStateForTests();
  cancelHackerCinema();
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  cancelHackerCinema();
  resetThemeSessionStateForTests();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.dataset.theme = "light";
});

describe("cheat phrase helpers", () => {
  it("keeps a rolling buffer capped at the phrase length", () => {
    let buffer = "";
    for (const key of "no cheatvcheatstick") {
      buffer = advanceCheatBuffer(buffer, key);
    }
    expect(buffer).toBe(CHEAT_CODE_PHRASE);
  });

  it("accumulates lowercase keys regardless of typed case", () => {
    let buffer = "";
    for (const key of "CHEATSTICK") {
      buffer = advanceCheatBuffer(buffer, key.toLowerCase());
    }
    expect(buffer).toBe(CHEAT_CODE_PHRASE);
  });

  it("defaults the switches on and persists an off choice", () => {
    expect(readCheatCodeEnabled()).toBe(true);
    expect(readCheatExitEnabled()).toBe(true);
    persistCheatOff();
    expect(readCheatCodeEnabled()).toBe(false);
    expect(localStorage.getItem(CHEAT_CODE_KEY)).toBe("off");

    persistExitOff();
    expect(readCheatExitEnabled()).toBe(false);
    expect(localStorage.getItem(CHEAT_EXIT_KEY)).toBe("off");
  });
});

function persistCheatOff() {
  const view = renderHook(() => useCheatCodeToggle());
  act(() => {
    view.result.current[1](false);
  });
  view.unmount();
}

function persistExitOff() {
  const view = renderHook(() => useCheatExitToggle());
  act(() => {
    view.result.current[1](false);
  });
  view.unmount();
}

describe("cheat code listener", () => {
  it("selects hacker with the splash when the phrase completes", () => {
    renderHook(() => useCheatCodeListener());

    typePhrase();

    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(hasActiveHackerCinema()).toBe(true);
  });

  it("never counts keys typed into fields or with modifiers", () => {
    renderHook(() => useCheatCodeListener());
    const input = document.createElement("input");
    document.body.append(input);
    try {
      input.focus();
      for (const key of CHEAT_CODE_PHRASE.split("")) {
        fireEvent.keyDown(input, { key });
      }
      expect(document.documentElement.dataset.theme).toBe("light");

      for (const key of CHEAT_CODE_PHRASE.split("")) {
        fireEvent.keyDown(document.body, { key, ctrlKey: true });
      }
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(hasActiveHackerCinema()).toBe(false);
    } finally {
      input.remove();
    }
  });

  it("stays inert while the phrase switch is off", () => {
    persistCheatOff();
    renderHook(() => useCheatCodeListener());

    typePhrase();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(hasActiveHackerCinema()).toBe(false);
  });

  it("returns to the fallback theme when hacker had no remembered predecessor", () => {
    // Hacker active with no remembered predecessor: the exit falls back to
    // light, and the power-down carries the exit like any hacker leave.
    document.documentElement.dataset.theme = "hacker";
    renderHook(() => useCheatCodeListener());

    typePhrase();

    expect(getHackerCinema()?.kind).toBe("power-down");
    expect(getHackerCinema()?.target).toBe("light");
    // The hacker palette stays painted until the fully black frame.
    expect(document.documentElement.dataset.theme).toBe("hacker");
  });

  it("remembers the pre-hacker theme on every hacker selection", () => {
    setTheme("dark", true);
    act(() => { cancelHackerCinema(); });
    setTheme("hacker", true);
    expect(localStorage.getItem(HACKER_RETURN_THEME_KEY)).toBe("dark");

    act(() => { cancelHackerCinema(); });
    document.documentElement.dataset.theme = "light";
    resetThemeSessionStateForTests();
    setTheme("hacker", true);
    expect(localStorage.getItem(HACKER_RETURN_THEME_KEY)).toBe("light");
  });

  it("returns to the remembered theme, power-down included, when typed in hacker", () => {
    setTheme("dark", true);
    act(() => { cancelHackerCinema(); });
    setTheme("hacker", true);
    act(() => { cancelHackerCinema(); });

    renderHook(() => useCheatCodeListener());
    typePhrase();

    // The exit arms the CRT power-down toward the remembered theme; the hacker
    // palette stays painted until that run reaches its fully black frame.
    expect(getHackerCinema()?.kind).toBe("power-down");
    expect(getHackerCinema()?.target).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("hacker");
  });

  it("keeps the exit path off when the sub-setting is off", () => {
    setTheme("dark", true);
    act(() => { cancelHackerCinema(); });
    setTheme("hacker", true);
    act(() => { cancelHackerCinema(); });
    persistExitOff();

    renderHook(() => useCheatCodeListener());
    typePhrase();

    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(hasActiveHackerCinema()).toBe(false);
  });

  it("counts the phrase over themed radios without racing radiogroup typeahead", () => {
    const radio = document.createElement("input");
    radio.type = "radio";
    document.body.append(radio);
    try {
      renderHook(() => useCheatCodeListener());
      // The first counted key preventDefaults, so radiogroup typeahead stays quiet.
      const typeaheadSuppressed = fireEvent.keyDown(radio, { key: "c", cancelable: true });
      expect(typeaheadSuppressed).toBe(false);
      for (const key of CHEAT_CODE_PHRASE.split("").slice(1)) {
        fireEvent.keyDown(radio, { key });
      }
      expect(document.documentElement.dataset.theme).toBe("hacker");
    } finally {
      radio.remove();
    }
  });
});

describe("cheat code switch in Settings", () => {
  it("offers both switches, flips state, and persists it", () => {
    render(<SettingsPanel />);

    const switchControl = screen.getByRole("switch", { name: /^“cheatstick” code/ });
    expect(switchControl).toHaveAttribute("aria-checked", "true");
    expect(switchControl).toHaveTextContent(`“${CHEAT_CODE_PHRASE}” code`);

    const exitSwitch = screen.getByRole("switch", { name: /Return with the code/ });
    expect(exitSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(switchControl);
    expect(screen.getByRole("switch", { name: /^“cheatstick” code/ })).toHaveAttribute("aria-checked", "false");
    expect(localStorage.getItem(CHEAT_CODE_KEY)).toBe("off");
    // The exit sub-setting disables together with its parent.
    expect(exitSwitch).toBeDisabled();
    expect(exitSwitch).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem(CHEAT_EXIT_KEY)).toBeNull();

    // Turning the phrase back on re-enables the sub-setting, which then
    // persists its own choice.
    fireEvent.click(screen.getByRole("switch", { name: /^“cheatstick” code/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Return with the code/ }));
    expect(exitSwitch).toHaveAttribute("aria-checked", "false");
    expect(localStorage.getItem(CHEAT_EXIT_KEY)).toBe("off");
  });
});
