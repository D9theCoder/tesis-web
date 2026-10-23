"use client";

import { useSyncExternalStore } from "react";
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
 */
export function setTheme(theme: Theme, animate = true) {
  sessionTheme = theme;
  persistTheme(theme);
  applyTheme(theme, animate);
  emit();
}
