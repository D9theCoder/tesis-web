"use client";

import { useEffect, useRef } from "react";

import type { RainMode } from "@/lib/hacker-settings";
import {
  advanceHeadY,
  clamp,
  clampDevicePixelRatio,
  columnX,
  createRainColumn,
  hasLeftViewport,
  nextBurstDelay,
  nextBurstDuration,
  nextColumnSpeed,
  nextGlyphSwapDelay,
  nextTrailLength,
  pointerProximity,
  pointerSpeedFactor,
  RAIN_FADE_COLOR,
  RAIN_GLYPHS,
  RAIN_LAYER_ORDER,
  RAIN_LAYERS,
  rainColumnCount,
  rainIntensity,
  randomBetween,
  randomGlyphIndex,
  respawnHeadY,
  type RainColumnState,
  type RainLayer,
  type RainLayerPreset,
} from "@/lib/hacker-rain";

type RainCanvasProps = {
  mode: RainMode;
  reducedMotion: boolean;
  active: boolean;
  /**
   * Extra per-frame speed multiplier. The power-down cinematic raises this to
   * briefly accelerate the column heads; it rides a ref so changing it never
   * rebuilds the rain scene.
   */
  speedBoost?: number;
};

type GlyphAtlas = {
  canvas: HTMLCanvasElement;
  cellWidth: number;
  cellHeight: number;
  gridColumns: number;
};

type LayerAtlases = {
  body: GlyphAtlas;
  head: GlyphAtlas;
};

type LayerRuntime = {
  layer: RainLayer;
  preset: RainLayerPreset;
  atlases: LayerAtlases;
  cellWidth: number;
  cellHeight: number;
  columns: RainColumnState[];
  lastStep: number;
};

type BurstState = {
  layer: RainLayer;
  column: number;
};

const FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** Static (reduced-motion) pattern uses fewer, fainter columns. */
const STATIC_COLUMN_STRENGTH = 0.55;
const STATIC_ALPHA = 0.5;
const RESIZE_DEBOUNCE_MS = 150;

/**
 * Build the two offscreen glyph atlases (normal trail + brighter head) for one
 * depth layer. Text is rasterized once here; the animation loop only calls
 * drawImage.
 */
function buildLayerAtlases(preset: RainLayerPreset, dpr: number): LayerAtlases | null {
  if (typeof document === "undefined") return null;
  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  if (!measure) return null;

  const physicalFontSize = Math.max(1, preset.fontSize * dpr);
  const font = `${physicalFontSize}px ${FONT_STACK}`;
  measure.font = font;

  let widest = physicalFontSize;
  for (const glyph of RAIN_GLYPHS) {
    widest = Math.max(widest, measure.measureText(glyph).width);
  }
  const cellWidth = Math.ceil(widest) + Math.max(2, Math.ceil(physicalFontSize * 0.25));
  const cellHeight = Math.ceil(physicalFontSize * 1.25);
  const gridColumns = Math.max(1, Math.ceil(Math.sqrt(RAIN_GLYPHS.length)));
  const gridRows = Math.max(1, Math.ceil(RAIN_GLYPHS.length / gridColumns));

  const paintAtlas = (color: string): HTMLCanvasElement | null => {
    const atlas = document.createElement("canvas");
    atlas.width = Math.max(1, cellWidth * gridColumns);
    atlas.height = Math.max(1, cellHeight * gridRows);
    const context = atlas.getContext("2d");
    if (!context) return null;
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    for (let index = 0; index < RAIN_GLYPHS.length; index += 1) {
      const glyph = RAIN_GLYPHS[index] ?? "";
      const column = index % gridColumns;
      const row = Math.floor(index / gridColumns);
      context.fillText(
        glyph,
        column * cellWidth + cellWidth / 2,
        row * cellHeight + cellHeight / 2,
      );
    }
    return atlas;
  };

  const bodyCanvas = paintAtlas(preset.trailColor);
  const headCanvas = paintAtlas(preset.headColor);
  if (!bodyCanvas || !headCanvas) return null;

  return {
    body: { canvas: bodyCanvas, cellWidth, cellHeight, gridColumns },
    head: { canvas: headCanvas, cellWidth, cellHeight, gridColumns },
  };
}

/**
 * Blit one pre-rendered glyph. `x` and `y` are CSS pixels; the atlas cell is
 * rasterized at the capped device pixel ratio and scaled back down here.
 */
function drawAtlasGlyph(
  context: CanvasRenderingContext2D,
  atlas: GlyphAtlas,
  index: number,
  x: number,
  y: number,
  dpr: number,
): void {
  const safeIndex = index >= 0 && index < RAIN_GLYPHS.length ? index : 0;
  const sourceX = (safeIndex % atlas.gridColumns) * atlas.cellWidth;
  const sourceY = Math.floor(safeIndex / atlas.gridColumns) * atlas.cellHeight;
  context.drawImage(
    atlas.canvas,
    sourceX,
    sourceY,
    atlas.cellWidth,
    atlas.cellHeight,
    x,
    y,
    atlas.cellWidth / dpr,
    atlas.cellHeight / dpr,
  );
}

/**
 * Decorative hacker-rain backdrop. One fixed full-viewport canvas with three
 * overlapping depth layers, pre-rendered glyph atlases, pointer proximity,
 * periodic full-column bursts, and a static reduced-motion fallback.
 */
export function RainCanvas({ mode, reducedMotion, active, speedBoost = 1 }: RainCanvasProps): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Read per frame; a cinematic speed change must not rebuild the scene.
  const boostRef = useRef(speedBoost);

  useEffect(() => {
    boostRef.current = speedBoost;
  }, [speedBoost]);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let disposed = false;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let canvasLeft = 0;
    let resizeTimer: number | undefined;
    let frameId: number | undefined;
    let lastFrame = 0;
    let nearVisible = true;
    let pointerX: number | null = null;
    let layers: LayerRuntime[] = [];
    let burst: BurstState | null = null;
    let burstTimer: number | undefined;
    let burstEndTimer: number | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let nearObserver: IntersectionObserver | null = null;

    const nowMs = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const configureCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = canvas.clientWidth || rect.width || window.innerWidth || 1;
      const cssHeight = canvas.clientHeight || rect.height || window.innerHeight || 1;
      const nextWidth = Math.max(1, Math.round(cssWidth));
      const nextHeight = Math.max(1, Math.round(cssHeight));
      const nextDpr = clampDevicePixelRatio(window.devicePixelRatio || 1);
      canvasLeft = rect.left;
      if (nextWidth === width && nextHeight === height && nextDpr === dpr) return false;
      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      return true;
    };

    const attachResize = (onResize: () => void) => {
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(canvas);
      }
      window.addEventListener("resize", onResize);
    };

    /* ---------------------------------------------------------------- *
     * Reduced motion: one static, faint column pattern and no animation.
     * ---------------------------------------------------------------- */
    if (reducedMotion) {
      const paintStatic = () => {
        if (!configureCanvas()) return;
        for (const layer of RAIN_LAYER_ORDER) {
          const preset = RAIN_LAYERS[layer];
          const atlases = buildLayerAtlases(preset, dpr);
          if (!atlases) return;
          const count = Math.max(
            2,
            Math.round(rainColumnCount(layer, width, 1) * STATIC_COLUMN_STRENGTH),
          );
          const cellWidth = atlases.body.cellWidth / dpr;
          const cellHeight = atlases.body.cellHeight / dpr;
          for (let index = 0; index < count; index += 1) {
            const x = columnX(index, count, width);
            const length = nextTrailLength(preset);
            const headY = randomBetween(-cellHeight, height, Math.random);
            context.globalAlpha = clamp(preset.trailAlpha * STATIC_ALPHA, 0, 1);
            for (let cell = 1; cell < length; cell += 1) {
              const y = headY - cell * cellHeight;
              if (y < -cellHeight || y > height) continue;
              drawAtlasGlyph(
                context,
                atlases.body,
                randomGlyphIndex(),
                x - cellWidth / 2,
                y,
                dpr,
              );
            }
            if (headY >= -cellHeight && headY <= height) {
              context.globalAlpha = clamp(preset.headAlpha * STATIC_ALPHA, 0, 1);
              drawAtlasGlyph(
                context,
                atlases.head,
                randomGlyphIndex(),
                x - cellWidth / 2,
                headY,
                dpr,
              );
            }
          }
        }
        context.globalAlpha = 1;
      };

      const scheduleStaticRepaint = () => {
        if (disposed) return;
        if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          resizeTimer = undefined;
          if (!disposed) paintStatic();
        }, RESIZE_DEBOUNCE_MS);
      };

      paintStatic();
      attachResize(scheduleStaticRepaint);

      return () => {
        disposed = true;
        if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
        resizeObserver?.disconnect();
        window.removeEventListener("resize", scheduleStaticRepaint);
      };
    }

    /* ---------------------------------------------------------------- *
     * Motion off: leave the canvas empty.
     * ---------------------------------------------------------------- */
    if (mode === "off") {
      configureCanvas();
      context.clearRect(0, 0, width, height);
      return;
    }

    /* ---------------------------------------------------------------- *
     * Animated rain.
     * ---------------------------------------------------------------- */
    const intensity = rainIntensity(mode);
    const alphaStrength = 0.65 + 0.35 * intensity;

    const buildScene = (): boolean => {
      const nextLayers: LayerRuntime[] = [];
      const start = nowMs();
      for (const layer of RAIN_LAYER_ORDER) {
        const preset = RAIN_LAYERS[layer];
        const atlases = buildLayerAtlases(preset, dpr);
        if (!atlases) return false;
        const count = rainColumnCount(layer, width, intensity);
        if (count <= 0) continue;
        const cellHeight = atlases.body.cellHeight / dpr;
        const columns: RainColumnState[] = [];
        for (let index = 0; index < count; index += 1) {
          columns.push(
            createRainColumn({
              x: columnX(index, count, width),
              viewportHeight: height,
              cellHeight,
              preset,
              intensity,
              now: start,
            }),
          );
        }
        nextLayers.push({
          layer,
          preset,
          atlases,
          cellWidth: atlases.body.cellWidth / dpr,
          cellHeight,
          columns,
          lastStep: 0,
        });
      }
      layers = nextLayers;
      return nextLayers.length > 0;
    };

    const isBursting = (runtime: LayerRuntime, index: number): boolean =>
      burst !== null && burst.layer === runtime.layer && burst.column === index;

    const updateLayer = (runtime: LayerRuntime, timestamp: number, deltaMs: number) => {
      const { cellHeight, preset } = runtime;
      for (const column of runtime.columns) {
        const proximity =
          pointerX === null ? 0 : pointerProximity(Math.abs(column.x - pointerX));
        column.headY = advanceHeadY(
          column.headY,
          column.speed,
          deltaMs,
          pointerSpeedFactor(proximity) * boostRef.current,
        );

        if (timestamp >= column.swapAt) {
          const swaps = 1 + Math.floor(Math.random() * 3);
          for (let swap = 0; swap < swaps; swap += 1) {
            if (column.glyphs.length === 0) break;
            const target = Math.floor(Math.random() * column.glyphs.length);
            column.glyphs[target] = randomGlyphIndex();
          }
          column.headGlyph = randomGlyphIndex();
          column.swapAt = timestamp + nextGlyphSwapDelay(preset);
        }

        if (hasLeftViewport(column.headY, column.length, cellHeight, height)) {
          column.headY = respawnHeadY(height, cellHeight);
          column.speed = nextColumnSpeed(preset, intensity);
          column.length = nextTrailLength(preset);
          column.headGlyph = randomGlyphIndex();
          column.swapAt = timestamp + nextGlyphSwapDelay(preset);
        }
      }
    };

    const drawLayer = (runtime: LayerRuntime) => {
      const { body, head } = runtime.atlases;
      const { cellWidth, cellHeight, preset } = runtime;
      for (let index = 0; index < runtime.columns.length; index += 1) {
        const column = runtime.columns[index];
        if (!column) continue;
        const proximity =
          pointerX === null ? 0 : pointerProximity(Math.abs(column.x - pointerX));
        const bursting = isBursting(runtime, index);
        const trailAtlas = bursting ? head : body;

        context.globalAlpha = clamp(
          preset.trailAlpha * alphaStrength +
            proximity * 0.3 +
            (bursting ? 0.45 : 0),
          0,
          1,
        );
        for (let cell = 1; cell < column.length; cell += 1) {
          const y = column.headY - cell * cellHeight;
          if (y < -cellHeight || y > height) continue;
          const glyph = column.glyphs[cell] ?? column.headGlyph;
          drawAtlasGlyph(
            context,
            trailAtlas,
            glyph,
            column.x - cellWidth / 2,
            y,
            dpr,
          );
        }

        if (column.headY >= -cellHeight && column.headY <= height) {
          context.globalAlpha = clamp(
            preset.headAlpha * alphaStrength +
              proximity * 0.3 +
              (bursting ? 0.2 : 0),
            0,
            1,
          );
          drawAtlasGlyph(
            context,
            head,
            column.headGlyph,
            column.x - cellWidth / 2,
            column.headY,
            dpr,
          );
        }

        // A rare burst brightens the whole column, not just the falling trail.
        // Draw a sparse full-height line from the pre-rendered atlas so the
        // moment reads as a screen event without extra text shaping.
        if (bursting) {
          const fullCells = Math.ceil(height / cellHeight) + 1;
          for (let cell = 0; cell < fullCells; cell += 1) {
            if (cell % 2 !== 0) continue;
            const y = cell * cellHeight;
            context.globalAlpha = clamp(
              0.2 + 0.45 * (1 - cell / fullCells),
              0,
              1,
            );
            drawAtlasGlyph(
              context,
              head,
              column.glyphs[cell % Math.max(1, column.length)] ?? column.headGlyph,
              column.x - cellWidth / 2,
              y,
              dpr,
            );
          }
        }
      }
    };

    const frame = (timestamp: number) => {
      frameId = undefined;
      if (disposed || document.visibilityState === "hidden") return;

      const deltaMs =
        lastFrame === 0 ? 16.7 : Math.min(100, Math.max(0, timestamp - lastFrame));
      lastFrame = timestamp;

      context.globalCompositeOperation = "source-over";
      context.fillStyle = RAIN_FADE_COLOR;
      context.fillRect(0, 0, width, height);

      for (const runtime of layers) {
        if (runtime.layer === "near" && !nearVisible) {
          runtime.lastStep = timestamp;
          continue;
        }
        const stepMs = runtime.preset.stepMs;
        if (stepMs > 0 && timestamp - runtime.lastStep < stepMs) continue;
        const layerDelta =
          runtime.lastStep === 0
            ? Math.min(deltaMs, stepMs > 0 ? stepMs : deltaMs)
            : Math.min(100, timestamp - runtime.lastStep);
        runtime.lastStep = timestamp;
        updateLayer(runtime, timestamp, layerDelta);
        drawLayer(runtime);
      }

      context.globalAlpha = 1;
      frameId = window.requestAnimationFrame(frame);
    };

    const startLoop = () => {
      if (disposed || frameId !== undefined) return;
      if (typeof window.requestAnimationFrame !== "function") return;
      if (document.visibilityState === "hidden") return;
      lastFrame = 0;
      for (const runtime of layers) runtime.lastStep = 0;
      frameId = window.requestAnimationFrame(frame);
    };

    const stopLoop = () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
        frameId = undefined;
      }
    };

    const scheduleBurst = () => {
      if (disposed) return;
      if (burstTimer !== undefined) window.clearTimeout(burstTimer);
      burstTimer = window.setTimeout(() => {
        burstTimer = undefined;
        if (disposed) return;
        if (document.visibilityState === "hidden") {
          scheduleBurst();
          return;
        }
        const candidates = layers.filter(runtime => runtime.columns.length > 0);
        if (candidates.length === 0) {
          scheduleBurst();
          return;
        }
        const runtime = candidates[Math.floor(Math.random() * candidates.length)];
        if (!runtime) {
          scheduleBurst();
          return;
        }
        const column = Math.floor(Math.random() * runtime.columns.length);
        burst = { layer: runtime.layer, column };
        burstEndTimer = window.setTimeout(() => {
          burstEndTimer = undefined;
          burst = null;
          scheduleBurst();
        }, nextBurstDuration());
      }, nextBurstDelay());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopLoop();
      } else {
        startLoop();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerX = event.clientX - canvasLeft;
    };

    const clearPointer = () => {
      pointerX = null;
    };

    const resizeScene = () => {
      const previousDpr = dpr;
      if (!configureCanvas()) return;
      // A route can add/remove a scrollbar. Keep existing heads, glyphs and
      // animation clocks when fitting the canvas to its new bounds.
      for (const runtime of layers) {
        if (dpr !== previousDpr) {
          const atlases = buildLayerAtlases(runtime.preset, dpr);
          if (!atlases) continue;
          runtime.atlases = atlases;
          runtime.cellWidth = atlases.body.cellWidth / dpr;
          runtime.cellHeight = atlases.body.cellHeight / dpr;
        }
        const count = rainColumnCount(runtime.layer, width, intensity);
        runtime.columns.length = Math.min(runtime.columns.length, count);
        for (let index = 0; index < count; index += 1) {
          const x = columnX(index, count, width);
          const column = runtime.columns[index];
          if (column) column.x = x;
          else runtime.columns.push(createRainColumn({
            x, viewportHeight: height, cellHeight: runtime.cellHeight,
            preset: runtime.preset, intensity, now: nowMs(),
          }));
        }
        if (runtime.layer !== "near" || nearVisible) drawLayer(runtime);
      }
      context.globalAlpha = 1;
    };

    const scheduleResize = () => {
      if (disposed) return;
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = undefined;
        if (!disposed) resizeScene();
      }, RESIZE_DEBOUNCE_MS);
    };

    configureCanvas();
    if (!buildScene()) return;

    attachResize(scheduleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("blur", clearPointer);
    document.addEventListener("pointerleave", clearPointer);

    if (typeof IntersectionObserver !== "undefined") {
      nearObserver = new IntersectionObserver(entries => {
        const entry = entries[entries.length - 1];
        if (entry) nearVisible = entry.isIntersecting;
      });
      nearObserver.observe(canvas);
    }

    scheduleBurst();
    startLoop();

    return () => {
      disposed = true;
      stopLoop();
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      if (burstTimer !== undefined) window.clearTimeout(burstTimer);
      if (burstEndTimer !== undefined) window.clearTimeout(burstEndTimer);
      resizeObserver?.disconnect();
      nearObserver?.disconnect();
      window.removeEventListener("resize", scheduleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", clearPointer);
      document.removeEventListener("pointerleave", clearPointer);
    };
  }, [active, mode, reducedMotion]);

  if (!active) return null;

  return <canvas ref={canvasRef} className="hacker-rain" aria-hidden="true" />;
}
