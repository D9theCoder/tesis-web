<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TESIS Web contributor guide

## Purpose and boundaries

TESIS Web is a read-only Next.js observer for TESIS runs. It discovers local run descriptors, tails redacted runtime journals, displays the Attack Knowledge Graph (AKG), and renders completed artifacts. Real-run endpoints must never launch, cancel, or modify TESIS experiments or write into `TESIS_ROOT`.

The mock AKG flow is local test data: it reads `data/akg-simulation.yaml`, replays events in the browser reducer, and verifies the resulting client state. Keep this separate from live TESIS and provider execution.

## Directory map

| Directory | Responsibility |
| --- | --- |
| `app/` | Next.js App Router entry point. Contains the root layout, global styles, pages, and route handlers. |
| `app/api/` | Server-side API boundary. Reads local TESIS files, validates and redacts responses, and returns JSON. Runtime-backed handlers use the Node.js runtime and dynamic rendering. |
| `app/api/akg/` | Serves the deterministic AKG snapshot used by the dashboard. |
| `app/api/mock/akg/` | Serves the checked-in mock replay fixture and assertions. It must not contact TESIS, DVWA, or model providers. |
| `app/api/runtime/` | Discovers runs, resolves one execution, and tails cursor-based runtime events. |
| `app/api/results/` | Loads aggregate results and individual matrix-coordinate artifacts. |
| `app/results/[executionId]/` | Dynamic results explorer page for a completed execution. |
| `components/` | React UI outside the routing tree. Keep data access and domain transformations in `lib/`. |
| `components/runtime/` | Live/mock dashboard orchestration, AKG visualization, and runtime side panels. |
| `components/results/` | Coordinate navigation, scoring, evidence, and artifact detail views. |
| `components/ui/` | Small reusable visual primitives shared by feature components. |
| `data/` | Versioned local fixtures. Currently contains the YAML mock AKG session. |
| `lib/` | Shared schemas, API client, reducers, result normalization, AKG data/layout/verification, formatting, and utilities. Prefer pure functions here. |
| `lib/server/` | Server-only filesystem discovery and path resolution under `TESIS_ROOT`. Never import these modules into Client Components. |
| `tests/` | Vitest unit and React component tests. Test files mirror the relevant `lib/` or component behavior. |
| `tests/browser/` | Playwright acceptance tests for replay, graph interaction, responsiveness, and reduced motion. |
| `types/` | Project-wide ambient TypeScript declarations for packages without suitable types. |
| `scripts/` | Reserved for repeatable repository automation; keep one-off shell commands out of application code. |
| `.agents/`, `.codex/` | Local agent-tooling directories. Application code must not depend on their contents. |

Generated directories such as `.next/`, `node_modules/`, `test-results/`, and `playwright-report/` are build or test output. Do not edit or commit them.

## Architecture rules

- Pages and layouts are Server Components by default. Add `"use client"` only at an interactive boundary that needs state, effects, event handlers, or browser APIs.
- Keep filesystem access inside `app/api/` and `lib/server/`. Browser code should use `lib/api-client.ts` and same-origin endpoints.
- Treat `lib/schemas.ts` as the shared contract boundary. Validate untrusted filesystem data and preserve compatibility with older TESIS artifacts where the schema already allows it.
- Resolve all user-derived paths through the containment helpers in `lib/server/fs-util.ts`. Never concatenate request parameters into filesystem paths directly.
- Redact secrets before returning API data. Do not expose credentials through logs, rendered payloads, or `NEXT_PUBLIC_*` variables.
- Preserve reducer determinism: runtime events should produce the same state during live polling and mock replay. Ignore stale async responses after session changes or cancellation.
- Keep AKG topology and replay verification separate from presentation. Layout belongs in `lib/akg-layout.ts`; rendering and interaction belong in `components/runtime/akg-graph.tsx`.
- Use the `@/` alias for repository-root imports. Keep TypeScript strict and avoid `any` when a schema or narrow type can express the data.
- Maintain keyboard access, responsive layouts, and `prefers-reduced-motion` behavior when changing interactive UI.

## Local development

```bash
npm install
npm run dev
```

Environment variables:

- `TESIS_ROOT`: local TESIS repository containing runtime and result artifacts.
- `NEXT_PUBLIC_TESIS_POLL_MS`: browser polling interval.
- `PORT`: local server port.
- `NEXT_ALLOWED_DEV_ORIGINS`: additional development hosts, useful for WSL access.

See `.env.example` for common defaults. Keep private values in `.env.local`; never commit them.

## Validation

Run checks proportional to the change. Before handing off code changes, use:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
git diff --check
```

For graph, replay, responsive layout, or interaction changes, also run Playwright against a local server:

```bash
npm run dev -- --webpack
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:browser
```

Add or update focused tests when changing reducers, schemas, normalization, path safety, mock verification, or user-visible interactions. Documentation-only edits need formatting and diff checks, not the full application suite.

## Change discipline

- Preserve the observer-only boundary and backward compatibility with existing TESIS artifacts.
- Keep changes focused; do not reformat unrelated files or overwrite existing worktree changes.
- Update `README.md`, `.env.example`, and tests when behavior, routes, configuration, or commands change.
- Do not commit or push unless the user explicitly asks.
