"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cinemaNoise,
  clampCinema,
  commitHackerCinema,
  CINEMA_SKIP_FADE_MS,
  finishHackerCinema,
  formatCinemaCounter,
  globePoint,
  GLOBE_LABELS,
  POWER_BLACK_MS,
  POWER_COLLAPSE_END_MS,
  POWER_DURATION_MS,
  POWER_GLITCH_END_MS,
  POWER_RAIN_FADE_AT_MS,
  POWER_REEL_END_MS,
  POWER_REDUCED_FADE_MS,
  progressPercent,
  PROGRESS_BARS,
  setHackerCinemaAudio,
  splashCounterValue,
  SPLASH_DURATION_MS,
  SPLASH_LOG_LINES,
  SPLASH_REDUCED_FADE_MS,
  SPLASH_REDUCED_HOLD_MS,
  SPLASH_REEL_END_MS,
  SLAM_END_MS,
  SPLASH_SWEEP_END_MS,
  SPLASH_WELCOME_END_MS,
  useHackerCinema,
  type GlobePoint,
  type HackerCinemaRun,
} from "@/lib/hacker-cinema";
import { createHackerAudio } from "@/lib/hacker-audio";
import { HACKER_AUDIO_KEY, persistHackerFlag } from "@/lib/hacker-settings";

/**
 * Full-screen session cinematics for the hacker theme (DESIGN.md: "Session
 * cinematics"). One overlay per run, fixed above every layer. The visual screen
 * is aria-hidden; the run announces one plain sentence through its role="status"
 * region, and focus stays on the theme control the user clicked.
 *
 * Skips: any click, tap, or key press (Escape included) jumps to the final
 * frame, except activations of the overlay's own sound control. All timers,
 * animation frames, audio voices, and root attributes are cleared when a run
 * finishes, is skipped, or is cancelled by another theme change.
 */

const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const CINEMA_WHITE = "#f0fff6";
const REEL_BEAT_MS = 72;
const POWER_BEAT_MS = 70;
const POWER_BEAT_SCALE = 4.2;
/** 17 characters at 26ms keeps the word complete ~60ms before the dissolve. */
const TYPE_INTERVAL_MS = 26;
const WELCOME_TEXT = "WELCOME, OPERATOR";

const RAIN_ATTR = "data-cinema-rain";

/** Number of the reel line at a moment of the reel clock. */
export function reelLineIndex(clockMs: number): number {
  const clock = Number.isFinite(clockMs) && clockMs > 0 ? clockMs : 0;
  return Math.floor(clock / REEL_BEAT_MS);
}

function reelLine(row: number): string {
  const count = SPLASH_LOG_LINES.length;
  return SPLASH_LOG_LINES[((row % count) + count) % count] ?? "";
}

/* --- Canvas plumbing ------------------------------------------------------- */

type CanvasKit = {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
};

function prepareCanvas(canvas: HTMLCanvasElement | null): CanvasKit | null {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const width = Math.max(1, Math.round(window.innerWidth || canvas.width || 1));
  const height = Math.max(1, Math.round(window.innerHeight || canvas.height || 1));
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

/**
 * Drives per-frame canvas/text updates. Uses requestAnimationFrame when the
 * environment has it and falls back to a 16ms timer (tests) otherwise. Returns
 * its own disposer; every path must call it exactly once.
 */
function frameEngine(onFrame: (elapsedMs: number) => void): () => void {
  const useRaf = typeof window.requestAnimationFrame === "function";
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const startedAt = now();
  let stopped = false;
  let handle = 0;
  const tick = () => {
    if (stopped) return;
    onFrame(now() - startedAt);
  };
  if (useRaf) {
    const loop = () => {
      tick();
      if (!stopped) handle = window.requestAnimationFrame(loop);
    };
    handle = window.requestAnimationFrame(loop);
  } else {
    handle = window.setInterval(tick, 16);
  }
  return () => {
    stopped = true;
    if (useRaf) window.cancelAnimationFrame(handle);
    else window.clearInterval(handle);
  };
}

/* --- Root attribute helpers (rain hold / fade) ------------------------------ */

function setRainHold() {
  document.documentElement.setAttribute(RAIN_ATTR, "hold");
}

function fadeRain() {
  document.documentElement.setAttribute(RAIN_ATTR, "fade");
}

function clearRainHold() {
  document.documentElement.removeAttribute(RAIN_ATTR);
}

/* --- Screen jitter (power-down phase 1) ------------------------------------ */

type ScreenJitter = { start: () => void; stop: () => void };

/** Rolls and tears the page with scroll offsets, then restores them exactly. */
function createScreenJitter(): ScreenJitter {
  const OFFSETS: readonly [number, number][] = [
    [2, 3],
    [-3, -2],
    [3, -1],
    [-2, 2],
    [1, 3],
    [-3, 1],
    [2, -3],
    [0, 0],
  ];
  let originalX = 0;
  let originalY = 0;
  let timer: number | undefined;
  let step = 0;
  return {
    start() {
      if (timer !== undefined) return;
      originalX = window.scrollX ?? window.pageXOffset ?? 0;
      originalY = window.scrollY ?? window.pageYOffset ?? 0;
      timer = window.setInterval(() => {
        const [dx, dy] = OFFSETS[step % OFFSETS.length] ?? [0, 0];
        step += 1;
        window.scrollTo(originalX + dx, originalY + dy);
      }, 25);
    },
    stop() {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
      window.scrollTo(originalX, originalY);
      step = 0;
    },
  };
}

/* --- Canvas scenes ---------------------------------------------------------- */

/** One scrolling column of cinematic log lines. Returns the current line no. */
function drawReel(
  kit: CanvasKit,
  clockMs: number,
  options: { x: number; top: number; bottom: number; beatMs: number; alphaScale: number },
): number {
  const { context } = kit;
  const lineH = 17;
  const clock = Math.max(0, clockMs);
  const current = Math.floor(clock / options.beatMs);
  const scroll = (clock - current * options.beatMs) / options.beatMs;
  const rows = Math.max(1, Math.floor((options.bottom - options.top) / lineH));
  context.font = `600 12px ${MONO_STACK}`;
  context.textBaseline = "top";
  context.textAlign = "left";
  // Clip to the reel's own band so the scrolling column never bleeds into the
  // progress-bar labels (or anything else) beneath it.
  context.save();
  context.beginPath();
  context.rect(0, options.top - 1, kit.width, options.bottom - options.top + 2);
  context.clip();
  for (let offset = rows; offset >= -1; offset -= 1) {
    const row = current - offset;
    const y = options.top + (offset + scroll) * lineH;
    if (y < options.top - lineH || y > options.bottom + lineH) continue;
    const age = rows - offset;
    const alpha = clampCinema((1 - age / (rows + 2)) * options.alphaScale, 0, 1);
    if (alpha <= 0.02) continue;
    context.fillStyle =
      row === current
        ? `rgba(51, 255, 102, ${alpha})`
        : `rgba(120, 226, 164, ${alpha * 0.8})`;
    context.fillText(`> ${reelLine(row)}`, options.x, y);
  }
  context.restore();
  return current;
}

function drawSplashGlobe(kit: CanvasKit, reelMs: number) {
  const { context, width, height } = kit;
  const radius = Math.min(width, height) * 0.21;
  const cx = width * 0.68;
  const cy = height * 0.42;
  const rotation = reelMs * 0.0065;
  context.lineWidth = 1;

  const strokePath = (points: GlobePoint[]) => {
    context.beginPath();
    let open = false;
    for (const point of points) {
      if (point.z > 0) {
        const x = cx + point.x * radius;
        const y = cy - point.y * radius;
        if (open) context.lineTo(x, y);
        else context.moveTo(x, y);
        open = true;
      } else {
        open = false;
      }
    }
    context.stroke();
  };

  context.strokeStyle = "rgba(51, 255, 102, 0.3)";
  for (let index = 0; index < 12; index += 1) {
    const lon = (index / 12) * Math.PI * 2;
    const points: GlobePoint[] = [];
    for (let step = 0; step <= 24; step += 1) {
      const lat = -Math.PI / 2 + (step / 24) * Math.PI;
      points.push(globePoint(lat, lon, rotation));
    }
    strokePath(points);
  }
  context.strokeStyle = "rgba(51, 255, 102, 0.2)";
  for (let index = 1; index < 6; index += 1) {
    const lat = -Math.PI / 2 + (index / 6) * Math.PI;
    const points: GlobePoint[] = [];
    for (let step = 0; step <= 32; step += 1) {
      points.push(globePoint(lat, (step / 32) * Math.PI * 2, rotation));
    }
    strokePath(points);
  }

  // Sector labels blink in on a fixed schedule, then hold.
  context.font = `600 ${Math.max(10, Math.round(radius * 0.075))}px ${MONO_STACK}`;
  GLOBE_LABELS.forEach((entry, index) => {
    const since = reelMs - (120 + index * 90);
    if (since < 0) return;
    const alpha = since < 270 ? (Math.floor(since / 90) % 2 === 0 ? 0.95 : 0.15) : 0.85;
    const point = globePoint(entry.lat, entry.lon, rotation);
    const x = cx + point.x * radius + 8;
    const y = cy - point.y * radius - 6;
    context.fillStyle =
      point.z > 0 ? `rgba(130, 255, 170, ${alpha})` : `rgba(130, 255, 170, ${alpha * 0.22})`;
    context.fillText(entry.label, x, y);
  });
}

function drawSplashReel(kit: CanvasKit, reelMs: number, veil: number): number {
  const { context, width, height } = kit;
  const margin = Math.max(16, Math.round(width * 0.06));
  const barsTop = height * 0.68;
  const barRow = (height - barsTop - margin) / PROGRESS_BARS.length;
  context.save();
  context.globalAlpha = clampCinema(1 - veil, 0, 1);

  // Climbing ops counter, top right.
  context.font = `600 12px ${MONO_STACK}`;
  context.textBaseline = "top";
  context.textAlign = "right";
  context.fillStyle = "rgba(51, 255, 102, 0.9)";
  context.fillText(
    `OPS ${formatCinemaCounter(splashCounterValue(reelMs))}`,
    width - margin,
    Math.max(14, Math.round(height * 0.08)),
  );

  drawReel(kit, reelMs, {
    x: margin,
    top: Math.round(height * 0.22),
    bottom: Math.round(barsTop - 10),
    beatMs: REEL_BEAT_MS,
    alphaScale: 1,
  });

  // Three progress bars race to 100 percent on their own clocks.
  context.font = `600 11px ${MONO_STACK}`;
  context.textAlign = "left";
  PROGRESS_BARS.forEach((bar, index) => {
    const y = Math.round(barsTop + barRow * index);
    if (y > height - 12) return;
    const percent = progressPercent(reelMs, bar.startMs, bar.durationMs);
    const track = 22;
    const fill = Math.round((percent / 100) * track);
    context.fillStyle = "rgba(120, 226, 164, 0.8)";
    context.fillText(bar.label, margin, y);
    context.fillStyle = "rgba(51, 255, 102, 0.6)";
    context.fillText(`[${"█".repeat(fill)}${"·".repeat(track - fill)}]`, margin + 110, y);
    context.textAlign = "right";
    context.fillText(`${percent}%`.padStart(4, " "), width - margin, y);
    context.textAlign = "left";
  });
  context.restore();
  return Math.floor(Math.max(0, reelMs) / REEL_BEAT_MS);
}

function drawPowerGlitch(kit: CanvasKit, elapsedMs: number) {
  const { context, width, height } = kit;
  const seedBase = Math.floor(elapsedMs / 40);
  for (let slice = 0; slice < 5; slice += 1) {
    const seed = seedBase * 7 + slice * 13;
    const y = cinemaNoise(seed) * height;
    const sliceHeight = 3 + cinemaNoise(seed + 1) * 22;
    const shift = (cinemaNoise(seed + 2) - 0.5) * 46;
    context.fillStyle = "rgba(51, 255, 102, 0.08)";
    context.fillRect(0, y, width, sliceHeight);
    context.fillStyle = slice % 2 === 0 ? "rgba(255, 59, 78, 0.38)" : "rgba(60, 224, 255, 0.38)";
    context.fillRect(shift, y, width, 1);
  }
  if (cinemaNoise(seedBase) > 0.55) {
    const y = cinemaNoise(seedBase + 5) * height;
    context.fillStyle = "rgba(240, 255, 246, 0.5)";
    context.fillRect(0, y, width, 1);
  }
}

function drawPowerGlobe(kit: CanvasKit, elapsedMs: number, decay: number) {
  const { context, width, height } = kit;
  const radius = Math.min(width, height) * 0.21 * (1 - 0.55 * decay);
  const cx = width * 0.68;
  const cy = height * 0.42;
  const rotation = elapsedMs * 0.0065 * (1 - 0.8 * decay);
  context.lineWidth = 1;

  const strokePath = (points: GlobePoint[]) => {
    context.beginPath();
    let open = false;
    for (const point of points) {
      if (point.z > 0) {
        const x = cx + point.x * radius;
        const y = cy - point.y * radius;
        if (open) context.lineTo(x, y);
        else context.moveTo(x, y);
        open = true;
      } else {
        open = false;
      }
    }
    context.stroke();
  };
  context.strokeStyle = `rgba(51, 255, 102, ${0.3 * (1 - decay * 0.6)})`;
  for (let index = 0; index < 12; index += 1) {
    const lon = (index / 12) * Math.PI * 2;
    const points: GlobePoint[] = [];
    for (let step = 0; step <= 24; step += 1) {
      points.push(globePoint(-Math.PI / 2 + (step / 24) * Math.PI, lon, rotation));
    }
    strokePath(points);
  }
  for (let index = 1; index < 6; index += 1) {
    const lat = -Math.PI / 2 + (index / 6) * Math.PI;
    const points: GlobePoint[] = [];
    for (let step = 0; step <= 32; step += 1) {
      points.push(globePoint(lat, (step / 32) * Math.PI * 2, rotation));
    }
    strokePath(points);
  }
}

function drawPowerCollapse(kit: CanvasKit, elapsedMs: number) {
  const { context, width, height } = kit;
  const cy = height / 2;
  const t = elapsedMs - POWER_REEL_END_MS;
  const collapseT = POWER_COLLAPSE_END_MS - POWER_REEL_END_MS;
  const dotT = POWER_BLACK_MS - POWER_COLLAPSE_END_MS;

  if (t < collapseT) {
    // The picture crushes into a single bright horizontal line. The band starts
    // under half the viewport (a squash, not a flashbang) and decays hard, so
    // by mid-phase it already reads as the CRT's last thin line.
    const progress = clampCinema(t / collapseT, 0, 1);
    const lineH = Math.max(2.5, height * 0.45 * Math.pow(1 - progress, 2.2));
    const bloom = Math.max(6, lineH * 0.5);
    const bloomAlpha = 0.2 * (1 - progress * 0.65);
    context.fillStyle = `rgba(160, 255, 190, ${bloomAlpha})`;
    context.fillRect(0, cy - bloom, width, bloom * 2);
    context.fillStyle = CINEMA_WHITE;
    context.fillRect(0, cy - lineH / 2, width, lineH);
    return;
  }
  // The line contracts horizontally into a dot, then fades to black.
  const progress = clampCinema((t - collapseT) / dotT, 0, 1);
  const halfWidth = Math.max(0, width * 0.5 * (1 - progress));
  const alpha = progress > 0.5 ? clampCinema(1 - (progress - 0.5) / 0.5, 0, 1) : 1;
  context.fillStyle = `rgba(160, 255, 190, ${alpha * 0.22})`;
  context.fillRect(width / 2 - halfWidth * 1.4, cy - 6, halfWidth * 2.8, 12);
  context.fillStyle = `rgba(240, 255, 246, ${alpha})`;
  context.fillRect(width / 2 - halfWidth, cy - 1.5, halfWidth * 2, 3);
}

/* --- Shared overlay pieces -------------------------------------------------- */

const CINEMA_UI_SELECTOR = "[data-cinema-ui]";

function isCinemaUi(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CINEMA_UI_SELECTOR) !== null;
}

function useCinemaSkip(skip: () => void) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isCinemaUi(event.target)) return;
      skip();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Every key skips except activation of the overlay's own controls; the
      // sound toggle stays reachable by pointer and assistive tech alike.
      if (isCinemaUi(event.target)) return;
      skip();
    };
    // Capture phase: nothing underneath may react before the run ends.
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [skip]);
}

function useCinemaSound(cinema: HackerCinemaRun): [boolean, () => void] {
  const [on, setOn] = useState(() => cinema.audio !== null);
  const toggle = useCallback(() => {
    const next = !on;
    persistHackerFlag(HACKER_AUDIO_KEY, next);
    if (next) {
      // Creating the context here keeps the gesture that started it: autoplay
      // rules stay satisfied even when sound was off at theme selection.
      const audio = createHackerAudio();
      setHackerCinemaAudio(cinema.id, audio);
      audio?.confirm();
      setOn(audio !== null);
    } else {
      setHackerCinemaAudio(cinema.id, null);
      setOn(false);
    }
  }, [cinema.id, on]);
  return [on, toggle];
}

function SoundButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="hacker-cinema-sound"
      data-cinema-ui
      aria-pressed={on}
      aria-label={on ? "Cinematic sound off" : "Cinematic sound on"}
      onClick={onToggle}
    >
      [ SOUND {on ? "ON" : "OFF"} ]
    </button>
  );
}

function SkipHint({ label }: { label: string }) {
  return (
    <div className="hacker-cinema-hint" aria-hidden="true">
      {label}
    </div>
  );
}

type RunLifecycle = {
  cinemaRef: { current: HackerCinemaRun };
  cleanupRun: () => void;
  skip: () => void;
  trackTimer: (id: number) => number;
  stopFrameRef: { current: (() => void) | null };
};

/**
 * Shared one-shot run plumbing: always-fresh view of the run, tracked timers,
 * the frame-engine handle, rain-attribute cleanup, the reduced-motion watch,
 * and the skip path (commit the pending theme, then land on the final frame).
 * `skip` is stable for the lifetime of the run.
 */
function useRunLifecycle(
  cinema: HackerCinemaRun,
  onSkipPhase: () => void,
  cancelExtras?: () => void,
): RunLifecycle {
  const cinemaRef = useRef<HackerCinemaRun>(cinema);
  const timersRef = useRef<number[]>([]);
  const stopFrameRef = useRef<(() => void) | null>(null);
  const extrasRef = useRef<(() => void) | undefined>(cancelExtras);
  const skippedRef = useRef(false);

  // Keep the timeline's view of the run current without restarting it; the
  // sound toggle swaps in a new run object mid-flight.
  useEffect(() => {
    cinemaRef.current = cinema;
  });
  useEffect(() => {
    extrasRef.current = cancelExtras;
  });

  const cleanupRun = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
    stopFrameRef.current?.();
    stopFrameRef.current = null;
    extrasRef.current?.();
    clearRainHold();
  }, []);

  const trackTimer = useCallback((id: number) => {
    timersRef.current.push(id);
    return id;
  }, []);

  const skip = useCallback(() => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    const run = cinemaRef.current;
    cleanupRun();
    // Skipping lands on the final frame: the pending theme is committed now.
    commitHackerCinema();
    if (run.reducedMotion) {
      // The static run holds no motion; its final frame is already on screen.
      finishHackerCinema(run.id);
      return;
    }
    onSkipPhase();
    trackTimer(window.setTimeout(() => finishHackerCinema(run.id), CINEMA_SKIP_FADE_MS));
  }, [cleanupRun, onSkipPhase, trackTimer]);

  useCinemaSkip(skip);

  // A preference flip mid-run must not keep canvas scenes moving: land on the
  // final frame, whose cover uses only a plain opacity fade.
  useEffect(() => {
    const query = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const onFlip = () => {
      if (query?.matches) skip();
    };
    query?.addEventListener?.("change", onFlip);
    return () => {
      query?.removeEventListener?.("change", onFlip);
    };
  }, [skip]);

  // Unmount (skip fade done, run finished, or another theme change) releases
  // everything the timeline borrowed.
  useEffect(() => () => cleanupRun(), [cleanupRun]);

  return { cinemaRef, cleanupRun, skip, trackTimer, stopFrameRef };
}

/* --- Opening splash --------------------------------------------------------- */

function SplashOverlay({ cinema }: { cinema: HackerCinemaRun }) {
  const [phase, setPhase] = useState(() => (cinema.reducedMotion ? "cover" : "sweep"));
  const [audioOn, toggleAudio] = useCinemaSound(cinema);
  const welcomeRef = useRef<HTMLSpanElement | null>(null);
  const globeRef = useRef<HTMLCanvasElement | null>(null);
  const fxRef = useRef<HTMLCanvasElement | null>(null);

  const setSkipPhase = useCallback(() => setPhase("skip"), []);
  const { cinemaRef, cleanupRun, trackTimer, stopFrameRef } = useRunLifecycle(cinema, setSkipPhase);

  useEffect(() => {
    if (cinema.reducedMotion) {
      // Reduced-motion choice: a static acknowledgement, then an opacity fade.
      trackTimer(
        window.setTimeout(() => setPhase("fade"), SPLASH_REDUCED_HOLD_MS),
      );
      trackTimer(
        window.setTimeout(
          () => finishHackerCinema(cinema.id),
          SPLASH_REDUCED_HOLD_MS + SPLASH_REDUCED_FADE_MS,
        ),
      );
      return cleanupRun;
    }

    const at = (ms: number, fn: () => void) => trackTimer(window.setTimeout(fn, ms));
    setRainHold();
    const globe = prepareCanvas(globeRef.current);
    const fx = prepareCanvas(fxRef.current);
    let lastBeepLine = -1;
    stopFrameRef.current = frameEngine(t => {
      // Typing must not depend on canvas availability (jsdom, blocked contexts).
      if (welcomeRef.current && t >= SLAM_END_MS) {
        const count = Math.min(
          WELCOME_TEXT.length,
          Math.floor((t - SLAM_END_MS) / TYPE_INTERVAL_MS) + 1,
        );
        const text = WELCOME_TEXT.slice(0, Math.max(0, count));
        if (welcomeRef.current.textContent !== text) {
          welcomeRef.current.textContent = text;
        }
      }
      if (!fx) return;
      const reelT = t - SPLASH_SWEEP_END_MS;
      // Full clear every frame: the reel, bars, and counter are redrawn whole.
      fx.context.clearRect(0, 0, fx.width, fx.height);
      if (reelT >= 0 && t < SLAM_END_MS) {
        const veil = t < SPLASH_REEL_END_MS ? 0 : clampCinema(
          ((t - SPLASH_REEL_END_MS) / (SLAM_END_MS - SPLASH_REEL_END_MS)) * 0.85,
          0,
          0.85,
        );
        const line = drawSplashReel(fx, reelT, veil);
        if (line !== lastBeepLine && reelT < SPLASH_REEL_END_MS) {
          lastBeepLine = line;
          cinemaRef.current.audio?.splashBeep(line);
        }
      }
      if (!globe) return;
      globe.context.clearRect(0, 0, globe.width, globe.height);
      if (reelT >= 0 && t < SPLASH_REEL_END_MS) {
        drawSplashGlobe(globe, reelT);
      }
    });

    at(SPLASH_SWEEP_END_MS, () => setPhase("reel"));
    at(SPLASH_REEL_END_MS, () => {
      setPhase("slam");
      cinemaRef.current.audio?.splashSlam();
    });
    at(SLAM_END_MS, () => setPhase("welcome"));
    at(SPLASH_WELCOME_END_MS, () => {
      // The hold lifts first so the rain fades in beneath the dissolving splash.
      clearRainHold();
      setPhase("dissolve");
    });
    at(SPLASH_DURATION_MS, () => finishHackerCinema(cinema.id));
    return cleanupRun;
    // The run is mounted once per id (keyed); the timeline must never restart
    // when the audio toggle swaps the run object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const word = (
    <div className="hacker-cinema-word">
      <span className="hacker-cinema-word-face">ACCESS GRANTED</span>
      <span className="hacker-cinema-word-ghost hacker-cinema-word-ghost--red">ACCESS GRANTED</span>
      <span className="hacker-cinema-word-ghost hacker-cinema-word-ghost--cyan">ACCESS GRANTED</span>
    </div>
  );

  if (cinema.reducedMotion) {
    return (
      <div className="hacker-cinema" data-kind="splash" data-phase={phase}>
        <span className="hacker-cinema-announcer" role="status" aria-live="polite">
          Hacker mode enabled.
        </span>
        <div className="hacker-cinema-screen hacker-cinema-screen--splash hacker-cinema-reduced" aria-hidden="true">
          <div className="hacker-cinema-reduced-title">HACKER MODE ENABLED</div>
          <SkipHint label="click or press any key to dismiss" />
        </div>
      </div>
    );
  }

  return (
    <div className="hacker-cinema" data-kind="splash" data-phase={phase}>
      {/* The live region holds only the announcement sentence. The visual screen
          stays aria-hidden; the sound control lives outside it so assistive
          tech can expose it, and its activation never skips the run. */}
      <span className="hacker-cinema-announcer" role="status" aria-live="polite">
        Hacker mode enabled.
      </span>
      <div className="hacker-cinema-screen hacker-cinema-screen--splash" aria-hidden="true">
        <canvas ref={globeRef} className="hacker-cinema-canvas" />
        <canvas ref={fxRef} className="hacker-cinema-canvas" />
        <div className="hacker-cinema-sweep" />
        <div className="hacker-cinema-flash" />
        {word}
        <div className="hacker-cinema-welcome">
          <span ref={welcomeRef} className="hacker-cinema-typed" />
          <span className="hacker-cinema-typed-cursor" />
        </div>
        <SkipHint label="press any key or tap to skip" />
      </div>
      <SoundButton on={audioOn} onToggle={toggleAudio} />
    </div>
  );
}

/* --- Power-down -------------------------------------------------------------- */

function PowerDownOverlay({ cinema }: { cinema: HackerCinemaRun }) {
  const [phase, setPhase] = useState(() => (cinema.reducedMotion ? "fade" : "glitch"));
  const [audioOn, toggleAudio] = useCinemaSound(cinema);
  const globeRef = useRef<HTMLCanvasElement | null>(null);
  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const jitterRef = useRef<ScreenJitter | null>(null);

  const setSkipPhase = useCallback(() => setPhase("skip"), []);
  const stopJitter = useCallback(() => jitterRef.current?.stop(), []);
  // The jitter interval is not among the tracked timers: it must also stop when
  // a skip cuts the run short mid-roll.
  const { cinemaRef, cleanupRun, trackTimer, stopFrameRef } = useRunLifecycle(
    cinema,
    setSkipPhase,
    stopJitter,
  );

  useEffect(() => {
    if (cinema.reducedMotion) {
      // Reduced motion: a plain 200ms fade to the target theme. The theme is
      // committed immediately, underneath the full black cover.
      commitHackerCinema();
      trackTimer(
        window.setTimeout(() => finishHackerCinema(cinema.id), POWER_REDUCED_FADE_MS),
      );
      return cleanupRun;
    }

    const at = (ms: number, fn: () => void) => trackTimer(window.setTimeout(fn, ms));
    const jitter = createScreenJitter();
    jitterRef.current = jitter;
    jitter.start();
    const globe = prepareCanvas(globeRef.current);
    const fx = prepareCanvas(fxRef.current);
    stopFrameRef.current = frameEngine(t => {
      if (!fx) return;
      // Full clear every frame: glitch slices, logs, globe, and the collapse
      // are all redrawn whole, so nothing accumulates between phases.
      fx.context.clearRect(0, 0, fx.width, fx.height);
      globe?.context.clearRect(0, 0, globe.width, globe.height);
      if (t < POWER_GLITCH_END_MS) {
        drawPowerGlitch(fx, t);
      } else if (t < POWER_REEL_END_MS) {
        const decay = (t - POWER_GLITCH_END_MS) / (POWER_REEL_END_MS - POWER_GLITCH_END_MS);
        drawReel(fx, (t - POWER_GLITCH_END_MS) * POWER_BEAT_SCALE, {
          x: Math.max(16, Math.round(fx.width * 0.06)),
          top: Math.round(fx.height * 0.2),
          bottom: Math.round(fx.height * 0.86),
          beatMs: POWER_BEAT_MS,
          alphaScale: 0.9,
        });
        if (globe) drawPowerGlobe(globe, t, clampCinema(decay, 0, 1));
      } else if (t < POWER_BLACK_MS) {
        drawPowerCollapse(fx, t);
      }
    });

    at(POWER_GLITCH_END_MS, () => {
      jitter.stop();
      setPhase("reel");
    });
    at(POWER_RAIN_FADE_AT_MS, fadeRain);
    at(POWER_REEL_END_MS, () => {
      setPhase("collapse");
      cinemaRef.current.audio?.powerCollapse();
    });
    at(POWER_BLACK_MS, () => {
      // Fully black: only now may the target theme replace the hacker palette.
      commitHackerCinema();
      setPhase("reveal");
    });
    at(POWER_DURATION_MS, () => finishHackerCinema(cinema.id));
    return cleanupRun;
    // One timeline per mounted run; audio swaps must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cinema.reducedMotion) {
    return (
      <div className="hacker-cinema" data-kind="power-down" data-phase={phase}>
        <span className="hacker-cinema-announcer" role="status" aria-live="polite">
          Hacker mode disabled.
        </span>
        <div className="hacker-cinema-screen hacker-cinema-screen--power hacker-cinema-reduced" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="hacker-cinema" data-kind="power-down" data-phase={phase}>
      <span className="hacker-cinema-announcer" role="status" aria-live="polite">
        Hacker mode disabled.
      </span>
      {/* Names the theme being restored so the first 1000ms — before the black
          frame paints it — still communicates the outcome of the selection. */}
      <div className="hacker-cinema-status" aria-hidden="true">
        [ RESTORING {cinema.target.toUpperCase()} THEME ]
      </div>
      <div className="hacker-cinema-screen hacker-cinema-screen--power" aria-hidden="true">
        <div className="hacker-cinema-shade" />
        <canvas ref={globeRef} className="hacker-cinema-canvas" />
        <canvas ref={fxRef} className="hacker-cinema-canvas" />
        <SkipHint label="press any key or tap to skip" />
      </div>
      <SoundButton on={audioOn} onToggle={toggleAudio} />
    </div>
  );
}

/* --- Entry ------------------------------------------------------------------- */

export function HackerCinema() {
  const cinema = useHackerCinema();
  if (!cinema) return null;
  return cinema.kind === "splash" ? (
    <SplashOverlay key={`splash-${cinema.id}`} cinema={cinema} />
  ) : (
    <PowerDownOverlay key={`power-down-${cinema.id}`} cinema={cinema} />
  );
}
