# TESIS Web Console

A web control plane and observer for the
[TESIS](https://github.com/example/tesis) autonomous penetration-testing
framework (authorized DVWA sandbox only). It configures the experiment matrix,
starts and cancels runs through the same headless entry point as the TUI, then
tracks them live and opens a detailed results explorer after completion.

**Runtime controls are local by default.** Launch, cancel, Doctor, and
configuration writes are accepted only from loopback hosts unless
`TESIS_CONTROL_ALLOWED_HOSTS` names others, so binding the dev server to
`0.0.0.0` for WSL access does not expose an experiment trigger to the network.
Reads stay available to every client, as before.

**Configuration is web-owned.** Settings are saved to a profile under
`TESIS_WEB_STATE_DIR` (default `.tesis-web/`) and passed to the runtime with
`--config`. The Python checkout's `config.yaml` is only rewritten by the
explicit **Write to TESIS config.yaml** action, which keeps a timestamped
backup first. Provider API keys entered in the web go to the profile `.env`,
never to YAML and never back to the browser.

The dashboard's `Mock AKG test` control still only replays the checked-in
`data/akg-simulation.yaml` fixture through the browser reducer; it does not
contact DVWA or a model provider.

## Prerequisites

- Node.js 22 (tested with Node 22.23.2)
- npm
- A TESIS checkout with its virtualenv (`TESIS_ROOT/.venv/bin/python`). The web
  never imports TESIS; it drives the checkout through a small bridge script and
  subprocesses, so this interpreter must exist for settings and runs to work.

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

The live dashboard begins in a waiting state. When an experiment starts — from
`Control`, the TUI, or the headless CLI — it auto-adopts the newest active
descriptor, replays the journal from cursor zero, then polls for new events. If
no run is active when the page opens, it replays the newest journaled or
artifact-backed run so completed experiments remain visible. On completion a
button links to the detailed results page.

## Runtime control

`/control` is the runtime control surface. It has three tabs:

- **Launch** — a `Scope → Coordinates → Runtime → Review` wizard matching the
  TUI launcher. *Single run* edits one coordinate; *Matrix* adds the
  `providers × levels × surfaces × payload_modes × repeats` axes with a live
  coordinate count. Review resolves the request through the real TESIS loader
  and is the only step with **Start**, which saves the reviewed document to the
  web profile and launches `python -m tesis run --headless --mode … --json`.
- **Runs** — supervised jobs with status, elapsed time, log tail, artifact and
  execution identity, **Cancel run** (graceful `SIGINT`, which the runtime turns
  into a cancelled artifact and terminal descriptor) and an explicit
  **Force kill** escalation. One run at a time is enforced; set
  `TESIS_CONTROL_ALLOW_CONCURRENT_RUNS=1` to override.
- **Doctor** — offline checks, plus a two-step confirmed live check that
  contacts DVWA and the model providers.

`/settings` holds the server-backed configuration: **Experiment** defaults,
**Model providers** (add/edit a provider, discover its catalog, stage API keys),
**AI scorer** (human / AI / human+AI preset, rubric version, frozen evaluator
model and limits) and **Advanced YAML** (the masked document with token colour,
validated before save). The footer offers **Validate**, **Discard changes**
(a second click confirms a draft reset), **Save profile**, and the explicitly
confirmed **Write to TESIS config.yaml**. The appearance options (theme, cheat
code) remain below it.

Which file is authoritative:

| Document | Written by | Read by |
| --- | --- | --- |
| `TESIS_WEB_STATE_DIR/config.yaml` | Settings, and the reviewed Start request | Every run and Doctor job started from the web |
| `TESIS_WEB_STATE_DIR/.env` | Settings, for provider keys entered in the web | The runtime subprocess, which loads `.env` next to `--config` |
| `TESIS_ROOT/config.yaml` | Only **Write to TESIS config.yaml** (backup kept) | The TUI and headless CLI |

The profile is seeded from `TESIS_ROOT/config.yaml` on first use so existing
settings carry over. `${VAR}` references are resolved from the checkout `.env`,
so credentials that already work in the TUI keep working here without being
copied.

### Control API

Mutating routes require a loopback `Host` (or a host listed in
`TESIS_CONTROL_ALLOWED_HOSTS`) and are additionally rejected for cross-origin
browser requests:

- `GET /api/control/schema` — field specs, choices, masked profile, provider and scorer projections, active job
- `POST /api/control/config/validate` — apply typed overrides and resolve with the TESIS loader
- `POST /api/control/config/save` — validate, then atomically replace the profile (and profile `.env`)
- `POST /api/control/config/sync` — write the profile over `TESIS_ROOT/config.yaml`
- `POST /api/control/config/models` — fetch a provider model catalog
- `GET /api/control/auth?action=status|models` — ChatGPT account state
- `GET /api/control/runs` · `POST /api/control/runs` — list or start a run/matrix
- `GET|DELETE /api/control/runs/[jobId]` — job detail, or request cancellation (`?force=1` to escalate)
- `GET /api/control/runs/[jobId]/log?offset=N` — incremental progress log
- `POST /api/control/doctor` — start an offline or live Doctor job

External cancellation is a signal, not a file protocol: the first `DELETE`
sends `SIGINT` to the process group, matching the TUI's cooperative
cancellation token. The runtime then writes a `cancelled` descriptor and an
aggregate artifact. A forced `SIGKILL` cannot do that, so the run stays
`active` until the monitor marks it stale.

## Routes

Live dashboard:

- `/` — primary live monitor with execution context, model stream, AKG, and status panels
- `/?execution=ID` — monitor one execution selected from the catalog
- `/results` — experiment-first inventory: matrix parents and standalone experiments
- `/results/[executionId]` — summary, evidence, scoring, matrix comparison, and redacted artifact explorer
- `/overview?scope=ID` — research interpretation for one exact experiment: coverage, outcomes, independent review readiness, and attention
- `/help` — visual tables for status, coverage, scores, metric denominators and an interactive evidence walkthrough
- `/settings` — appearance: light, dark, or hacker mode, plus the "cheatstick" cheat code switch

The application uses a compact persistent sidebar on desktop and a keyboard-accessible
navigation drawer on mobile. The desktop sidebar can collapse to a 64px icon rail and
restores its preference locally; the mobile drawer always keeps full labels. A first
visit follows the system color preference; light and dark keep the
Cloudflare-inspired research console, while hacker is an opt-in cinematic mode
(phosphor green on near-black, monospace, rain, scanlines, boot sequence, and
glitches). The header control switches light and dark and is hidden while hacker is
active; Settings selects hacker and offers all three modes. The choice writes the
local preference and cross-dissolves the workspace over its canvas in 320ms; a fixed
head script applies it before paint. Selecting hacker during a session plays a
skippable ~2.1s splash, and leaving hacker plays a ~1.2s CRT power-down that lands
on the target theme at its fully black frame; any key or click skips either run,
both can be switched off, and reduced motion replaces them with a static
acknowledgement and a plain fade (see DESIGN.md, "Session cinematics"). In hacker
mode the bottom status bar exposes rain off / normal / max (max by default) next
to splash and power-down on/off switches. Typing "cheatstick" anywhere outside a
field also selects hacker; the shorthand can be switched off in Settings, where a
sub-setting also lets the phrase return to the theme used before hacker. Blocked
storage falls back to the session
and then memory, and reduced-motion preferences swap instantly, keep a static rain
pattern, and disable the boot, glitch, and scramble effects. Phone and
coarse-pointer controls use 44px targets, including graph traversal and inventory
actions. On wide screens the live monitor rail, its Coordinate, Trajectory, and
Outcomes panels, and the overall workspace height are resizable with pointer or
keyboard separators, so the graph can grow past the default viewport-relative
height; the stacked mobile layout is unchanged. The current-run live monitor remains the primary entry
point. Results
groups exact validated coordinates under their matrix parent before filtering
and pagination. All executions provides raw identity browsing; Unresolved
identities preserves ambiguous and orphaned sources without choosing a copy.
Readable recorded context leads each row; execution IDs remain searchable and
copyable. Missing parent metadata is supplemented only by values shared by every
bound coordinate, with that provenance disclosed.

Overview contains no history table or catalog filters. Its scope precedence is
explicit `scope`, a valid previously selected experiment in session storage, then
the newest readable experiment by stored timestamp (missing dates last, exact ID
as deterministic tie-breaker). Explicit missing, ambiguous, or invalid selections
fail visibly, never substitute another experiment. Configured roots are not cohorts.
Standalone evidence has no inferred planned matrix; unavailable primary evidence
has unavailable counts rather than zero. Matrix coverage counts coordinates once,
separating recorded planned, represented, lifecycle, skipped, unstarted, and unknown.
The four canonical security outcomes remain independent of lifecycle; unknown or
producer-excluded attribution is labeled separately.

Human and AI readiness reuse the source-bound review adapter, independently.
Each shows declared eligibility, unknown eligibility, scanned membership, and final,
pending, stale, missing, unavailable, not-selected, or unscanned counts. Missing
final scores do not imply pending work. The receipt scan is capped at 100 exact
member sources in batches of four; missing primaries, unresolved membership,
coverage/membership mismatches, retrieval errors, and truncated scans are explicitly
incomplete. Attention disclosures count affected executions separately from
diagnostic messages and link to the scoped inventory and exact coordinate details.
Summary rendering never retrieves every child's full evidence or invokes an evaluator.

The detailed results explorer opens on Summary. Browse coordinates provides search, filters, ordering,
and pagination; selecting a coordinate closes the chooser and loads its exact
artifact. Evidence records have explicit Inspect actions, common and advanced
filters, sorting, density controls, and local pagination. Scoring keeps provisional,
Human, and AI sources separate, with a visible selected origin. Mobile scoring
retains interpretation and evidence links beneath each dimension.
Inventory state is URL-backed. Detail selection uses `coordinate=CHILD_EXECUTION_ID`,
`tab=summary|evidence|scoring|matrix|json`, and `origin=runtime|human|ai`.
Reload, direct links, and browser Back retain these values; invalid detail selections
are visibly unavailable. Source/query changes hide previous data immediately and
abort and reject late responses. A failed same-query refresh can retain its prior
snapshot alongside the error and its original refresh timestamp.
Common filter and inventory-level changes retain an explicit scope even when
another query parameter is invalid; they cannot silently broaden the investigation.

Review metrics and recorded denominators stay within their independent Human/AI
workflow; the adjacent runtime metric panel is explicitly provisional. Missing
review metrics never substitute runtime values. Producer projection vectors
take precedence over legacy score fields, including explicit unknown dimensions.
Raw null canonical status fields fall back to final_state; hash-bound projection
unknowns remain authoritative. Focus path explains empty or mismatched traversal.
Compact tables prioritize clipped single-line scanning; Comfortable wraps metadata.
Inspect retains full evidence in either density. Block disclosures have 44px touch
targets on phones/coarse pointers. Discovery reuses parsed/hash-verified sources
while their inode, size, modification and change timestamps remain unchanged. A
two-second catalog snapshot is served while a fresh scan runs behind it; an
explicit refresh waits for that scan instead of returning the snapshot.

Observer API (served by the local Next.js process, contained under configured
source/review roots and response-redacted):

- `GET /api/runtime/runs?cursor=0&limit=100` — merged execution catalog; limit 1–200, `nextCursor` and `total`
- `GET /api/experiments` — validated experiment/execution inventory, grouped and filtered server-side; `fresh=1` waits for a new discovery scan
- `GET /api/experiments/overview?scope=ID` — one exact source-bound interpretation summary; optional `previous=ID` supplies a remembered preference only when no explicit scope exists; `fresh=1` waits for a new discovery scan
- `GET /api/runtime/runs/[executionId]` — resolve one run
- `GET /api/runtime/runs/[executionId]/events?cursor=N&journal=IDENTITY` — bounded journal pages (512 KiB / 500 lines), byte cursor and replacement/reset diagnostics
- `GET /api/results/[executionId]` — validated `observer-result.v1` bundle; matrix responses contain coordinate metadata
- `GET /api/results/[executionId]/coordinates/[runId]` — load one exact child execution ID; the retained parameter name does not permit nonunique run-ID lookup
- `GET /api/akg?executionId=ID` — selected invocation snapshot, owner/path/hash; explicitly labeled static fallback
- `GET /api/mock/akg` — validated YAML fixture events and assertions (verification runs in the browser)

`/results` and `/api/experiments` share the typed query contract in
`lib/experiment-contract.ts`:

| Parameter | Values / meaning |
| --- | --- |
| `view` | `experiments` (default), `executions`, `unresolved` |
| `scope` | Exact experiment ID; limits raw discovery to its declared identities, including unresolved children |
| `q` | Search recorded condition, method, surface, provider/model, or exact ID; experiment-level search includes validated children |
| `execution` | `all` (default), `completed`, `failed`, `interrupted`, `unknown` |
| `outcome` | `all` (default), `confirmed`, `no_finding`, `unconfirmed`, `fixture_limited`, `unknown` |
| `artifacts` | `all` (default), `available`, `missing` |
| `sort` | `newest` (default), `oldest`, `identity`; missing dates always last |
| `cursor`, `limit` | Nonnegative offset and page size 1–100 (default 25), applied after grouping/filtering/sorting |
| `density` | `comfortable` (default), `compact`; presentation only |

At experiment level lifecycle/outcome filters match the scoped distribution,
independently; a matching experiment can contain other states. In All executions,
each identity filters by its own canonical state: a parent is not another child
finding. Repeated or invalid parameters return 400; missing scope returns 404;
ambiguous source identity returns 409. No request parameter selects filesystem roots.
List totals describe inventory, not study coverage. Summary/list responses include
refresh time, incomplete-discovery indicators, and bounded diagnostics. Attention
details return at most 100 affected identities per group and disclose omissions.
Discovery stops at 20,000 JSON files or depth 12; review discovery diagnostics
survive cache hits, so partial receipt scans cannot become complete on refresh.

The existing `/api/runtime/runs` execution catalog remains available to the live
monitor. Its `q`, `execution`, `outcome`, `artifacts=available`, `sort`, `cursor`,
and `limit` parameters retain their prior behavior and 1–200 limit. Its `workspace`
fields are source-inventory facts, not scoped coverage or review completion.

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
tie-breaker. Results uses Previous / Next to navigate bounded server pages.

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
  returned or rendered. The settings document is masked at the source (literal
  secrets become restorable placeholders, environment references stay visible)
  and the resolved configuration is scrubbed of credential-shaped keys before it
  leaves the bridge.
- The dev server binds to `0.0.0.0` for WSL/Windows host access. Every mutating
  control route rejects a non-loopback `Host` and a cross-origin `Origin` unless
  the host is listed in `TESIS_CONTROL_ALLOWED_HOSTS`; `TESIS_CONTROL_DISABLED=1`
  turns the control plane off entirely. Reads remain open, so a dashboard on
  another machine keeps working.
- Starting a run is the only consequential action, and it is always explicit:
  the wizard's Review step is the sole place with Start, and it shows the
  resolved target, coordinates and profile path first.
- The web writes only its own state directory. Artifacts are written by the
  TESIS runtime process under `TESIS_ROOT/results`, exactly as the TUI does; the
  web never edits them. The checkout `config.yaml` changes only through the
  explicit sync action, which keeps a backup.
- The bridge script runs with the checkout as its working directory and never
  receives request bodies as paths, argv, or environment variables. Model IDs,
  axes and targets are validated by the TESIS loader before use.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — webpack production build with Next.js build-time type checking
- `npm run start` — serve the production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint 9 with the Next.js flat configuration
- `npm run test` — Vitest unit and React component tests, once
- `npm run test:browser` — Playwright Chromium acceptance checks against a running local server


## Graph dashboard

Above 1200px, the AKG shares the workspace with a 330px supporting sidebar.
The right sidebar divides its height between Coordinate (30%), Trajectory
(40%), and Outcomes (30%); each panel scrolls independently. Smaller screens
show compact execution context before the graph and stack the supporting panels.
Experiment activity provides the complete paged journal below the live workspace,
with execution identity, timestamp and inspectable event data. It refreshes the
latest journal page automatically and resets when the journal changes. The
Trajectory panel is a single ledger over the same bounded 300-record window;
earlier events remain available in the timeline. The ledger keeps the journal's
own order and shows every record: turns carry a status, node states, and the AKG
path, each call shows its kind, arguments, and paired duration, and expanding a
call reveals a labelled record inspector (start time, total duration, TTFT,
generation, throughput, and where the timing came from; input, cached, output,
reasoning tokens, and total tokens; then the reasoning trace and summary with the
metadata field each arrived in; an unfilled row says `not recorded` and a phase
the record kind cannot have says `n/a`), the request, reasoning trace or summary,
response text, and the raw payload when the journal recorded them. A search field
and a Conversation toggle narrow the ledger without hiding anything by default; the
toggle keeps only System, User, and Model records for a quieter read. Each turn folds
from its own header, and one control folds every turn. A folded timing overview draws
every record as a block coloured by kind across input, model, and tool lanes, with
turn separators, a turn strip, the observed start and end times, and a per-turn table
of duration and token usage; a Duration control switches between measured durations
and equal-width operations.
What the artifacts do not yet provide, and the keys the ledger accepts, are
documented in `TRAJECTORY-DATA-HANDOFF.md`.
Matrix child selection resolves exact metadata independently of catalog pages,
and exposes a return-to-parent action. Demonstration replay stays separate.

The client graph boundary loads React Flow and a lightweight ELK client. The
generated ELK engine runs in a same-origin browser Web Worker, emitted by the
webpack build. Each uncached layout terminates its worker when complete; worker
load failures and a 30-second timeout preserve the error and Retry layout flow.
Browsers must support Web Workers to arrange the graph. The deterministic layered
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
- **Legend**: amber marks the current node/latest edge, blue previous
  transitions, green confirmed findings/achieved outcomes, red mismatches.
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
node scripts/prepare-browser-artifacts.mjs /tmp/tesis-web-browser-artifacts --overview
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
snapshot ownership and mobile layout. The `--overview` fixture option adds a
standalone unknown-outcome source, a missing primary, an orphan, and ambiguous
identities. Research workflow checks cover parent/coordinate grouping, scoped
drill-down, URL refresh/Back, direct coordinate/tab/origin links, rapid scope
switching, and loading/error/empty distinctions. Fixture-gated checks skip unless
`TESIS_WEB_BROWSER_FIXTURES=1` is set; the new rapid-switch scenario needs
`--overview` fixtures. No source experiments, provider calls or DVWA requests run.

Historical 2026-10-12 non-browser acceptance records remain under
`results/validation/artifact-retrieval-2026-10-12/implementation.md`; those records
are not a claim of current historical-cohort parity.
