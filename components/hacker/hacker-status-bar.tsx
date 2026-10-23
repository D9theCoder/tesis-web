"use client";

import { useEffect, useId, useState } from "react";
import { RAIN_MODES, type RainMode } from "@/lib/hacker-settings";

export function formatUtcClock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

const RAIN_COPY: Record<RainMode, { visible: string; accessibleName: string }> = {
  off: { visible: "[ OFF ]", accessibleName: "Rain off" },
  normal: { visible: "[ NORMAL ]", accessibleName: "Rain normal" },
  max: { visible: "[ MAX ]", accessibleName: "Rain max" },
};

type CinemaToggleProps = {
  label: string;
  fullLabel: string;
  compactLabel: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

/**
 * One on/off cinematic switch, styled like the rain options. The wide layout
 * shows the state word (ON / OFF); below 600px the label collapses into the
 * button and the pressed styling carries the state, so the bar never wraps.
 */
function CinemaToggle({ label, fullLabel, compactLabel, enabled, onChange }: CinemaToggleProps) {
  const state = enabled ? "on" : "off";
  return (
    <div className="hacker-statusbar__group">
      <span className="hacker-statusbar__label">{label}</span>
      <button
        type="button"
        className="hacker-cinema-toggle"
        aria-pressed={enabled}
        aria-label={`${fullLabel}: ${state}`}
        onClick={() => onChange(!enabled)}
      >
        <span className="hacker-cinema-toggle__full" aria-hidden="true">
          {enabled ? "ON" : "OFF"}
        </span>
        <span className="hacker-cinema-toggle__compact" aria-hidden="true">
          {compactLabel}
        </span>
      </button>
    </div>
  );
}

type HackerStatusBarProps = {
  rainMode: RainMode;
  onRainChange: (mode: RainMode) => void;
  splashEnabled: boolean;
  onSplashChange: (enabled: boolean) => void;
  powerDownEnabled: boolean;
  onPowerDownChange: (enabled: boolean) => void;
  reducedMotion: boolean;
};

/**
 * Fixed hacker chrome. The labels are not a live region: only the rain and
 * cinematic buttons are interactive, and their DOM order never changes so
 * clicking one cannot move focus. The clock renders empty until mounted to
 * avoid a server/client time mismatch.
 */
export function HackerStatusBar({
  rainMode,
  onRainChange,
  splashEnabled,
  onSplashChange,
  powerDownEnabled,
  onPowerDownChange,
  reducedMotion,
}: HackerStatusBarProps) {
  const [now, setNow] = useState<Date | null>(null);
  const motionNoteId = useId();

  useEffect(() => {
    // The clock has no meaningful server value; seed it with the mounted time,
    // then let the interval drive it. This is a one-shot sync, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <footer className="hacker-statusbar" aria-label="Observer status">
      <div className="hacker-statusbar__group">
        <span className="hacker-statusbar__label">[ OK ] observer online</span>
      </div>
      <span className="hacker-statusbar__spacer" aria-hidden="true" />
      <div className="hacker-statusbar__group">
        <span className="hacker-statusbar__label">[ RAIN ]</span>
        <div
          className="hacker-rain-control"
          role="group"
          aria-label="Rain intensity"
          aria-describedby={reducedMotion ? motionNoteId : undefined}
        >
          {RAIN_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              className="hacker-rain-option"
              aria-label={RAIN_COPY[mode].accessibleName}
              aria-pressed={rainMode === mode}
              disabled={reducedMotion && mode !== "off"}
              onClick={() => onRainChange(mode)}
            >
              {RAIN_COPY[mode].visible}
            </button>
          ))}
        </div>
        {reducedMotion ? (
          <span className="hacker-statusbar__label" id={motionNoteId}>
            static pattern
          </span>
        ) : null}
      </div>
      <div className="hacker-statusbar__group hacker-cinema-controls">
        <CinemaToggle
          label="[ SPLASH ]"
          fullLabel="Splash intro animation"
          compactLabel="SPLASH"
          enabled={splashEnabled}
          onChange={onSplashChange}
        />
        <CinemaToggle
          label="[ POWER-DOWN ]"
          fullLabel="Power-down animation"
          compactLabel="PWR-DN"
          enabled={powerDownEnabled}
          onChange={onPowerDownChange}
        />
      </div>
      <div className="hacker-statusbar__group">
        <time className="hacker-statusbar__clock" dateTime={now?.toISOString()}>
          {now ? formatUtcClock(now) : ""}
        </time>
      </div>
    </footer>
  );
}
