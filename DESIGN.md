---
name: TESIS Web Observer
description: A read-only research observer for live TESIS runs and their evidence.
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

**Intent:** the movie version of a research terminal. Near-black phosphor green, full monospace, CRT glow, scanlines, and rain behind the workspace. It is an opt-in skin over the same observer, not a separate product: every page, data contract, status label, and read-only boundary remains the same.

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
- Three overlapping depths: far (10px, dim, slower, ~30fps movement), mid (14px, normal green, ~30fps), near (22px, bright, full refresh). The translucent trail fill keeps the depth layers visually distinct.
- Each column has a bright leading glyph, a fading trail, a random length and speed, and a random reset off screen. Half-width katakana, digits, hex letters, brackets, slashes, and shade blocks are the complete vocabulary; a few trail glyphs swap every few frames.
- Columns near the pointer brighten and speed up slightly. Every 6–11s one random column flashes along its full height for about half a second.
- Rain is off in light/dark. The status bar offers off / normal / max; max is the default. Mobile halves the column count and the canvas pauses when the tab is hidden or the near layer is off screen.
- Reduced motion draws a static faint column pattern instead of animating and starts the control at off.

### Motion and effects

- First load in hacker mode can run a short, generic boot log; any click or key skips it, `sessionStorage` marks it seen for the session, and reduced motion skips it entirely. Logs are deliberately generic: no hosts, addresses, credentials, or exploit output.
- Every 4–8s one visible plain-text heading scrambles for about 300ms and shifts slightly. Link text scrambles for about 300ms on hover. Both restore exact text and never destroy icons or nested markup.
- The boot, glitch, and scramble effects are decorative. They never replace information or block a task.

### Readability and accessibility

- Body and secondary text keep at least 4.5:1 contrast on the near-solid surfaces; the hero still puts its text on a dark panel even when more rain shows through.
- Focus rings, touch targets, and the 375px no-horizontal-scroll rule follow the base system. The fixed status bar is accounted for in content and sidebar bottom clearance.
- Decorative rain glyphs, boot lines, and log text stay generic and safe.

### Intentional anti-pattern flags

These are deliberate for this variant and must not leak into light/dark: monospace as the whole interface voice, glow on headings/decoration, scanline and vignette overlays, uppercase short labels, rain behind content, ASCII/bracketed chrome, and a boot/glitch motion layer. Still avoided: gradient text on body content, glassmorphism panels, identical card grids, and glow on body text.

### Implementation map

- `lib/theme.ts` / `lib/use-theme.ts`: three-mode type, system-preference first visit, persistence and session fallback, cross-dissolve.
- `components/settings/settings-panel.tsx` and `app/settings/page.tsx`: the only three-way theme control.
- `components/theme-toggle.tsx`: header light/dark quick switch, hidden in hacker mode.
- `components/hacker/hacker-chrome.tsx`: mounts rain, overlays, effects, boot, and status bar only while hacker is active.
- `components/hacker/rain-canvas.tsx` / `lib/hacker-rain.ts`: rain renderer and tuning.
- `components/hacker/boot-sequence.tsx` / `hacker-effects.tsx` / `lib/hacker-effects.ts`: session boot, heading glitch, link scramble.
- `components/hacker/hacker-status-bar.tsx` / `lib/use-hacker.ts`: rain control and reduced-motion behavior.

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

The desktop workspace uses a fixed 216px sidebar, a sticky 56px top bar, and a flexible content area with 28px page gutters. A 4px-based rhythm supports compact spacing; common gaps and padding step through 8px, 12px, 16px, 20px, and 24px. The current-run view places the AKG in the main column and status, coordinate, and conversation panels in a 330px rail. On wide screens, that rail shares the monitor height; at 1200px and below the runtime layout stacks. Completed results use a main inspection area with a 300px detail rail and collapse to one column at 1100px.

At 900px and below, the fixed sidebar becomes a menu drawer. At 600px and below, page gutters tighten, summary grids and runtime panels stack, and interactive controls reach a 44px minimum height. Results discovery uses five semantic columns on desktop: recorded context/identity, provider/model/date, coverage/lifecycle, security outcomes, and inspection actions. At 1100px and below rows reflow into labeled groups; phones stack identity, provider context, and actions around two lifecycle/outcome columns without page-level scrolling. Wide evidence and coordinate tables scroll within their own containers.

Coarse-pointer devices use 44px controls even above the phone breakpoint. Numbered traversal steps, experiment actions, and Overview outcome drill-downs follow the same target size. Fine-pointer desktop controls retain compact density. The saved theme is applied by a fixed head script before the initial styled paint.

On wide screens the live monitor adds resizable tracks: a vertical separator adjusts the 330px right rail (280–520px or 45vw), horizontal separators allocate height between Runtime coordinate, Conversation, and Outcomes, and a fourth separator at the bottom of the workspace sets the overall monitor height (480–1400px) that used to be locked by the `--live-height` clamp. Moving it grows the graph and the stacked rail together and pushes the demonstration replay and timeline down. Defaults preserve the old 3/4/3 rhythm and the viewport-relative height; drag, Arrow keys, Home/End, double-click, and Enter reset the affected boundary. Sizes persist locally, the narrow stacked layout is untouched, and handles use the same tokens and focus conventions as the rest of the interface.

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
- `/settings` is an Operate surface: one appearance section and a native three-way radio group for Light, Dark, and Hacker. The group's accessible name includes the current mode, selection is announced and focus stays on the chosen radio, and the layout does not change on selection.
- Hacker is selected only here; the header light/dark quick switch steps aside while hacker is active. The page uses the same card, heading, and focus system in every theme.
- The page keeps only the theme decision. Rain lives in the hacker status bar; motion behavior follows the OS setting; storage behavior stays in the implementation, not in explanatory copy.

### Hacker Chrome
- The fixed status bar, scanline/vignette overlays, and rain canvas are inert outside hacker. The bar groups `[ OK ]` observer status, the `[ RAIN ]` three-way control, and a UTC clock; at 375px it keeps the rain control and clock and drops nonessential status copy.
- Rain options are stable buttons with `aria-pressed`; changing intensity keeps focus on the pressed control. Reduced motion pins the control to off and disables animated intensities while keeping the static pattern.
- Boot, glitch, and scramble effects are session-scoped or interval-scoped, restore exact text, and never intercept a task.

### Live Monitor Panels
- The AKG, coordinate, conversation, and outcome panels share bordered surface containers with compact headers and scrollable bodies.
- On wide screens the rail width, the three panel heights, and the overall workspace height are user-resizable through keyboard-operable separators; the AKG grows with the remaining space, and the workspace can extend past its default viewport-relative height so the graph and rail claim space from the content below. Sizes persist per browser and clamp so no panel collapses. Below 1201px the existing stacked layout remains.
- The graph uses neutral nodes and edges, blue for traversed paths, ochre for the current node, and green for achieved nodes. Selection receives a visible accent outline.
- On phones, control groups retain accessible names while redundant visual labels recede; the normal graph canvas retains a 300px minimum height as the controls wrap. Expanded views use the available viewport.
- The conversation stream separates role, event type, message, time, and optional structured details. Safety events use the warning color and retain explanatory text.
- Execution status, security outcome, diagnostics, run counts, and budget each keep their own labels and reasons.

### Data Tables
- Column headings sit on a subtle surface with 12px semibold labels. Cells use 12px by 16px padding, 1px row dividers, and top alignment.
- Hover uses the subtle surface; selection uses the soft accent fill. Numeric values align right with tabular numerals.
- Long tables scroll inside a positioned, horizontally scrollable container. Preserve readable columns and provide comfortable or compact row density where available.
- The experiment inventory reflows into labeled row groups on smaller screens. Exact IDs remain secondary, copyable, and searchable. Compact clips metadata for scanning; Comfortable wraps it. Preserve table row/cell roles and explicit counting units.

### Results and Evidence
- Results keep the chosen coordinate and score origin connected to their detail view. Provisional runtime scores and Human or AI reviews retain distinct labels and source bindings.
- Evidence tables pair sorting and filtering with visible counts, pagination, and a focused detail drawer. Missing values retain their unavailable state.
- Experiment activity replaces the monitor catalog with paged source events and per-execution identity. Bounded conversation previews link readers to the complete history.
- The guide is a Read surface: semantic comparison tables, explicit metric denominators, and a user-controlled evidence walkthrough with a static reduced-motion alternative.
- Comfortable tables wrap metadata; Compact uses limited-width single-line scanning without changing accessible content. Block disclosures retain 44px coarse-pointer targets.

### Overview and Results discovery
- Overview leads with one experiment selector, its recorded context/source identity, and a factual conclusion before coverage and independent security outcomes. It contains no catalog table, density control, or history pagination.
- Coverage and outcomes use paired bordered panels on desktop and stack on phones. Counts carry their unit and denominator; unavailable values are text, not fabricated zeros. No decorative chart duplicates these small distributions.
- Human and AI readiness occupy independent columns, stacking on phones. Final, pending, stale, missing, unavailable, not-selected, and unscanned states remain text-labeled. Eligibility and scan completeness stay visible.
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
