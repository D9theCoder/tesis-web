# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary audience is the thesis researcher who owns the experiments, their
supervisor, and a closed group of invited people, including thesis examiners.
They use TESIS Web to observe experiments and inspect the resulting research
evidence.

## Product Purpose

TESIS Web Observer makes TESIS experiment progress and completed results
inspectable through a read-only browser interface. It supports understanding
agent activity, following Attack Knowledge Graph (AKG) traversal, reviewing
results and scoring, and comparing matrix coordinates for thesis analysis.

Live monitoring and completed-results review have equal priority. Successful
use means viewers can understand what happened, inspect the evidence behind a
reported result, and recognize uncertainty or incomplete coverage.

## Positioning

The observer connects TESIS runtime journals, AKG snapshots, completed artifacts,
and source-bound reviews in one interface. Its research value depends on
preserving source identity and distinguishing execution status, security outcome,
coverage, and scoring provenance.

## Operating Context

- The application runs as a local Next.js web process and reads artifacts from
  the separately managed TESIS Python repository and configured artifact and
  review roots.
- TESIS experiments run separately in the authorized DVWA sandbox. Viewers
  observe them here and open completed evidence for analysis and review.
- `/` provides runtime discovery, journal replay and polling, an interactive
  AKG, and coordinate, conversation, and outcome panels. The conversation panel is
  a turn-based trajectory ledger that inspects each call's request, reasoning,
  response, tokens, timing, and graph path where the journal records them, with a
  Conversation filter for a quieter system/user/model-only read.
- `/results/[executionId]` provides completed-execution inspection, matrix
  coordinate selection, scoring, evidence details, and redacted exports.
- The local mock flow replays `data/akg-simulation.yaml` in the browser to verify
  reducer and graph behavior.

## Capabilities and Constraints

- Preserve the observer-only boundary. Real-run endpoints never launch, cancel,
  or modify experiments and never write into `TESIS_ROOT`.
- Mock replay remains separate from live TESIS, DVWA, and model-provider
  execution.
- Filesystem access belongs on the server. User-derived paths must pass the
  containment helpers; credentials and other secrets must be redacted before
  data reaches API responses, exports, or the browser.
- Preserve compatibility with older artifacts where the shared schemas allow
  it. Missing or ambiguous sources must remain visibly unavailable.
- Keep execution status separate from security outcome, and planned,
  represented, completed, and confirmed coverage separate from one another.
- Preserve provisional runtime scoring and independent Human/AI final reviews
  with their source bindings. Missing metrics and scores retain their reasons
  and display as unavailable.
- Keep historical analysis and diagnostics attributable to their own evidence.
  A mock verification, offline check, or partial result cannot establish a live
  research outcome.
- Session changes must discard stale asynchronous responses, and replay must
  remain deterministic.

Open decisions:

- Hosting, authentication, and how access will be granted to invited viewers
  are undecided. The confirmed audience alone does not establish an access
  mechanism.
- Any future localization requirements remain undecided. Current interface
  copy is in English.

## Brand Commitments

The existing product name is TESIS Web Observer, also rendered as TESIS Observer
in the interface. Preserve TESIS and AKG terminology and accurate research
claims. The user confirms a Cloudflare-inspired enterprise dashboard: restrained
colors, professional typography, dense readable data, compact navigation, and
consistent components. Light and dark are the working themes; hacker is an
opt-in third variant selected on Settings, never chosen automatically.
The current-run live monitor remains primary, including the model stream, AKG,
and status panels; completed-results review remains equally accessible.

## Evidence on Hand

- `README.md` documents the workflows, routes, artifact contracts, configuration,
  and observer-only boundary.
- `AGENTS.md` records architecture, accessibility, and contribution constraints.
- `lib/schemas.ts` defines the shared data contracts; `lib/server/` contains
  filesystem discovery, validation, source resolution, and redaction.
- `data/akg-simulation.yaml` supplies deterministic mock events and assertions.
- `tests/` and `tests/browser/` contain unit, component, and browser checks.
- `results/validation/artifact-retrieval-2026-10-12/` contains saved artifact
  acceptance records. These describe their recorded scope; this init does not
  rerun or extend their validation.

Experiment findings and scores come from inspected source artifacts and their
validated reviews. Future interfaces must preserve attribution and must not
invent results, endorsements, or performance claims.

## Product Principles

1. Make observation and evidence inspection possible without changing the
   experiment being studied.
2. Give live understanding and completed-results analysis equal importance.
3. Keep reported conclusions traceable to the execution, source, and review
   that support them.
4. Show uncertainty, missing data, and incomplete coverage explicitly.
5. Support the researcher and invited reviewers with clear terminology and
   accessible inspection workflows.

## Accessibility & Inclusion

Maintain keyboard access, responsive layouts, and reduced-motion behavior.
Interactive graphs and evidence details must remain inspectable without a
pointer. Dialogs must manage focus, support Escape, and restore focus to their
opening control. No additional audience-specific accessibility standard or
accommodation was established during init.
