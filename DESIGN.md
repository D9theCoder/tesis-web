---
name: TESIS Web Console
description: A runtime control plane and evidence console for live TESIS experiments.
colors:
  canvas: "var(--canvas)"
  surface: "var(--surface)"
  surface-subtle: "var(--surface-subtle)"
  surface-hover: "var(--surface-hover)"
  text: "var(--text)"
  secondary: "var(--secondary)"
  muted: "var(--muted)"
  border: "var(--border)"
  border-strong: "var(--border-strong)"
  control-border: "var(--control-border)"
  accent: "var(--accent)"
  accent-soft: "var(--accent-soft)"
  success: "var(--success)"
  warning: "var(--warning)"
  danger: "var(--danger)"
  review: "var(--review)"
  graph-edge: "var(--akg-edge)"
  brand-mark: "#f58220"
  brand-ink: "#281a09"
  drawer-scrim: "rgb(12 22 40 / .45)"
typography:
  headline-mobile:
    fontFamily: "var(--font-sans)"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.25
  brand:
    fontFamily: "var(--font-sans)"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.5
  technical-meta:
    fontFamily: "var(--font-sans)"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.2
  headline:
    fontFamily: "var(--font-sans)"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-sans)"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  section:
    fontFamily: "var(--font-sans)"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "var(--font-sans)"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
  navigation-active:
    fontFamily: "var(--font-sans)"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-sans)"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  status:
    fontFamily: "var(--font-sans)"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.35
  mono:
    fontFamily: "var(--font-mono)"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  xs: "3px"
  sm: "4px"
  control: "5px"
  lg: "6px"
  xl: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "28px"
components:
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "34px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, var(--accent), black 12%)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "34px"
  button-icon:
    rounded: "{rounded.control}"
    padding: "6px"
    height: "34px"
    width: "34px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
  card-content:
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "18px"
  badge-neutral:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.secondary}"
    typography: "{typography.status}"
    rounded: "{rounded.sm}"
    padding: "3px 7px"
    height: "24px"
  navigation-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    typography: "{typography.navigation-active}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
    height: "40px"
  table-row-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    padding: "12px 16px"
  akg-node-current:
    backgroundColor: "rgb(var(--warning-rgb) / .06)"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "6px 10px"
    height: "56px"
    width: "152px"
---

# Design System: TESIS Web Observer

## Overview

**Creative North Star: "The Research Observatory"**

TESIS Web Observer should read like a trusted research console for people following an experiment and inspecting its record. Its Cloudflare-inspired enterprise character comes from cool neutral surfaces, clear blue interactions, concise sans-serif type, compact navigation, and dense but readable data. Light is the default; dark and hacker are opt-in variants that keep the same semantic color roles. A first visit follows the system light/dark preference, and hacker is never selected automatically.

The live monitor leads with the current run, model conversation, Attack Knowledge Graph (AKG), and factual status panels. Completed results and comparison stay easy to reach, with source details, review origin, and evidence kept close to each conclusion. Borders and surface tone define structure, while movement stays quiet. The header theme control stays deliberately light/dark and is hidden while hacker is active; it cross-dissolves the workspace over a fading canvas scrim in 320ms while the sun and moon rotate in place, and reduced-motion preferences swap instantly. Hacker is chosen on Settings and adds its own authored motion world: rain, a boot pass, heading glitches, and link scrambling. The sticky header keeps an opaque surface and fades its previous tone separately, so scrolling content never shows through it.

**Key Characteristics:**
- Current-run monitoring with the model stream, AKG, and status panels.
- Dense, aligned tables with source and score provenance in view.
- Flat neutral surfaces, clear 1px borders, and compact controls.
- Light default, an optional dark variant, and an opt-in hacker variant with the same semantic roles.
- A resizable live-monitor rail and stacked side panels, with keyboard separators.

## Colors

The palette pairs cool neutrals with one blue interaction color and restrained status colors; each token resolves through the active theme.

### Primary
- **Signal Blue** (`colors.accent`): Links, active navigation, selected rows and nodes, focus outlines, graph traversal, and primary actions.
- **Soft Signal** (`colors.accent-soft`): Selected rows, active navigation, and other low-emphasis selection backgrounds.

### Neutral
- **Cool Canvas** (`colors.canvas`): The page background behind the workspace.
- **Surface White** (`colors.surface`): Cards, navigation, and inspector panels.
- **Quiet Surface** (`colors.surface-subtle`): Table headings, code blocks, and nested information.
- **Hover Surface** (`colors.surface-hover`): Hover feedback for navigation and neutral controls.
- **Graphite Ink** (`colors.text`): Primary headings and data.
- **Secondary Ink** (`colors.secondary`): Supporting copy and neutral controls.
- **Muted Ink** (`colors.muted`): Metadata, hints, and secondary labels.
- **Soft Border** (`colors.border`): Dividers and standard component outlines.
- **Strong Border** (`colors.border-strong`): Panel outlines and secondary button edges.
- **Control Boundary** (`colors.control-border`): Editable field boundaries, with at least 3:1 contrast against their adjacent surfaces in both themes.
- **Graph Edge** (`colors.graph-edge`): AKG connectors.

### Status and Identity
- **Confirmed Green** (`colors.success`): Positive outcomes and confirmed status.
- **Caution Ochre** (`colors.warning`): Interrupted or uncertain states, safety events, and the current AKG node.
- **Failure Red** (`colors.danger`): Failed states, errors, and blocked violations.
- **Review Violet** (`colors.review`): Independent review provenance.
- **TESIS Mark Orange** (`colors.brand-mark`): The compact brand mark in the sidebar.
- **Brand Ink** (`colors.brand-ink`): Dark lettering inside the orange mark; it stays fixed across themes.
- **Drawer Scrim** (`colors.drawer-scrim`): The translucent neutral overlay behind a protected inspection or navigation task.

**The Signal Separation Rule.** Blue marks interaction and traversal. Green, ochre, red, and violet keep their status and review meanings.

## Hacker Mode (third variant)

**Intent:** the movie version of a research terminal. Near-black phosphor green, full monospace, CRT glow, scanlines, and rain behind the workspace. It is an opt-in skin over the same observer, not a separate product: every page, data contract, status label, and control boundary remains the same.

### Palette and tokens

The variant lives in `:root[data-theme="hacker"]` in `app/globals.css`. Light and dark token values are untouched.

- **Near-black canvas** (`#050805`): the page and graph background behind the rain.
- **Phosphor green** (`#33ff66`): primary text, headings, links, active navigation, and interaction focus.
- **Dim green** (`#94e2a4` secondary, `#78be87` muted): supporting copy, metadata, and inactive labels. Both keep at least 4.5:1 against their near-solid panel.
- **Amber** (`#ffb020`): the single warm alarm color for warnings and errors. Labels, not hue alone, carry the distinction.
- **Pale mint** (`#a7ffc4`): review provenance, kept distinct from the signal green.
- **Surfaces** (`rgb(8 14 9 / .94)`, subtle `rgb(11 20 12 / .92)`, hero `rgb(8 14 9 / .82)`): near-solid panels so rain never runs through body text. Borders use translucent green (`rgb(51 255 102 / .34)` / `.58`).
- **Focus** stays a 2px green outline with a 3px offset and a soft green halo; selection is green ink on a green field.

### Typography and chrome

- `var(--font-mono)` is applied to body, headings, controls, badges, tables, and settings. Headings stay in sentence case and readable sizes; only short labels (badges, tabs, status bar, navigation labels, brand caption) are uppercase.
- Headings get a restrained green text-shadow. Body copy, paragraphs, table cells, links, and controls never receive a glow.
- Panels use 2px corners, thin green borders, bracketed titles (`[ Title ]`), and small `+` corner marks. The page header is a wider, more translucent hero panel with the same text on a dark backing.
- A fixed bottom status bar (`[ OK ] observer online`, `[ RAIN ]`, UTC clock) is the permanent screen chrome. The sidebar collapse control, settings, and all data panels keep their existing geometry.
- Settings is the only place to select hacker. The header light/dark quick switch never offers hacker, includes the current mode and next action in its accessible name, and is hidden while hacker is active.

### Rain layer

- One fixed full-viewport canvas behind the content, `pointer-events: none`, drawn by `components/hacker/rain-canvas.tsx` with glyph atlases from `lib/hacker-rain.ts`.
- Client-side navigation keeps the rain scene running. Scrollbar and viewport size changes retain existing columns, glyphs, and animation timing; glyph atlases are rebuilt only when pixel density changes.
- Three overlapping depths: far (10px, dim, slower, ~30fps movement), mid (14px, normal green, ~30fps), near (22px, bright, full refresh). The translucent trail fill keeps the depth layers visually distinct.
- Each column has a bright leading glyph, a fading trail, a random length and speed, and a random reset off screen. Half-width katakana, digits, hex letters, brackets, slashes, and shade blocks are the complete vocabulary; a few trail glyphs swap every few frames.
- Columns near the pointer brighten and speed up slightly. Every 6–11s one random column flashes along its full height for about half a second.
- Rain is off in light/dark. The status bar offers off / normal / max; max is the default. Mobile halves the column count and the canvas pauses when the tab is hidden or the near layer is off screen.
- Reduced motion draws a static faint column pattern instead of animating and starts the control at off.

### Motion and effects

- First load in hacker mode can run a short, generic boot log; any click or key skips it, `sessionStorage` marks it seen for the session, and reduced motion skips it entirely. Logs are deliberately generic: no hosts, addresses, credentials, or exploit output.
- Every 4–8s one visible plain-text heading scrambles for about 300ms and shifts slightly. Link text scrambles for about 300ms on hover. Both restore exact text and never destroy icons or nested markup.
- The boot, glitch, and scramble effects are decorative. They never replace information or block a task.

### Session cinematics

Two theatrical, skippable full-screen runs are tied to the theme control: the opening splash when the user selects hacker during a session, and the CRT power-down when the user leaves hacker for light or dark. Neither plays on page load, neither plays when a saved theme is restored, and the page-load boot sequence never runs inside them (a session that saw one never replays the other). The cinematics are the hacker variant's one documented full-screen exception to the quiet-motion rule; nothing in them crosses into light or dark.

**Triggers.** Only a selection through a theme control in this tab (`setTheme` with animation) arms a run, and each can be switched off in the status bar. A keyboard easter egg counts as a selection: typing "cheatstick" anywhere outside text entry selects hacker through the same path (splash and skip rules included), and a Cheat code section in Settings turns the shorthand on or off (default on). While hacker is active, the same phrase returns to the theme in effect before hacker (its power-down included) — that exit path is a sub-setting under the same section, default on and disabled whenever the phrase itself is off. The theme in effect before hacker is remembered at every hacker entry, persisted, and never remembers hacker itself. External storage changes cancel a running cinematic and apply the restored theme instantly. Selecting the same target again never restarts a run; selecting anything else supersedes it at once and applies the newly selected theme.

**Opening splash (2100ms).**
1. 0–150ms: the screen cuts to black; one white CRT sweep line runs top to bottom and the screen flashes exactly once (one flash total, roughly 90ms — within the WCAG 2.3.1 budget of three or fewer per second).
2. 150–750ms: fictional log lines scroll in phosphor green (SYSTEM OVERRIDE ENGAGED, ESTABLISHING UPLINK, EVADING TRACE, NODE 7G SYNCHRONIZED, KEYSTREAM LOADED); three progress bars race to 100% on their own clocks while an ops counter climbs. Behind the logs a wireframe globe spins on canvas with sector labels that blink in.
3. 750–1300ms: ACCESS GRANTED slams in at full width (type clamps from 1.5rem to 8rem so 375px never scrolls); the screen shakes for ~100ms, red/cyan edge ghosts flash with clip-path slices shifting the word sideways.
4. 1300–1800ms: WELCOME, OPERATOR types out letter by letter (26ms per letter, complete ~60ms before the dissolve) with a blinking block cursor.
5. 1800–2100ms: the splash dissolves over 300ms while the rain layer finishes its own 300ms fade-in beneath it (the rain is held invisible until the final frame begins).

**Power-down (1200ms).**
1. 0–200ms: the content jitters (scroll-offset roll, restored exactly) under a short glitch burst across the screen.
2. 200–500ms: the rain speeds up to double, then fades out on its own 150ms tail; log lines scroll upward fast while the globe spins down and shrinks under a darkening scrim.
3. 500–800ms: the picture crushes into one bright horizontal line — the band starts under half the viewport height and decays hard, so the squash reads without a white flashbang.
4. 800–1000ms: the line contracts into a dot and fades to black; only at fully black is the target theme (light or dark) painted — never earlier.
5. 1000–1200ms: the black overlay fades over 200ms, revealing the target theme in its own colors.

**Skip rules.** Any click, any tap, or any key press (Escape included) jumps to the final frame: the splash lands on the hacker theme with its rain, the power-down commits the target theme and fades out in 120ms. The overlays' own sound control is exempt from skipping. Changing themes during a run cancels it immediately and applies the newly selected theme; all timers, animation frames, scroll offsets, and audio voices are cleared when a run ends, skips, or is cancelled.

**Sound.** Off by default. A sound toggle sits on each overlay — outside the aria-hidden screen so assistive technology exposes it, and its activation never skips the run. When armed, Web Audio synthesizes short log beeps, a rising tone under the slam, and a falling tone under the collapse — no audio files. The context is created only inside the click that selected the theme (or the toggle click), so autoplay rules are satisfied by the genuine gesture. The preference persists. Reduced-motion runs stay silent, so the control is hidden there.

**Reduced motion.** The opening shows a static overlay reading HACKER MODE ENABLED for ~300ms, then fades out — the splash theater and boot-style log are skipped, not the acknowledgment. The power-down becomes a plain 200ms fade to the target theme. Reduced-motion rain stays off, overlays announce their one plain sentence ("Hacker mode enabled." / "Hacker mode disabled."), and the sound control is hidden because no sound plays.

**Accessibility and performance.** Both overlays are fixed, cover the viewport, sit at the top of the stack, and announce one plain sentence ("Hacker mode enabled." / "Hacker mode disabled.") through a `role="status"` region with `aria-live="polite"`; every visual layer is aria-hidden. The power-down also shows a small `[ RESTORING LIGHT ]`-style status line naming the theme it will paint, so the first 1000ms is never silent about the outcome. Focus stays on the theme control and is never moved into an overlay. Oversized type uses `clamp()`; slams, shakes, and collapses animate transform and opacity only; logs, bars, counter, and globe render on canvases; the workspace beneath never reflows during a run. The overlay text draws exclusively in the system monospace stack, so no font is fetched at run time — text cannot jump on either sequence; the Geist face is self-hosted and preloaded before the app paints.

### Readability and accessibility

- Body and secondary text keep at least 4.5:1 contrast on the near-solid surfaces; the hero still puts its text on a dark panel even when more rain shows through.
- Focus rings, touch targets, and the 375px no-horizontal-scroll rule follow the base system. The fixed status bar is accounted for in content and sidebar bottom clearance.
- Decorative rain glyphs, boot lines, and log text stay generic and safe.

### Intentional anti-pattern flags

These are deliberate for this variant and must not leak into light/dark: monospace as the whole interface voice, glow on headings/decoration, scanline and vignette overlays, uppercase short labels, rain behind content, ASCII/bracketed chrome, and a boot/glitch motion layer. Still avoided: gradient text on body content, glassmorphism panels, identical card grids, and glow on body text.

### Implementation map

- `lib/theme.ts` / `lib/use-theme.ts`: three-mode type, system-preference first visit, persistence and session fallback, cross-dissolve, cinematic hand-off on selection.
- `lib/hacker-cinema.ts`: run store, trigger policy, timeline constants, reel/globe math shared with the overlay.
- `lib/hacker-audio.ts`: the synthesized beep/slam/collapse voices.
- `lib/hacker-settings.ts` / `lib/use-hacker.ts`: run and audio flags, the cheat-code phrase buffer, and the keyboard listener.
- `components/settings/settings-panel.tsx` and `app/settings/page.tsx`: the only three-way theme control, plus the cheat-code switch.
- `components/theme-toggle.tsx`: header light/dark quick switch, hidden in hacker mode.
- `components/hacker/hacker-chrome.tsx`: mounts rain, overlays, effects, boot, and status bar only while hacker is active.
- `components/hacker/hacker-cinema.tsx`: the two session cinematics (splash and power-down), their skip rules, sound control, and reduced-motion covers.
- `components/hacker/rain-canvas.tsx` / `lib/hacker-rain.ts`: rain renderer and tuning.
- `components/hacker/boot-sequence.tsx` / `hacker-effects.tsx` / `lib/hacker-effects.ts`: session boot, heading glitch, link scramble.
- `components/hacker/hacker-status-bar.tsx` / `lib/use-hacker.ts` / `lib/hacker-settings.ts`: rain control, splash and power-down switches, audio flag, reduced-motion behavior.

## Typography

**Display Font:** Geist variable, loaded locally, with the system sans-serif stack as fallback; no separate display face.
**Body Font:** Geist variable through `--font-sans`, followed by `ui-sans-serif`, system-ui, Apple system, BlinkMacSystemFont, Segoe UI, and sans-serif fallbacks.
**Label/Mono Font:** The same Geist sans stack for labels; `--font-mono` resolves to `ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace` for code and identifiers.

**Character:** Locally bundled Geist gives the interface a consistent, direct sans-serif voice, with weight and spacing carrying hierarchy instead of a separate display face. Monospaced text is reserved for hashes, structured values, and identifiers.

In hacker mode the whole interface intentionally switches to `--font-mono`; headings stay sentence case at the documented sizes, while short labels become uppercase and bracketed. This is the one documented exception to the One Sans Rule.

### Hierarchy
- **Headline** (650, 24px, 1.25 line-height, -0.025em tracking): Page titles.
- **Phone Headline** (650, 22px, 1.25 line-height): The smaller page-title step at 600px and below.
- **Brand** (700, 18px): The TESIS wordmark; the compact mark uses the same size.
- **Title** (600, 16px, 1.4 line-height): Card and major panel headings.
- **Section** (600, 14px, 1.5 line-height): Subsection headings.
- **Body** (400, 14px, 1.5 line-height): General interface copy; descriptive text stays near 75ch where space allows.
- **Control** (500, 13px, 1.3 line-height): Buttons, selects, and compact controls.
- **Label** (500, 12px, 1.5 line-height): Field labels and metadata.
- **Status** (500, 11px, 1.35 line-height): Compact status badges.
- **Mono** (400, 12px, 1.6 line-height): Code, hashes, and structured values.
- **Technical Metadata** (400, 10px): Secondary graph-kind labels and compact canonical status codes; never body copy or controls.

Panel titles use the 16px title level consistently. Links within guide prose retain an underline, independent of hover or theme.

**The One Sans Rule.** Use Geist through `--font-sans`, with its system fallback stack, for interface text; reserve monospace for technical values. Hacker mode is the documented exception, where monospace becomes the interface voice.

## Layout

The desktop workspace uses a fixed 216px sidebar, a sticky 56px top bar, and a flexible content area with 24px page gutters; phones use 12px gutters. A 4px-based rhythm supports compact spacing; common gaps and padding step through 8px, 12px, 16px, 20px, and 24px. The current-run view places the AKG in the main column and status, coordinate, and trajectory panels in a 330px rail. On wide screens, that rail shares the monitor height; at 1200px and below the runtime layout stacks. Completed results use a main inspection area with a 300px detail rail and collapse to one column at 1100px.

At 900px and below, the fixed sidebar becomes a menu drawer. At 600px and below, page gutters tighten, summary grids and runtime panels stack, and interactive controls reach a 44px minimum height. Results discovery uses five semantic columns on desktop: recorded context/identity, provider/model/date, coverage/lifecycle, security outcomes, and inspection actions. At 1100px and below rows reflow into labeled groups; phones stack identity, provider context, and actions around two lifecycle/outcome columns without page-level scrolling. Wide evidence and coordinate tables scroll within their own containers.

Coarse-pointer devices use 44px controls even above the phone breakpoint. Numbered traversal steps, experiment actions, and Overview outcome drill-downs follow the same target size. Fine-pointer desktop controls retain compact density. The saved theme is applied by a fixed head script before the initial styled paint.

On wide screens the live monitor adds resizable tracks: a vertical separator adjusts the 330px right rail (280–720px, never past 60vw, and always leaving the graph at least 400px), horizontal separators allocate height between Runtime coordinate, Trajectory, and Outcomes, and a fourth separator at the bottom of the workspace sets the overall monitor height (480–1400px). The default height follows the viewport with a 520px minimum on wide screens and 480px in the stacked layout. On phones, the graph panel has a 520px minimum and its canvas remains at least 300px tall. Moving the separator grows the graph and the stacked rail together and pushes the demonstration replay and timeline down. Defaults preserve the 3/4/3 rail rhythm; drag, Arrow keys, Home/End, double-click, and Enter reset the affected boundary. Sizes persist locally, and handles use the same tokens and focus conventions as the rest of the interface.

Hacker mode adds a fixed 30–47px bottom status bar. The workspace and sidebar reserve bottom clearance so the bar never covers the last row; it is chrome, not a layout row, so it does not resize the page when the mode changes.

**The Evidence Context Rule.** Keep the selected execution, coordinate, score origin, and supporting evidence visibly connected as the layout narrows.

## Elevation & Depth

The system is flat. No box shadows define cards or panels. A clear 1px border, white or subtle neutral surfaces, and small background shifts establish grouping. The sticky top bar, mobile drawer scrim, and expanded AKG view provide structural layering where interaction needs it.

Hacker mode keeps the border-led depth and adds a green text glow on headings, a green focus halo, and the CRT scanline/vignette overlays. These are the documented exception; panels themselves still do not use decorative shadows.

**The Border Defines Depth Rule.** Use borders and tonal surfaces to separate content; keep panels free of decorative shadow.

## Shapes

Cards and primary panels use gently rounded corners (8px). Navigation and AKG nodes use a slightly tighter curve (6px); buttons and fields use a compact control radius (5px), and badges use 4px corners. Status badges remain compact labels rather than oversized pills. Tables use square row geometry, thin dividers, and subtle selected or hover fills.

Hacker mode tightens cards, panels, and controls to 2px and adds bracketed titles and small `+` corner marks. The geometry stays aligned with the base grid; only the terminal frame treatment changes.

## Components

### Buttons
- **Character:** Compact and quiet, with sentence-case labels and a clear focus outline.
- **Default / Outline:** Surface background, primary text, a 1px strong border, 5px corners, and 7px by 12px padding; the outline variant shares the same base treatment.
- **Primary:** Accent blue surface with a contrasting surface-colored label; hover deepens the accent.
- **Ghost:** Transparent at rest with secondary text; hover uses the surface-hover color.
- **Focus / Disabled:** Focus uses a 2px accent outline with a 3px offset. Disabled controls use reduced opacity and a not-allowed cursor. Buttons have no transition outside the theme switch.
- **Sizing:** 34px minimum height for fine-pointer desktop use and 44px for small screens or coarse pointers.
- **Icon controls:** Use square 34px controls for fine-pointer desktop use and 44px touch targets for small screens or coarse pointers. Preserve an accessible action name.

### Chips
- **Style:** Compact 24px status labels with a 4px radius and short internal padding.
- **State:** Neutral badges use a subtle surface and border. Confirmed, caution, failure, interaction, and review variants use their semantic colors and remain text-labeled.

### Cards / Containers
- **Corner Style:** 8px on cards and main panels.
- **Background:** Surface color with a 1px border.
- **Shadow Strategy:** Flat; borders and surface tone provide separation.
- **Internal Padding:** Card content uses 18px on desktop and 14px on small screens. Headers use a compact inset and a bottom divider.

### Inputs / Fields
- **Style:** Surface background, a 1px Control Boundary border, 5px radius, and 7px by 10px padding.
- **Focus:** The shared 2px accent outline with a 3px offset.
- **Sizing:** 36px minimum height on larger screens and 44px on small screens.

### Navigation
- **Desktop:** A 216px sidebar with vertically stacked links, 40px minimum link height, 6px radius, and compact icon-and-label alignment. Active links use a soft accent fill and stronger accent text; hover uses a neutral surface shift.
- **Collapse:** A labeled button at the bottom of the rail collapses the desktop sidebar to 64px and restores it; the wordmark, nav labels, and supporting copy give way to the brand mark, centered icons, and tooltips. The preference persists locally, focus stays on the toggle, and the collapsed state is inert at 900px and below.
- **Mobile:** Navigation opens in a left-side drawer; the top bar retains the menu control and page context. The drawer always shows full labels.

### Settings
- `/settings` is an Operate surface with two halves. **Runtime configuration** owns the experiment: an Experiment tab of loader-backed fields (target, run limits, reporting, logging, guardrails, LLM runtime), a Model providers tab of provider records plus the add/edit form beside them, an AI scorer tab (human / AI / human+AI preset, rubric version, frozen evaluator limits), and an Advanced YAML tab. The card footer carries the actions in one row, left to right by blast radius: Discard changes (with its second-click confirm), Validate, then the outline "Write to TESIS config.yaml", then the primary Save profile. Discarding never touches the saved profile; validation and saving both run through the TESIS loader before anything is replaced.
- **Appearance** stays below it: one section with a native three-way radio group for Light, Dark, and Hacker, plus a Cheat code section. The group's accessible name includes the current mode, selection is announced and focus stays on the chosen radio, and the layout does not change on selection.
- Light and dark render the cheat-code switch as a plain borderless row with a simple pill; hacker keeps the boxed chip card over its terminal chrome. State is conveyed by `aria-checked` (and the pill/chip visually), focus stays on the control.
- Hacker is selected only in Appearance or through the cheat code; the header light/dark quick switch steps aside while hacker is active. The page uses the same card, heading, and focus system in every theme.
- Each configured provider is a record, not a paragraph: the display name carries the exceptions only (`no key`, `staged`, `removal staged`), one meta line holds the protocol and model count, and a labelled fact spine lists Base URL, Catalog, Models, and Key. Model ids are discrete mono chips, never a comma-joined line. The facts pair into two columns when the row is wide enough, except the models row, which keeps the full width so an id never splits inside a half cell; the editor narrows the row, so the facts return to one column there. `Edit provider` and `Remove` hold the right edge of the row at the height of its name, so nothing floats in the middle of the record.
- ChatGPT sign-in is its own block under a divider: a plain-language title with `openai_codex_auth` demoted to a mono reference beside it, its two terminal-backed actions on the heading row, and the `python -m tesis auth login` command as a code strip sized to its content.
- The Advanced YAML tab paints the document with token colour (comments, keys, strings, numbers/literals, `${VAR}` references, secret placeholders) behind a transparent textarea, so selection, undo, and the caret stay native.
- Small mutually exclusive choices (experiment mode, payload review preset) use one bordered segmented track that sizes to its content; it never stretches across the card.
- The appearance section keeps only the theme decision. Rain and the session cinematics live in the hacker status bar; motion behavior follows the OS setting; storage behavior stays in the implementation, not in explanatory copy.

### Runtime control
- `/control` is an Operate surface in one card at a time: Launch, Runs, and Doctor are page tabs, and the Launch card repeats the same underline treatment for its four steps so the two levels read as one system. The step row wraps onto a second line instead of scrolling, because a horizontal scroller clips the 2px focus ring; steps keep 44px targets on small screens and coarse pointers.
- The experiment mode stays in the card header as a segmented track, because switching between a single run and a matrix applies to every step; a segmented track in a card header is a control, not a nested card. Changing the step moves focus to the new step body, so pressing Enter on Next never drops focus to the page body.
- Review is read-only: it resolves the request with the TESIS loader, lists field errors as `path` plus message, and keeps Start disabled until the resolution passes. Start is the card's only primary button and names the save when the draft is dirty ("Save and start").
- Runs lists the supervised jobs and details the selected one. Cancel run is an outline button because the first request is cooperative; Force kill is a ghost that opens a confirm dialog whose destructive button is the only red control in the flow. A selected run shows its status, pid, execution, artifact directory, command, and the tailed runtime log in one focusable scroll region.
- Doctor runs offline checks by default; live checks authenticate to the target and spend provider credits, so their dialog spells that out and confirms with the dialog's primary action.
- Empty states stay inside the card they belong to and name the next step. A card that is still loading shows its own header plus one status line, in the same shape as the loaded card, so the page never reflows into a different shell.
- A modal's confirm is its primary action, not a status hue; red is reserved for the destructive confirm of an action that cannot be undone. Cancel holds initial focus so Escape and Enter on the dialog never destroy work.

### Hacker Chrome
- The fixed status bar, scanline/vignette overlays, and rain canvas are inert outside hacker. The bar groups `[ OK ]` observer status, the `[ RAIN ]` three-way control, the `[ SPLASH ]` and `[ POWER-DOWN ]` on/off switches, and a UTC clock; at 375px it keeps the rain and cinematic controls and the clock and drops nonessential status copy.
- Rain options are stable buttons with `aria-pressed`; changing intensity keeps focus on the pressed control. Reduced motion pins the control to off and disables animated intensities while keeping the static pattern. The cinematic switches follow the same behavior and default both runs on.
- Boot, glitch, and scramble effects are session-scoped or interval-scoped, restore exact text, and never intercept a task. The two session cinematics follow DESIGN.md's "Session cinematics" section for their timelines, skip rules, sound, and reduced-motion covers.

### Live Monitor Panels
- The AKG, coordinate, trajectory, and outcome panels share bordered surface containers with compact headers and scrollable bodies.
- On wide screens the rail width, the three panel heights, and the overall workspace height are user-resizable through keyboard-operable separators; the AKG grows with the remaining space, and the workspace can extend past its default viewport-relative height so the graph and rail claim space from the content below. Sizes persist per browser and clamp so no panel collapses. Below 1201px the existing stacked layout remains.
- The graph uses neutral nodes and edges, blue for traversed paths, ochre for the current node, and green for achieved nodes. Selection receives a visible accent outline.
- On phones, control groups retain accessible names while redundant visual labels recede; the normal graph canvas retains a 300px minimum height as the controls wrap. Expanded views use the available viewport.
- The Trajectory panel is one ledger: no view switch, no second list. It keeps the journal's emission order, never re-sorts it, and shows every record kind by default; raw per-event audit stays in the paged Experiment activity table below the workspace. Turns are headed by `Turn N`, scope, and duration, followed by a status chip, model, token totals, record count, settled node states, and the recorded AKG path. Each cell lists its `#N` index, a kind chip (System, User, Context, Model, Tool, Safety), the event type, compact arguments, and the paired duration; in-flight calls read `running` and never invent a duration. Expanding a cell adds its outcome, node, method, tool, and model, a labelled record inspector, the Request, Reasoning trace, Reasoning summary, and Response blocks, and the raw payload, each drawn only from fields the journal actually carried. The inspector is three lists: `Record timing` (Started, Total duration, TTFT, Generation, Throughput, Source), `Token usage` (Input, Cached, Output, Reasoning, Total tokens), and `Reasoning evidence` (Trace, Trace source, Summary, Summary source). Every row always renders, so the reader can tell three states apart: a value, `not recorded` when the journal was silent although the record kind could have carried the fact, and `n/a` when the phase cannot exist for that kind — a tool call has no first-token latency. The reasoning rows keep the provider's trace and summary independent and name the metadata field each text arrived in (`additional_kwargs.reasoning_content`, `content`, or similar); a trace or summary without that metadata reads `not recorded` rather than a guessed origin, and a record kind that cannot carry provider reasoning reads `n/a`. `Source` names the basis of the numbers (`journal event timestamps`, or `no timestamps recorded`), and a model call without streamed chunks explains its empty latency rows in the row tooltip. The toolbar holds the search field, a `Conversation` toggle that keeps only System, User, and Model cells and reports `X of Y records` in the summary, a Duration control that switches between measured durations and equal-width operations, a Turns control that folds or expands every turn, and one control that expands or collapses every row. The conversation toggle is off by default and its own empty state names the hidden kinds; turns are expanded by default but fold individually from their headers. The timing overview draws every record as a block coloured by kind (System, User, Context, Model, Tool, Safety) on Input / Model / Tools lanes, marks turn boundaries across the lanes, adds a proportional turn strip and the observed start and end clocks, and keeps the per-turn table of start time, duration, token usage, and status. The timing overview stays folded behind a summary line of turns, records, observed span, and failures; opened, it shows the input, model, and tool lanes plus a per-turn table of start time, duration, token usage, and status. The panel body is the single scroll region. `TRAJECTORY-DATA-HANDOFF.md` records which journal fields are still missing.
- Execution status, security outcome, diagnostics, run counts, and budget each keep their own labels and reasons.
- The live monitor's execution summary is a dense key/value strip, not a card grid: each of the four fields puts its label and value on one baseline-aligned line with the supporting note beneath, so the whole strip stays under 48px tall at desktop widths while every value keeps a visible label.

### Data Tables
- Column headings sit on a subtle surface with 12px semibold labels. Cells use 12px by 16px padding, 1px row dividers, and top alignment.
- Hover uses the subtle surface; selection uses the soft accent fill. Numeric values align right with tabular numerals.
- Long tables scroll inside a positioned, horizontally scrollable container. Preserve readable columns and provide comfortable or compact row density where available.
- The experiment inventory reflows into labeled row groups on smaller screens. Exact IDs remain secondary, copyable, and searchable. Compact clips metadata for scanning; Comfortable wraps it. Preserve table row/cell roles and explicit counting units.

### Results and Evidence
- Results keep the chosen coordinate and score origin connected to their detail view. Provisional runtime scores and Human or AI reviews retain distinct labels and source bindings.
- Evidence tables pair sorting and filtering with visible counts, pagination, and a focused detail drawer. Missing values retain their unavailable state.
- Experiment activity replaces the monitor catalog with paged source events and per-execution identity. Bounded trajectory previews link readers to the complete history.
- The guide is a Read surface: semantic comparison tables, explicit metric denominators, and a user-controlled evidence walkthrough with a static reduced-motion alternative.
- Comfortable tables wrap metadata; Compact uses limited-width single-line scanning without changing accessible content. Block disclosures retain 44px coarse-pointer targets.

### Overview and Results discovery
- Overview leads with one experiment selector, its recorded context/source identity, and a factual conclusion before coverage and independent security outcomes. It contains no catalog table, density control, or history pagination.
- Coverage and outcomes use paired bordered panels on desktop and stack on phones. Counts carry their unit and denominator; unavailable values are text, not fabricated zeros. No decorative chart duplicates these small distributions.
- Human and AI readiness occupy independent columns, stacking on phones. State labels and counts share compact, aligned rows; zero counts remain visible with quieter type. Final, pending, stale, missing, unavailable, not-selected, and unscanned states remain text-labeled. Eligibility and scan completeness stay visible.
- Attention uses bordered disclosures, not alert tiles. Affected execution counts and diagnostic-message counts are distinct. On phones descriptions take the full text width and counts sit below; opened groups show exact source diagnostics and scoped Results links.
- Source/epoch attribution and discovery limitations sit in a secondary disclosure. Shared coordinate metadata is identified as supplemental context, never an invented experiment name.
- Results leads with experiment/raw/unresolved inventory levels, search, and outcome filtering. Secondary lifecycle/availability/order/density controls live in a disclosure. Open results is primary; monitoring historical activity is secondary.
- Matrix parents and standalone experiments own default rows; coordinates remain within their parent. Raw execution rows use their own lifecycle/outcome rather than repeating the parent's coordinate distribution. Unresolved records never borrow one ambiguous source's metadata.
- Scope, inventory filters/order/page/density, and detail coordinate/tab/score origin live in URLs. Changing source hides previous content immediately; late responses cannot restore it. Missing explicit selections never silently select another experiment.


## Do's and Don'ts

### Do:
- Do route interactive and selected states through the existing accent tokens, and status states through their semantic tokens.
- Do use 1px borders and the existing neutral surface steps to separate panels.
- Do keep the 2px focus outline with a 3px offset, and give small-screen controls at least 44px height.
- Do label execution status and security outcome separately, keeping reasons, diagnostics, and unavailable states close to the relevant result.
- Do keep the selected execution, coordinate, score origin, and evidence visibly connected.
- Do select hacker on Settings; the header quick switch covers light/dark and steps aside in hacker.
- Do keep hacker glow on headings and decoration only, with body text on near-solid surfaces.

### Don't:
- Don't add gradients, glass effects, decorative grids, or pulse animations outside the documented hacker scanline/vignette/rain treatment.
- Don't add shadows to cards or panels; use the existing border and surface treatment.
- Don't use color as the only carrier of a status; keep its text label visible.
- Don't collapse provisional runtime scoring and independent Human or AI review into one unlabeled value.
- Don't carry hacker rain, scanlines, glow, or uppercase labels into light or dark.
- Don't uppercase body copy, long headings, or control labels in hacker mode.
- Don't fire more than one full-screen flash in a cinematic run, and never spread them faster than three per second (WCAG 2.3.1).
- Don't apply a target theme mid-power-down; the swap belongs at the fully black frame.
