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

TESIS Web Observer should read like a trusted research console for people following an experiment and inspecting its record. Its Cloudflare-inspired enterprise character comes from cool neutral surfaces, clear blue interactions, concise sans-serif type, compact navigation, and dense but readable data. Light is the default; the existing dark theme keeps the same semantic color roles.

The live monitor leads with the current run, model conversation, Attack Knowledge Graph (AKG), and factual status panels. Completed results and comparison stay easy to reach, with source details, review origin, and evidence kept close to each conclusion. Borders and surface tone define structure, while movement stays quiet.

**Key Characteristics:**
- Current-run monitoring with the model stream, AKG, and status panels.
- Dense, aligned tables with source and score provenance in view.
- Flat neutral surfaces, clear 1px borders, and compact controls.
- Light default theme with an optional dark theme and consistent semantic roles.

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

## Typography

**Display Font:** Geist variable, loaded locally, with the system sans-serif stack as fallback; no separate display face.
**Body Font:** Geist variable through `--font-sans`, followed by `ui-sans-serif`, system-ui, Apple system, BlinkMacSystemFont, Segoe UI, and sans-serif fallbacks.
**Label/Mono Font:** The same Geist sans stack for labels; `--font-mono` resolves to `ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace` for code and identifiers.

**Character:** Locally bundled Geist gives the interface a consistent, direct sans-serif voice, with weight and spacing carrying hierarchy instead of a separate display face. Monospaced text is reserved for hashes, structured values, and identifiers.

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

**The One Sans Rule.** Use Geist through `--font-sans`, with its system fallback stack, for interface text; reserve monospace for technical values.

## Layout

The desktop workspace uses a fixed 216px sidebar, a sticky 56px top bar, and a flexible content area with 28px page gutters. A 4px-based rhythm supports compact spacing; common gaps and padding step through 8px, 12px, 16px, 20px, and 24px. The current-run view places the AKG in the main column and status, coordinate, and conversation panels in a 330px rail. On wide screens, that rail shares the monitor height; at 1200px and below the runtime layout stacks. Completed results use a main inspection area with a 300px detail rail and collapse to one column at 1100px.

At 900px and below, the fixed sidebar becomes a menu drawer. At 600px and below, page gutters tighten, summary grids and runtime panels stack, and interactive controls reach a 44px minimum height. The run catalog keeps all seven fields in a labeled two-column row layout without horizontal scrolling; execution identity, start time, and actions span the row. Wide evidence and matrix tables keep their columns and scroll within their own container; comfortable and compact density remain available for evidence review.

Coarse-pointer devices use 44px controls even above the phone breakpoint. Numbered traversal steps and catalog identity controls follow the same target size. Fine-pointer desktop controls retain compact density. The saved theme is applied by a fixed head script before the initial styled paint.

**The Evidence Context Rule.** Keep the selected execution, coordinate, score origin, and supporting evidence visibly connected as the layout narrows.

## Elevation & Depth

The system is flat. No box shadows define cards or panels. A clear 1px border, white or subtle neutral surfaces, and small background shifts establish grouping. The sticky top bar, mobile drawer scrim, and expanded AKG view provide structural layering where interaction needs it.

**The Border Defines Depth Rule.** Use borders and tonal surfaces to separate content; keep panels free of decorative shadow.

## Shapes

Cards and primary panels use gently rounded corners (8px). Navigation and AKG nodes use a slightly tighter curve (6px); buttons and fields use a compact control radius (5px), and badges use 4px corners. Status badges remain compact labels rather than oversized pills. Tables use square row geometry, thin dividers, and subtle selected or hover fills.

## Components

### Buttons
- **Character:** Compact and quiet, with sentence-case labels and a clear focus outline.
- **Default / Outline:** Surface background, primary text, a 1px strong border, 5px corners, and 7px by 12px padding; the outline variant shares the same base treatment.
- **Primary:** Accent blue surface with a contrasting surface-colored label; hover deepens the accent.
- **Ghost:** Transparent at rest with secondary text; hover uses the surface-hover color.
- **Focus / Disabled:** Focus uses a 2px accent outline with a 3px offset. Disabled controls use reduced opacity and a not-allowed cursor. Buttons have no transition in the current stylesheet.
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
- **Mobile:** Navigation opens in a left-side drawer; the top bar retains the menu control and page context.

### Data Tables
- Column headings sit on a subtle surface with 12px semibold labels. Cells use 12px by 16px padding, 1px row dividers, and top alignment.
- Hover uses the subtle surface; selection uses the soft accent fill. Numeric values align right with tabular numerals.
- Long tables scroll inside a positioned, horizontally scrollable container. Preserve readable columns and provide comfortable or compact row density where available.
- The run catalog reflows into labeled two-column rows on small screens. Keep all seven fields, make the execution identity, start time, and actions span the row, and preserve table row and cell roles.

### Live Monitor Panels
- The AKG, coordinate, conversation, and outcome panels share bordered surface containers with compact headers and scrollable bodies.
- The graph uses neutral nodes and edges, blue for traversed paths, ochre for the current node, and green for achieved nodes. Selection receives a visible accent outline.
- On phones, control groups retain accessible names while redundant visual labels recede; the normal graph canvas retains a 300px minimum height as the controls wrap. Expanded views use the available viewport.
- The conversation stream separates role, event type, message, time, and optional structured details. Safety events use the warning color and retain explanatory text.
- Execution status, security outcome, diagnostics, run counts, and budget each keep their own labels and reasons.

### Results and Evidence
- Results keep the chosen coordinate and score origin connected to their detail view. Provisional runtime scores and Human or AI reviews retain distinct labels and source bindings.
- Evidence tables pair sorting and filtering with visible counts, pagination, and a focused detail drawer. Missing values retain their unavailable state.

## Do's and Don'ts

### Do:
- Do route interactive and selected states through the existing accent tokens, and status states through their semantic tokens.
- Do use 1px borders and the existing neutral surface steps to separate panels.
- Do keep the 2px focus outline with a 3px offset, and give small-screen controls at least 44px height.
- Do label execution status and security outcome separately, keeping reasons, diagnostics, and unavailable states close to the relevant result.
- Do keep the selected execution, coordinate, score origin, and evidence visibly connected.

### Don't:
- Don't add gradients, glass effects, decorative grids, or pulse animations.
- Don't add shadows to cards or panels; use the existing border and surface treatment.
- Don't use color as the only carrier of a status; keep its text label visible.
- Don't collapse provisional runtime scoring and independent Human or AI review into one unlabeled value.
