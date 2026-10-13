# UI audit findings resolved

2026-10-13. All nine findings in [the original audit](audit.md) were addressed.
The staged redesign patch remains byte-for-byte unchanged; fixes are additional
unstaged changes and new files. The original audit evidence is retained.

| Finding | Change | Evidence |
| --- | --- | --- |
| F1: color-only guide links | Guide prose links have a persistent underline | Browser style assertions; guide axe scans now report zero violations |
| F2: field boundaries | Dedicated theme-aware control-boundary token replaces the structural border on editable fields | Browser contrast checks pass the 3:1 threshold in light and dark themes |
| F3: graph connectors | Light graph-edge color changed to `#70829c`, retaining current/traversed semantics | Computed canvas contrast is approximately 3.75:1, with margin over 3:1 on the tinted group fill |
| F4: metric definitions | Values, reasons, availability counts, and reason breakdowns share the metric's `<dd>` | Semantic regression test and scoring axe scans report no definition-list violation |
| F5: theme flash | Fixed head script initializes the persisted preference before styled paint; hydration preserves it | Browser test holds all client bundles while the page remains dark; legacy preference and blocked-storage tests pass |
| F6: touch targets | Phone and coarse-pointer controls use 44px sizing, including traversal and catalog identity actions | 320px and 768px touch browser assertions; existing responsive checks pass |
| F7: layout cost | Lightweight ELK client delegates to a genuine same-origin worker; completion, failure, and timeout terminate it | Real emitted worker runs in production; blocked worker retry, geometry, and lifecycle tests pass; measured main-thread cost decreases |
| F8: stale copy feedback | Copy state is keyed by value and label; late requests cannot affect a new identity or overwrite a newer request | Completed-copy reset, late completion, return-to-old-value, and out-of-order request tests; selected-coordinate browser check |
| F9: design documentation | Control boundary, brand ink, drawer scrim, and intentional size exceptions are documented; panel titles use the 16px level | DESIGN frontmatter and sidecar references validated; every CSS font-size is on the documented ramp |

## Performance comparison

The same sanitized fixture root and localhost production setup were used for the
audit baseline and corrected build. Values are individual diagnostic samples,
with cold browser contexts and a warm server, not field Web Vitals.

| Measurement | Audit baseline | Corrected build |
| --- | --- | --- |
| Main-context requested JS, including navigation prefetch | 2,283,964 bytes | 828,634 bytes |
| Computed individual gzip estimate | 683,692 bytes | 248,428 bytes |
| Largest observed main-thread task, normal CPU | 59ms | No task at or above the observer's 50ms threshold |
| Largest observed main-thread task, 4x CPU | 679ms | 237ms |
| Time of sample after initial graph readiness, 4x CPU | 2,570ms | 1,622ms |

Main-context JS decreased by approximately **64%**. The generated ELK engine is
still approximately 1.44MB and loads inside the worker, behind a small bootstrap;
this moves parsing and computation off the main thread rather than removing that
network payload. Layout readiness timing includes the browser's network-idle
wait and must not be presented as interaction latency or TTI. CPU sample variance
and differences in worker throttling limit generalization.

The implementation follows webpack's
[native worker entry syntax](https://webpack.js.org/guides/web-workers/) and
ELK's [worker-factory API](https://github.com/kieler/elkjs). Graph topology,
placement settings, the bounded content cache, and source attribution are
preserved. Browsers without Web Workers show the existing visible layout-error
flow; a main-thread fallback is deliberately avoided.

## Validation

- **118 unit/component tests passed**, with one existing opt-in cohort test
  skipped. Tests cover layout geometry, malformed topology, worker cleanup and
  retry, metric definitions, theme initialization, and copy request races.
- **19 Playwright tests passed** on the corrected production build. Coverage
  includes 320, 390, 768, 1024, 1440, and 1920px layouts, replay, graph and edge
  inspection, keyboard handling, responsive tables, reduced motion, loading and
  failure states, and the new audit regressions.
- **Build, typecheck, and lint passed.** Lint retains two pre-existing unused
  symbols in `lib/formatters.ts`.
- Six focused guide/scoring axe scans in desktop light, phone dark, and tablet
  light modes reported **zero violations**, no page errors, and no document
  overflow. Some contrast/ARIA checks remain incomplete; this is not a formal
  accessibility certification.
- Desktop and phone scoring captures were visually inspected after the browser
  checks. The semantic correction keeps metric reasons visible and the intended
  dense research layout intact. Captures are local tooling artifacts under
  `.impeccable/audit-fixes-2026-10-13/`.
- DESIGN YAML, JSON sidecar references, and CSS typography sizes were validated.
  Automatic Impeccable hooks reported no deterministic issues; no redundant
  standalone detector pass was added.
- The new unstaged changes pass `git diff --check`. The preserved staged patch
  still has the two original trailing-space findings in `app/fonts/OFL.txt:21`
  and `results/validation/ui-redesign-2026-10-13/critique.md:5`.

Evidence: [focused browser scans and timings](fixes-browser.json),
[unit results](fixes-unit.log), [Playwright results](fixes-playwright.log),
[production build](fixes-build.log), and [source hashes](fixes-manifest.json).

Physical-device touch, Firefox/Safari, screen-reader announcements, the audit's
unscored fullscreen-background isolation item, and browser text-only zoom remain
outside this validation. The application remains a read-only observer; all checks
used sanitized saved artifacts or the local mock replay. No experiments, provider
calls, source writes, commits, pushes, or deployments were performed.
