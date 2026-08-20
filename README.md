# TESIS Web Observer

A read-only web observer and artifact explorer for the
[TESIS](https://github.com/example/tesis) autonomous penetration-testing
framework (authorized DVWA sandbox only). It discovers active experiments,
tails the redacted runtime journal, and opens a detailed results explorer
after completion.

**This application is observer-only.** It never launches, cancels, or mutates
experiments, and it never writes to the Python repository. All HTTP is
restricted to the configured DVWA base URL at the framework layer; this web
app makes no requests to the target.

## Prerequisites

- Node.js 18+ (tested with Node 22)
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

- `/` — four-quadrant runtime monitor (AKG traversal, coordinate, conversation, outcomes)
- `/results/[executionId]` — detailed + thesis scoring explorer

Read-only API (served by the local Next.js process, path-contained under
`TESIS_ROOT`, response-redacted):

- `GET /api/runtime/runs` — scan active/recent descriptors and manifests
- `GET /api/runtime/runs/[executionId]` — resolve one run
- `GET /api/runtime/runs/[executionId]/events?cursor=N` — tail the journal
- `GET /api/results/[executionId]` — load a single or matrix result
- `GET /api/results/[executionId]/coordinates/[runId]` — load one coordinate
- `GET /api/akg` — deterministic AKG snapshot

The browser poll interval is configured with `NEXT_PUBLIC_TESIS_POLL_MS`.

## Safety

- Every route resolves strict paths under `TESIS_ROOT` and rejects traversal.
- Responses pass through a secret-key redaction allowlist and mask known
  credential values; no API keys, cookies, passwords, or session tokens are
  returned or rendered.
- The dev server binds to `0.0.0.0` for WSL/Windows host access. There are no
  endpoints that launch, cancel, or control experiments, and no arbitrary
  filesystem/proc reads.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint
