/**
 * Pure sizing and persistence helpers for the live monitor's resizable
 * workspace. The dashboard keeps three stacked runtime panels and one right
 * rail; everything here is deterministic and independent of React so the
 * clamping rules can be unit tested.
 */

export const RAIL_DEFAULT_WIDTH = 330;
export const RAIL_MIN_WIDTH = 280;
/** Widest the rail may grow; the graph keeps whatever is left. */
export const RAIL_MAX_WIDTH = 720;
export const RAIL_MAX_VIEWPORT_RATIO = 0.6;
/** The graph stops the rail from growing past this width. */
export const GRAPH_MIN_WIDTH = 400;
/**
 * Fixed space left of the graph: the 216px navigation sidebar, the 24px page
 * gutters, the 16px splitter, and scrollbar slack on wide viewports.
 */
const WORKSPACE_CHROME_WIDTH = 300;

/** Below this width the rail is not rendered at all: the layout stacks. */
export const WIDE_LAYOUT_MIN_WIDTH = 1201;

export const DASHBOARD_MIN_HEIGHT = 480;
export const DASHBOARD_MAX_HEIGHT = 1400;

export const PANEL_MIN_HEIGHT = 120;
export const PANEL_COUNT = 3;
export const PANEL_WEIGHTS: readonly number[] = [3, 4, 3];
export const SPLITTER_SIZE = 16;

export const KEYBOARD_STEP = 16;
export const KEYBOARD_LARGE_STEP = 64;

export const RAIL_STORAGE_KEY = "tesis.live.rail.v1";
export const PANEL_STORAGE_KEY = "tesis.live.panels.v1";
export const DASHBOARD_HEIGHT_KEY = "tesis.live.height.v1";

/** Clamp a number into an inclusive range. Non-finite values fall back to min. */
export function clamp(value: number, min: number, max: number): number {
  const upper = Math.max(min, max);
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), upper);
}

/**
 * The widest rail allowed for the current viewport. On wide screens it may claim
 * 60% of the viewport and up to 720px, but never so much that the graph drops
 * below `GRAPH_MIN_WIDTH`; stacked layouts keep the plain proportional bound,
 * because the rail is not rendered there.
 */
export function railMaxWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return RAIL_MAX_WIDTH;
  }
  const ratioLimit = Math.floor(viewportWidth * RAIL_MAX_VIEWPORT_RATIO);
  const ceiling =
    viewportWidth < WIDE_LAYOUT_MIN_WIDTH
      ? Math.min(RAIL_MAX_WIDTH, ratioLimit)
      : Math.min(
          RAIL_MAX_WIDTH,
          ratioLimit,
          Math.floor(viewportWidth - WORKSPACE_CHROME_WIDTH - GRAPH_MIN_WIDTH),
        );
  return Math.max(RAIL_MIN_WIDTH, ceiling);
}

export function clampRailWidth(width: number, viewportWidth: number): number {
  return clamp(width, RAIL_MIN_WIDTH, railMaxWidth(viewportWidth));
}

/** The whole graph/outcomes workspace can grow past the CSS default. */
export function clampDashboardHeight(height: number): number {
  return clamp(height, DASHBOARD_MIN_HEIGHT, DASHBOARD_MAX_HEIGHT);
}

/** Arrow-key step in CSS pixels; Shift gives a coarse adjustment. */
export function keyboardStep(shiftKey: boolean): number {
  return shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
}

/** Pixel space available to panel rows after the two horizontal splitters. */
export function panelTrackHeight(
  containerHeight: number,
  count = PANEL_COUNT,
  handleSize = SPLITTER_SIZE,
): number {
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) return 0;
  const handles = Math.max(0, count - 1) * Math.max(0, handleSize);
  return Math.max(0, Math.floor(containerHeight) - handles);
}

/**
 * Reduce the configured 120px floor when the rail is so short that three
 * panels cannot honour it. This keeps the row total from overflowing.
 */
export function effectivePanelMin(
  containerHeight: number,
  minHeight = PANEL_MIN_HEIGHT,
  count = PANEL_COUNT,
  handleSize = SPLITTER_SIZE,
): number {
  const available = panelTrackHeight(containerHeight, count, handleSize);
  if (count <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(minHeight), Math.floor(available / count)));
}

/** Largest height one panel may occupy while its siblings keep the floor. */
export function panelMaxHeight(
  containerHeight: number,
  minHeight = PANEL_MIN_HEIGHT,
  count = PANEL_COUNT,
  handleSize = SPLITTER_SIZE,
): number {
  const available = panelTrackHeight(containerHeight, count, handleSize);
  if (count <= 1) return available;
  const floor = effectivePanelMin(containerHeight, minHeight, count, handleSize);
  return Math.max(floor, available - floor * (count - 1));
}

/**
 * Fit requested row heights into an exact integer total while keeping every
 * row at or above the floor. Space above the floor is distributed in
 * proportion to each request, so a dragged allocation survives container
 * growth without collapsing a sibling.
 */
function fitHeights(
  requested: readonly number[],
  total: number,
  minHeight: number,
): number[] {
  const count = requested.length;
  if (count === 0) return [];

  const available = Math.max(0, Math.floor(total));
  const floor = Math.max(
    0,
    Math.min(Math.floor(minHeight), Math.floor(available / count)),
  );
  const free = Math.max(0, available - floor * count);

  const slacks = requested.map((value) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value - floor);
  });
  const slackTotal = slacks.reduce((sum, value) => sum + value, 0);

  if (free === 0) return new Array<number>(count).fill(floor);

  const exact = slacks.map((slack) =>
    slackTotal > 0 ? (free * slack) / slackTotal : free / count,
  );
  const result = exact.map((value) => Math.floor(value));
  let remainder = free - result.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let cursor = 0; remainder > 0 && cursor < order.length; cursor += 1) {
    result[order[cursor].index] += 1;
    remainder -= 1;
  }
  // Floating point can leave a stray pixel; give it to the first row.
  if (remainder > 0) result[0] += remainder;

  return result.map((value) => value + floor);
}

/** 3fr / 4fr / 3fr defaults, fitted to the measured rail height. */
export function defaultPanelHeights(
  containerHeight: number,
  minHeight = PANEL_MIN_HEIGHT,
  count = PANEL_COUNT,
  handleSize = SPLITTER_SIZE,
): number[] {
  const total = panelTrackHeight(containerHeight, count, handleSize);
  const weightTotal = PANEL_WEIGHTS.reduce((sum, value) => sum + value, 0);
  const requested = Array.from({ length: count }, (_, index) => {
    const weight = PANEL_WEIGHTS[index % PANEL_WEIGHTS.length];
    return weightTotal > 0 ? (total * weight) / weightTotal : total / count;
  });
  return fitHeights(
    requested,
    total,
    effectivePanelMin(containerHeight, minHeight, count, handleSize),
  );
}

/** Re-fit stored or previously measured heights after the rail changes size. */
export function fitPanelHeights(
  heights: readonly number[],
  containerHeight: number,
  minHeight = PANEL_MIN_HEIGHT,
  handleSize = SPLITTER_SIZE,
): number[] {
  const count = heights.length;
  const total = panelTrackHeight(containerHeight, count, handleSize);
  return fitHeights(
    heights,
    total,
    effectivePanelMin(containerHeight, minHeight, count, handleSize),
  );
}

/**
 * Move the boundary above panel `index` by `delta` pixels. Only the two
 * adjacent panels change, so the sum (and every other row) stays fixed.
 */
export function applyPanelDelta(
  heights: readonly number[],
  index: number,
  delta: number,
  minHeight = PANEL_MIN_HEIGHT,
): number[] {
  const next = heights.map((height) =>
    Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0,
  );
  if (index < 0 || index >= next.length - 1) return next;

  const pair = next[index] + next[index + 1];
  const floor = Math.max(
    0,
    Math.min(Math.floor(minHeight), Math.floor(pair / 2)),
  );
  const first = clamp(
    next[index] + (Number.isFinite(delta) ? Math.round(delta) : 0),
    floor,
    Math.max(floor, pair - floor),
  );
  next[index] = first;
  next[index + 1] = pair - first;
  return next;
}

/** Set one panel height exactly and proportionally re-fit its siblings. */
export function setPanelHeight(
  heights: readonly number[],
  index: number,
  target: number,
  containerHeight: number,
  minHeight = PANEL_MIN_HEIGHT,
  handleSize = SPLITTER_SIZE,
): number[] {
  const count = heights.length;
  if (index < 0 || index >= count) return [...heights];

  const total = panelTrackHeight(containerHeight, count, handleSize);
  const floor = effectivePanelMin(containerHeight, minHeight, count, handleSize);
  const base = fitHeights(heights, total, floor);
  const max = Math.max(floor, total - floor * (count - 1));
  const bounded = clamp(
    Number.isFinite(target) ? Math.round(target) : floor,
    floor,
    max,
  );

  const otherIndices = base
    .map((_, cursor) => cursor)
    .filter((cursor) => cursor !== index);
  const otherRequested = otherIndices.map((cursor) => base[cursor]);
  const otherTotal = Math.max(0, total - bounded);
  const otherFitted = fitHeights(otherRequested, otherTotal, floor);

  const result = new Array<number>(count);
  result[index] = bounded;
  otherIndices.forEach((cursor, position) => {
    result[cursor] = otherFitted[position] ?? floor;
  });
  return result;
}

/**
 * Reset one boundary to the default allocation. Because the row total is
 * fixed, the remaining panel absorbs the difference; with defaults derived
 * from the same container this restores the complete default stack.
 */
export function resetPanelPair(
  heights: readonly number[],
  index: number,
  defaults: readonly number[],
  minHeight = PANEL_MIN_HEIGHT,
): number[] {
  const next = heights.map((height) =>
    Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0,
  );
  if (index < 0 || index >= next.length - 1) return next;

  const total = next.reduce((sum, height) => sum + height, 0);
  const floor = Math.max(
    0,
    Math.min(Math.floor(minHeight), Math.floor(total / next.length)),
  );
  const target = [...next];
  const firstDefault = Math.max(
    floor,
    Number.isFinite(defaults[index]) ? Math.round(defaults[index]) : floor,
  );
  const secondDefault = Math.max(
    floor,
    Number.isFinite(defaults[index + 1])
      ? Math.round(defaults[index + 1])
      : floor,
  );

  const otherIndices = next
    .map((_, cursor) => cursor)
    .filter((cursor) => cursor !== index && cursor !== index + 1);
  const otherTotal = total - firstDefault - secondDefault;

  if (otherTotal >= floor * otherIndices.length) {
    const otherFitted = fitHeights(
      otherIndices.map((cursor) => next[cursor]),
      otherTotal,
      floor,
    );
    otherIndices.forEach((cursor, position) => {
      target[cursor] = otherFitted[position] ?? floor;
    });
    target[index] = firstDefault;
    target[index + 1] = secondDefault;
    return target;
  }

  // The defaults do not leave the siblings their floor; keep the siblings
  // safe and fit the requested pair into whatever remains.
  const pairTotal = Math.max(0, total - floor * otherIndices.length);
  const pairFitted = fitHeights([firstDefault, secondDefault], pairTotal, floor);
  target[index] = pairFitted[0] ?? floor;
  target[index + 1] = pairFitted[1] ?? floor;
  otherIndices.forEach((cursor) => {
    target[cursor] = floor;
  });
  return target;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

const memoryStore = new Map<string, string>();

function browserStorages(): Storage[] {
  if (typeof window === "undefined") return [];
  const storages: Storage[] = [];
  try {
    if (window.localStorage) storages.push(window.localStorage);
  } catch {
    /* Access can be denied by the browser. */
  }
  try {
    if (window.sessionStorage) storages.push(window.sessionStorage);
  } catch {
    /* Access can be denied by the browser. */
  }
  return storages;
}

/**
 * Read a persisted value from localStorage, sessionStorage, or the module's
 * in-memory fallback. Storage exceptions are swallowed because the observer
 * must keep working when persistence is blocked.
 */
export function readStoredValue(key: string): string | null {
  let accessible = false;
  for (const storage of browserStorages()) {
    try {
      const value = storage.getItem(key);
      accessible = true;
      if (value !== null) return value;
    } catch {
      /* Try the next storage. */
    }
  }
  if (accessible) return null;
  return memoryStore.get(key) ?? null;
}

/** Persist a value, falling back to the in-memory map when writes are blocked. */
export function writeStoredValue(key: string, value: string): void {
  let persisted = false;
  for (const storage of browserStorages()) {
    try {
      storage.setItem(key, value);
      persisted = true;
    } catch {
      /* Try the next storage. */
    }
  }
  if (persisted) {
    memoryStore.delete(key);
  } else {
    memoryStore.set(key, value);
  }
}

function asFinitePositive(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

export function serializeRailWidth(width: number): string {
  return String(Number.isFinite(width) ? Math.round(width) : 0);
}

export function parseRailWidth(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate: unknown = trimmed;
  if (trimmed.startsWith("{")) {
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("width" in candidate)
    ) {
      return null;
    }
    candidate = (candidate as { width?: unknown }).width;
  }

  const numeric =
    typeof candidate === "number"
      ? candidate
      : typeof candidate === "string" && candidate.trim() !== ""
        ? Number(candidate)
        : Number.NaN;
  return asFinitePositive(numeric);
}

export function serializeDashboardHeight(height: number): string {
  return String(
    Number.isFinite(height) ? Math.round(clampDashboardHeight(height)) : DASHBOARD_MIN_HEIGHT,
  );
}

export function parseDashboardHeight(raw: string | null): number | null {
  const height = parseRailWidth(raw);
  return height === null ? null : clampDashboardHeight(height);
}

export function serializePanelHeights(heights: readonly number[]): string {
  return JSON.stringify(
    heights.map((height) => (Number.isFinite(height) ? Math.round(height) : 0)),
  );
}

export function parsePanelHeights(raw: string | null): number[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== PANEL_COUNT) return null;
  const heights: number[] = [];
  for (const value of parsed) {
    const height = asFinitePositive(value);
    if (height === null) return null;
    heights.push(height);
  }
  return heights;
}
