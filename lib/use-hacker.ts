"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  advanceCheatBuffer,
  CHEAT_CODE_KEY,
  CHEAT_CODE_PHRASE,
  CHEAT_EXIT_KEY,
  effectiveRainMode,
  persistHackerFlag,
  persistRainMode,
  POWER_DOWN_CINEMA_KEY,
  RAIN_KEY,
  readCheatExitEnabled,
  readHackerFlag,
  readHackerReturnTheme,
  readRainMode,
  SPLASH_CINEMA_KEY,
  type RainMode,
} from "@/lib/hacker-settings";
import { setTheme } from "@/lib/use-theme";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function motionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOTION_QUERY).matches;
}

function motionServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, motionServerSnapshot);
}

/** Rain preference shared by the status bar and the canvas. */
export function useRainController() {
  const reducedMotion = useReducedMotion();
  // Hacker chrome mounts after the theme resolves on the client, so the stored
  // value can seed the first render without an effect-driven cascading update.
  const [stored, setStored] = useState<RainMode>(() => readRainMode() ?? "max");

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== RAIN_KEY) return;
      setStored(readRainMode() ?? "max");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const rainMode = effectiveRainMode(stored, reducedMotion);
  const setRainMode = useCallback((mode: RainMode) => {
    setStored(mode);
    persistRainMode(mode);
  }, []);

  return { rainMode, storedMode: stored, setRainMode, reducedMotion };
}

/**
 * One persisted hacker on/off flag (splash, power-down). Local state seeds from
 * the stored value and mirrors other tabs through the storage event; the write
 * path persists immediately so the next theme selection reads the new choice.
 */
export function useHackerFlag(key: string, fallback: boolean): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => readHackerFlag(key, fallback));

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      setEnabled(readHackerFlag(key, fallback));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, fallback]);

  const setFlag = useCallback(
    (next: boolean) => {
      persistHackerFlag(key, next);
      setEnabled(next);
    },
    [key],
  );

  return [enabled, setFlag];
}

/** Opening splash toggle; both cinematics default to on. */
export function useSplashCinemaToggle(): [boolean, (enabled: boolean) => void] {
  return useHackerFlag(SPLASH_CINEMA_KEY, true);
}

/** CRT power-down toggle; both cinematics default to on. */
export function usePowerDownCinemaToggle(): [boolean, (enabled: boolean) => void] {
  return useHackerFlag(POWER_DOWN_CINEMA_KEY, true);
}

/** “cheatstick” keyboard easter egg; defaults to on, Settings can switch it off. */
export function useCheatCodeToggle(): [boolean, (enabled: boolean) => void] {
  return useHackerFlag(CHEAT_CODE_KEY, true);
}

/** Exit sub-setting: the phrase returns to the pre-hacker theme; defaults on. */
export function useCheatExitToggle(): [boolean, (enabled: boolean) => void] {
  return useHackerFlag(CHEAT_EXIT_KEY, true);
}

const TEXTY_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/**
 * Fields whose own typing must never feed the phrase buffer. Radio and
 * checkbox inputs are fair game — they carry no text to type — and the listener
 * preventDefaults those counted keys so the radiogroup's typeahead cannot race
 * the phrase while the Settings page has focus.
 */
function eventMayCountForCheat(event: KeyboardEvent, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return false;
  if (target instanceof HTMLTextAreaElement) return false;
  if (target instanceof HTMLInputElement) {
    if (target.type === "radio" || target.type === "checkbox") {
      event.preventDefault();
      return true;
    }
    return !TEXTY_INPUT_TYPES.has(target.type);
  }
  if (target instanceof HTMLSelectElement) return false;
  return true;
}

/**
 * Types-ahead easter egg: a rolling buffer of printable keys completes the
 * “cheatstick” phrase anywhere outside text entry and selects hacker through
 * the same path as the theme control (splash and skip rules included). With
 * hacker active the phrase returns to the remembered theme — light or dark,
 * whichever was set before hacker — playing the power-down. The enabled flags
 * are read at event time, so flipping the Settings switches takes effect
 * immediately without re-binding.
 */
export function useCheatCodeListener() {
  const [enabled] = useCheatCodeToggle();
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    let buffer = "";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1 || event.repeat) return;
      if (!eventMayCountForCheat(event, event.target)) {
        buffer = "";
        return;
      }
      if (!enabledRef.current) {
        buffer = "";
        return;
      }
      buffer = advanceCheatBuffer(buffer, event.key.toLowerCase());
      if (buffer !== CHEAT_CODE_PHRASE) return;
      buffer = "";
      const painted = document.documentElement.dataset.theme;
      if (painted === "hacker") {
        if (!readCheatExitEnabled()) return;
        // Back to the theme in effect before hacker (light when none was
        // recorded); the same selection path plays the CRT power-down.
        setTheme(readHackerReturnTheme() ?? "light", true);
        return;
      }
      setTheme("hacker", true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
