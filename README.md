# TESIS Web Observer

A read-only web observer and artifact explorer for the
[TESIS](https://github.com/example/tesis) autonomous penetration-testing
framework (authorized DVWA sandbox only). It discovers active experiments,
tails the redacted runtime journal, and opens a detailed results explorer
after completion.

**This application is observer-only for real TESIS runs.** It never launches,
cancels, or mutates experiments, and it never writes to the Python repository.
The dashboard's `Mock AKG test` control only replays the checked-in
`data/akg-simulation.yaml` fixture through the browser reducer; it does not
contact DVWA or a model provider.

## Prerequisites

- Node.js 22 (tested with Node 22.23.2)
- npm

## Setup

```bash
cd tesis-web
npm install
cp .env.example .env.local   # optional; defaults already point at the repo
```

`TESIS_ROOT` defaults to `/home/kevin/coding/tesis`. Point it elsewhere if the
Python repository lives at a different path:

```bash
# .env.local
TESIS_ROOT=/home/kevin/coding/tesis
NEXT_PUBLIC_TESIS_POLL_MS=2000
```

## Run

```bash
npm run dev      # http://127.0.0.1:3000 (also reachable via the current WSL IP)
npm run build && npm run start
```

The live dashboard begins in a waiting state. When you start an experiment
with `python -m tesis run --config config.yaml` (or the headless CLI), it
auto-adopts the newest active descriptor, replays the journal from cursor zero,
then polls for new events. If no run is active when the page opens, it replays
the newest journaled or artifact-backed run so completed experiments remain
visible. On completion a button links to the detailed results page.

## Routes

Live dashboard:

- `/` — graph-first runtime monitor with Coordinate, Conversation, and Outcomes sidebar
- `/results/[executionId]` — detailed + thesis scoring explorer

Read-only API (served by the local Next.js process, contained under configured
source/review roots and response-redacted):

- `GET /api/runtime/runs?cursor=0&limit=100` — merged execution catalog; limit 1–200, `nextCursor` and `total`
- `GET /api/runtime/runs/[executionId]` — resolve one run
- `GET /api/runtime/runs/[executionId]/events?cursor=N&journal=IDENTITY` — bounded journal pages (512 KiB / 500 lines), byte cursor and replacement/reset diagnostics
- `GET /api/results/[executionId]` — validated `observer-result.v1` bundle; matrix responses contain coordinate metadata
- `GET /api/results/[executionId]/coordinates/[runId]` — load one exact child execution ID; the retained parameter name does not permit nonunique run-ID lookup
- `GET /api/akg?executionId=ID` — selected invocation snapshot, owner/path/hash; explicitly labeled static fallback
- `GET /api/mock/akg` — validated YAML fixture events and assertions (verification runs in the browser)

The browser poll interval is configured with `NEXT_PUBLIC_TESIS_POLL_MS`.

## Artifact roots and contracts

`TESIS_ARTIFACT_ROOTS` and `TESIS_REVIEW_ROOTS` are JSON objects mapping safe root
identifiers to absolute paths. Artifact roots replace the default
`TESIS_ROOT/results/runs`; include that root explicitly alongside research roots
when both are wanted. Roots can be flat directories, experiment directories or
individual JSON files. Source-local `reviews/` remains supported. External review
outputs require explicit review roots. See `.env.example` for the epoch7 setup.

Discovery uses content discriminators and exact execution IDs. Descriptor and
manifest metadata fill gaps in the primary source; the primary's own config,
identity and canonical status take precedence. Sidecars, reviews and audits do
not become executions. Ambiguous IDs return 409 rather than selecting a copy.
Missing primaries stay unavailable. Stored start/generated/manifest timestamps
sort the catalog; missing timestamps sort last, with execution ID as the stable
tie-breaker. Use **Load older runs** to retrieve another bounded page.

Result bundles contain `artifact`, original-byte `source` binding, independent
`reviews.human` / `reviews.ai`, historical analysis and diagnostics. The browser
validates the shared schemas. Matrix evidence is fetched only on selection;
embedded-only children retain their own full data and the aggregate hash.
Downloads contain the redacted bundle for the displayed execution. A download's
bytes are different from the original source whose SHA-256 is retained.

The optional `TESIS_PROJECTION_FILES` JSON array selects already generated
`observer-projection.v1` files. This consumer matches the producer contract in
`evaluation/observer_export.py`: named roots, original sources, code epoch,
identity, execution, security, scores, reviews, metrics and matrix coverage.
Root identifiers must match the export. Referenced file hashes are checked
before applying a projection; rejected projections leave source interpretation
unchanged and report diagnostics. The web process never invokes the exporter,
classifier, runner or review evaluator.

Without a projection, `TESIS_COMPATIBILITY_FILES` can select the saved hash-bound
historical compatibility view. Joins require both canonical source path and
original SHA-256. Historical incomplete audits remain separately attributed
analysis. Original matrix totals remain inspectable. Unclassified legacy errors
stay unknown; `INCOMPLETE`, HTTP status or an absent signal cannot classify an
execution or security outcome.

`TESIS_REVIEW_INDEX_FILES` selects explicit source-bound epoch associations for
old pending review statuses without IDs/timestamps. Supported indexes include
batch summaries with `sources[].review_status` and the epoch7 audit with
`source_path`, `source_sha256`, `execution_id` and `review_output_epoch`.
The source association and contained decision ledger must validate. A producer
projection can supply those associations instead. New status files use direct
ID/path/hash/timestamp metadata. Finals require a source-bound scoring.v4 receipt,
correct method/config/workflow, finite components, distinct candidate grades,
and valid mean/composite arithmetic. Eligible finals are ordered by stored
timestamp with a deterministic path tie-breaker. Stale receipts remain inspectable.

The UI separates execution from security outcome, planned/represented/completed/
confirmed coverage, and provisional scoring.v2 from Human/AI finals. Missing
scores and unavailable metrics display N/A or a dash with reasons. Fractional
components and four-decimal final scores are preserved. Provider performance
summaries supply provider usage, not experiment rates. Child graphs/findings
remain partitioned during parent-journal replay. Evidence drawers keep keyboard
focus inside, close with Escape, and return focus to the opening control.
Switching sources aborts and
rejects old responses; journal identity and cursor checkpoints reset replay when
a file is replaced, truncated or rewritten. Oversized journal lines are reported:
complete records are skipped with bounded memory so later events remain reachable;
unterminated records retain their byte cursor until the writer completes them.

## Safety

- Source and review roots are configured on the server. Canonical real paths reject traversal and escaped symlinks; root configuration is never accepted from a request.
- Responses pass through a secret-key redaction allowlist and mask known
  credential values; no API keys, cookies, passwords, or session tokens are
  returned or rendered.
- The dev server binds to `0.0.0.0` for WSL/Windows host access. There are no
  endpoints that launch, cancel, or control real experiments, and no arbitrary
  filesystem/proc reads. The mock route reads only the checked-in fixture under
  this web project.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — webpack production build with Next.js build-time type checking
- `npm run start` — serve the production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint 9 with the Next.js flat configuration
- `npm run test` — Vitest unit and React component tests, once
- `npm run test:browser` — Playwright Chromium acceptance checks against a running local server


## Graph dashboard

At 1280px and above, the AKG occupies approximately two-thirds of the dashboard.
The right sidebar divides its height between Coordinate (30%), Conversation
(40%), and Outcomes (30%); each panel scrolls independently. Smaller screens
place the graph first and allow the page to scroll through the supporting panels.

The client graph boundary loads React Flow and ELK. The deterministic layered
layout uses explicit ports, orthogonal routes, rounded bends, and restrained
surface groups. Shared entry/outcome nodes remain singular. Group rectangles
are presentation only; the original node IDs and directed topology remain intact.
Layout is cached by snapshot content/settings, so replay never moves the nodes.
A failed layout displays an error and a Retry layout button.

- **Full graph / Focus path**: full snapshot by default; focus retains every
  traversed node (including repeat visits in the strip), current/selected nodes,
  and immediate neighboring choices. The count shows visible/total nodes.
- **Fit**, **Center current**, **Zoom − / +**: navigate the graph. Event updates
  preserve the viewport; initial placement and view changes fit automatically.
- **Expand**: full-screen graph with the same session. Escape closes it and
  restores the prior viewport and keyboard focus.
- **Legend**: amber marks the current node/latest edge, muted cyan previous
  transitions, lime confirmed findings/achieved outcomes, red mismatches.
  Pending outcomes remain neutral. Dashed edges identify chain transitions.
- Select a node or edge for inspection. Tab to a node/edge and press Enter for
  keyboard inspection. Node details include the complete label, ID, kind,
  surface, and runtime state. Edge details include directed endpoints,
  preconditions, and target agent.
- The numbered path strip preserves repeat visits. Click a step to center it.
  New-edge animation lasts briefly and honors reduced-motion preferences.

## Mock verification

**Mock AKG test** starts an isolated session: loading → running → passed/failed.
It resolves and captures the snapshot, waits for graph placement, then reduces
all 18 fixture events exactly once. Success appears only after the final event
has been reduced and `verifyAkgMockState` checks the actual state: exact ordered
10-node path, final `data_exfiltrated` node, required findings and outcomes, node
existence, and all nine directed transitions in that same displayed snapshot.
Required membership permits method-ID aliases and additional findings/outcomes.
Failures show expected/actual details in the dashboard.

Live discovery, event polling, artifacts and their late responses/errors are
suspended throughout mock mode, including after completion. **Rerun mock** clears
the prior replay and cancels outstanding work. **Return to live** cancels the
session, clears the mock, and immediately resumes discovery. Filtering never
changes the snapshot used for verification. This remains a browser simulation;
it does not execute Python traversal, DVWA, or a model provider.

## Validation

```bash
npm run test
npm run typecheck
npm run lint
npm run build
git diff --check
git diff --cached --check

# In another terminal, start the app first:
npm run dev -- --webpack
npx playwright install chromium
npm run test:browser
curl http://127.0.0.1:3000/api/mock/akg
```

Playwright checks 1440×900, 1920×1080, 1024×768 and 390×844, writing overview,
cross-surface, final replay and mismatch screenshots to `test-results/acceptance`.
Set `PLAYWRIGHT_BASE_URL` to test another local port. Geometry tests cover every
node rectangle and routed segment, including cycles and unfamiliar nodes.

Layout integration references: [React Flow ELK multiple handles](https://reactflow.dev/examples/layout/elkjs-multiple-handles)
and [ELK layered layout](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html).


## Saved-artifact acceptance

The opt-in cohort test reads existing files only and records original source hashes.
It runs no TESIS experiments, evaluators, provider calls or DVWA requests:

```bash
TESIS_ACCEPTANCE_EPOCH_ROOT=/home/kevin/coding/tesis/results/validation/scoring-v4-remediation-2026-10-12-matrix-epoch7 \
TESIS_ACCEPTANCE_PROJECTION=/home/kevin/coding/tesis/results/validation/artifact-export-2026-10-12/observer-epoch7-accepted.json \
TESIS_ACCEPTANCE_REPORT=results/validation/artifact-retrieval-2026-10-12/epoch7-projection.json \
npx vitest run tests/artifact-cohort.test.ts
```

For separately authorized local browser acceptance, prepare sanitized fixtures
and start a fixture-only server. Browser binaries and fixture files can stay in `/tmp`:

```bash
node scripts/prepare-browser-artifacts.mjs
TESIS_ROOT=/tmp/tesis-web-browser-artifacts \
TESIS_ARTIFACT_ROOTS='{"browser":"/tmp/tesis-web-browser-artifacts"}' \
TESIS_REVIEW_ROOTS='{"reviews":"/tmp/tesis-web-browser-artifacts/reviews"}' \
TESIS_PROJECTION_FILES='[]' TESIS_COMPATIBILITY_FILES='[]' TESIS_REVIEW_INDEX_FILES='[]' \
npx next dev --webpack --hostname 127.0.0.1 --port 3100

# Another terminal, after installing the matching Chromium when needed:
TESIS_WEB_BROWSER_FIXTURES=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npm run test:browser
```

The artifact browser checks cover API pagination, exact IDs, review origins,
redaction, child selection races, JSON download identity, evidence references,
snapshot ownership and mobile layout. They skip unless fixture acceptance is
explicitly enabled. Browser acceptance for the 2026-10-12 implementation was
deferred at the user's request; the non-browser results and gates are recorded in
`results/validation/artifact-retrieval-2026-10-12/implementation.md`.
