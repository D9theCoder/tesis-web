/**
 * Desktop sidebar preference helpers. The preference is stored as a readable
 * string so a future non-JavaScript reader could inspect it, and reading never
 * throws when the browser blocks storage (private windows, embedded webviews,
 * storage policy, or a disabled quota).
 */

export const SIDEBAR_STORAGE_KEY = "tesis-sidebar:v1";

export type SidebarPreference = "expanded" | "collapsed";

const EXPANDED: SidebarPreference = "expanded";
const COLLAPSED: SidebarPreference = "collapsed";

/**
 * Keeps the current session's choice when localStorage and sessionStorage are
 * both unavailable. Reloads lose it by definition; React state keeps the
 * control working for the lifetime of the mounted shell.
 */
let memoryPreference: SidebarPreference | null = null;

export function isSidebarPreference(value: unknown): value is SidebarPreference {
  return value === EXPANDED || value === COLLAPSED;
}

export function isSidebarCollapsed(preference: SidebarPreference): boolean {
  return preference === COLLAPSED;
}

function readStorage(storageName: "localStorage" | "sessionStorage"): SidebarPreference | null {
  try {
    const value = window[storageName].getItem(SIDEBAR_STORAGE_KEY);
    return isSidebarPreference(value) ? value : null;
  } catch {
    // Accessing the storage object itself can throw under a blocked policy.
    return null;
  }
}

/**
 * The stored preference, falling back from localStorage to sessionStorage to
 * this module's in-memory value. The default is expanded, which is also the
 * value used for the server render so hydration starts from a stable state.
 */
export function readSidebarPreference(): SidebarPreference {
  if (typeof window === "undefined") return EXPANDED;
  if (memoryPreference) return memoryPreference;
  return readStorage("localStorage") ?? readStorage("sessionStorage") ?? EXPANDED;
}

/**
 * Saves the preference for this and future visits. A storage failure is
 * non-fatal: sessionStorage gets the next chance, then the in-memory value
 * above keeps this session's control working.
 */
export function persistSidebarPreference(preference: SidebarPreference): void {
  memoryPreference = preference;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, preference);
    return;
  } catch {
    /* Fall back to the per-tab store. */
  }
  try {
    window.sessionStorage.setItem(SIDEBAR_STORAGE_KEY, preference);
  } catch {
    /* The in-memory value retains the selection for this session. */
  }
}

/**
 * Follows changes made in another tab when the browser exposes a storage
 * event. Returns an unsubscribe function so effects can clean up.
 */
export function subscribeToSidebarPreference(
  listener: (preference: SidebarPreference) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== SIDEBAR_STORAGE_KEY) return;
    const preference = isSidebarPreference(event.newValue) ? event.newValue : EXPANDED;
    memoryPreference = preference;
    listener(preference);
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

/** Clears the in-memory fallback so tests start from a clean module state. */
export function resetSidebarPreference(): void {
  memoryPreference = null;
}
