export const THEME_KEY = "tesis-theme:v1";

export type Theme = "light" | "dark";

/** Keep the duration in sync with --theme-switch-duration in app/globals.css. */
export const THEME_TRANSITION_MS = 320;
export const THEME_SWAP_MS = THEME_TRANSITION_MS / 2;
export const THEME_TRANSITION_CLASS = "theme-fading";
const CLEANUP_BUFFER_MS = 60;

let swapTimer: number | undefined;
let cleanupTimer: number | undefined;
let canvasFade: HTMLDivElement | undefined;

// Only fixed application constants enter this parser-blocking head script.
// It runs before client bundles so a persisted dark theme never paints light.
export const THEME_INIT_SCRIPT = `(()=>{try{const theme=localStorage.getItem(${JSON.stringify(THEME_KEY)})??localStorage.getItem("tesis-theme");document.documentElement.dataset.theme=theme==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}})()`;

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* Retain the selection for this session. */
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
 * Applies a theme. An explicit toggle cross-dissolves the workspace through a
 * fading canvas scrim and swaps the token values at the hidden midpoint, so no
 * element has to interpolate inherited colors on every frame. External
 * preference changes and the initial sync stay instant.
 */
export function applyTheme(theme: Theme, animate = false) {
  const root = document.documentElement;
  const prefersReducedMotion = typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!animate || prefersReducedMotion) {
    // The toggle's subscription effect runs after the click; do not let that
    // instant sync short-circuit the cross-dissolve already in flight.
    if (root.classList.contains(THEME_TRANSITION_CLASS) && root.dataset.themeIcon === theme) return;
    clearTransition();
    root.dataset.theme = theme;
    return;
  }
  if (root.classList.contains(THEME_TRANSITION_CLASS)) return;

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
