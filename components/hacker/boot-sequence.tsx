"use client";

import { useEffect, useState } from "react";
import { BOOT_SEEN_VALUE, BOOT_STORAGE_KEY, bootWasSeen, markBootSeen } from "@/lib/hacker-settings";

export { BOOT_SEEN_VALUE, BOOT_STORAGE_KEY };

/** Long enough to feel cinematic, short enough to stay out of the user's way. */
export const BOOT_DURATION_MS = 2600;
export const BOOT_LINE_INTERVAL_MS = 280;

/**
 * Generic observer-chrome copy only. No hosts, addresses, credentials, or
 * anything that could be mistaken for real exploit output.
 */
export const BOOT_LINES: readonly string[] = [
  "[ OK ] loading observer shell",
  "[ OK ] linking read-only journal",
  "[ OK ] resolving graph snapshot",
  "[ OK ] indexing evidence records",
  "[ OK ] arming review boundaries",
  "[ OK ] syncing observer clock",
  "[ OK ] preparing artifact view",
  "[ OK ] ready",
];

type BootSequenceProps = {
  reducedMotion?: boolean;
};

/**
 * One decorative startup pass per browser session. Any click or key skips it.
 * The visible log is hidden from assistive technology; the status region keeps
 * a stable accessible name instead of announcing each rapidly changing line.
 */
export function BootSequence({ reducedMotion = false }: BootSequenceProps) {
  const [visible, setVisible] = useState(false);
  const [lineCount, setLineCount] = useState(0);

  useEffect(() => {
    // Reduced motion gets no startup theater at all, but it still consumes the
    // once-per-session marker so a later motion preference change cannot replay it.
    if (reducedMotion) {
      markBootSeen();
      // The overlay starts hidden; this only matters if the preference flips
      // while it is on screen. It is a one-shot sync, not a render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }
    if (bootWasSeen()) {
      setVisible(false);
      return;
    }

    let lineTimer: number | undefined;
    let finishTimer: number | undefined;
    let finished = false;
    let mounted = true;

    const clearTimers = () => {
      if (lineTimer !== undefined) {
        window.clearInterval(lineTimer);
        lineTimer = undefined;
      }
      if (finishTimer !== undefined) {
        window.clearTimeout(finishTimer);
        finishTimer = undefined;
      }
    };

    const stopSkipListeners = () => {
      window.removeEventListener("click", skip, true);
      window.removeEventListener("keydown", skip, true);
    };

    const finish = () => {
      if (!mounted || finished) return;
      finished = true;
      clearTimers();
      stopSkipListeners();
      markBootSeen();
      setVisible(false);
    };

    function skip() {
      finish();
    }

    setVisible(true);
    setLineCount(1);

    let lineIndex = 1;
    lineTimer = window.setInterval(() => {
      lineIndex = Math.min(BOOT_LINES.length, lineIndex + 1);
      setLineCount(lineIndex);
      if (lineIndex >= BOOT_LINES.length && lineTimer !== undefined) {
        window.clearInterval(lineTimer);
        lineTimer = undefined;
      }
    }, BOOT_LINE_INTERVAL_MS);

    finishTimer = window.setTimeout(finish, BOOT_DURATION_MS);
    window.addEventListener("click", skip, true);
    window.addEventListener("keydown", skip, true);

    return () => {
      mounted = false;
      clearTimers();
      stopSkipListeners();
    };
  }, [reducedMotion]);

  if (!visible) return null;

  return (
    <div className="hacker-boot" role="status" aria-label="Observer startup">
      <div className="hacker-boot-frame">
        <div className="hacker-boot-log" aria-hidden="true">
          {BOOT_LINES.slice(0, lineCount).map((line, index) => (
            <div className="hacker-boot-line" key={index}>
              {line}
            </div>
          ))}
        </div>
        <div className="hacker-boot-prompt" aria-hidden="true">
          press any key or click to skip
        </div>
      </div>
    </div>
  );
}
