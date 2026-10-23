export const RAIN_KEY = "tesis-rain:v1";

export type RainMode = "off" | "normal" | "max";

export const RAIN_MODES: readonly RainMode[] = ["off", "normal", "max"];

export function isRainMode(value: unknown): value is RainMode {
  return value === "off" || value === "normal" || value === "max";
}

/** In-memory fallback so the control works when both storage APIs are blocked. */
let sessionRainMode: RainMode | null = null;

export function readRainMode(): RainMode | null {
  if (sessionRainMode) return sessionRainMode;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(RAIN_KEY);
    if (isRainMode(stored)) return stored;
  } catch {
    /* Try the session store next. */
  }
  try {
    const stored = window.sessionStorage.getItem(RAIN_KEY);
    if (isRainMode(stored)) return stored;
  } catch {
    /* Rely on the in-memory value. */
  }
  return null;
}

export function persistRainMode(mode: RainMode) {
  sessionRainMode = mode;
  try {
    window.localStorage.setItem(RAIN_KEY, mode);
    return;
  } catch {
    /* Fall back to the session so the control still works. */
  }
  try {
    window.sessionStorage.setItem(RAIN_KEY, mode);
  } catch {
    /* The in-memory value retains the choice for this session. */
  }
}

/** Reduced motion keeps a static pattern and starts the control at off. */
export function effectiveRainMode(mode: RainMode | null, reducedMotion: boolean): RainMode {
  return reducedMotion ? "off" : mode ?? "max";
}
