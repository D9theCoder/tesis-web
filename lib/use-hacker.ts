"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  effectiveRainMode,
  persistRainMode,
  RAIN_KEY,
  readRainMode,
  type RainMode,
} from "@/lib/hacker-settings";

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
