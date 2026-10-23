"use client";

import { useSyncExternalStore } from "react";
import {
  cancelHackerCinema,
  cinemaBlockedByVisibility,
  getHackerCinema,
  planHackerCinema,
  startHackerPowerDown,
  startHackerSplash,
} from "@/lib/hacker-cinema";
import { persistHackerReturnTheme } from "@/lib/hacker-settings";
import {
  applyTheme,
  isTheme,
  LEGACY_THEME_KEY,
  persistTheme,
  preferredTheme,
  readStoredTheme,
  THEME_KEY,
  type Theme,
} from "@/lib/theme";

let sessionTheme: Theme | null = null;
const listeners = new Set<() => void>();
let storageBound = false;

function resolveTheme(): Theme {
  if (sessionTheme) return sessionTheme;
  if (typeof document !== "undefined") {
    const applied = document.documentElement.dataset.theme;
    if (isTheme(applied)) return applied;
  }
  return readStoredTheme() ?? preferredTheme();
}

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== THEME_KEY && event.key !== LEGACY_THEME_KEY) return;
  // An external change is not a selection in this tab: it must never start a
  // cinematic, and a running one ends immediately so the restored theme shows.
  cancelHackerCinema();
  sessionTheme = null;
  // Resolve from storage rather than the DOM: the DOM still holds this tab's
  // previous theme until the external change is applied.
  const next = readStoredTheme() ?? preferredTheme();
  applyTheme(next);
  emit();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (!storageBound && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    storageBound = true;
  }
  return () => {
    listeners.delete(callback);
  };
}

/** Clears the module-side session theme (nothing persisted). Test hook. */
export function resetThemeSessionStateForTests() {
  sessionTheme = null;
}

function getSnapshot(): Theme {
  return resolveTheme();
}

function getServerSnapshot(): Theme {
  return "light";
}

/** The only shared theme subscription; both the header control and Settings use it. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Applies and retains a theme for every subscriber. The in-memory value keeps
 * the control working when localStorage is blocked, including across client
 * navigations inside the same session.
 *
 * Hacker selection and hacker exit are wrapped by the session cinematics
 * (splashes and the CRT power-down, see DESIGN.md): the overlay owns when the
 * theme is actually painted, and a change arriving mid-run cancels it.
 */
export function setTheme(theme: Theme, animate = true) {
  const active = getHackerCinema();
  if (active && active.target !== theme) {
    // A run keeps going only while the selection still matches its target;
    // any other theme (back to hacker included) is a new intent that
    // supersedes the run immediately, like any theme change mid-animation.
    cancelHackerCinema();
  }
  const previous = resolveTheme();
  if (previous !== "hacker" && theme === "hacker") {
    // Remember the theme in effect before hacker, so the cheat code can return
    // to it later; only a real light/dark value is ever remembered.
    if (previous === "light" || previous === "dark") persistHackerReturnTheme(previous);
  }
  const cinematic =
    animate && previous !== theme && !cinemaBlockedByVisibility()
      ? planHackerCinema(previous, theme)
      : null;

  if (cinematic === "splash") {
    sessionTheme = theme;
    persistTheme(theme);
    // Instant swap, hidden underneath the opaque splash; the hacker chrome
    // (rain, status bar) mounts now and is revealed by the final dissolve.
    applyTheme(theme, false);
    emit();
    startHackerSplash();
    return;
  }

  if (cinematic === "power-down") {
    if (getHackerCinema()?.kind === "power-down" && getHackerCinema()?.target === theme) {
      // The run toward this theme is already in progress.
      return;
    }
    persistTheme(theme);
    // The hacker palette stays painted until the collapse reaches full black;
    // only then does this callback flip the theme and unmount the chrome.
    startHackerPowerDown(theme, () => {
      sessionTheme = theme;
      applyTheme(theme, false);
      emit();
    });
    return;
  }

  sessionTheme = theme;
  persistTheme(theme);
  applyTheme(theme, animate);
  emit();
}
