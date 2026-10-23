"use client";

import { useEffect, useState } from "react";
import { BootSequence } from "@/components/hacker/boot-sequence";
import { HackerEffects } from "@/components/hacker/hacker-effects";
import { HackerStatusBar } from "@/components/hacker/hacker-status-bar";
import { RainCanvas } from "@/components/hacker/rain-canvas";
import { CINEMA_RAIN_BOOST, useHackerCinema } from "@/lib/hacker-cinema";
import { usePowerDownCinemaToggle, useRainController, useSplashCinemaToggle } from "@/lib/use-hacker";
import { useTheme } from "@/lib/use-theme";

/**
 * Hacker-mode chrome, mounted once by AppShell. It renders nothing outside the
 * hacker theme, so no canvas, overlay, boot pass, or DOM effects exist in
 * light/dark. Boot eligibility is captured only after hydration: switching into
 * hacker later in the session replays the session splash instead of the boot.
 *
 * The cinematic overlays live outside this component (AppShell mounts
 * HackerCinema directly) because the power-down must outlive the hacker theme
 * it retires. While a run is active the boot pass stays unmounted, the rain
 * speeds up for the power-down's opening, and the status bar gains the two
 * cinematic on/off switches.
 */
export function HackerChrome() {
  const theme = useTheme();
  const { rainMode, setRainMode, reducedMotion } = useRainController();
  const cinema = useHackerCinema();
  const [splashEnabled, setSplashEnabled] = useSplashCinemaToggle();
  const [powerDownEnabled, setPowerDownEnabled] = usePowerDownCinemaToggle();
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
      <RainCanvas
        mode={rainMode}
        reducedMotion={reducedMotion}
        active
        speedBoost={cinema?.kind === "power-down" ? CINEMA_RAIN_BOOST : 1}
      />
      <div className="hacker-scanlines" aria-hidden="true" />
      <div className="hacker-vignette" aria-hidden="true" />
      <HackerStatusBar
        rainMode={rainMode}
        onRainChange={setRainMode}
        splashEnabled={splashEnabled}
        onSplashChange={setSplashEnabled}
        powerDownEnabled={powerDownEnabled}
        onPowerDownChange={setPowerDownEnabled}
        reducedMotion={reducedMotion}
      />
      <HackerEffects active reducedMotion={reducedMotion} />
      {cinema === null && bootEligible ? <BootSequence reducedMotion={reducedMotion} /> : null}
    </>
  );
}
