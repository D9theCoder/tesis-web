import { describe, expect, it } from "vitest";
import {
  advanceHeadY,
  BURST_MAX_DELAY_MS,
  BURST_MAX_DURATION_MS,
  BURST_MIN_DELAY_MS,
  BURST_MIN_DURATION_MS,
  clamp,
  clampDevicePixelRatio,
  columnX,
  createRainColumn,
  hasLeftViewport,
  initialHeadY,
  isMobileViewport,
  MAX_DEVICE_PIXEL_RATIO,
  MOBILE_BREAKPOINT,
  nextBurstDelay,
  nextBurstDuration,
  nextColumnSpeed,
  nextGlyphSwapDelay,
  nextTrailLength,
  pointerProximity,
  pointerSpeedFactor,
  RAIN_GLYPHS,
  RAIN_INTENSITY,
  RAIN_LAYER_ORDER,
  RAIN_LAYERS,
  rainColumnCount,
  rainIntensity,
  randomBetween,
  respawnHeadY,
} from "@/lib/hacker-rain";

const half = () => 0.5;

describe("rain glyph set", () => {
  it("mixes half-width katakana, hex digits, brackets, and shade blocks", () => {
    const expected = ["ｱ", "ﾜ", "0", "9", "A", "F", "<", ">", "/", "{", "}", "[", "]", "░", "▒", "▓"];
    for (const glyph of expected) {
      expect(RAIN_GLYPHS).toContain(glyph);
    }
    const katakana = RAIN_GLYPHS.filter((glyph) => {
      const codePoint = glyph.codePointAt(0) ?? 0;
      return codePoint >= 0xff66 && codePoint <= 0xff9d;
    });
    expect(katakana.length).toBeGreaterThanOrEqual(40);
  });

  it("contains only unique single-character glyphs", () => {
    expect(new Set(RAIN_GLYPHS).size).toBe(RAIN_GLYPHS.length);
    for (const glyph of RAIN_GLYPHS) {
      expect(Array.from(glyph)).toHaveLength(1);
    }
  });
});

describe("layer presets and intensity", () => {
  it("orders far, mid, near from small and dim to large and bright", () => {
    expect(RAIN_LAYER_ORDER).toEqual(["far", "mid", "near"]);
    const far = RAIN_LAYERS.far;
    const mid = RAIN_LAYERS.mid;
    const near = RAIN_LAYERS.near;
    expect(far.fontSize).toBeLessThan(mid.fontSize);
    expect(mid.fontSize).toBeLessThan(near.fontSize);
    expect(far.maxSpeed).toBeLessThan(mid.maxSpeed);
    expect(mid.maxSpeed).toBeLessThan(near.maxSpeed);
    expect(far.trailAlpha).toBeLessThan(near.trailAlpha);
    expect(far.stepMs).toBeGreaterThan(0);
    expect(mid.stepMs).toBeGreaterThan(0);
    expect(near.stepMs).toBe(0);
    expect(far.stepMs).toBeCloseTo(1000 / 30, 5);
    expect(mid.stepMs).toBeCloseTo(1000 / 30, 5);
  });

  it("maps off to idle, normal to a lighter storm, and max to full strength", () => {
    expect(rainIntensity("off")).toBe(0);
    expect(rainIntensity("normal")).toBeGreaterThan(0);
    expect(rainIntensity("normal")).toBeLessThan(1);
    expect(rainIntensity("max")).toBe(1);
    expect(RAIN_INTENSITY.max).toBe(1);
  });
});

describe("column counts", () => {
  it("uses the full preset count at desktop width and full intensity", () => {
    expect(rainColumnCount("far", 1280, 1)).toBe(RAIN_LAYERS.far.columns);
    expect(rainColumnCount("mid", 1280, 1)).toBe(RAIN_LAYERS.mid.columns);
    expect(rainColumnCount("near", 1280, 1)).toBe(RAIN_LAYERS.near.columns);
  });

  it("halves every layer below the mobile breakpoint", () => {
    expect(MOBILE_BREAKPOINT).toBe(768);
    expect(isMobileViewport(767)).toBe(true);
    expect(isMobileViewport(768)).toBe(false);
    expect(isMobileViewport(Number.NaN)).toBe(false);
    for (const layer of RAIN_LAYER_ORDER) {
      const desktop = rainColumnCount(layer, 1024, 1);
      const mobile = rainColumnCount(layer, 480, 1);
      expect(mobile).toBe(Math.round(desktop / 2));
    }
  });

  it("scales with intensity and stays empty when off", () => {
    expect(rainColumnCount("far", 1024, 0)).toBe(0);
    expect(rainColumnCount("far", 1024, 0.65)).toBeLessThan(RAIN_LAYERS.far.columns);
    expect(rainColumnCount("far", 1024, 0.65)).toBeGreaterThan(0);
    expect(rainColumnCount("far", 1024, 2)).toBe(RAIN_LAYERS.far.columns);
  });
});

describe("viewport and pixel-ratio math", () => {
  it("clamps values and handles non-finite input", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(13, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
    expect(clamp(5, 10, 0)).toBe(10);
  });

  it("caps device pixel ratio at two and never drops below one", () => {
    expect(MAX_DEVICE_PIXEL_RATIO).toBe(2);
    expect(clampDevicePixelRatio(3)).toBe(2);
    expect(clampDevicePixelRatio(1.25)).toBe(1.25);
    expect(clampDevicePixelRatio(0.5)).toBe(1);
    expect(clampDevicePixelRatio(0)).toBe(1);
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
    expect(clampDevicePixelRatio(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("produces bounded random ranges", () => {
    expect(randomBetween(10, 20, half)).toBe(15);
    expect(randomBetween(10, 20, () => 2)).toBe(20);
    expect(randomBetween(10, 20, () => Number.NaN)).toBe(10);
    expect(randomBetween(20, 10, half)).toBe(20);
  });
});

describe("column spawn and respawn math", () => {
  it("spreads columns evenly with bounded jitter", () => {
    expect(columnX(0, 4, 1000, half)).toBe(125);
    expect(columnX(3, 4, 1000, half)).toBe(875);
    expect(columnX(0, 4, 1000, () => 0)).toBeGreaterThanOrEqual(0);
    expect(columnX(0, 4, 1000, () => 1)).toBeLessThanOrEqual(1000);
    expect(columnX(2, 1, 0, half)).toBe(0.5);
  });

  it("starts new heads inside the viewport and restarts them above it", () => {
    const initial = initialHeadY(600, 12, half);
    expect(initial).toBeGreaterThanOrEqual(-600);
    expect(initial).toBeLessThan(600);

    for (const random of [0, 0.25, 0.5, 0.75, 1]) {
      const respawn = respawnHeadY(600, 12, () => random);
      expect(respawn).toBeLessThan(0);
      expect(respawn).toBeGreaterThanOrEqual(-12 - Math.max(12, 600 * 0.35));
    }
  });

  it("detects when a head and its full trail have left the viewport", () => {
    expect(hasLeftViewport(100, 5, 10, 40)).toBe(true);
    expect(hasLeftViewport(40, 5, 10, 40)).toBe(false);
    expect(hasLeftViewport(89, 5, 10, 40)).toBe(false);
    expect(hasLeftViewport(91, 5, 10, 40)).toBe(true);
  });

  it("advances by speed and caps long frame stalls", () => {
    expect(advanceHeadY(10, 100, 250)).toBeCloseTo(35, 5);
    expect(advanceHeadY(0, 100, 1000)).toBeCloseTo(25, 5);
    expect(advanceHeadY(0, 100, -20)).toBe(0);
    expect(advanceHeadY(10, 100, 250, 2)).toBeCloseTo(60, 5);
    expect(advanceHeadY(Number.NaN, 100, 250)).toBe(0);
  });

  it("randomizes speeds, lengths, and swap delays within presets", () => {
    for (const layer of RAIN_LAYER_ORDER) {
      const preset = RAIN_LAYERS[layer];
      for (const random of [0, 0.5, 1]) {
        const speed = nextColumnSpeed(preset, 1, () => random);
        expect(speed).toBeGreaterThanOrEqual(preset.minSpeed);
        expect(speed).toBeLessThanOrEqual(preset.maxSpeed);

        const slowSpeed = nextColumnSpeed(preset, 0.65, () => random);
        expect(slowSpeed).toBeLessThanOrEqual(speed + 1e-9);

        const length = nextTrailLength(preset, () => random);
        expect(Number.isInteger(length)).toBe(true);
        expect(length).toBeGreaterThanOrEqual(preset.minLength);
        expect(length).toBeLessThanOrEqual(preset.maxLength);

        const delay = nextGlyphSwapDelay(preset, () => random);
        expect(delay).toBeGreaterThanOrEqual(preset.swapMsMin);
        expect(delay).toBeLessThanOrEqual(preset.swapMsMax);
      }
    }
  });

  it("builds a preallocated column with valid glyph indices", () => {
    const preset = RAIN_LAYERS.mid;
    const column = createRainColumn({
      x: 42,
      viewportHeight: 700,
      cellHeight: 17,
      preset,
      now: 1000,
      intensity: 1,
      random: half,
    });

    expect(column.x).toBe(42);
    expect(column.glyphs).toHaveLength(preset.maxLength);
    for (const glyph of column.glyphs) {
      expect(Number.isInteger(glyph)).toBe(true);
      expect(glyph).toBeGreaterThanOrEqual(0);
      expect(glyph).toBeLessThan(RAIN_GLYPHS.length);
    }
    expect(column.headGlyph).toBeGreaterThanOrEqual(0);
    expect(column.headGlyph).toBeLessThan(RAIN_GLYPHS.length);
    expect(column.length).toBeGreaterThanOrEqual(preset.minLength);
    expect(column.length).toBeLessThanOrEqual(preset.maxLength);
    expect(column.speed).toBeGreaterThanOrEqual(preset.minSpeed);
    expect(column.speed).toBeLessThanOrEqual(preset.maxSpeed);
    expect(column.headY).toBeGreaterThanOrEqual(-700);
    expect(column.headY).toBeLessThan(700);
    expect(column.swapAt).toBeGreaterThanOrEqual(1000 + preset.swapMsMin);
    expect(column.swapAt).toBeLessThanOrEqual(1000 + preset.swapMsMax);
  });
});

describe("pointer and burst timing", () => {
  it("falls off linearly from the pointer", () => {
    expect(pointerProximity(0)).toBe(1);
    expect(pointerProximity(65)).toBeCloseTo(0.5, 5);
    expect(pointerProximity(999)).toBe(0);
    expect(pointerProximity(-65)).toBeCloseTo(0.5, 5);
    expect(pointerProximity(10, 0)).toBe(0);
    expect(pointerProximity(Number.NaN)).toBe(0);
    expect(pointerSpeedFactor(0)).toBe(1);
    expect(pointerSpeedFactor(1)).toBeCloseTo(1.35, 5);
    expect(pointerSpeedFactor(2)).toBeCloseTo(1.35, 5);
  });

  it("keeps bursts inside the six-to-eleven-second window", () => {
    expect(nextBurstDelay(() => 0)).toBe(BURST_MIN_DELAY_MS);
    expect(nextBurstDelay(() => 1)).toBe(BURST_MAX_DELAY_MS);
    expect(nextBurstDelay(() => 0.5)).toBeGreaterThanOrEqual(BURST_MIN_DELAY_MS);
    expect(nextBurstDelay(() => 0.5)).toBeLessThanOrEqual(BURST_MAX_DELAY_MS);
    expect(nextBurstDuration(() => 0)).toBe(BURST_MIN_DURATION_MS);
    expect(nextBurstDuration(() => 1)).toBe(BURST_MAX_DURATION_MS);
    expect(nextBurstDuration(half)).toBeGreaterThanOrEqual(BURST_MIN_DURATION_MS);
    expect(nextBurstDuration(half)).toBeLessThanOrEqual(BURST_MAX_DURATION_MS);
  });
});
