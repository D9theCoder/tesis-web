# TESIS Web technical UI audit

Date: 2026-10-13. Scope: the current staged enterprise dashboard redesign and
polish implementation. This audit documents findings; application code and the
existing staged changes were preserved.

## Implementation integrity verdict

**Pass.** The implementation expresses a coherent research observer: shared
surface and status tokens, locally bundled Geist, clear execution versus security
outcome labels, independent score origins, source hashes, and direct evidence
inspection. The catalog preserves all seven fields on phones. These are specific
to TESIS workflows and consistent with PRODUCT.md and the pinned DESIGN.md.

The bundled Impeccable detector reported **zero primary findings and nine
advisories**. Context review reduces those advisories to one documentation issue
(F9), rather than nine user-facing defects. State-specific correctness and
accessibility still need the changes below.

## Executive summary

**Audit health: 14/20, Good.** Nine distinct issues: **0 P0, 4 P1, 4 P2, 1 P3**.
Repeated occurrences across themes and viewport sizes are counted once.

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 2/4 | Color-only guide links, weak field and graph contrast, invalid metric definition groups |
| 2 | Performance | 3/4 | A large ELK-containing chunk and a 679ms cold-load task under simulated slower CPU |
| 3 | Theming | 3/4 | Saved dark mode is applied after hydration, leaving an initial light surface |
| 4 | Responsive design | 3/4 | Layout fits inspected widths; traversal and tablet controls miss the 44px comfort target |
| 5 | Implementation integrity | 3/4 | Copied-state feedback survives a coordinate identity change; a few design exceptions are undocumented |
| **Total** | | **14/20** | **Good: address weak dimensions** |

Priority work is to make guide links visibly recognizable, restore meaningful
non-text contrast, and associate all metric explanations with their values.
Then correct copied-state feedback, touch sizing, theme initialization, and
client-load costs. The general layout and product identity can be preserved.

## Evidence and limits

- A fresh production build served existing sanitized artifacts from
  `/tmp/tesis-web-redesign-fixtures` on localhost. Local mock replay supplied the
  graph states. No experiments, DVWA operations, provider calls, or source writes
  were performed.
- Chromium **153.0.8010.12**, Playwright, and axe-core **4.13.0** inspected **45
  rendered states**. Coverage includes guide, overview, catalog, mock monitor,
  expanded graph, aggregate summary, selected-coordinate AI scoring, evidence,
  evidence drawer, and phone navigation.
- Desktop 1440px and phone 320px were inspected in both themes; tablet 768px was
  inspected in light mode. Phone contexts used reduced motion and touch support.
  All 45 states had document width at or below viewport width. Some evidence,
  matrix, and tablet catalog tables intentionally scroll inside their containers.
- Keyboard confirmation covered result-tab arrows, drawer Tab wrapping and
  Escape/focus restoration, expanded-graph Escape/focus restoration, phone
  navigation, and the outcomes scroller. Synthesized CDP touch covered graph pan,
  cancellation, and recovery on an uncovered canvas region.
- Performance samples used a cold browser context, warm local server, unthrottled
  network, and normal versus 4x CPU throttling. Resource totals include automatic
  navigation prefetch. Gzip sizes are computed estimates, not measured wire bytes.
- Axe found three recurring rule IDs. Two are confirmed below; the outcomes
  scroller warning was disproved in this Chromium engine. Several contrast and
  ARIA checks remain marked incomplete by axe, especially transformed graph text
  and content in scrollable tables. Zero reported violations is not certification.
- Physical devices, Safari, Firefox, screen-reader announcements, large real
  journals, and browser text-only zoom were not tested. A 200% CSS font override
  kept document width within 320px, but feature text in px stayed fixed; that is
  not evidence of browser text-scaling acceptance. Automated scans can leave
  focus and scroll state visible in captures; those capture effects were not
  treated as layout defects.

Raw evidence: [browser scans](browser-audit.json),
[focused confirmation](confirmation.json), [detector output](detector.json),
[source and evidence hashes](source-manifest.json), and [build log](build.log).
Local screenshots are in the gitignored `.impeccable/audit-2026-10-13/` directory.

## P1 findings

### F1. Guide links rely on color alone

- **Location:** [app/help/page.tsx:6](/home/kevin/coding/tesis-web/app/help/page.tsx:6),
  [app/globals.css:72](/home/kevin/coding/tesis-web/app/globals.css:72).
- **Category:** Accessibility.
- **Evidence:** Axe `link-in-text-block` identifies the two inline links in every
  guide scan. Computed link-to-surrounding-text contrast is **1.16:1** in light
  mode and **1.10:1** in dark mode, with no underline or other persistent cue.
- **Impact:** Readers with color-vision differences can miss the two primary
  workflow links because they appear to be ordinary prose.
- **Standard:** [WCAG 1.4.1, Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
- **Recommendation:** Give links inside prose a persistent underline using a
  shared prose-link rule. Preserve the compact navigation and button treatments.
- **Suggested command:** `$impeccable harden`.

### F2. Light-theme field boundaries have insufficient contrast

- **Location:** [app/globals.css:17](/home/kevin/coding/tesis-web/app/globals.css:17),
  [app/globals.css:164](/home/kevin/coding/tesis-web/app/globals.css:164).
- **Category:** Accessibility / Theming.
- **Evidence:** The catalog search field's author-styled boundary is
  `rgb(178, 190, 208)` against white: **1.88:1**. Its white fill against the
  surrounding white surface is **1:1**. The shared rule uses this treatment for
  inputs throughout filtering and evidence review.
- **Impact:** Low-vision users have difficulty locating the editable area,
  particularly when fields contain little content. This is a field-boundary
  finding; decorative card borders and text-labeled buttons are not implicated.
- **Standard:** Meaningful control identification requires 3:1 contrast under
  [WCAG 1.4.11, Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- **Recommendation:** Add a dedicated control-boundary token with at least 3:1
  against its adjacent surface. Keep the lighter divider token for structural
  borders, and verify both themes and focus states.
- **Suggested command:** `$impeccable colorize`.

### F3. Pending graph connectors fall below meaningful-graphic contrast

- **Location:** [app/globals.css:45](/home/kevin/coding/tesis-web/app/globals.css:45),
  [components/runtime/akg-graph.tsx:129](/home/kevin/coding/tesis-web/components/runtime/akg-graph.tsx:129).
- **Category:** Accessibility / Theming.
- **Evidence:** A rendered non-traversed connector uses `rgb(139, 155, 177)` on
  `rgb(248, 250, 253)`: **2.71:1**. These thin connectors communicate available
  graph relationships, rather than serving as decoration.
- **Impact:** Low-vision reviewers can lose unvisited connections and therefore
  misread available traversal alternatives.
- **Standard:** Meaningful graphic parts require 3:1 under
  [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- **Recommendation:** Darken the light-theme graph-edge token enough to meet the
  threshold on the canvas and group fills. Preserve the separate traversed,
  current, and confirmed colors. Consider a small margin above 3:1 for thin lines.
- **Suggested command:** `$impeccable colorize`.

### F4. Metric explanations sit outside valid definition groups

- **Location:** [components/results/scoring-table.tsx:319](/home/kevin/coding/tesis-web/components/results/scoring-table.tsx:319).
- **Category:** Accessibility.
- **Evidence:** Additional recorded metrics render `<dl><div><dt>…</dt><dd>…</dd>
  <p>reason or availability counts</p></div></dl>`. Axe reports `definition-list`
  in all five scoring configurations. Paragraph siblings inside the grouping
  div do not satisfy the definition-list content model.
- **Impact:** The metric's value and its missing-data explanation are visually
  grouped but not represented as one valid description. Assistive-technology
  interpretation of that relationship is unreliable; announcements were not
  measured in this audit.
- **Standard:** The intended relationship falls under
  [WCAG 1.3.1, Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html).
- **Recommendation:** Put the reason, availability counts, and reason breakdown
  inside the metric's `<dd>`, or use additional valid descriptions for that term.
  Keep every unavailable reason visible.
- **Suggested command:** `$impeccable harden`.

## P2 findings

### F5. Saved dark mode appears only after hydration

- **Location:** [components/app-shell.tsx:27](/home/kevin/coding/tesis-web/components/app-shell.tsx:27),
  [components/app-shell.tsx:33](/home/kevin/coding/tesis-web/components/app-shell.tsx:33),
  [app/layout.tsx:26](/home/kevin/coding/tesis-web/app/layout.tsx:26).
- **Category:** Theming.
- **Evidence:** With `tesis-theme:v1=dark` and client scripts temporarily held,
  the server-rendered guide displays `rgb(247, 249, 252)` with no theme attribute.
  Releasing scripts switches the background to `rgb(15, 23, 37)`. The server
  snapshot is always light and the theme attribute is applied in an effect.
- **Impact:** Returning dark-theme users see a bright initial page and a visible
  palette change. The delay depends on client loading and hydration speed.
- **Standard:** Product theme-persistence expectation; no WCAG failure asserted.
- **Recommendation:** Apply the stored theme before the first styled paint,
  using a small safe initialization path, or adopt a server-readable preference.
  Preserve storage-failure behavior and hydration consistency.
- **Suggested command:** `$impeccable harden`.

### F6. Touch sizing stops short of the shared 44px target

- **Location:** [app/globals.css:248](/home/kevin/coding/tesis-web/app/globals.css:248),
  [app/globals.css:280](/home/kevin/coding/tesis-web/app/globals.css:280),
  [app/globals.css:312](/home/kevin/coding/tesis-web/app/globals.css:312).
- **Category:** Responsive.
- **Evidence:** Numbered traversal buttons are **34px high** on a 320px touch
  viewport. Catalog identity links are **19.5px high**, although the alternative
  Monitor/Results actions are 44px. At 768px, menu and theme icons are **34×34px**,
  ordinary buttons are 34px high, and fields are 36px high. The larger target rule
  only applies at 600px and below and does not include traversal buttons.
- **Impact:** Compact graph controls and tablet controls require more precise
  tapping than the established phone button pattern.
- **Standard:** Impeccable's 44px comfort target. WCAG 2.2 AA uses a different
  [24px minimum with exceptions](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html);
  these measurements alone do not establish an AA target-size violation.
- **Recommendation:** Extend 44px sizing to traversal and primary identity
  controls, and use an appropriate coarse-pointer rule for tablet interactions.
  Keep mouse-focused desktop density compact.
- **Suggested command:** `$impeccable adapt`.

### F7. The graph's initial client load has avoidable main-thread cost

- **Location:** [lib/akg-layout.ts:1](/home/kevin/coding/tesis-web/lib/akg-layout.ts:1),
  [lib/akg-layout.ts:193](/home/kevin/coding/tesis-web/lib/akg-layout.ts:193),
  [components/runtime/runtime-shell.tsx:32](/home/kevin/coding/tesis-web/components/runtime/runtime-shell.tsx:32).
- **Category:** Performance.
- **Evidence:** Cold monitor navigation requests **2,283,964 bytes** of client
  JavaScript, approximately **683,692 bytes** when individually gzip-compressed,
  including navigation prefetch. The largest ELK-containing chunk accounts for
  **1,450,917 bytes raw / 433,223 bytes gzip**. `new ELK()` uses the bundled fake
  worker without a real worker factory. A 4x CPU sample observed a **679ms** long
  task; the normal CPU sample's maximum was 59ms. No field INP result is claimed,
  and the long task was not attributed to a specific stack.
- **Impact:** Slower devices can experience a substantial pause while the graph
  becomes usable. Dynamic import separates graph code from other routes, but
  the monitor still loads and evaluates it on first use.
- **Standard:** Performance budget opportunity; no normative size limit asserted.
- **Recommendation:** Profile evaluation and first layout separately, then move
  ELK behind a real Web Worker with a lightweight client entry. Preserve content
  caching, deterministic placement, layout readiness, and failure recovery.
  Review navigation prefetch only after measuring its actual benefit.
- **Suggested command:** `$impeccable optimize`.

### F8. Copied feedback survives a change of execution identity

- **Location:** [components/ui/copy-button.tsx:8](/home/kevin/coding/tesis-web/components/ui/copy-button.tsx:8),
  [app/results/[executionId]/page.tsx:176](/home/kevin/coding/tesis-web/app/results/[executionId]/page.tsx:176).
- **Category:** Implementation integrity.
- **Evidence:** Using a clipboard stub, copy `browser-matrix`, then select
  coordinate `browser-child-a`. The header updates to the child identity while
  the same button still says **Copied**. The stub still contains `browser-matrix`.
  No system clipboard was modified by this check.
- **Impact:** A reviewer can believe the currently displayed coordinate ID has
  been copied and paste the previous execution ID into their research notes.
- **Standard:** Feedback must remain attributable to the value acted on.
- **Recommendation:** Bind feedback to the copied value, or remount/reset the
  control when its value changes. Also prevent an in-flight copy for a previous
  value from setting feedback on a newly selected value.
- **Suggested command:** `$impeccable harden`.

## P3 finding

### F9. Small design-system exceptions are undocumented

- **Location:** [app/globals.css:98](/home/kevin/coding/tesis-web/app/globals.css:98),
  [app/globals.css:99](/home/kevin/coding/tesis-web/app/globals.css:99),
  [app/globals.css:128](/home/kevin/coding/tesis-web/app/globals.css:128),
  [app/globals.css:155](/home/kevin/coding/tesis-web/app/globals.css:155),
  and [DESIGN.md](/home/kevin/coding/tesis-web/DESIGN.md).
- **Category:** Implementation integrity.
- **Evidence:** Nine detector advisories: seven off-ramp typography occurrences
  using 10, 15, 18, or 22px, and two undocumented colors (`#281a09` brand ink and
  the drawer scrim). Some have clear special roles, such as branding and graph
  metadata; the existing document already describes mobile heading adjustment.
- **Impact:** Future contributors cannot reliably distinguish intentional
  component exceptions from unwanted drift. There is no demonstrated current
  task-completion impact.
- **Standard:** Repository design-system documentation consistency.
- **Recommendation:** Record intentional sizes and role-specific colors as
  documented tokens or exceptions. Reconcile repeated 15px panel headings with
  the documented 16px title level. Do not replace the pinned brand palette merely
  to silence detector advisories.
- **Suggested command:** `$impeccable document`.

## Rejected flags and unresolved checks

1. **Outcomes scroller:** Axe reports `scrollable-region-focusable`, but Chromium
   sequential Tab navigation reaches this element despite its DOM `tabIndex=-1`.
   It accepts focus and ArrowDown changes scrollTop from 0 to 30. Excluded from
   confirmed defects for this engine. Explicit focusability would improve
   cross-engine predictability, but Safari/Firefox failure was not established.
2. **Interrupted touch pan:** The initial no-delay probe reported no movement on
   its second gesture. Confirmation picked an uncovered pane location, used
   distinct touch identifiers and bounded move timing, and observed movement
   during normal pan, cancellation, and subsequent pan. No stuck-gesture defect
   is retained. This is Chromium-synthesized touch, not a physical-device result.
3. **Expanded background elements:** The shell is not set inert by the older
   fullscreen selector. Axe did not report a modal defect, and Escape and focus
   restoration passed. Screen-reader isolation and complete Tab cycling were
   not established; this remains a manual verification item, not a scored issue.
4. **Global reduced-motion reset:** The app disables CSS motion rather than
   compressing it to 0.01ms. Selection, disclosure, progress, and graph state
   remain visible through immediate state changes. No loss of task feedback was
   demonstrated, so this was not treated as an animation defect.

## Patterns and positive findings

The main accessibility gaps are shared styling and semantic edge cases: form
boundary contrast affects several filters, graph contrast is a token issue, and
metric explanation markup repeats for each additional reading. The touch rule
uses viewport width as a proxy for input modality. Copy and theme feedback each
depend on state whose identity or initialization changes over time.

Preserve these strengths:

- Consistent semantic tokens update across light and dark themes; no general
  text-contrast violations were reported in completed axe checks.
- Shared buttons, clear focus outlines, a skip link, named form controls, tab
  keyboard handling, and tested evidence-drawer focus restoration.
- Phone catalogs retain status, outcome, provider/model, timestamp, and actions;
  large evidence tables scroll locally rather than widening the page.
- Quiet motion, immediate graph fitting, source-bound evidence, review origin
  labels, and explicit unavailable states.
- Graph layout is cached by content and bounded to twelve entries; conversation
  rendering is capped at 300 entries; result tables paginate their rows.
- No browser page errors in the captured batch, and no application mutations
  were needed to perform the audit.

## Recommended actions

1. **P1/P2 `$impeccable harden`:** Fix F1 and F4, then bind copied feedback to its
   value and initialize persisted themes before paint (F8 and F5).
2. **P1 `$impeccable colorize`:** Correct control-boundary and pending-connector
   contrast (F2 and F3) within the existing semantic palette.
3. **P2 `$impeccable adapt`:** Extend touch sizing to numbered traversal, primary
   identity controls, and coarse-pointer tablet controls (F6).
4. **P2 `$impeccable optimize`:** Profile cold monitor startup and reduce the ELK
   code/evaluation burden with an actual worker boundary (F7).
5. **P3 `$impeccable document`:** Reconcile intentional design exceptions (F9).
6. **`$impeccable polish`:** Confirm the final corrected surfaces in one bounded
   desktop/mobile pass, followed by `$impeccable audit` to rescore.

## Validation record

| Check in this audit | Result |
| --- | --- |
| Impeccable context and detector | Completed; 0 primary findings, 9 advisories |
| Production webpack build | Passed |
| Typecheck | Passed |
| Lint | Passed; 2 existing unused-variable warnings in lib/formatters.ts |
| Targeted browser batch and confirmation | Completed; 45 states, no page errors; findings above |
| Unit and full repository Playwright suites | Not rerun; this audit made no application changes |
| Unstaged git diff whitespace check | Passed before report creation |
| Staged git diff whitespace check | Failed on pre-existing trailing spaces in app/fonts/OFL.txt:21 and results/validation/ui-redesign-2026-10-13/critique.md:5 |

The staged whitespace findings were preserved and are not included in the UI
issue count. Earlier redesign/polish acceptance reports describe earlier runs;
the browser evidence and source hashes here establish this audit's own scope.
Nothing was committed, pushed, or deployed.
