# TESIS Web artifact retrieval implementation, 2026-10-12

Status: implemented; non-browser consumer acceptance validated. Playwright acceptance is deferred at the user's explicit request. This report does not close browser/live integration or producer acceptance gates.

The observer reads configured filesystem roots only. No TESIS source or experiment artifacts were edited. No runner, review evaluator, exporter, DVWA request, provider call, or experiment was executed by this implementation. No commit or push was made. The existing staged handoff addition and implementation-handoff deletion were preserved.

## Implementation

- One content-aware catalog resolves exact execution IDs, configured normal/flat/research roots, matrix membership, independent and embedded child sources, descriptors/manifests, journals and snapshots. Sidecars are excluded. Missing primaries and ambiguous copies remain explicit. Registry pagination is bounded and exposed to the UI.
- Validated `observer-result.v1` bundles retain original-byte SHA-256, independent Human/AI reviews, historical analysis and diagnostics. Matrix bundles carry coordinate metadata and retrieve full child evidence only on selection.
- `observer-projection.v1` matches the companion producer's current transport fields. Every referenced source binding is checked before applying the read model. Schema/root/hash/membership rejection restores the original interpretation. No Python classifier or exporter is launched. A supported hash-bound historical compatibility adapter remains available.
- Canonical execution/outcome/reasons are independent. Missing/ambiguous historical attribution stays unknown. Candidate executed/not-executed is a separate schema. Canonical counts, planned/unstarted coverage, group counts and original legacy totals retain separate meanings.
- Final Human/AI vectors come from source-bound scoring.v4 receipts with valid ID/path/hash, method/config/workflow, finite components, distinct candidate denominator, payload mean and weighted arithmetic. Missing, stale and pending workflows have null finals. Old pending statuses require declared source/epoch/ledger associations or a verified projection. Saved receipts remain inspectable.
- Runtime scoring.v2 remains provisional. No partial-vector composite or zero-filled missing component is invented. Fractional components and four-decimal receipt finals are preserved. Metric precedence and explicit availability retain nulls, denominators and reasons; provider performance is not used for experiment rates.
- Coordinate requests are aborted and guarded against late responses. Header, evidence, scores and redacted download use the selected child's source. Failed detail retrieval displays unavailability. Lifecycle/outcome/historical filters and evidence-reference links are available.
- Parent lifecycle and per-child graph/findings state are partitioned. LLM completions and child finishes cannot end a parent. Journal pages bound bytes/lines, retain multibyte byte offsets/partial lines, expose diagnostics/continuation and filter a shared journal without changing its cursor semantics. Identity and cursor checkpoints detect replacement, observed truncation and rewrites.
- Snapshot selection follows the execution and declared parent ownership; static fallback is labeled. Canonical real-path containment applies to source/review/manifest/snapshot references. Structured and free-text redaction preserves safe IDs/hashes/usage metadata.
- README and `.env.example` document source/review roots, projection/compatibility selection, legacy review indexes, API semantics and repeatable saved/browser fixture checks.

## Consumer evidence

`epoch7.json` records the supported historical-compatibility path. `epoch7-projection.json` records the companion producer's accepted `observer-epoch7-accepted.json` path. Both contain original source hashes and the observed counts:

| Gate | Evidence |
| --- | --- |
| Saved research discovery | 109 executions: one matrix and 108 exact children, without review/audit/sidecar executions |
| Canonical lifecycle | 108 completed, 0 failed, 0 unknown |
| Canonical outcomes | 57 confirmed, 10 no_finding, 9 unconfirmed, 32 fixture_limited |
| Original totals | 61 legacy success / 47 legacy error preserved |
| Historical incomplete analysis | 36 executed_without_candidate_confirmation; 4 executed_unconfirmed_weak_or_partial_signal; 7 fixture_permission_oracle_unavailable |
| Source-bound review workflows | 97 final AI / 11 pending AI, instead of counting 146 historical status files as current workflows |
| Original identity/hash | Each child and the matrix retain original-byte SHA-256; original matrix bytes still report 47 legacy errors |

Focused Vitest tests additionally cover all twelve lifecycle/outcome pairs, null/zero/fractional semantics, availability precedence, exact and ambiguous IDs, missing/embedded primaries, child identity, independent reviews, arithmetic/binding rejection, containment/redaction, evidence links, journal pages/reset/filtering, snapshot switching and stale coordinate responses.

## Validation and remaining boundary

- Standard Vitest suite: 82 passed; the opt-in saved-cohort test is skipped in the standard invocation and passed separately through both compatibility and producer-projection configurations.
- TypeScript: passed.
- ESLint: passed with four existing unused-symbol warnings.
- Production webpack build: passed.
- `git diff --check`: passed.
- Playwright: deferred by the user. The initial attempt could not launch the matching browser or connect inside the sandbox. The localhost fixture server and temporary browser download were stopped when the user withdrew browser scope. No browser pass is claimed. The new local artifact browser tests and `/tmp` fixture preparer are implemented but remain unverified in a browser.

Producer projection generation/publication and producer/live acceptance are owned by the companion handoff. This report establishes read-only saved-input consumer behavior and non-browser framework checks. It does not establish a new research result or browser acceptance.
