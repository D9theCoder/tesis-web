# AKG Mock Test Handoff

## Objective

Finish the dashboard mock test so that it verifies the AKG traversal state
actually produced by the browser reducer. A successful result must not be based
only on the internal consistency of the YAML fixture.

## Current implementation

The current uncommitted implementation provides:

- A `Mock AKG test` dashboard button in
  `components/runtime/runtime-shell.tsx`.
- A checked-in simulation seed at `data/akg-simulation.yaml`.
- A read-only `GET /api/mock/akg` route that parses the YAML and creates replay
  events.
- An animated replay through the same `reduceEvents` function used by live
  runtime events.
- Server-side checks for node existence, directed edges, expected paths,
  confirmed findings, and achieved outcomes.

The route was exercised successfully and returned HTTP 200 with 18 events. Its
five server-side checks passed. The web snapshot and the current Python AKG
snapshot also contain the same 38 directed edges.

## Required improvements

### 1. Derive the final result from the browser reducer

This is the main correctness issue.

`lib/akg-mock.ts` currently calculates `verification.passed` directly from the
generated event objects. `components/runtime/runtime-shell.tsx` displays that
value as `AKG verified` as soon as the fixture is loaded, before the animated
replay has completed.

Replaying the current fixture through `reduceEvents` produces a different final
result from the server verification:

- Expected path: 10 nodes, ending at `data_exfiltrated`.
- Reduced UI path: 9 nodes, ending at `access_control_confirmed`.
- Reduced `currentNode`: `access_control_confirmed`.

Add client-side verification of the final `LiveRunState`. While events are
being replayed, the UI should show a running or pending result. Only after the
last event has been reduced should it display verified or failed.

The final check should at least compare:

- `state.akgPath` with `assertions.expected_path` in exact order.
- `state.currentNode` with the final expected node.
- `state.confirmedVulns` with the expected confirmed findings.
- `state.achievedOutcomes` with the expected outcomes.
- Every path transition with the snapshot rendered by `AkgGraph`.

Prefer extracting this into a pure function so it can be unit tested without
rendering React.

### 2. Ensure traversal-bearing events update graph state

`lib/event-reducer.ts` currently updates `akgPath` only when processing a
`graph.state` event. The YAML fixture carries traversal state on other events,
including `chain.transition`, `vuln.confirmed`, and `outcome.achieved`. The
final `data_exfiltrated` hop is therefore ignored by the graph reducer.

Preferred fix: teach the reducer to accept a valid non-empty `data.akg_path`
from traversal-bearing events, while preserving the reducer's monotonic state
rules. It should also update `currentNode` for the corresponding AKG transition
or outcome event when the node is valid.

Adding another `graph.state` event to the fixture would hide the mismatch but
would not fix the underlying reducer behavior, so it should not be the only
change.

After the fix, the current fixture must reduce to:

```text
unauthenticated
-> brute_force
-> bf_dictionary
-> bf_dictionary_confirmed
-> brute_force_confirmed
-> authenticated_session
-> ac_idor
-> ac_idor_confirmed
-> access_control_confirmed
-> data_exfiltrated
```

The final `currentNode` must be `data_exfiltrated`.

### 3. Verify against the graph that is actually rendered

`createAkgMockSimulation` verifies against the compiled `AKG_SNAPSHOT`, but the
dashboard renders the snapshot loaded from `GET /api/akg`. That route may return
an AKG snapshot from a TESIS run instead of the compiled fallback.

Although both snapshots match today, they can drift independently. The mock
verification must use the exact `AkgSnapshot` passed to `AkgGraph`. Possible
approaches are:

- Perform topology verification in the client using the loaded `akg` state.
- Or centralize snapshot resolution on the server and return the resolved
  snapshot/version with the simulation.

Do not display a green result calculated against one snapshot while rendering
another.

### 4. Add automated regression tests

There is currently no test script or test suite in this web repository. Add an
appropriate TypeScript test runner and cover at least:

1. Valid YAML parsing and default values.
2. Rejection of malformed seeds and unsupported structures.
3. Failure when an expected node does not exist.
4. Failure when a directed transition does not exist.
5. Full fixture replay through `reduceEvents`.
6. Exact final path, final node, confirmed findings, and achieved outcomes.
7. Verification remains pending while the animation is running.
8. The badge becomes green only after a successful replay.
9. A deliberately mismatched fixture produces a visible failed result.
10. Re-running the mock does not duplicate events or leak state from a live run.

A pure reducer/verification test is mandatory. A component test that clicks the
button and advances fake timers is strongly recommended.

## Acceptance criteria

The work is complete when all of the following are true:

- The dashboard button loads and replays the YAML fixture.
- Live discovery and polling do not modify the state during the mock replay.
- No success badge appears before replay completion.
- Every expected path edge becomes visible during the replay.
- Final `akgPath` exactly matches the YAML assertion.
- Final `currentNode` is `data_exfiltrated`.
- Expected confirmed findings and outcomes exist in the reduced state.
- Validation uses the same snapshot rendered by the graph.
- A node, edge, path, finding, or outcome mismatch produces a failed badge with
  useful details.
- Unit and component tests pass.
- Type checking, linting, production build, and `git diff --check` pass.

## Validation commands

```bash
npm run typecheck
npm run test
npm run lint
npm run build
git diff --check
```

Also start the application, click `Mock AKG test`, observe the complete path,
and exercise `GET /api/mock/akg` directly.

## Existing tooling blockers

These blockers predate the AKG mock changes but prevent a clean merge-quality
validation:

- `npm run lint` currently fails before linting source because ESLint 8 is
  incompatible with the installed Next 16 ESLint configuration.
- Turbopack production builds cannot run in the restricted review environment
  because its helper process is denied permission to bind a local port.
- The webpack build path reached a separate Next.js error while parsing
  TypeScript's `--showConfig` output.

Fix or independently verify the lint/build setup before declaring the feature
complete. Do not attribute the Turbopack port error to the AKG implementation.

## Scope note

This fixture is a browser simulation. Even after these improvements, it proves
that the dashboard snapshot, event reducer, and AKG visualization agree. It does
not execute DVWA, a model provider, or the Python `AttackKnowledgeGraph`
traversal engine. If the button is intended to verify the Python traversal
engine itself, the API must invoke a dedicated backend dry-run or consume an
artifact produced by that engine instead of synthesizing all events in the web
application.
