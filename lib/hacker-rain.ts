/**
 * Pure helpers and tuning constants for the hacker-mode rain canvas.
 *
 * Nothing here touches the DOM: the component owns the canvas, glyph atlases,
 * observers, and animation loop, while these helpers stay deterministic enough
 * to unit test under jsdom.
 */

import type { RainMode } from "@/lib/hacker-settings";

export type RandomSource = () => number;

export type RainLayer = "far" | "mid" | "near";

/** Painter's order: far first, near last. */
export const RAIN_LAYER_ORDER: readonly RainLayer[] = ["far", "mid", "near"];

/** Half-width katakana plus hex digits, brackets, and shade blocks. */
export const RAIN_GLYPHS: readonly string[] = Object.freeze([
  ..."ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟｰ",
  ..."0123456789",
  ..."ABCDEF",
  "<",
  ">",
  "/",
  "\\",
  "{",
  "}",
  "[",
  "]",
  "░",
  "▒",
  "▓",
  "-",
]);

export type RainLayerPreset = {
  /** Column count at full intensity, before mobile halving. */
  columns: number;
  /** CSS-pixel glyph size. */
  fontSize: number;
  /** Full-intensity head speed range, in CSS pixels per second. */
  minSpeed: number;
  maxSpeed: number;
  /** Trail length range, in glyph cells. */
  minLength: number;
  maxLength: number;
  /**
   * Minimum time between movement updates. Far and mid are capped near 30fps;
   * near is 0 so it redraws on every animation frame.
   */
  stepMs: number;
  /** Base opacity for trail glyphs. */
  trailAlpha: number;
  /** Base opacity for the leading glyph. */
  headAlpha: number;
  /** Delay range between small trail-glyph mutations. */
  swapMsMin: number;
  swapMsMax: number;
  trailColor: string;
  headColor: string;
};

export const RAIN_LAYERS: Record<RainLayer, RainLayerPreset> = {
  far: {
    columns: 56,
    fontSize: 10,
    minSpeed: 20,
    maxSpeed: 42,
    minLength: 6,
    maxLength: 14,
    stepMs: 1000 / 30,
    trailAlpha: 0.26,
    headAlpha: 0.58,
    swapMsMin: 220,
    swapMsMax: 460,
    trailColor: "#0a5c2a",
    headColor: "#49c46f",
  },
  mid: {
    columns: 34,
    fontSize: 14,
    minSpeed: 46,
    maxSpeed: 96,
    minLength: 8,
    maxLength: 18,
    stepMs: 1000 / 30,
    trailAlpha: 0.38,
    headAlpha: 0.78,
    swapMsMin: 190,
    swapMsMax: 400,
    trailColor: "#11a34b",
    headColor: "#7dffab",
  },
  near: {
    columns: 16,
    fontSize: 22,
    minSpeed: 92,
    maxSpeed: 190,
    minLength: 10,
    maxLength: 24,
    stepMs: 0,
    trailAlpha: 0.5,
    headAlpha: 0.95,
    swapMsMin: 160,
    swapMsMax: 340,
    trailColor: "#52e88b",
    headColor: "#d8ffe6",
  },
};

/** Below this CSS viewport width the column counts are halved. */
export const MOBILE_BREAKPOINT = 768;

/** Device pixel ratio is capped so huge displays do not multiply fill cost. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** Translucent per-frame fill that turns falling glyphs into trails. */
export const RAIN_FADE_COLOR = "rgba(5, 8, 5, 0.16)";

/** Horizontal distance in CSS pixels within which the pointer lifts columns. */
export const POINTER_RADIUS = 130;
export const POINTER_SPEED_BOOST = 0.35;
export const POINTER_ALPHA_BOOST = 0.3;

export const BURST_MIN_DELAY_MS = 6000;
export const BURST_MAX_DELAY_MS = 11000;
export const BURST_MIN_DURATION_MS = 400;
export const BURST_MAX_DURATION_MS = 500;

/** Off is idle, normal is a lighter storm, max is full strength. */
export const RAIN_INTENSITY: Record<RainMode, number> = {
  off: 0,
  normal: 0.65,
  max: 1,
};

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || min > max) return min;
  return Math.min(max, Math.max(min, value));
}

/** Uniform float in [min, max]. Degenerate or non-finite ranges return min. */
export function randomBetween(min: number, max: number, random: RandomSource = Math.random): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min;
  const value = random();
  const normalized = Number.isFinite(value) ? clamp(value, 0, 1) : 0;
  return min + normalized * (max - min);
}

function randomIndex(length: number, random: RandomSource): number {
  if (!Number.isFinite(length) || length <= 0) return 0;
  const value = random();
  const normalized = Number.isFinite(value) ? clamp(value, 0, 1) : 0;
  return Math.min(length - 1, Math.floor(normalized * length));
}

/** A random index into RAIN_GLYPHS. */
export function randomGlyphIndex(random: RandomSource = Math.random): number {
  return randomIndex(RAIN_GLYPHS.length, random);
}

export function isMobileViewport(viewportWidth: number): boolean {
  return Number.isFinite(viewportWidth) && viewportWidth < MOBILE_BREAKPOINT;
}

export function rainIntensity(mode: RainMode): number {
  return RAIN_INTENSITY[mode];
}

/**
 * Per-layer column count for a viewport. Intensity scales the max-strength
 * preset count; narrow viewports halve the result (rounding up so tiny layers
 * do not disappear).
 */
export function rainColumnCount(layer: RainLayer, viewportWidth: number, intensity = 1): number {
  const strength = clamp(intensity, 0, 1);
  if (strength <= 0) return 0;
  const preset = RAIN_LAYERS[layer];
  const full = Math.max(1, Math.round(preset.columns * strength));
  if (isMobileViewport(viewportWidth)) return Math.max(1, Math.round(full / 2));
  return full;
}

export function clampDevicePixelRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return clamp(value, 1, MAX_DEVICE_PIXEL_RATIO);
}

/** Base speed for a new column, scaled by storm intensity. */
export function nextColumnSpeed(
  preset: RainLayerPreset,
  intensity = 1,
  random: RandomSource = Math.random,
): number {
  const base = randomBetween(preset.minSpeed, preset.maxSpeed, random);
  const factor = 0.55 + 0.45 * clamp(intensity, 0, 1);
  return base * factor;
}

/** Integer trail length within the preset's inclusive range. */
export function nextTrailLength(
  preset: RainLayerPreset,
  random: RandomSource = Math.random,
): number {
  const value = Math.floor(randomBetween(preset.minLength, preset.maxLength + 1, random));
  return clamp(value, preset.minLength, preset.maxLength);
}

export function nextGlyphSwapDelay(
  preset: RainLayerPreset,
  random: RandomSource = Math.random,
): number {
  return Math.round(randomBetween(preset.swapMsMin, preset.swapMsMax, random));
}

export function nextBurstDelay(random: RandomSource = Math.random): number {
  return Math.round(randomBetween(BURST_MIN_DELAY_MS, BURST_MAX_DELAY_MS, random));
}

export function nextBurstDuration(random: RandomSource = Math.random): number {
  return Math.round(randomBetween(BURST_MIN_DURATION_MS, BURST_MAX_DURATION_MS, random));
}

/** 1 at the pointer, fading linearly to 0 at the radius. */
export function pointerProximity(distance: number, radius = POINTER_RADIUS): number {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 0;
  return clamp(1 - Math.abs(distance) / radius, 0, 1);
}

/** Slight speed lift for columns near the pointer. */
export function pointerSpeedFactor(proximity: number): number {
  return 1 + POINTER_SPEED_BOOST * clamp(proximity, 0, 1);
}

/** Evenly spread column center with a small deterministic jitter. */
export function columnX(
  index: number,
  count: number,
  viewportWidth: number,
  random: RandomSource = Math.random,
): number {
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1;
  const safeCount = Math.max(1, Math.floor(count));
  const slot = width / safeCount;
  const center = (clamp(index, 0, safeCount - 1) + 0.5) * slot;
  const jitter = slot * 0.3;
  return clamp(center + randomBetween(-jitter, jitter, random), 0, width);
}

/** A fresh column head starts somewhere in (or above) the viewport. */
export function initialHeadY(
  viewportHeight: number,
  cellHeight: number,
  random: RandomSource = Math.random,
): number {
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
  const cell = Number.isFinite(cellHeight) && cellHeight > 0 ? cellHeight : 1;
  return randomBetween(-height, height - cell, random);
}

/** After leaving the screen, a column restarts above the top edge. */
export function respawnHeadY(
  viewportHeight: number,
  cellHeight: number,
  random: RandomSource = Math.random,
): number {
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
  const cell = Number.isFinite(cellHeight) && cellHeight > 0 ? cellHeight : 1;
  return -cell - randomBetween(0, Math.max(cell, height * 0.35), random);
}

/** True once the head and its whole trail have dropped below the viewport. */
export function hasLeftViewport(
  headY: number,
  length: number,
  cellHeight: number,
  viewportHeight: number,
): boolean {
  return (
    Number.isFinite(headY) &&
    headY - Math.max(0, length) * Math.max(0, cellHeight) > viewportHeight
  );
}

/** Advance a head position; long stalls are capped so tab restores stay calm. */
export function advanceHeadY(
  headY: number,
  speedPerSecond: number,
  deltaMs: number,
  speedFactor = 1,
): number {
  if (!Number.isFinite(headY)) return 0;
  const delta = clamp(deltaMs, 0, 250) / 1000;
  const speed = Number.isFinite(speedPerSecond) ? Math.max(0, speedPerSecond) : 0;
  const factor = Number.isFinite(speedFactor) ? Math.max(0, speedFactor) : 0;
  return headY + speed * delta * factor;
}

export type RainColumnState = {
  /** Column center in CSS pixels. */
  x: number;
  /** Leading glyph top in CSS pixels. */
  headY: number;
  /** Current full-intensity-relative speed in CSS pixels per second. */
  speed: number;
  /** Number of trail glyphs to draw. */
  length: number;
  /** Glyph atlas indices, sized to the preset's maxLength once. */
  glyphs: number[];
  headGlyph: number;
  /** Timestamp (ms) when a few glyphs should next mutate. */
  swapAt: number;
};

export type CreateRainColumnOptions = {
  x: number;
  viewportHeight: number;
  cellHeight: number;
  preset: RainLayerPreset;
  now: number;
  intensity?: number;
  random?: RandomSource;
};

/** Build one column with a preallocated glyph buffer and randomized state. */
export function createRainColumn(options: CreateRainColumnOptions): RainColumnState {
  const random = options.random ?? Math.random;
  const intensity = options.intensity ?? 1;
  const glyphs = new Array<number>(options.preset.maxLength);
  for (let index = 0; index < glyphs.length; index += 1) {
    glyphs[index] = randomGlyphIndex(random);
  }
  return {
    x: options.x,
    headY: initialHeadY(options.viewportHeight, options.cellHeight, random),
    speed: nextColumnSpeed(options.preset, intensity, random),
    length: nextTrailLength(options.preset, random),
    glyphs,
    headGlyph: randomGlyphIndex(random),
    swapAt: options.now + nextGlyphSwapDelay(options.preset, random),
  };
}
