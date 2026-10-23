"use client";

import { useEffect, useState } from "react";
import { BootSequence } from "@/components/hacker/boot-sequence";
import { HackerEffects } from "@/components/hacker/hacker-effects";
import { HackerStatusBar } from "@/components/hacker/hacker-status-bar";
import { RainCanvas } from "@/components/hacker/rain-canvas";
import { useRainController } from "@/lib/use-hacker";
import { useTheme } from "@/lib/use-theme";

/**
 * Hacker-mode chrome, mounted once by AppShell. It renders nothing outside the
 * hacker theme, so no canvas, overlay, boot pass, or DOM effects exist in
 * light/dark. Boot eligibility is captured only after hydration: switching into
 * hacker later in the session must not replay the startup sequence.
 */
export function HackerChrome() {
  const theme = useTheme();
  const { rainMode, setRainMode, reducedMotion } = useRainController();
  const [bootEligible, setBootEligible] = useState(false);

  useEffect(() => {
    // Read after hydration so the boot overlay never appears for a user who
    // switched into hacker during this session. This is deliberately a
    // one-time external read rather than derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBootEligible(document.documentElement.dataset.theme === "hacker");
  }, []);

  if (theme !== "hacker") return null;

  return (
    <>
      <RainCanvas mode={rainMode} reducedMotion={reducedMotion} active />
      <div className="hacker-scanlines" aria-hidden="true" />
      <div className="hacker-vignette" aria-hidden="true" />
      <HackerStatusBar rainMode={rainMode} onRainChange={setRainMode} reducedMotion={reducedMotion} />
      <HackerEffects active reducedMotion={reducedMotion} />
      {bootEligible ? <BootSequence reducedMotion={reducedMotion} /> : null}
    </>
  );
}
