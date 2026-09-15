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

Read-only API (served by the local Next.js process, path-contained under
`TESIS_ROOT`, response-redacted):

- `GET /api/runtime/runs` — scan active/recent descriptors and manifests
- `GET /api/runtime/runs/[executionId]` — resolve one run
- `GET /api/runtime/runs/[executionId]/events?cursor=N` — tail the journal
- `GET /api/results/[executionId]` — load a single or matrix result
- `GET /api/results/[executionId]/coordinates/[runId]` — load one coordinate
- `GET /api/akg` — deterministic AKG snapshot
- `GET /api/mock/akg` — validated YAML fixture events and assertions (verification runs in the browser)

The browser poll interval is configured with `NEXT_PUBLIC_TESIS_POLL_MS`.

## Safety

- Every route resolves strict paths under `TESIS_ROOT` and rejects traversal.
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
