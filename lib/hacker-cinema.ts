/**
 * Session cinematics for the hacker theme: the opening splash (hacker selected)
 * and the CRT power-down (hacker left for light/dark).
 *
 * This module owns the shared run state and the trigger policy only. Timeline
 * timers, canvas rendering, skip listeners, and audio scheduling live in
 * `components/hacker/hacker-cinema.tsx`, which renders one overlay per run and
 * commits or finishes the run through the functions below.
 *
 * Trigger rules (see DESIGN.md, "Session cinematics"):
 * - The splash plays only when the user selects hacker from a theme control in
 *   this tab during a session. Page loads and saved-theme restores never play
 *   it, because neither path calls `setTheme`.
 * - The power-down plays only when the user selects light or dark while hacker
 *   is active. A theme restored from storage cancels any running cinematic
 *   instead of starting one.
 */

import { createHackerAudio, type HackerAudio } from "@/lib/hacker-audio";
import {
  bootWasSeen,
  markBootSeen,
  readHackerAudioEnabled,
  readPowerDownCinemaEnabled,
  readSplashCinemaEnabled,
} from "@/lib/hacker-settings";
import type { Theme } from "@/lib/theme";
import { useSyncExternalStore } from "react";

export type HackerCinemaKind = "splash" | "power-down";

export type HackerCinemaRun = {
  readonly id: number;
  readonly kind: HackerCinemaKind;
  /** Theme the run lands on; a splash run always targets "hacker". */
  readonly target: Theme;
  readonly reducedMotion: boolean;
  readonly audio: HackerAudio | null;
  /** `performance.now()` captured while the initiating click was still running. */
  readonly startedAt: number;
  /**
   * Applies the pending theme exactly once. A splash run already committed
   * (the overlay hides the instant swap, so the run records a no-op commit),
   * while a power-down commits at its fully black frame.
   */
  readonly commit: () => void;
};

type RunRecord = {
  run: HackerCinemaRun;
  committed: boolean;
};

let current: RunRecord | null = null;
let nextRunId = 1;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getHackerCinema(): HackerCinemaRun | null {
  return current?.run ?? null;
}

/** Server render never starts with a run, so hydration matches. */
export const getHackerCinemaServer = (): HackerCinemaRun | null => null;

export function subscribeHackerCinema(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding for the current run; the overlay re-renders only on changes. */
export function useHackerCinema(): HackerCinemaRun | null {
  return useSyncExternalStore(subscribeHackerCinema, getHackerCinema, getHackerCinemaServer);
}

export function hasActiveHackerCinema(): boolean {
  return current !== null;
}

function disposeCurrent() {
  if (!current) return;
  current.run.audio?.dispose();
  current = null;
  notify();
}

/**
 * Applies the pending theme once. Called at the power-down's fully black frame,
 * by the skip path, and by theme changes that cancel a running power-down.
 */
export function commitHackerCinema() {
  const record = current;
  if (!record || record.committed) return;
  record.committed = true;
  record.run.commit();
}

/**
 * Skips straight to the final frame: the pending theme is applied and the run
 * ends, so the overlay unmounts (the theme underneath is already correct).
 */
export function skipHackerCinema() {
  if (!current) return;
  commitHackerCinema();
  disposeCurrent();
}

/** Ends a completed run. Stale ids are ignored so a newer run survives. */
export function finishHackerCinema(id: number) {
  if (current?.run.id !== id) return;
  disposeCurrent();
}

/**
 * Ends a run immediately without committing it: used by theme changes that
 * cancel a running cinematic and by external storage restores.
 */
export function cancelHackerCinema() {
  disposeCurrent();
}

/** Replaces the run's audio instance (the overlay sound toggle). */
export function setHackerCinemaAudio(id: number, audio: HackerAudio | null) {
  const record = current;
  if (record?.run.id !== id) {
    audio?.dispose();
    return;
  }
  record.run.audio?.dispose();
  current = { run: { ...record.run, audio }, committed: record.committed };
  notify();
}

function armRun(kind: HackerCinemaKind, target: Theme, commit: () => void): HackerCinemaRun {
  // A selection always supersedes a running cinematic, and its audio dies with it.
  disposeCurrent();
  const run: HackerCinemaRun = {
    id: nextRunId++,
    kind,
    target,
    reducedMotion:
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    audio: readHackerAudioEnabled() ? createHackerAudio() : null,
    startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    commit,
  };
  current = { run, committed: kind === "splash" };
  // The boot pass and the splash tell the same startup story; a session that
  // saw one never needs the other.
  if (kind === "splash" && !bootWasSeen()) markBootSeen();
  notify();
  return run;
}

/** Arms the opening splash. The hacker theme must already be applied. */
export function startHackerSplash() {
  armRun("splash", "hacker", () => {});
}

/** Arms the power-down. `commit` applies the target theme at the black frame. */
export function startHackerPowerDown(target: Theme, commit: () => void) {
  armRun("power-down", target, commit);
}

/* --- Trigger policy -------------------------------------------------------- */

export type HackerCinemaPlan = HackerCinemaKind | null;

/**
 * Which cinematic a theme change earns, or null for the plain transition.
 * `use-theme.ts` only consults this for user selections in this tab
 * (`setTheme` with animation enabled) and only when the theme actually changes.
 */
export function planHackerCinema(previous: Theme, next: Theme): HackerCinemaPlan {
  if (previous === "hacker" && (next === "light" || next === "dark")) {
    return readPowerDownCinemaEnabled() ? "power-down" : null;
  }
  if (previous !== "hacker" && next === "hacker") {
    return readSplashCinemaEnabled() ? "splash" : null;
  }
  return null;
}

/** A hidden tab throttles timers, which would stall the timeline mid-phase. */
export function cinemaBlockedByVisibility(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/* --- Timeline constants ---------------------------------------------------- */

/** Opening splash: 0-150 sweep, 150-750 reel, 750-1300 slam, 1300-1800 type, 1800-2100 dissolve. */
export const SPLASH_SWEEP_END_MS = 150;
export const SPLASH_REEL_END_MS = 750;
export const SLAM_END_MS = 1300;
export const SPLASH_WELCOME_END_MS = 1800;
export const SPLASH_DURATION_MS = 2100;
export const SPLASH_REDUCED_HOLD_MS = 300;
export const SPLASH_REDUCED_FADE_MS = 180;

/** Power-down: 0-200 jitter, 200-500 reel, 500-800 collapse, 800-1000 dot, 1000-1200 reveal. */
export const POWER_GLITCH_END_MS = 200;
export const POWER_REEL_END_MS = 500;
export const POWER_COLLAPSE_END_MS = 800;
export const POWER_BLACK_MS = 1000;
export const POWER_DURATION_MS = 1200;
export const POWER_REVEAL_MS = POWER_DURATION_MS - POWER_BLACK_MS;
/** The rain speeds up until here, then fades out over the rest of the reel. */
export const POWER_RAIN_FADE_AT_MS = 350;
/** Overlay fade-out used when a run is skipped mid-timeline. */
export const CINEMA_SKIP_FADE_MS = 120;
export const POWER_REDUCED_FADE_MS = 200;

/** Rain speed multiplier while a power-down runs on top of the hacker canvas. */
export const CINEMA_RAIN_BOOST = 2;

/* --- Reel content and pure helpers ----------------------------------------- */

/**
 * Fictional operator-theatre copy only: no hosts, addresses, credentials, or
 * anything that could be mistaken for real exploit output.
 */
export const SPLASH_LOG_LINES: readonly string[] = [
  "SYSTEM OVERRIDE ENGAGED",
  "ESTABLISHING UPLINK",
  "EVADING TRACE",
  "NODE 7G SYNCHRONIZED",
  "KEYSTREAM LOADED",
  "ROTATING HANDSHAKE KEYS",
  "RIDGING PACKET GHOSTS",
  "TRACE ROUTE MASKED",
  "SECTOR GRID 7G MAPPED",
  "WATCHDOG FED FALSE TELEMETRY",
  "RESOLVING GHOST PROXY",
  "FIREWALL SIGNATURE FED",
  "PHANTOM NODES BROADCAST",
  "DEAD DROP STAGED",
  "ARMING WELCOME MAT",
];

/** All three bars complete inside the 600ms reel, each on its own clock. */
export const PROGRESS_BARS: readonly { label: string; startMs: number; durationMs: number }[] = [
  { label: "UPLINK", startMs: 0, durationMs: 240 },
  { label: "KEYSTREAM", startMs: 60, durationMs: 380 },
  { label: "TRACE SHIELD", startMs: 110, durationMs: 470 },
];

export function clampCinema(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** A bar's percentage against the reel clock. Pure so tests can pin it. */
export function progressPercent(elapsedMs: number, startMs: number, durationMs: number): number {
  if (durationMs <= 0) return 100;
  return Math.round(clampCinema(((elapsedMs - startMs) / durationMs) * 100, 0, 100));
}

/** The climbing ops counter behind the log reel. Pure for tests. */
export function splashCounterValue(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 8000;
  return Math.round(8000 + elapsedMs * 43.7);
}

/** Grouped counter text, e.g. 10 482, kept locale-independent. */
export function formatCinemaCounter(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Wireframe sphere projection on the unit sphere; the renderer scales it. */
export type GlobePoint = { x: number; y: number; z: number };

export function globePoint(lat: number, lon: number, rotation: number): GlobePoint {
  const angle = lon + rotation;
  const cosLat = Math.cos(lat);
  return { x: cosLat * Math.sin(angle), y: Math.sin(lat), z: cosLat * Math.cos(angle) };
}

/** Fixed sector label anchors; labels blink in during the reel. */
export const GLOBE_LABELS: readonly { lat: number; lon: number; label: string }[] = [
  { lat: 0.35, lon: 0.5, label: "SEC-01" },
  { lat: -0.5, lon: 2.1, label: "GRID 7G" },
  { lat: 0.75, lon: 3.6, label: "SEC-04" },
  { lat: -0.2, lon: 5, label: "NODE 71" },
  { lat: 0.1, lon: 1.3, label: "UPLINK" },
  { lat: -0.75, lon: 4.2, label: "SEC-09" },
];

/** Deterministic pseudo-random noise for glitch slices; stable across frames. */
export function cinemaNoise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function easeInOutCubic(t: number): number {
  const x = clampCinema(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeInCubic(t: number): number {
  const x = clampCinema(t, 0, 1);
  return x * x * x;
}
