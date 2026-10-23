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

type HackerStatusBarProps = {
  rainMode: RainMode;
  onRainChange: (mode: RainMode) => void;
  reducedMotion: boolean;
};

/**
 * Fixed hacker chrome. The labels are not a live region: only the three rain
 * buttons are interactive, and their DOM order never changes so clicking one
 * cannot move focus. The clock renders empty until mounted to avoid a
 * server/client time mismatch.
 */
export function HackerStatusBar({ rainMode, onRainChange, reducedMotion }: HackerStatusBarProps) {
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
      <div className="hacker-statusbar__group">
        <time className="hacker-statusbar__clock" dateTime={now?.toISOString()}>
          {now ? formatUtcClock(now) : ""}
        </time>
      </div>
    </footer>
  );
}
