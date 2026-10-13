---
target: TESIS Web dashboard and results explorer against Cloudflare enterprise dashboard design
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/kevin/coding/tesis-web/app"
timestamp: 2026-10-13T02-10-05Z
slug: app
---
Method: dual-agent (A: /root/design_assessment · B: /root/browser_evidence)

TESIS needs a comprehensive redesign around navigation, readable information, and consistent data-review workflows. Its research semantics and AKG are valuable foundations to preserve.

The interface has a recognizable technical-monitor identity. For the researcher, supervisor, and invited examiner, however, its hierarchy makes it harder to answer: what ran, what happened, what evidence supports it, and what remains unknown?

**Cloudflare reference**

I inspected Cloudflare’s published dashboard screenshots, including Security Overview, Security Rules, and Cloudflare One navigation. The useful principles are persistent navigation, clear resource context, a strong page heading, neutral surfaces, restrained accents, and structured tables. Cloudflare also documents navigation organized around users’ tasks. These are published reference examples, not a review of a signed-in Cloudflare account. [Application Security dashboard](https://blog.cloudflare.com/new-application-security-experience/), [Cloudflare One navigation](https://developers.cloudflare.com/changelog/post/new-cloudflare-one-navigation-and-product-experience/).

A light neutral shell with blue interaction accents is a reasonable direction to explore. TESIS should keep its own names, research terminology, and read-only actions.

**Design health: 20/40**

This is an expert heuristic baseline, not a usability-study result. All ten heuristics apply.

| Heuristic | Score / 4 | Main finding |
|---|---:|---|
| Visibility of system status | 2 | Useful runtime states; permanent green Runtime indicator blurs state and location. |
| Match with users’ language | 2 | Raw codes and scoring symbols require interpretation. |
| User control and freedom | 3 | Good return/dismiss controls; evidence rows lack a keyboard opening action. |
| Consistency and standards | 2 | Controls, tabs, filters, and badges follow different conventions. |
| Error prevention | 3 | Read-only boundary and provenance help; completion and legacy success can still be misread. |
| Recognition rather than recall | 2 | Run discovery is tucked away; coordinate labels offer limited comparison context. |
| Flexibility and efficiency | 2 | Useful filters; weak search, sorting, and comparison workflows. |
| Aesthetic and minimalist design | 1 | Large low-information areas coexist with tiny, crowded metadata. |
| Error recovery | 2 | Some retries and recovery paths; empty filtered views lack clear reset guidance. |
| Help and documentation | 1 | Owner setup guidance exists; reviewer-oriented explanations are limited. |
| **Total** | **20/40** | **Acceptable band; substantial improvements required.** |

**What is working**

- Execution status, security outcome, coverage, and score provenance remain distinct. Preserve those distinctions throughout the redesign.
- Full graph, focused path, traversal history, and inspection connect agent activity with AKG topology.
- Source-bound Human/AI reviews, evidence references, unavailable-data reasons, and redacted exports support credible scrutiny. Preserve the existing drawer and expanded-graph focus behavior.

**Priority improvements**

1. **[P1] Navigation needs a real application structure.**

   Both global links, Live and Runtime, lead to `/`. Results has no global destination, and the run catalog is collapsed beneath the runtime workspace. The permanent Runtime highlight also appears on results pages. [Source](/home/kevin/coding/tesis-web/app/layout.tsx:30)

   Establish persistent desktop navigation and a mobile drawer. Give live monitoring and results discovery equal prominence, with a browsable run catalog. Separate application location, selected execution, and connection/freshness indicators. Use breadcrumbs such as Results → Execution → Coordinate, with a readable execution label and the exact ID available nearby.

   Suggested command: `$impeccable shape`.

2. **[P1] Rebuild layout, visual hierarchy, and information density together.**

   The desktop graph occupies roughly two-thirds of the workspace. On mobile, a 560px graph precedes the coordinate and outcome summaries. Results opens on Detailed, even when the aggregate has no evidence rows. Dense status strips and filters sit above large empty areas. [Runtime layout](/home/kevin/coding/tesis-web/app/globals.css:129), [Results entry](/home/kevin/coding/tesis-web/app/results/[executionId]/page.tsx:107)

   Put execution identity and four summary groups first: execution, security outcome, coverage, and review state. Give completed results a meaningful Summary entry view. In live monitoring, keep current traversal and activity easy to find, with full topology available for deeper inspection. Place compact context before the graph on mobile.

   Group metrics by the question they answer. Keep unavailable reasons visible, while avoiding a wall of equally weighted empty tiles. Put legacy fields, long hashes, raw JSON, and detailed diagnostics behind clearly labeled disclosure.

   Suggested commands: `$impeccable layout`, `$impeccable distill`.

3. **[P1] Replace the typography and foreground hierarchy.**

   Important metadata uses 9–11px type, often uppercase monospace. Scoring headers and inactive tabs use dark gray text on near-black surfaces. The decorative grid extends behind results tables. These choices reduce sustained readability. [Typography](/home/kevin/coding/tesis-web/app/globals.css:91), [Shared primitives](/home/kevin/coding/tesis-web/components/ui/primitives.tsx:43)

   Define a small, consistent type scale: approximately 14–16px body text, 13–14px table text, and 12px secondary metadata as starting points. Use sentence case and a reliably loaded sans-serif family. Reserve monospace for identifiers, timestamps, formulas, and raw data. Establish strong primary/secondary text contrast and clear heading levels.

   Use neutral surfaces and restrained interaction accents; give warning, failure, confirmed, and unavailable states explicit meanings supported by text. Keep graph-specific decoration scoped to the graph.

   Suggested commands: `$impeccable typeset`, `$impeccable colorize`.

4. **[P1] Design tables as the primary review tools.**

   Coordinates appear as a growing chip collection. Matrix comparison has limited columns and no visible search or sorting controls. Evidence exposes six filter inputs at once, and its rows open through a click handler without a focusable inspect action. Mobile hides scoring interpretation and evidence links. [Coordinate picker](/home/kevin/coding/tesis-web/components/results/coordinate-index.tsx:42), [Evidence table](/home/kevin/coding/tesis-web/components/results/detail-table.tsx:118), [Scoring table](/home/kevin/coding/tesis-web/components/results/scoring-table.tsx:57)

   Use a structured coordinate table with meaningful sorting, search, stable selection, and columns for condition, method, execution, security outcome, and review state. Keep score origin explicit beside scores. Preserve four-decimal final scores, denominators, and unavailable reasons.

   Standardize row spacing, header treatment, alignment, tabular numerals, and row actions. Provide comfortable and compact density options. Show common filters first, group advanced filters, and offer a clear reset. Add explicit keyboard-accessible Inspect evidence controls.

   On mobile, keep interpretation and evidence reachable through row details or a deliberate alternate layout. Horizontal scrolling alone does not replace that access.

   Suggested commands: `$impeccable harden`, `$impeccable adapt`.

5. **[P2] Establish one component and state language.**

   Graph controls, native selects, coordinate chips, tabs, and score-source buttons use different sizing and selection conventions. AI review is correctly marked `aria-pressed=true`, but looks identical to the other score-source buttons. Result tabs have visible selection styling but lack tab/selection semantics. [Score source controls](/home/kevin/coding/tesis-web/components/results/scoring-table.tsx:32), [Tabs](/home/kevin/coding/tesis-web/components/ui/primitives.tsx:134)

   Define shared buttons, fields, tabs, status badges, banners, empty states, and drawers with consistent sizing and focus/selected states. Measured tabs and score-source controls are only 25–26px high; target sizing deserves deliberate review.

   Give every score view a visible origin, review status, rubric, and evidence binding. Translate raw values into readable labels while retaining exact values in details. Move mock replay into a clearly labeled demonstration/help area, and distinguish reviewer guidance from owner setup guidance.

   Suggested commands: `$impeccable clarify`, `$impeccable polish`.

**Cognitive load and reviewer experience**

Six checklist areas need improvement: focus, chunking, hierarchy, sequencing, choice management, and progressive disclosure. The graph offers eight controls; evidence shows six filter inputs; coverage presents eight counts before outcome counts; metrics starts with twelve tiles. The issue is how these compete for attention, rather than the number of table columns alone.

The researcher encounters a hidden catalog and limited comparison tools. An examiner encounters raw terms such as `no_finding`, legacy success, and provisional scores without a clear reading sequence. A keyboard or low-vision reviewer encounters tiny dim labels, click-only evidence rows, and weak selected-source styling.

A successful redesign should guide the reader through execution identity → outcome → supporting evidence → limitations.

**Smaller improvements**

Make filters, coordinates, and selected views shareable/restorable. Allow full evidence-summary values to wrap or expand. Provide copy access for source identifiers and hashes. Explain scoring dimensions with readable labels while retaining their technical symbols.

**Detector and browser evidence**

The source detector returned one advisory in app and none in components: `codex-grid-background` at [globals.css](/home/kevin/coding/tesis-web/app/globals.css:23). A grid can serve the AKG; its application-wide use behind results remains relevant.

Injected browser scans reported 60 signals on the dashboard and 35 on aggregate results. Individual rule/location records were unavailable, so these are supporting signals, not 95 verified defects. The main critique rests on independently inspected source and screenshots.

Desktop inspection used 1440×900; mobile used 390×844. Results used sanitized fixtures, and the rich 29-node graph used mock/static data. Documents stayed within the mobile viewport; evidence tables used local scrolling. This is design inspection, not live experiment acceptance or a completed accessibility audit.

Useful captures: [runtime](/tmp/tesis-web-critique-mock-static-desktop.png), [results](/tmp/tesis-web-critique-results-overview-desktop.png), [scoring](/tmp/tesis-web-critique-scoring-desktop.png), [mobile scoring](/tmp/tesis-web-critique-scoring-mobile.png).

**Redesign preparation**

Next, use `$impeccable shape` to settle the application map, default entry view, and review workflows. Then define the replacement design system and representative desktop/mobile screens before implementation. Preserve the observer-only boundary and evidence semantics.

Questions to consider for that brief: should the default entry emphasize a run catalog or an overview, and should the current traversal or full topology lead the live view?
