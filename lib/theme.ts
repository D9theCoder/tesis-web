export const THEME_KEY = "tesis-theme:v1";
export const LEGACY_THEME_KEY = "tesis-theme";

export type Theme = "light" | "dark" | "hacker";

export const THEMES: readonly Theme[] = ["light", "dark", "hacker"];

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "hacker";
}

/** The quick control cycles in this order; Settings offers the direct choice. */
export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : theme === "dark" ? "hacker" : "light";
}

/** Keep the duration in sync with --theme-switch-duration in app/globals.css. */
export const THEME_TRANSITION_MS = 320;
export const THEME_SWAP_MS = THEME_TRANSITION_MS / 2;
export const THEME_TRANSITION_CLASS = "theme-fading";
const CLEANUP_BUFFER_MS = 60;

let swapTimer: number | undefined;
let cleanupTimer: number | undefined;
let canvasFade: HTMLDivElement | undefined;

function readPreference(key: string): string | null {
  try {
    const local = window.localStorage.getItem(key);
    if (local !== null) return local;
  } catch {
    /* Storage can be unavailable; session storage may still work. */
  }
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A stored theme, or null when this device has no preference yet. */
export function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const stored = readPreference(THEME_KEY);
  if (isTheme(stored)) return stored;
  const legacy = readPreference(LEGACY_THEME_KEY);
  return isTheme(legacy) ? legacy : null;
}

/** First visits follow the system preference. Hacker is never automatic. */
export function preferredTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveStoredOrPreferredTheme(): Theme {
  return readStoredTheme() ?? preferredTheme();
}

// Only fixed application constants enter this parser-blocking head script.
// It runs before client bundles so a persisted theme never paints the wrong
// palette. A first visit follows the system preference; if storage is blocked
// the system preference still applies.
export const THEME_INIT_SCRIPT = `(()=>{
  const valid=(value)=>value==="light"||value==="dark"||value==="hacker";
  let theme=null;
  try{theme=localStorage.getItem(${JSON.stringify(THEME_KEY)})??localStorage.getItem(${JSON.stringify(LEGACY_THEME_KEY)})}catch{}
  if(!valid(theme)){try{theme=sessionStorage.getItem(${JSON.stringify(THEME_KEY)})??sessionStorage.getItem(${JSON.stringify(LEGACY_THEME_KEY)})}catch{}}
  if(!valid(theme)){try{theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch{theme="light"}}
  document.documentElement.dataset.theme=theme;
})()`;

export function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
    return;
  } catch {
    /* Fall back to the session so the control still works without localStorage. */
  }
  try {
    window.sessionStorage.setItem(THEME_KEY, theme);
  } catch {
    /* The in-memory store retains the selection for this session. */
  }
}

function clearTransition() {
  if (swapTimer !== undefined) {
    window.clearTimeout(swapTimer);
    swapTimer = undefined;
  }
  if (cleanupTimer !== undefined) {
    window.clearTimeout(cleanupTimer);
    cleanupTimer = undefined;
  }
  canvasFade?.remove();
  canvasFade = undefined;
  const root = document.documentElement;
  root.classList.remove(THEME_TRANSITION_CLASS);
  root.style.removeProperty("--theme-old-surface");
  delete root.dataset.themeIcon;
}

/**
 * Applies a theme. An explicit change cross-dissolves the workspace through a
 * fading canvas scrim and swaps the token values at the hidden midpoint, so no
 * element has to interpolate inherited colors on every frame. External
 * preference changes and the initial sync stay instant.
 */
export function applyTheme(theme: Theme, animate = false) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const prefersReducedMotion = typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A second choice during a dissolve replaces it with a clean transition from
  // the theme currently painted. Never leave the store and the DOM disagreeing.
  if (root.classList.contains(THEME_TRANSITION_CLASS)) clearTransition();
  if (root.dataset.theme === theme) return;

  if (!animate || prefersReducedMotion) {
    root.dataset.theme = theme;
    return;
  }

  const oldCanvas = getComputedStyle(document.body).backgroundColor;
  // The sticky header fades its old surface through a pseudo-element so its
  // contents can swap at the midpoint without exposing content underneath.
  const oldSurface = getComputedStyle(root).getPropertyValue("--surface").trim();
  if (oldSurface) root.style.setProperty("--theme-old-surface", oldSurface);
  canvasFade = document.createElement("div");
  canvasFade.className = "theme-canvas-fade";
  canvasFade.setAttribute("aria-hidden", "true");
  canvasFade.style.backgroundColor = oldCanvas;
  document.body.append(canvasFade);

  // The icon animates from the click; data-theme follows at the midpoint.
  root.dataset.themeIcon = theme;
  root.classList.add(THEME_TRANSITION_CLASS);

  swapTimer = window.setTimeout(() => {
    root.dataset.theme = theme;
    swapTimer = undefined;
  }, THEME_SWAP_MS);

  cleanupTimer = window.setTimeout(() => {
    canvasFade?.remove();
    canvasFade = undefined;
    root.classList.remove(THEME_TRANSITION_CLASS);
    root.style.removeProperty("--theme-old-surface");
    delete root.dataset.themeIcon;
    cleanupTimer = undefined;
  }, THEME_TRANSITION_MS + CLEANUP_BUFFER_MS);
}
