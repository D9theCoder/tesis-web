# TESIS Web dashboard redesign

Implemented on 2026-10-13. This is a frontend redesign of the read-only observer;
it is not live TESIS experiment acceptance. No experiments, evaluators, DVWA
requests, or model-provider calls were run.

## Confirmed direction

The researcher, supervisor, and invited reviewers receive a Cloudflare-inspired
enterprise workspace. Light is the default, with optional dark mode. The current
run's live monitor remains the primary entry experience, with AKG topology,
model stream, traversal, and status panels. Completed results remain prominent.
The implementation followed the existing Next.js App Router and React conventions.

## Critique and implementation

The initial expert heuristic critique scored the old UI 20/40. This was a design
baseline, not a user study. The main improvements were implemented as follows:

| Critique finding | Implemented behavior |
| --- | --- |
| Global links shared one destination; results were buried | Persistent desktop sidebar and mobile navigation drawer; distinct Live monitor, Overview, Results, and Guide destinations with active route context |
| Runtime and results had weak reading order | Compact execution context precedes graph detail; completed results opens on Summary; execution, security outcome, coverage, and review remain separate |
| Tiny dim metadata and decorative backgrounds | Semantic light/dark tokens, self-hosted Geist sans-serif hierarchy, restrained blue interactions, flat surfaces and borders; monospace is reserved for data |
| Coordinates and evidence were difficult to compare | Searchable, sortable, paged coordinate, run, evidence, and matrix tables; common filters and disclosed advanced filters; density controls where useful |
| Mobile scoring hid interpretation and supporting evidence | Scoring interpretation and evidence stack beneath the dimension and score on narrow screens |
| Catalog fields and actions were outside the phone viewport | Mobile catalog rows show labeled identity, condition, model, execution status, outcome, date, and Monitor/Results actions without horizontal scrolling |
| Click-only evidence and inconsistent selection states | Explicit Inspect buttons, keyboard tabs, visible pressed score origins, focus-managed drawers, Escape and focus restoration |
| Raw details overwhelmed primary information | Source, legacy, diagnostics, structured data, and demonstration replay use labeled disclosures; exact identifiers and hashes remain available with copy controls |

The full initial critique is preserved alongside this report as `critique.md`.
Its source line references describe the baseline before the redesign.
Cloudflare's published dashboard references guided navigation, typography,
hierarchy, borders, and density; the application is not a pixel copy.

## Routes and components

- `/` remains the live monitor. `/?execution=ID` can pin a catalog-selected run.
- `/results/[executionId]` remains the source-bound completed-results explorer.
- `/results` adds a dedicated run catalog for completed-results discovery.
- `/overview` adds an overview of the loaded catalog and its known statuses.
- `/help` adds reviewer-oriented guidance.
- The application shell, buttons, badges, tabs, drawers, copy controls, fields,
  and tables share a consistent visual system. Heavy graph code stays dynamically
  loaded; table filtering and paging operate on the loaded data.
- `DESIGN.md` records the reusable system; `.impeccable/design.json` provides its
  tooling sidecar. `PRODUCT.md` records the confirmed audience and direction.

Existing API routes, server filesystem resolution, schemas, normalization,
reducers, artifact/review bindings, and AKG layout were preserved. There are no
changes in `app/api/` or `lib/`. The catalog describes loaded data explicitly and
does not invent totals from partial pagination or infer canonical outcomes from
legacy success fields. Mock replay remains separate from live observation.

## Validation

| Check | Final evidence |
| --- | --- |
| `npm run test` | 107 passed; 1 existing opt-in artifact-cohort test skipped; the affected catalog suite passed again after the final responsive change |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with two existing unused-variable warnings in `lib/formatters.ts` |
| `npm run build` | Passed; original API and dynamic results routes plus the three new pages present |
| Full Playwright suite against sanitized fixtures | 12 passed on the final build, including mobile catalog field/action containment |
| Focused dashboard Playwright pass after containment correction | 2 passed at 1440×900 and 390×844 before finish-review fixes; the final full suite includes both checks and the evidence-view/open-drawer overflow assertions |
| Impeccable source detector | App and components scans returned no findings before finish-review fixes; subsequent layout edit hook returned no findings. No second detector pass was run. |
| `git diff --check` | Passed |

Browser coverage includes graph replay and verification, unfamiliar topology,
resize, scroll containment, reduced motion, keyboard access, drawer focus,
theme switching, mobile navigation, source-consistent coordinate selection,
downloads, final score origins and four-decimal precision, evidence filters,
and pagination cancellation/stale-response behavior.

The final containment correction makes the table scroll container the positioning
context for its screen-reader header. This prevents an absolutely positioned
hidden label in a wide evidence table from widening the mobile document.

The finish-review correction also provides a checked-in Geist variable Latin
subset and its SIL OFL license. `next/font/local` loads it without build-time or
visitor font-provider requests. Font provenance is recorded in `app/fonts/README.md`.

Browser verification used `/tmp/tesis-web-redesign-fixtures`, generated by the
repository fixture script, and a localhost production server. Runtime captures
show explicitly labeled deterministic mock replay. These checks establish UI and
fixture behavior; they do not establish provider integration or live research
acceptance. They are not a formal WCAG certification.

## Visual evidence and handoff

Final captures are under `.impeccable/review/`: desktop and mobile monitor in both
themes, results summary, scoring, evidence, catalog, overview, and guide. Full-page
capture sizes are 1440×900 and 390×844; evidence inspector viewport captures use
the same dimensions. These tooling files are locally available and gitignored.

Independent finish-review disposition and the checked design documentation are
recorded in `finish-review.md`. Source changes were implemented and integrated by
the root agent, including review and revision of earlier subagent contributions.
Final review and documentation delegation were limited to Luna at max effort.

No commit, push, deployment, or research-artifact cleanup was performed. Existing
staged work and prior validation artifacts were preserved.
