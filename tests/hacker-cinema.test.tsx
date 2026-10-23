import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HackerCinema } from "@/components/hacker/hacker-cinema";
import {
  CINEMA_SKIP_FADE_MS,
  cancelHackerCinema,
  hasActiveHackerCinema,
  POWER_BLACK_MS,
  POWER_DURATION_MS,
  POWER_GLITCH_END_MS,
  POWER_REDUCED_FADE_MS,
  POWER_REEL_END_MS,
  POWER_RAIN_FADE_AT_MS,
  skipHackerCinema,
  splashCounterValue,
  SPLASH_REDUCED_FADE_MS,
  SPLASH_REDUCED_HOLD_MS,
  SPLASH_REEL_END_MS,
  SPLASH_SWEEP_END_MS,
  SPLASH_WELCOME_END_MS,
  SLAM_END_MS,
  startHackerPowerDown,
  startHackerSplash,
} from "@/lib/hacker-cinema";
import { resetHackerSessionFlags } from "@/lib/hacker-settings";

/**
 * The overlays drive their phases from fake-timer deadlines and their canvas
 * and typing frames from `performance.now()`, so tests advance both clocks in
 * lockstep. jsdom exposes no 2d context (drawing is skipped) and no
 * requestAnimationFrame (the engine falls back to a plain interval).
 */

let nowMs = 0;

function tick(ms: number) {
  act(() => {
    nowMs += ms;
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  nowMs = 0;
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  sessionStorage.clear();
  resetHackerSessionFlags();
  document.documentElement.dataset.theme = "hacker";
  delete document.documentElement.dataset.themeIcon;
  document.documentElement.removeAttribute("data-cinema-rain");
  cancelHackerCinema();
});

afterEach(() => {
  cancelHackerCinema();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-cinema-rain");
  document.documentElement.dataset.theme = "light";
  localStorage.clear();
  sessionStorage.clear();
});

describe("splash cinematic", () => {
  it("plays the authored phases and lifts the rain hold on the final frame", () => {
    startHackerSplash();
    render(<HackerCinema />);

    const overlay = document.querySelector(".hacker-cinema");
    expect(screen.getByRole("status")).toHaveTextContent(/Hacker mode (enabled|disabled)\./);
    expect(overlay).toHaveAttribute("data-kind", "splash");
    expect(overlay).toHaveAttribute("data-phase", "sweep");
    expect(overlay).toHaveTextContent("Hacker mode enabled.");
    expect(document.documentElement.getAttribute("data-cinema-rain")).toBe("hold");

    tick(SPLASH_SWEEP_END_MS);
    expect(overlay).toHaveAttribute("data-phase", "reel");

    tick(SPLASH_REEL_END_MS - SPLASH_SWEEP_END_MS);
    expect(overlay).toHaveAttribute("data-phase", "slam");
    expect(overlay.textContent).toContain("ACCESS GRANTED");
    expect(overlay.textContent).toContain("press any key or tap to skip");

    tick(SLAM_END_MS - SPLASH_REEL_END_MS);
    expect(overlay).toHaveAttribute("data-phase", "welcome");
    expect(document.querySelector(".hacker-cinema-typed")?.textContent).toBe("W");

    tick(90);
    expect(document.querySelector(".hacker-cinema-typed")?.textContent).toBe("WELC");

    tick(SPLASH_WELCOME_END_MS - SLAM_END_MS - 90);
    expect(overlay).toHaveAttribute("data-phase", "dissolve");
    expect(document.querySelector(".hacker-cinema-typed")?.textContent).toBe("WELCOME, OPERATOR");
    // The rain fades in beneath the dissolving splash.
    expect(document.documentElement.hasAttribute("data-cinema-rain")).toBe(false);

    tick(300);
    expect(hasActiveHackerCinema()).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("raises the climbing counter while the reel runs", () => {
    startHackerSplash();
    render(<HackerCinema />);
    tick(SPLASH_SWEEP_END_MS);

    const before = splashCounterValue(nowMs - SPLASH_SWEEP_END_MS);
    tick(200);
    const after = splashCounterValue(nowMs - SPLASH_SWEEP_END_MS);
    expect(after).toBeGreaterThan(before);
  });

  it("skips to the hacker theme on click and clears the run", () => {
    startHackerSplash();
    render(<HackerCinema />);
    tick(300);

    fireEvent.click(window);
    expect(hasActiveHackerCinema()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(CINEMA_SKIP_FADE_MS + 10);
    });
    expect(hasActiveHackerCinema()).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.documentElement.hasAttribute("data-cinema-rain")).toBe(false);
  });

  it("treats the sound control as cinematic UI, not a skip", () => {
    startHackerSplash();
    render(<HackerCinema />);
    // The sound control sits inside the aria-hidden screen: it is pointer-only
    // by design (focus never moves into the overlay), so hidden must be true.
    const sound = screen.getByRole("button", { name: "Cinematic sound on", hidden: true });

    fireEvent.click(sound);
    expect(hasActiveHackerCinema()).toBe(true);
    // jsdom has no AudioContext: the control stays honest about being off.
    expect(sound).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("tesis-hacker-audio:v1")).toBe("on");
  });

  it("shows a static acknowledgement under reduced motion and fades it out", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    startHackerSplash();
    render(<HackerCinema />);

    const overlay = document.querySelector(".hacker-cinema");
    expect(screen.getByRole("status")).toHaveTextContent(/Hacker mode (enabled|disabled)\./);
    expect(overlay).toHaveAttribute("data-phase", "cover");
    expect(screen.getByText("HACKER MODE ENABLED")).toBeInTheDocument();
    expect(document.documentElement.hasAttribute("data-cinema-rain")).toBe(false);
    expect(screen.queryByRole("button", { name: /Cinematic sound/, hidden: true })).toBeNull();

    tick(SPLASH_REDUCED_HOLD_MS);
    expect(overlay).toHaveAttribute("data-phase", "fade");
    tick(SPLASH_REDUCED_FADE_MS);
    expect(hasActiveHackerCinema()).toBe(false);
  });
});

describe("power-down cinematic", () => {
  it("keeps the hacker theme until fully black, then commits once", () => {
    const commit = vi.fn(() => {
      document.documentElement.dataset.theme = "light";
    });
    startHackerPowerDown("light", commit);
    render(<HackerCinema />);

    const overlay = document.querySelector(".hacker-cinema");
    expect(screen.getByRole("status")).toHaveTextContent(/Hacker mode (enabled|disabled)\./);
    expect(overlay).toHaveAttribute("data-kind", "power-down");
    expect(overlay).toHaveAttribute("data-phase", "glitch");
    expect(overlay).toHaveTextContent("Hacker mode disabled.");
    expect(document.documentElement.dataset.theme).toBe("hacker");
    expect(commit).not.toHaveBeenCalled();

    tick(POWER_GLITCH_END_MS);
    expect(overlay).toHaveAttribute("data-phase", "reel");
    tick(POWER_RAIN_FADE_AT_MS - POWER_GLITCH_END_MS);
    expect(document.documentElement.getAttribute("data-cinema-rain")).toBe("fade");
    tick(POWER_REEL_END_MS - POWER_RAIN_FADE_AT_MS);
    expect(overlay).toHaveAttribute("data-phase", "collapse");
    expect(commit).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("hacker");

    tick(POWER_BLACK_MS - POWER_REEL_END_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(overlay).toHaveAttribute("data-phase", "reveal");

    tick(POWER_DURATION_MS - POWER_BLACK_MS);
    expect(hasActiveHackerCinema()).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("starts the rain fade while the reel is on screen", () => {
    startHackerPowerDown("dark", () => {});
    render(<HackerCinema />);

    tick(POWER_RAIN_FADE_AT_MS - 1);
    expect(document.documentElement.hasAttribute("data-cinema-rain")).toBe(false);
    act(() => {
      nowMs = POWER_RAIN_FADE_AT_MS + 16;
      vi.advanceTimersByTime(32);
    });
    expect(document.documentElement.getAttribute("data-cinema-rain")).toBe("fade");
  });

  it("skips via Escape: commit immediately, land on the target theme", () => {
    const commit = vi.fn(() => {
      document.documentElement.dataset.theme = "dark";
    });
    startHackerPowerDown("dark", commit);
    render(<HackerCinema />);
    tick(400);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      vi.advanceTimersByTime(CINEMA_SKIP_FADE_MS + 10);
    });
    expect(hasActiveHackerCinema()).toBe(false);
  });

  it("restores the page scroll after the jitter phase", () => {
    const scrollTo = vi.mocked(window.scrollTo);
    startHackerPowerDown("dark", () => {});
    render(<HackerCinema />);

    tick(POWER_GLITCH_END_MS - 20);
    expect(scrollTo).toHaveBeenCalled();

    tick(40); // crosses 200ms: jitter stops
    const last = scrollTo.mock.calls.at(-1);
    expect(last?.[0]).toBe(0);
    expect(last?.[1]).toBe(0);
  });

  it("fades plainly to the target theme under reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const commit = vi.fn(() => {
      document.documentElement.dataset.theme = "dark";
    });
    startHackerPowerDown("dark", commit);
    render(<HackerCinema />);

    expect(document.querySelector(".hacker-cinema")).toHaveAttribute("data-phase", "fade");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.queryByRole("button", { name: /Cinematic sound/, hidden: true })).toBeNull();

    tick(POWER_REDUCED_FADE_MS);
    expect(hasActiveHackerCinema()).toBe(false);
  });

  it("never starts when a skip arrived first (jump avoids a flash)", () => {
    startHackerPowerDown("dark", () => {});
    skipHackerCinema();
    render(<HackerCinema />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(hasActiveHackerCinema()).toBe(false);
  });
});
