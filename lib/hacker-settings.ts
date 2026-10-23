export const RAIN_KEY = "tesis-rain:v1";
export const SPLASH_CINEMA_KEY = "tesis-hacker-splash:v1";
export const POWER_DOWN_CINEMA_KEY = "tesis-hacker-powerdown:v1";
export const HACKER_AUDIO_KEY = "tesis-hacker-audio:v1";
export const CHEAT_CODE_KEY = "tesis-hacker-cheat:v1";
export const CHEAT_EXIT_KEY = "tesis-hacker-cheat-exit:v1";
export const HACKER_RETURN_THEME_KEY = "tesis-hacker-return:v1";

/** The keyboard easter egg: typing this anywhere (outside fields) selects hacker. */
export const CHEAT_CODE_PHRASE = "cheatstick";

export type RainMode = "off" | "normal" | "max";

export const RAIN_MODES: readonly RainMode[] = ["off", "normal", "max"];

/** Session-scoped guard shared by the boot pass and the session cinematics. */
export const BOOT_STORAGE_KEY = "tesis-boot:v1";
export const BOOT_SEEN_VALUE = "1";

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

/* --- On/off hacker flags (cinematics and audio) --------------------------- */
/* Same storage ladder as the rain mode: in-memory value, localStorage, then
   sessionStorage, so the controls keep working when either store is blocked. */

const sessionFlags = new Map<string, string>();

function readStoredFlag(key: string): "on" | "off" | null {
  const memory = sessionFlags.get(key);
  if (memory === "on" || memory === "off") return memory;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "on" || stored === "off") return stored;
  } catch {
    /* Try the session store next. */
  }
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored === "on" || stored === "off") return stored;
  } catch {
    /* Rely on the in-memory value. */
  }
  return null;
}

function writeStoredFlag(key: string, value: string) {
  sessionFlags.set(key, value);
  try {
    window.localStorage.setItem(key, value);
    return;
  } catch {
    /* Fall back to the session store. */
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* The in-memory value retains the choice. */
  }
}

/** Unknown or missing values resolve to the documented default. */
export function readHackerFlag(key: string, fallback: boolean): boolean {
  const stored = readStoredFlag(key);
  if (stored === null) return fallback;
  return stored === "on";
}

export function persistHackerFlag(key: string, enabled: boolean) {
  writeStoredFlag(key, enabled ? "on" : "off");
}

/** Opening splash and power-down cinematics default to on; audio defaults off. */
export function readSplashCinemaEnabled(): boolean {
  return readHackerFlag(SPLASH_CINEMA_KEY, true);
}

export function readPowerDownCinemaEnabled(): boolean {
  return readHackerFlag(POWER_DOWN_CINEMA_KEY, true);
}

export function readHackerAudioEnabled(): boolean {
  return readHackerFlag(HACKER_AUDIO_KEY, false);
}

/** The keyboard easter egg defaults to on; Settings can switch it off. */
export function readCheatCodeEnabled(): boolean {
  return readHackerFlag(CHEAT_CODE_KEY, true);
}

/**
 * While hacker is active the same phrase can return to the theme used before;
 * this exit path defaults to on and has its own Settings switch.
 */
export function readCheatExitEnabled(): boolean {
  return readHackerFlag(CHEAT_EXIT_KEY, true);
}

/** Valid return targets; hacker itself is never a return value. */
export type HackerReturnTheme = "light" | "dark";

export function isHackerReturnTheme(value: unknown): value is HackerReturnTheme {
  return value === "light" || value === "dark";
}

/** The theme in effect immediately before hacker was last entered. */
export function persistHackerReturnTheme(theme: HackerReturnTheme) {
  writeStoredFlag(HACKER_RETURN_THEME_KEY, theme);
}

export function readHackerReturnTheme(): HackerReturnTheme | null {
  if (readStoredFlag(HACKER_RETURN_THEME_KEY) === null) {
    // The persisted value may hold a theme the in-memory flags never saw
    // (another tab, or a reload mid-session).
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(HACKER_RETURN_THEME_KEY);
      if (isHackerReturnTheme(stored)) return stored;
    } catch {
      return null;
    }
    return null;
  }
  const memoryValue = readStoredFlag(HACKER_RETURN_THEME_KEY);
  return isHackerReturnTheme(memoryValue) ? memoryValue : null;
}

/** Rolling key buffer: append one printable key, keep at most the phrase length. */
export function advanceCheatBuffer(
  buffer: string,
  key: string,
  phrase: string = CHEAT_CODE_PHRASE,
): string {
  return (buffer + key).slice(-phrase.length);
}

export function markBootSeen() {
  try {
    window.sessionStorage.setItem(BOOT_STORAGE_KEY, BOOT_SEEN_VALUE);
  } catch {
    /* With storage blocked the boot overlay still shows once per mount. */
  }
}

export function bootWasSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(BOOT_STORAGE_KEY) === BOOT_SEEN_VALUE;
  } catch {
    return false;
  }
}

/**
 * Clears the in-memory flag fallback (and nothing stored). Used when the embedder
 * needs a clean slate, which is the unit tests' case.
 */
export function resetHackerSessionFlags() {
  sessionFlags.clear();
}
