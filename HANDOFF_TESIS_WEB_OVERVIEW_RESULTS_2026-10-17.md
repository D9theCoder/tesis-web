# Handoff: Distinct Overview and Results workflows

Status: **implemented and verified against sanitized saved fixtures, 2026-10-17**. The approved page responsibilities below are implemented in the working tree. Section 10 records the exercised verification and its limits; this is not a historical-cohort parity certification.

Implementation repository: `/home/kevin/coding/tesis-web`.

## 1. Objective and accepted decisions

Separate the two destinations by task, not by decoration:

- **Overview: research interpretation.** Explain what a selected experiment or explicitly defined cohort establishes, what coverage is incomplete, and what needs attention before review.
- **Results: experiments first.** Find, compare, and inspect saved experiments. Matrix parents and standalone experiments are the primary inventory; coordinates live within their experiment.

The user explicitly selected **Research interpretation** for Overview and **Experiments first** for Results after the critique. Do not substitute a workspace-health-only Overview or retain a flat execution catalog as the default Results experience.

| Destination | User question | Primary content | Successful next action |
| --- | --- | --- | --- |
| Live monitor | What is happening in this execution? | Current activity, conversation, graph, coordinate state | Follow a step or inspect its evidence |
| Overview | What does this experiment or study establish, and what still needs attention? | Scoped coverage, security outcomes, review readiness, exceptions | Open the relevant experiment or subset in Results |
| Results | Which saved experiment should I inspect or compare? | Searchable experiment inventory and coordinate drill-down | Open evidence, scores, or comparison |
| Guide | How should I interpret these terms and values? | Definitions, calculations, examples, evidence relationships | Return to the research task with understanding |

### Baseline and evidence

The preceding audit-remediation work was committed as `690006c` (`fix(observer): preserve evidence and review context`). It improved correctness, discovery, density, the guide, and live activity, but retained the duplicated page architecture.

The subsequent critique inspected current source and the running Overview and Results pages in desktop Chromium, plus narrow Results layout. It found:

- `app/overview/page.tsx` renders `<CatalogPage overview />`.
- `app/results/page.tsx` renders `<CatalogPage />`.
- `components/catalog-page.tsx` adds an availability section for Overview but renders the same catalog controls, history table, pagination, and row actions on both pages.
- The default catalog mixes matrix parent and child identities at the same list level.
- Long execution IDs dominate the first column; experimental context is secondary.
- Availability/diagnostic totals describe source inventory, not a research denominator or review-readiness summary.

The critique scored these two surfaces **25/40**, with three P1 and two P2 priorities. This is a page-design assessment, not a new correctness certification or a score for the entire application. The source detector reported zero findings; injected browser detection reported the pinned Geist font and small sidebar captions, not the information-architecture problems. Assessment was single-context because the user declined subagents. Continue without subagents unless the user changes that instruction.

No application changes were made during the critique. Its archived snapshot is under `.impeccable/critique/` with target slug `components-catalog-page-tsx`.

## 2. Scope and non-goals

### In scope

- Distinct Overview and Results page compositions.
- Explicit experiment/cohort scope and source attribution.
- Server-side scoped coverage, outcome, review-readiness, and attention summaries.
- Experiment-first discovery with exact parent/coordinate relationships.
- Readable inventory hierarchy, purposeful row actions, and URL-backed investigation state.
- Actionable diagnostic categories instead of unexplained message totals.
- Responsive and keyboard-accessible versions of the new workflows.
- Affected schemas, API client, route behavior, tests, README, and design documentation.

### Out of scope

- Rebranding, changing the pinned enterprise visual identity, or replacing the shell.
- Redesigning Live monitor or the guide except for directly affected navigation/help.
- Experiment launch, cancellation, artifact mutation, provider execution, review evaluation, or DVWA requests.
- New databases, writable experiment services, speculative analytics, or arbitrary filesystem access.
- Inferring cohorts from folder names or combining every configured root into a supposed study.
- Decorative charts added merely to make Overview look different.

## 3. Overview: interpretation and triage

Overview must no longer render the general run-history table, its search/filter suite, density control, or catalog pagination.

### A. Establish the research scope

Show a clearly selected experiment, matrix, or explicitly defined cohort, together with identity, available source/epoch attribution, and refresh context.

Selection precedence:

1. Explicit URL selection.
2. Previously selected valid scope, when available.
3. Newest available experiment, using stored timestamps and a deterministic fallback.

An explicitly selected missing or ambiguous source must show an actionable unavailable state; it must not silently switch to a different experiment. Do not equate artifact roots with cohorts. If no supported cohort definition exists, ship the selected-experiment workflow without inventing cohort membership.

The scope selector is the main Overview control. It is not a second catalog filter bar.

### B. Explain coverage

For the selected scope, show recorded planned, represented, completed, failed, interrupted, skipped/unstarted, and unknown coverage where applicable.

- Count matrix coordinates once; do not add the parent as another coordinate.
- Distinguish planned coverage from artifacts represented in aggregation.
- Preserve unknown and unavailable values; null is not zero.
- Treat standalone executions as standalone evidence, not as an invented planned matrix.
- Disclose the counting unit and denominator next to each aggregate.

### C. Explain supported security conclusions

Display the selected scope's independent security-outcome distribution:

- `confirmed`
- `no_finding`
- `unconfirmed`
- `fixture_limited`
- Separately labeled unknown/unattributed data, not a fifth canonical outcome.

Keep lifecycle and security outcome as separate groups. A failed/interrupted execution can retain a confirmed finding; completion is not exploit success. Preserve the producer's attribution and exclusion rules rather than reclassifying evidence in the browser.

Use a chart only when it makes the distribution easier to understand. Every visual aggregate must have accessible labels and a readable data equivalent. A small, well-labeled distribution is preferable to unrelated KPI cards or a row of decorative rings.

### D. Explain review readiness and required attention

Show Human and AI workflows independently, with final, pending, stale, missing, unavailable, or not-selected states grounded in the saved source/review contract.

- Count each workflow against its declared eligible scope; two workflows do not mean two executions.
- Do not infer pending reviews merely from absent final scores.
- Do not mix runtime scores with Human/AI finals or average different score origins.
- Clearly identify any incomplete review-summary scan. Never label a partial scan as complete readiness.

Provide actionable attention groups, such as missing primary artifacts, unknown attribution, pending review work, stale/mismatched receipts, and retrieval problems. Each group needs:

- A plain-language description.
- Its affected execution/source count, distinguished from the number of diagnostic messages.
- A link to the relevant experiment or filtered Results subset.
- Source-specific details when opened.

The observer may explain what is missing; it must not imply it can repair artifacts or run reviews.

### Optional secondary content

A compact Continue reviewing section may contain a few recent experiment links. It must not become another full history table. Keep filesystem availability and configured-source health in a secondary disclosure rather than presenting them as the main research conclusion.

## 4. Results: experiments-first evidence explorer

Results owns history discovery, filtering, comparison, and entry into detailed evidence.

### Inventory hierarchy

- Matrix parents appear as top-level experiments.
- Their coordinates are inspected within the parent experiment, not duplicated as peer experiment rows by default.
- Standalone executions remain top-level standalone experiments.
- Exact, validated membership determines grouping; do not group by filename prefixes, execution-ID resemblance, or shared nonunique run IDs.
- Keep an explicit secondary All executions view for raw identity browsing.
- Preserve visibility of orphaned, unavailable, ambiguous, or unresolved child records through an identified unresolved group or All executions view. Do not silently discard them to make the primary table cleaner.

### Row hierarchy

Lead with readable experimental context drawn from actual recorded metadata:

- Condition / method / surface as appropriate.
- Provider and model.
- Stored date and mode.
- Coordinate count and distinct lifecycle/outcome summary.
- Review availability/readiness when supported by the summary contract.

Use the exact execution ID as secondary, copyable, searchable metadata. Do not invent experiment names or labels implying preregistered study structure.

Make Open results the primary action. Monitoring a historical execution is secondary. Existing detail routes `/results/[executionId]` remain the evidence destination; preserve exact coordinate identity, score origin, reasons, and redacted export consistency there.

### Discovery and comparison

- Apply experiment/execution view selection, search, filters, sorting, and pagination server-side at the correct inventory level.
- Keep search and common filters prominent. Move secondary filtering, sorting, and density into a quieter toolbar or disclosure when they compete with the primary task.
- Preserve comfortable/compact behavior, but only Results needs catalog density controls.
- Comparisons must retain scope, score origin, rubric, availability, and denominator. Do not introduce an unlabeled runtime/Human/AI leaderboard.
- Overview drill-down links must open the intended experiment or subset, not an unfiltered catalog.

### URL-backed investigation state

Encode relevant scope, view, filters, sorting, and detail selection in the URL so refresh, direct links, and browser Back preserve the investigation. Update all link producers and consumers together; avoid a second competing convention.

Final parameter names and endpoint placement should follow current routing conventions during implementation. Any new query contract must be documented and exercised end to end. Unknown/invalid/expired selections must fail visibly without showing another source's data.

## 5. Data and architecture requirements

### Separate page compositions

Replace the `CatalogPage overview` mode switch with distinct Overview and Results compositions. Share visual primitives, schemas, source-resolution helpers, and genuinely common domain logic—not a whole page whose title changes with a boolean.

Known implementation entry points:

| Area | Current files / responsibility |
| --- | --- |
| Overview route | `app/overview/page.tsx` |
| Results route | `app/results/page.tsx` |
| Shared composition to split | `components/catalog-page.tsx` |
| Inventory presentation | `components/run-catalog.tsx` |
| Detailed review workflow | `app/results/[executionId]/page.tsx`, `components/results/` |
| API contract | `lib/schemas.ts`, `lib/api-client.ts` |
| Discovery and exact membership | `app/api/runtime/runs/route.ts`, `lib/server/resolve-run.ts` |
| Status, counts and normalization | `lib/artifact-contract.ts`, `lib/result-normalizer.ts` |
| Source-bound reviews | `lib/server/reviews.ts`, `lib/server/result-bundle.ts` |
| Presentation system | `app/globals.css`, `components/ui/` |

New module names or API routes are implementation decisions, not already existing deliverables. Inspect the current files before editing; preserve intervening user changes.

### Server-owned scoped summaries

The current catalog's `workspace` fields provide source-inventory facts. They do not establish deduplicated study coverage or complete review readiness. Extend typed, validated server-side read contracts for those facts rather than manufacturing them from the browser's loaded page.

Requirements:

- Exact scope identity, original source bindings, and supported projection/epoch attribution.
- Stable parent/child membership and explicit ambiguity diagnostics.
- Coverage and outcomes using producer-compatible semantics.
- Independent review workflow summaries with explicit eligibility/availability.
- Attention groups with affected identities and source-specific links.
- Bounded discovery, review retrieval, payloads, and pagination.
- Explicit summary freshness and partial/unavailable states.
- Stale async-response rejection when scope or query changes.

Reuse the existing resolver/review adapters. Do not independently port Python proof gates into browser heuristics, trust unbound historical compatibility data, or launch an exporter/evaluator from an endpoint. Avoid fetching every child's complete evidence merely to render an Overview summary.

### Preserve existing safeguards

- Read-only TESIS boundary and isolated local mock replay.
- Canonical real-path containment and redaction on API responses/downloads.
- Execution/outcome independence and source-aware null fallback.
- Authoritative hash-bound projection vectors, including intentional unknowns.
- Independent Human/AI final receipt validation and metric denominators.
- Exact source-specific coordinate details, abort guards, keyboard focus, reduced motion, and responsive interaction.

## 6. Visual and interaction direction

Keep the established Cloudflare-inspired enterprise identity: neutral surfaces, readable sans-serif typography, blue interactions, restrained semantic status colors, aligned tables, and 1px borders. Light and dark must remain equivalent in meaning and usability.

Mode: **Operate** for both surfaces. The distinction is their task and composition:

- Overview: synthesis, scope context, relationships, and exceptions.
- Results: efficient scanning, selection, comparison, and evidence navigation.

On phones, Overview must communicate the selected scope and its main conclusion before any long secondary content. Results must offer usable search and experiment identity without requiring the user to traverse a wall of controls. Preserve keyboard access, appropriate touch targets, visible focus, and reduced-motion alternatives. Do not convey readiness or outcome by color alone.

The critical test: removing the page title should still leave Overview and Results recognizably different in purpose.

## 7. Implementation order

1. Define the scoped summary and experiment-list contracts against current saved sources; establish counting units, membership, provenance, availability, and URL behavior.
2. Split the page compositions and remove general catalog controls/history from Overview.
3. Implement server-owned scoped Overview summaries, independent review readiness, and actionable attention groups.
4. Implement experiment-first Results inventory, raw execution fallback, readable row hierarchy, and parent-to-coordinate navigation.
5. Wire Overview drill-down, Results filters, browser navigation, and existing detail views to the same source/query identity.
6. Refine hierarchy and responsive layouts within the established visual system.
7. Exercise contracts and the actual desktop/mobile workflows, update docs, and finish with a bounded polish pass.

Relevant Impeccable workflows: shape → harden → layout/clarify → distill → polish. Read the relevant installed Next.js guides and skill playbooks before implementation. Do not use subagents under the current user instruction.

## 8. Acceptance requirements

| Gate | Required observable behavior |
| --- | --- |
| Distinct purpose | Overview contains no general RunCatalog, catalog filter suite, density control, or history pagination. Results is the primary inventory. |
| Scope | Overview names its selected experiment/cohort and source context. Selection persists according to the agreed precedence. Explicit unavailable/ambiguous selection never silently substitutes another source. |
| No invented cohort | Configured roots and filesystem identity totals are not presented as study denominators. Cohort membership is explicitly supported or not offered. |
| Counting | Parent/child inventory and scoped coordinate counts do not double-count. Planned, represented, terminal lifecycle, unknown, and skipped/unstarted remain distinct. |
| Conclusions | Execution status and security outcome remain independent. Unknown attribution stays explicit; missing proof does not become no_finding. |
| Reviews | Human/AI readiness uses accepted source-bound workflow evidence. Unselected, pending, missing, stale, and unavailable states are not conflated. Runtime values do not substitute for finals. |
| Attention | Each attention group identifies its unit/count and opens the affected experiment or subset with inspectable source diagnostics. |
| Experiment inventory | A matrix and its children appear once at experiment level by default. Standalone, orphaned, unavailable, and ambiguous records retain a discoverable path. |
| Readable rows | Experimental context leads; exact IDs remain copyable/searchable. Open results is primary, historical monitoring secondary. |
| Navigation | Overview drill-down, refresh, direct links, browser Back, query changes, and rapid scope switching preserve the intended identity/state and reject stale responses. |
| Pagination | Search/filter/order apply before pagination at the correct grouping level. Results are not restricted to already loaded browser rows. |
| Accessibility | Primary tasks work with keyboard and touch; labels, focus, non-color status meaning, reduced motion, and responsive layouts survive the composition change. |
| Safety | No experiment/review/provider/DVWA execution or artifact writes. Containment, source binding, redaction, and mock isolation remain intact. |

Use existing test conventions. Add or update focused behavioral coverage for membership/count boundaries, scoped summaries, review eligibility, query persistence, unavailable states, stale-response rejection, and drill-down. Remove obsolete assertions that require a duplicated Overview table; do not simply re-pin incidental wording or CSS.

For implementation validation, follow the repository guide:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Run applicable Playwright acceptance checks against a local server using sanitized saved fixtures. Exercise the actual changed surface in a browser on desktop and phone, including light/dark, loading/error/empty, selected matrix/standalone, and unknown/incomplete-review states. Keep visual review bounded: one batched inspection, one batch of corrections, at most one confirmation round. No live experiments, DVWA or provider calls are authorized by this handoff.

Documentation-only preparation of this handoff does not require an application build or test rerun. Actual implementation must record what was exercised and any unavailable gates without claiming historical cohort parity from UI inspection alone.

## 9. Definition of done

Completion requires both accepted page purposes to work end to end, updated affected callsites/contracts/tests/docs, and observed verification of the acceptance requirements. A changed title, another statistics strip, or charts above the existing duplicated table do not satisfy this handoff. Missing producer facts must remain unavailable, not be replaced with invented readiness or conclusions.

## 10. Implementation and verification record

### Implemented

- Separate `ExperimentOverviewPage` and `ExperimentInventoryPage` compositions replace the shared `CatalogPage overview` switch. The obsolete general catalog component and duplicated Overview-table expectations were removed.
- `lib/experiment-contract.ts`, `lib/server/experiments.ts`, and `GET /api/experiments[/overview]` own typed experiment inventory and scoped summaries. Grouping/filtering/ordering happen before bounded pagination; no cohort is inferred from configured roots.
- Overview selects an exact experiment, exposes original source/hash and available projection epoch, separates coverage from security outcomes, and reports independent bounded Human/AI receipt readiness. Missing primaries and incomplete scans retain unavailable states.
- Attention disclosures identify affected executions separately from diagnostic messages, expose source diagnostics, and link to the scoped inventory and exact coordinate.
- Results defaults to matrix parents and standalone experiments, with All executions and Unresolved identities alternatives. Raw parent identities filter by their own canonical lifecycle/outcome rather than repeating the child distribution.
- Scope and inventory state are URL-backed; detail routes persist exact coordinate, tab, and score origin. Invalid-query filter/view changes preserve the explicit scope. Scope/query transitions hide previous data and reject late responses.
- Exact membership validation is shared by inventory, coordinate retrieval, aggregate detail enrichment, and parent runtime-source ownership. Orphans retain their own inspectable source; ambiguity never selects one source's metadata. Receipt-discovery diagnostics survive cache hits.
- README, DESIGN, surface briefs, fixtures, and affected behavioral tests document the new contracts. No new environment variables were introduced.

### Exercised gates

| Gate | Observed result |
| --- | --- |
| `npm run test` | 141 passed; one opt-in historical-cohort test skipped |
| `npm run typecheck` | Passed |
| `npm run lint` | No errors; two unused-symbol warnings in unchanged `lib/formatters.ts` |
| `npm run build` | Passed, webpack production build |
| `git diff --check` | Passed |
| Playwright against fixture-only production server | 25 passed |

Browser acceptance used `scripts/prepare-browser-artifacts.mjs ... --overview`
under `/tmp`, with explicitly configured fixture-only artifact/review roots and
no compatibility/projection/index files. Scenarios covered matrix versus raw
inventory, failed-confirmed independence, scoped drill-down, direct coordinate/
tab/origin links, refresh/Back, invalid and missing selections, invalid-query
scope preservation, rapid source switching, loading/error/empty states, reviews,
redaction, evidence identity, keyboard/touch, responsive layout, and reduced motion.
The existing worker-retry test was isolated from unrelated runtime adoption after
failure evidence showed the graph identity changing before Retry.

Manual Chromium inspection covered desktop 1440×1000 and phone 390×844 in light
and dark, selected matrix/standalone, unknown attribution, missing primary,
ambiguous scope, and incomplete-review states. One batched visual inspection and
one confirmation round corrected phone attention wrapping and verified 44px
outcome-link targets without page-level overflow. The observed matrix had three
represented coordinates and four planned; confirmed drill-down returned only the
failed-confirmed child, and Back restored the scoped query.

### Limits and safety

The summary scans at most 100 exact member sources for reviews, with at most 100
attention details per group; omissions and incomplete scans remain explicit.
No historical-cohort parity gate was run. No real TESIS artifacts were modified,
and no experiments, review evaluations, provider calls, or DVWA requests were run.
Visual identity, the shell, and the read-only observer boundary were preserved.
