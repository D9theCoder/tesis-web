"use client";

import { useEffect } from "react";
import {
  getLinkScrambleTarget,
  HACKER_GLITCH_CLASS,
  HEADING_GLITCH_DURATION_MS,
  HEADING_GLITCH_FRAME_MS,
  LINK_SCRAMBLE_FRAME_MS,
  nextHeadingGlitchDelay,
  nextLinkScrambleDuration,
  pickGlitchableHeading,
  scrambleText,
} from "@/lib/hacker-effects";

type HackerEffectsProps = {
  active: boolean;
  reducedMotion: boolean;
};

function mainContent(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("main-content") ?? document.querySelector<HTMLElement>("main");
}

type ActiveHeadingGlitch = {
  element: HTMLElement;
  original: string;
  hadClass: boolean;
};

type ActiveLinkScramble = {
  anchor: HTMLElement;
  target: HTMLElement;
  original: string;
  frameTimer: number;
  stopTimer: number;
};

/**
 * Decorative-only text effects for hacker mode. Headings are mutated in place
 * for a few hundred milliseconds and restored exactly; links are scrambled
 * only when the anchor itself (or one direct span) is plain text, so icons and
 * nested markup are never touched. Focus and ARIA state are left alone.
 */
export function HackerEffects({ active, reducedMotion }: HackerEffectsProps) {
  useEffect(() => {
    if (!active || reducedMotion) return;

    let scheduleTimer: number | undefined;
    let frameTimer: number | undefined;
    let restoreTimer: number | undefined;
    let glitch: ActiveHeadingGlitch | null = null;
    let disposed = false;

    const restoreHeading = () => {
      if (!glitch) return;
      // A concurrent render could have introduced an icon or link while the
      // decorative pass was running. Never wipe real child elements.
      if (glitch.element.childElementCount === 0) {
        glitch.element.textContent = glitch.original;
      }
      if (!glitch.hadClass) glitch.element.classList.remove(HACKER_GLITCH_CLASS);
      glitch = null;
    };

    const stopGlitch = () => {
      if (frameTimer !== undefined) {
        window.clearInterval(frameTimer);
        frameTimer = undefined;
      }
      if (restoreTimer !== undefined) {
        window.clearTimeout(restoreTimer);
        restoreTimer = undefined;
      }
      restoreHeading();
    };

    const schedule = () => {
      if (disposed) return;
      scheduleTimer = window.setTimeout(runGlitch, nextHeadingGlitchDelay());
    };

    function runGlitch() {
      scheduleTimer = undefined;
      if (disposed) return;
      const heading = pickGlitchableHeading(mainContent());
      if (!heading) {
        schedule();
        return;
      }
      const original = heading.textContent ?? "";
      if (!original.trim()) {
        schedule();
        return;
      }

      glitch = {
        element: heading,
        original,
        hadClass: heading.classList.contains(HACKER_GLITCH_CLASS),
      };
      heading.classList.add(HACKER_GLITCH_CLASS);
      heading.textContent = scrambleText(original);

      frameTimer = window.setInterval(() => {
        if (disposed || !glitch) return;
        glitch.element.textContent = scrambleText(glitch.original);
      }, HEADING_GLITCH_FRAME_MS);

      restoreTimer = window.setTimeout(() => {
        restoreTimer = undefined;
        if (disposed) return;
        stopGlitch();
        schedule();
      }, HEADING_GLITCH_DURATION_MS);
    }

    schedule();

    return () => {
      disposed = true;
      if (scheduleTimer !== undefined) {
        window.clearTimeout(scheduleTimer);
        scheduleTimer = undefined;
      }
      stopGlitch();
    };
  }, [active, reducedMotion]);

  useEffect(() => {
    if (!active || reducedMotion) return;

    let current: ActiveLinkScramble | null = null;
    /**
     * Chromium re-fires pointerover when the glyphs under a stationary pointer
     * are replaced. Remember an anchor that already had its one brief pass so
     * the mutation cannot start an endless scramble; leaving the anchor (or
     * moving to another one) relinks it.
     */
    let settledAnchor: HTMLElement | null = null;

    const restoreLink = (settled: boolean) => {
      if (!current) return;
      const { anchor, target, original, frameTimer, stopTimer } = current;
      window.clearInterval(frameTimer);
      window.clearTimeout(stopTimer);
      // Do not destroy an icon or other markup that appeared during the pass.
      if (target.childElementCount === 0) target.textContent = original;
      current = null;
      if (settled) settledAnchor = anchor;
    };

    const startLink = (anchor: HTMLElement, target: HTMLElement) => {
      restoreLink(false);
      const original = target.textContent ?? "";
      if (!original.trim()) return;
      settledAnchor = null;
      target.textContent = scrambleText(original);
      const frameTimer = window.setInterval(() => {
        if (!current) return;
        current.target.textContent = scrambleText(current.original);
      }, LINK_SCRAMBLE_FRAME_MS);
      const stopTimer = window.setTimeout(() => restoreLink(true), nextLinkScrambleDuration());
      current = { anchor, target, original, frameTimer, stopTimer };
    };

    const onPointerOver = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLElement)) return;
      if (current?.anchor === anchor || settledAnchor === anchor) return;
      const textTarget = getLinkScrambleTarget(anchor);
      if (!textTarget) return;
      startLink(anchor, textTarget);
    };

    const onPointerOut = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (settledAnchor && anchor === settledAnchor) settledAnchor = null;
      if (!current) return;
      if (!anchor || !current.anchor.contains(target)) return;
      const related = (event as Event & { relatedTarget?: EventTarget | null }).relatedTarget;
      if (related instanceof Node && current.anchor.contains(related)) return;
      restoreLink(false);
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      restoreLink(false);
      settledAnchor = null;
    };
  }, [active, reducedMotion]);

  return null;
}
