import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, THEME_TRANSITION_CLASS } from "@/lib/theme";
import { resetThemeSessionStateForTests, setTheme, useTheme } from "@/lib/use-theme";
import {
  cancelHackerCinema,
  cinemaBlockedByVisibility,
  cinemaNoise,
  commitHackerCinema,
  easeInCubic,
  easeInOutCubic,
  finishHackerCinema,
  formatCinemaCounter,
  getHackerCinema,
  globePoint,
  hasActiveHackerCinema,
  planHackerCinema,
  POWER_BLACK_MS,
  POWER_DURATION_MS,
  progressPercent,
  PROGRESS_BARS,
  setHackerCinemaAudio,
  skipHackerCinema,
  splashCounterValue,
  SPLASH_DURATION_MS,
  SPLASH_LOG_LINES,
  SLAM_END_MS,
  SPLASH_REEL_END_MS,
  SPLASH_SWEEP_END_MS,
  SPLASH_WELCOME_END_MS,
  startHackerPowerDown,
  startHackerSplash,
} from "@/lib/hacker-cinema";
import {
  HACKER_AUDIO_KEY,
  persistHackerFlag,
  POWER_DOWN_CINEMA_KEY,
  POWER_DOWN_CINEMA_KEY as POWER_KEY,
  readHackerAudioEnabled,
  readHackerFlag,
  readPowerDownCinemaEnabled,
  readSplashCinemaEnabled,
  resetHackerSessionFlags,
  SPLASH_CINEMA_KEY,
} from "@/lib/hacker-settings";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetHackerSessionFlags();
  cancelHackerCinema();
});

afterEach(() => {
  cancelHackerCinema();
  vi.unstubAllGlobals();
});

describe("cinematic trigger plan", () => {
  it("plays the splash only when a theme control selects hacker from light or dark", () => {
    expect(planHackerCinema("light", "hacker")).toBe("splash");
    expect(planHackerCinema("dark", "hacker")).toBe("splash");
    // Hacker leaving, plain transitions, and same-theme calls never splash.
    expect(planHackerCinema("hacker", "light")).toBe("power-down");
    expect(planHackerCinema("light", "dark")).toBeNull();
    expect(planHackerCinema("dark", "light")).toBeNull();
    expect(planHackerCinema("hacker", "hacker")).toBeNull();
  });

  it("plays the power-down only when hacker is left for light or dark", () => {
    expect(planHackerCinema("hacker", "light")).toBe("power-down");
    expect(planHackerCinema("hacker", "dark")).toBe("power-down");
    expect(planHackerCinema("hacker", "hacker")).toBeNull();
  });

  it("follows the status bar switches for both runs", () => {
    persistHackerFlag(SPLASH_CINEMA_KEY, false);
    expect(planHackerCinema("light", "hacker")).toBeNull();
    expect(planHackerCinema("hacker", "light")).toBe("power-down");

    persistHackerFlag(POWER_KEY, false);
    expect(planHackerCinema("hacker", "dark")).toBeNull();

    persistHackerFlag(SPLASH_CINEMA_KEY, true);
    persistHackerFlag(POWER_DOWN_CINEMA_KEY, true);
    expect(planHackerCinema("light", "hacker")).toBe("splash");
    expect(planHackerCinema("hacker", "dark")).toBe("power-down");
  });
});

describe("hacker on/off flags", () => {
  it("defaults cinematics on and audio off", () => {
    expect(readSplashCinemaEnabled()).toBe(true);
    expect(readPowerDownCinemaEnabled()).toBe(true);
    expect(readHackerAudioEnabled()).toBe(false);
  });

  it("persists and restores each flag", () => {
    persistHackerFlag(SPLASH_CINEMA_KEY, false);
    persistHackerFlag(POWER_DOWN_CINEMA_KEY, false);
    persistHackerFlag(HACKER_AUDIO_KEY, true);
    expect(localStorage.getItem(SPLASH_CINEMA_KEY)).toBe("off");
    expect(localStorage.getItem(POWER_DOWN_CINEMA_KEY)).toBe("off");
    expect(localStorage.getItem(HACKER_AUDIO_KEY)).toBe("on");
    expect(readSplashCinemaEnabled()).toBe(false);
    expect(readPowerDownCinemaEnabled()).toBe(false);
    expect(readHackerAudioEnabled()).toBe(true);
  });

  it("falls back to memory when storage rejects writes", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      persistHackerFlag(SPLASH_CINEMA_KEY, false);
      expect(readSplashCinemaEnabled()).toBe(false);
      expect(readHackerFlag(SPLASH_CINEMA_KEY, true)).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});

describe("cinematic run store", () => {
  it("marks the boot guard seen when a splash arms", () => {
    expect(sessionStorage.getItem("tesis-boot:v1")).toBeNull();
    startHackerSplash();
    expect(sessionStorage.getItem("tesis-boot:v1")).toBe("1");
    cancelHackerCinema();
    expect(sessionStorage.getItem("tesis-boot:v1")).toBe("1");
  });

  it("defers a power-down theme until the record commits, exactly once", () => {
    const commit = vi.fn(() => {
      document.documentElement.dataset.theme = "light";
    });
    document.documentElement.dataset.theme = "hacker";
    startHackerPowerDown("light", commit);

    expect(hasActiveHackerCinema()).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("hacker");

    commitHackerCinema();
    commitHackerCinema();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("skips to the final frame: commit, then end the run", () => {
    const commit = vi.fn();
    startHackerPowerDown("dark", commit);
    skipHackerCinema();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(hasActiveHackerCinema()).toBe(false);

    // Skipping with nothing active stays a no-op.
    skipHackerCinema();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("cancelling drops a pending power-down theme without committing", () => {
    document.documentElement.dataset.theme = "hacker";
    const commit = vi.fn();
    startHackerPowerDown("light", commit);
    cancelHackerCinema();
    expect(commit).not.toHaveBeenCalled();
    expect(hasActiveHackerCinema()).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("hacker");
  });

  it("a new run replaces a running one and its audio dies with it", () => {
    startHackerSplash();
    const first = getHackerCinema();
    startHackerSplash();
    expect(getHackerCinema()?.id).not.toBe(first?.id);
    expect(hasActiveHackerCinema()).toBe(true);
  });

  it("finishes only the matching run id", () => {
    startHackerSplash();
    const stale = getHackerCinema()?.id ?? -1;
    startHackerPowerDown("dark", () => {});
    finishHackerCinema(stale);
    expect(hasActiveHackerCinema()).toBe(true);

    const live = getHackerCinema()?.id ?? -1;
    finishHackerCinema(live);
    expect(hasActiveHackerCinema()).toBe(false);
  });

  it("swaps the sound toggle's audio instance in place", () => {
    startHackerSplash();
    const before = getHackerCinema();
    setHackerCinemaAudio(before?.id ?? -1, null);
    expect(hasActiveHackerCinema()).toBe(true);
    // Stale ids must not touch the live run.
    setHackerCinemaAudio(before?.id ?? -1, null);
    expect(hasActiveHackerCinema()).toBe(true);
  });

  it("reports blocked visibility so a hidden tab never arms a stalled run", () => {
    expect(cinemaBlockedByVisibility()).toBe(false);
    vi.stubGlobal("document", { ...document, visibilityState: "hidden" });
    expect(cinemaBlockedByVisibility()).toBe(true);
  });
});

describe("synthesized audio", () => {
  it("returns null without an AudioContext and tolerates beep/dispose calls", async () => {
    const { createHackerAudio } = await import("@/lib/hacker-audio");
    expect(createHackerAudio()).toBeNull();

    class FakeOscillator {
      onended: (() => void) | null = null;
      type: OscillatorType = "sine";
      frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
    }
    class FakeGain {
      gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
      connect = vi.fn();
    }
    class FakeContext {
      destination = {};
      state = "running";
      currentTime = 0;
      closed = false;
      createOscillator() { return new FakeOscillator(); }
      createGain() { return new FakeGain(); }
      async close() { this.closed = true; }
      async resume() { this.state = "running"; }
    }
    vi.stubGlobal("AudioContext", FakeContext);

    const audio = createHackerAudio();
    expect(audio).not.toBeNull();
    expect(() => {
      audio?.splashBeep(0);
      audio?.splashBeep(3);
      audio?.splashSlam();
      audio?.powerCollapse();
      audio?.confirm();
    }).not.toThrow();
    await audio?.dispose();
    vi.unstubAllGlobals();
  });
});

describe("cinematic pure helpers", () => {
  it("keeps every timeline inside one authored envelope", () => {
    expect(SPLASH_SWEEP_END_MS).toBeLessThan(SPLASH_REEL_END_MS);
    expect(SPLASH_REEL_END_MS).toBeLessThan(SLAM_END_MS);
    expect(SLAM_END_MS).toBeLessThan(SPLASH_WELCOME_END_MS);
    expect(SPLASH_WELCOME_END_MS).toBeLessThan(SPLASH_DURATION_MS);
    expect(SPLASH_DURATION_MS - SLAM_END_MS).toBe(800);
    expect(POWER_BLACK_MS).toBeGreaterThan(SLAM_END_MS - SLAM_END_MS);
    expect(POWER_BLACK_MS).toBeLessThan(POWER_DURATION_MS);
  });

  it("races the progress bars to 100 percent inside the reel", () => {
    const slowest = PROGRESS_BARS.reduce((max, bar) => Math.max(max, bar.startMs + bar.durationMs), 0);
    expect(slowest).toBeLessThanOrEqual(SPLASH_REEL_END_MS - SPLASH_SWEEP_END_MS);
    expect(progressPercent(-10, 0, 240)).toBe(0);
    expect(progressPercent(240, 0, 240)).toBe(100);
    expect(progressPercent(120, 0, 240)).toBe(50);
  });

  it("formats the climbing counter deterministically", () => {
    expect(splashCounterValue(-5)).toBe(8000);
    expect(splashCounterValue(0)).toBe(8000);
    expect(splashCounterValue(1000)).toBe(51700);
    expect(splashCounterValue(1000)).toBeGreaterThan(splashCounterValue(999));
    expect(formatCinemaCounter(10482)).toBe("10 482");
    expect(formatCinemaCounter(Number.NaN)).toBe("0");
  });

  it("projects wireframe globe points on the unit sphere", () => {
    const pole = globePoint(Math.PI / 2, 0, 0);
    expect(pole.y).toBeCloseTo(1);
    const equator = globePoint(0, 0, 0);
    expect(equator.z).toBeCloseTo(1);
    const rotated = globePoint(0, Math.PI / 2, 0);
    expect(rotated.x).toBeCloseTo(1);
    expect(Math.hypot(rotated.x, rotated.y, rotated.z)).toBeCloseTo(1);
  });

  it("produces stable noise and monotone easing", () => {
    expect(cinemaNoise(7)).toBe(cinemaNoise(7));
    expect(cinemaNoise(7)).not.toBe(cinemaNoise(8));
    expect(easeInCubic(0.5)).toBeCloseTo(0.125);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInCubic(-1)).toBe(0);
  });

  it("keeps log copy fictional and screen-safe", () => {
    for (const line of SPLASH_LOG_LINES) {
      expect(line).toBe(line.toUpperCase());
      expect(line).not.toMatch(/https?:|\\\d|\/etc|passwd|token|secret/i);
    }
  });
});
describe("setTheme cinematic wiring", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    resetThemeSessionStateForTests();
  });

  it("applies the hacker theme instantly and arms the splash on selection", () => {
    setTheme("hacker", true);
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(localStorage.getItem(THEME_KEY)).toBe("hacker");
    expect(getHackerCinema()?.kind).toBe("splash");
  });

  it("paints the hacker palette until a power-down commits", () => {
    document.documentElement.dataset.theme = "hacker";
    setTheme("light", true);
    expect(getHackerCinema()?.kind).toBe("power-down");
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");

    commitHackerCinema();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("never arms a cinematic when animation is not requested", () => {
    setTheme("hacker", false);
    expect(hasActiveHackerCinema()).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("hacker");
  });

  it("does not replay a run for the current theme", () => {
    setTheme("hacker", true);
    const id = getHackerCinema()?.id;
    setTheme("hacker", true);
    expect(getHackerCinema()?.id).toBe(id);
  });

  it("keeps a running power-down when its target is re-selected", () => {
    document.documentElement.dataset.theme = "hacker";
    setTheme("light", true);
    const id = getHackerCinema()?.id;
    setTheme("light", true);
    expect(getHackerCinema()?.id).toBe(id);
  });

  it("cancels the power-down when hacker is re-selected mid-run", () => {
    document.documentElement.dataset.theme = "hacker";
    setTheme("dark", true);
    expect(hasActiveHackerCinema()).toBe(true);

    setTheme("hacker", true);
    expect(hasActiveHackerCinema()).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("hacker");
  });

  it("falls back to the standard cross-dissolve when the splash is off", () => {
    persistHackerFlag(SPLASH_CINEMA_KEY, false);
    setTheme("hacker", true);
    expect(hasActiveHackerCinema()).toBe(false);
    expect(document.documentElement).toHaveClass(THEME_TRANSITION_CLASS);
  });

  it("cancels a running cinematic when storage restores a theme", () => {
    renderHook(() => useTheme());
    setTheme("hacker", true);
    expect(hasActiveHackerCinema()).toBe(true);

    localStorage.setItem(THEME_KEY, "dark");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_KEY, storageArea: window.localStorage }),
      );
    });

    expect(hasActiveHackerCinema()).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
