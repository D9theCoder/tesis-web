# Trajectory view — artifact handoff

The live monitor's **Trajectory** view (`components/runtime/trajectory-view.tsx` over
`lib/trajectory.ts`) projects the redacted runtime journal into turns, calls, and a
timing overview. It renders exactly what the journal carries and states when a fact
was never recorded. This document records the field contract it already accepts and
the gaps that only TESIS-side artifact changes can close.

Ordering is fixed and not configurable: the view walks `state.events` in emission
order, never sorts by timestamp, and shows every record kind by default. Search and
the expand/collapse control change presentation only.

## 1. What the view derives per record

| Fact | Source | Render |
| --- | --- | --- |
| Turn grouping | `event_type` matching `llm.started`, `llm.request`, `model.request`, `method.selected`, `iteration.*`, `turn.*` opens a turn | `Turn N` header |
| Cell pairing | start record (`*.started`, `*.start`, `*.attempt`, `*.request`, `*.queued`) with a finish record (`*.completed`, `*.success`, `*.failed`, `*.confirmed`, `*.response`, `*.result`, …) in the same namespace, kind, `call_id`, node, and method | one row, measured `durationMs` |
| Kind / lane | `event_type` patterns plus `data.prompts` | chip + Input / Model / Tools / Safety lane |
| Status | `event_type` and payload verdicts (see §3) | `Completed` / `Failed` / `Pending` / `Observed` |
| Node status | `event.node` per cell, last meaningful status wins per node | node chips on the turn |
| AKG path | `data.akg_path` / `data.akgPath` on the latest record carrying one | breadcrumb on the turn and in the cell |
| Request text | `data.prompts`, `prompt`, `system_prompt`, `systemPrompt`, `messages`, `request_text`, `input` | `Request` block |
| Reasoning text | `data.reasoning_content`, `reasoningContent`, `reasoning_text`, `reasoning`, `thinking_text`, `thinking`, `analysis`, `thought` | `Thinking` block |
| Response text | `data.response_text`, `responseText`, `response`, `content`, `output_text`, `output`, `completion`, `text`; streamed `*.token` / `*.stream` chunks are concatenated | `Response` block |
| Model, tool | `data.model`, `model_name`, `model_id`; `data.tool`, `tool_name` | meta line |
| Usage | `data.usage.{input_tokens|prompt_tokens, output_tokens|completion_tokens, reasoning_tokens, cached_tokens, total_tokens}` or the same keys flat on `data`; `usage.completion_tokens_details.reasoning_tokens`, `usage.prompt_tokens_details.cached_tokens` | `Input` / `Cached` / `Output` / `Reasoning` / `Total tokens` rows, `in/out/think/cached` on the turn |
| Start, finish | `event.timestamp` on the opening and closing records of a cell | `Started`, `Total duration` |
| TTFT, generation, throughput | first `*.token` / `*.stream` / `*.delta` / `*.partial` record after the call start, compared with `event.timestamp` | `TTFT`, `Generation`, `Throughput` |
| Raw payload | the latest record in the cell whose `data` is non-empty | `Raw JSON` block |

Timestamps are epoch seconds and are rendered through `fmtClock`; missing timestamps
degrade the overview to emission order and are labelled as such.

The cell inspector renders two labelled lists, `Record timing` and `Token usage`, with
one row per fact. Three states are distinguished and never blurred: a filled value, `not
recorded` when the journal was silent although the record kind could have carried the
fact, and `n/a` when the phase cannot exist for that kind (a tool call has no first-token
latency). The `Source` row names where the numbers came from — today always `journal
event timestamps`, never provider-reported timing.

## 2. Gaps that need TESIS-side changes

Each gap lists what the UI shows today, what is missing from the artifacts, and the
concrete change that would close it. The client already reads the keys in §1, so most
fixes are emitter-only.

### G1 — Provider reasoning is never recorded

- **Today:** no `Thinking` block ever appears for a real run; the block only renders when a journal carries a reasoning key.
- **Missing:** TESIS does not emit reasoning/thinking text or reasoning-token counts.
- **Change:** in the model client, add to the response event `data`:
  `reasoning_content` (string, the model's reasoning text) and
  `usage.completion_tokens_details.reasoning_tokens` (number).
  If the provider streams reasoning, emit it as `llm.reasoning` / `llm.reasoning_token`
  records; the view concatenates chunk records that sit inside a model cell.
- **Consumption:** automatic — no client change needed once the keys are present.
- **Verification:** `tests/trajectory.test.ts` ("projects request, response, reasoning …") asserts the projection; the browser test asserts that no `Thinking` block appears when the mock has none.

### G2 — Prompts, system prompt, tool catalog, and request options

- **Today:** the mock journal carries only `response_text`, so `Request` never renders for it. Real journals are unknown to this repo.
- **Missing:** the exact prompt payload the AKG sent to the model, the system prompt, the tool catalog offered, and sampling options.
- **Change:** emit a `llm.request` event per call (before `llm.response`) with `data.prompts` (array of `{role, content}`), `data.model`, and optionally `data.tools` and `data.request_options`. Keep `call_id` shared with the response so the pair collapses into one cell.
- **Consumption:** `prompts` / `messages` render in the `Request` block with roles preserved (`system: …`, `user: …`).
- **Not implemented:** a `Tools` / `Options` block. DSH shows both; adding them is a small extension to `DetailBlock` plus keys `data.tools` and `data.request_options` in `REQUEST_KEYS`-style lists.

### G3 — First-token latency and throughput need stream records

- **Today:** the `TTFT`, `Generation`, and `Throughput` rows read `not recorded` unless the journal emitted per-token or per-chunk records; a single `llm.response` has no intra-call timing. The row carries a tooltip naming the missing stream records.
- **Missing:** chunk events with timestamps during generation.
- **Change:** emit `llm.token` (or `llm.stream`) records carrying `call_id` and `data.token` or `data.text`, one per chunk. Also emit `llm.request`/`llm.started` so the call has a start time; without a start, the cell reports `not recorded` and `Source: no timestamps recorded`.
- **Consumption:** the first chunk after the start becomes `ttftMs`, rendered as `TTFT`; `decodeMs = completed − firstToken` renders as `Generation`, and `tok/s = output tokens / decodeMs` renders as `Throughput`.
- **Caveat:** if chunk events carry cumulative text instead of deltas, the view already tolerates it (`appendChunk` replaces a prefix).

### G4 — Token usage is only partially reported

- **Today:** the mock reports `total_tokens` only, so turns show `—/—/—` in the timing table, and the record inspector fills `Total tokens` while `Input`, `Cached`, `Output`, and `Reasoning` read `not recorded`.
- **Missing:** input, output, cached, and reasoning splits.
- **Change:** emit a `usage` object on the response event (or flat `prompt_tokens`, `completion_tokens`, `cached_tokens`, `reasoning_tokens`). Note `isSecretKey()` keeps `*_tokens` keys intact, so these survive redaction.
- **Consumption:** the per-turn table switches to `in/out/think`, the record inspector fills the four split rows, and totals appear in the turn meta and the panel's stat summary.

### G5 — Tool identity is inferred from the method

- **Today:** cells show `Method:` and only show `Tool:` when `data.tool` exists.
- **Missing:** the name of the tool or verifier that executed a probe, independent of the AKG method.
- **Change:** add `data.tool` (or `tool_name`) to `probe.*`, `exploit.*`, and `verifier.*` events.
- **Consumption:** automatic; `Method:` and `Tool:` render side by side.

### G6 — Node verdicts are inferred, not declared

- **Today:** a node's chip reads `Completed` / `Failed` / `Pending` derived from event types (`vuln.confirmed`, `probe.success`, `probe.failed`) and payloads (`data.ok === false`, `data.status`), and a retried node reports its last state.
- **Missing:** an authoritative per-node verdict such as `exploited`, `reachable`, `not_exploitable`, `blocked`, or `skipped`.
- **Change:** emit `data.node_status` (enum string) on the graph/verdict event, or a dedicated `node.status` event with `node` and `data.status`. Map the runtime's vocabulary to `completed` / `failed` / `pending` / `observed`, or extend `TrajectoryStatus` and the `isFailure` heuristics in `lib/trajectory.ts`.
- **Consumption:** requires a small client mapping table (one record of event-type/status → label) so the chip shows the runtime's own vocabulary rather than a guess.

### G7 — No compaction, subagent, or request-header records

- **Today:** every event falls into System / Context / Model / Tool / Safety.
- **Missing:** DSH distinguishes `COMPACTED`, request headers, and subtool rows.
- **Change:** if TESIS compacts context or delegates to subagents, emit `context.compacted` (with `data.tokens_before`, `data.tokens_after`) and `subagent.started` / `subagent.finished` (with `data.parent_call_id`). `context.compacted` already classifies as Context; a dedicated chip needs a `TrajectoryKind` extension.

### G8 — The view is bounded to the last 300 events

- **Today:** `reduceEvents` caps `state.events` at 300 (`slice(-300)`), so a long run's ledger starts mid-run; the panel warns once the cap is reached.
- **Missing:** the earlier window.
- **Change:** either raise the cap for derived views or keep a second bounded store. The projection is pure, so a larger window costs only render time. `Experiment activity` remains the complete, paged audit source.
- **Consumption:** none; `deriveTrajectory` accepts any window.

### G9 — Timestamps are required for the time axis

- **Today:** without `event.timestamp` the overview falls back to emission order and says so.
- **Change:** keep emitting epoch-second timestamps on every record; monotonic order matters more than absolute accuracy.

### G10 — Failure heuristics can mislabel

- **Today:** a record counts as failed when its `event_type` matches `error|fail|reject|blocked|invalid|refus`, when `data.ok === false`, or when `data.status` matches the same words. A domain event that merely mentions "blocked" in its name (for example a successful containment block) renders as an error.
- **Change:** prefer explicit verdict fields (`data.ok`, `data.status`, `data.node_status`) on those events, or rename outcome events so the vocabulary is unambiguous.

## 3. Precise key contract

- Pairing identity: `data.call_id`, `data.callId`, or a top-level `call_id`. Without it, pairing falls back to namespace + kind + node + method, most recent open call first.
- Status inputs: `data.ok` (boolean), `data.success` (boolean), `data.status` (string).
- Redaction: the API scrubs secret-looking strings and replaces secret-keyed values with `[REDACTED]` (`lib/server/fs-util.ts`). Prompt and reasoning text survive redaction; credentials inside them do not. Never rely on the view to hide secrets.
- Determinism: identical event windows must produce identical models, so no `Date.now()`, no locale-dependent formatting, and no ordering by object iteration.

## 4. How to verify a change end to end

1. Add the field to `data/akg-simulation.yaml` on an **existing** event first — the replay assertions count `18/18 events reduced`, so new events need those expectations updated in `tests/browser/akg.spec.ts`.
2. `npx vitest run tests/trajectory.test.ts` — the projection tests cover request/response/reasoning, usage, TTFT, status, and search.
3. `npx vitest run tests/trajectory-view.test.tsx` — the component tests cover the blocks, the turn meta, the timing table, and the record inspector's timing and usage rows.
4. `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/browser/akg.spec.ts -g trajectory` — asserts the unfiltered 16-record ledger, chronology, turn status, node chips, AKG path, and the response/raw blocks against the mock replay.
5. Screenshots land in `test-results/acceptance/trajectory-*.png` for a visual check.

## 5. Constraints to preserve

- Observer-only: this view never launches, cancels, or mutates a run, and never writes into `TESIS_ROOT`.
- No fabricated values: an absent field renders as absent (`not recorded`, `n/a` for a phase the record kind cannot have, `—`, or no block at all), never as a zero.
- Every record stays visible by default; search and folding are presentation only.
- The panel body is the single scroll region in this view.
