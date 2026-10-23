/**
 * Pure helpers for the hacker-mode chrome. Everything here is DOM-optional
 * and side-effect free so the chrome components can stay small and testable.
 */

export const HACKER_GLITCH_CLASS = "hacker-glitch";

/** Delay between decorative heading glitches. */
export const HEADING_GLITCH_MIN_DELAY_MS = 4000;
export const HEADING_GLITCH_MAX_DELAY_MS = 8000;
/** How long a heading stays scrambled before the exact original is restored. */
export const HEADING_GLITCH_DURATION_MS = 300;
/** Cadence of the character swaps while a heading is glitching. */
export const HEADING_GLITCH_FRAME_MS = 60;

/** Pointer hover scramble window. */
export const LINK_SCRAMBLE_MIN_MS = 280;
export const LINK_SCRAMBLE_MAX_MS = 350;
export const LINK_SCRAMBLE_FRAME_MS = 55;

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?!<>[]{}";
const WHITESPACE = /\s/;

export type RandomSource = () => number;

/** Uniform random float in [min, max). A fixed value when the range is empty. */
export function randomBetween(min: number, max: number, random: RandomSource = Math.random): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min;
  const value = random();
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return min + clamped * (max - min);
}

export function nextHeadingGlitchDelay(random: RandomSource = Math.random): number {
  return Math.round(randomBetween(HEADING_GLITCH_MIN_DELAY_MS, HEADING_GLITCH_MAX_DELAY_MS, random));
}

export function nextLinkScrambleDuration(random: RandomSource = Math.random): number {
  return Math.round(randomBetween(LINK_SCRAMBLE_MIN_MS, LINK_SCRAMBLE_MAX_MS, random));
}

/**
 * Replace every non-whitespace code unit with a generic glyph. The result has
 * exactly the same length as the input, so restoring `textContent` never
 * changes layout or accessible labels. Whitespace is preserved.
 */
export function scrambleText(text: string, random: RandomSource = Math.random): string {
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === undefined) continue;
    if (WHITESPACE.test(character)) {
      output += character;
      continue;
    }
    const glyphIndex = Math.min(
      SCRAMBLE_GLYPHS.length - 1,
      Math.max(0, Math.floor(random() * SCRAMBLE_GLYPHS.length)),
    );
    output += SCRAMBLE_GLYPHS[glyphIndex] ?? character;
  }
  return output;
}

function hasOnlyTextChildren(element: Element): boolean {
  if (element.childElementCount > 0) return false;
  if (element.childNodes.length === 0) return false;
  let hasText = false;
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== 3) return false;
    if ((node.textContent ?? "").trim().length > 0) hasText = true;
  }
  return hasText;
}

/**
 * True when an element or any ancestor is taken out of the visual flow. This
 * understands the `hidden` attribute, `aria-hidden`, `inert`, and CSS
 * display/visibility on ancestors (a child of a display:none panel reports its
 * own block display, so the walk is required in real browsers).
 */
export function isElementHidden(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return true;
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return true;
  }
  return false;
}

/** A heading we can safely mutate: no element children, visible, in the document. */
export function isGlitchableHeading(element: Element): boolean {
  if (!HEADING_TAGS.has(element.tagName)) return false;
  if (!hasOnlyTextChildren(element)) return false;
  return !isElementHidden(element);
}

/** Every eligible heading below `root`, in document order. */
export function collectGlitchableHeadings(root: ParentNode | null | undefined): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).filter(isGlitchableHeading);
}

/** Pick one eligible heading, or null when the current view has none. */
export function pickGlitchableHeading(
  root: ParentNode | null | undefined,
  random: RandomSource = Math.random,
): HTMLElement | null {
  const headings = collectGlitchableHeadings(root);
  if (headings.length === 0) return null;
  const index = Math.min(headings.length - 1, Math.max(0, Math.floor(random() * headings.length)));
  return headings[index] ?? null;
}

/**
 * The exact text-bearing element it is safe to scramble for an anchor. Either
 * the anchor itself when it only contains text, or a single direct span with
 * no element children. Icons, SVGs, and nested markup are never mutated.
 */
export function getLinkScrambleTarget(anchor: Element): HTMLElement | null {
  if (typeof HTMLElement === "undefined" || !(anchor instanceof HTMLElement)) return null;
  if (anchor.tagName !== "A") return null;
  if (isElementHidden(anchor)) return null;
  if (!(anchor.textContent ?? "").trim()) return null;

  if (anchor.childElementCount === 0) {
    return hasOnlyTextChildren(anchor) ? anchor : null;
  }
  if (anchor.childElementCount !== 1) return null;

  const child = anchor.firstElementChild;
  if (!(child instanceof HTMLElement) || child.tagName !== "SPAN") return null;
  if (child.childElementCount > 0) return null;
  return hasOnlyTextChildren(child) ? child : null;
}
