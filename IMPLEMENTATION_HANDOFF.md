# AKG Replay Verification and Diagram Redesign

  ## Summary

  Complete the mock verification described in AKG_MOCK_HANDOFF.md and redesign the live AKG diagram for readability.

  Confirmed design choices:

  - Full graph is the default view.
  - AKG becomes the main dashboard panel, occupying roughly two-thirds of desktop width.
  - Completed mock results remain visible until Return to live is clicked.
  - Preserve the existing dark dashboard theme.

  ## 1. Replay Correctness and Interfaces

  - Update reduceEvents to consume valid, non-empty data.akg_path arrays from traversal-bearing events and update currentNode
    consistently. Preserve ordered paths, repeated nodes, accumulated findings/outcomes, and monotonic counters.

  - Return validated assertions alongside fixture events from /api/mock/akg; remove the server-generated verification verdict.
  - Validate seed structures, supported schema versions, supplied field types, and non-empty expected paths. Retain defaults for
    omitted optional fields.

  - Add pure verifyAkgMockState(state, assertions, snapshot) verification for exact path, final node, required findings/
    outcomes, node existence, and directed transitions. Include readable expected/actual details.

  - Keep finding/outcome checks based on required membership, preserving existing method-ID aliases.
  - Use an isolated mock session with loading, running, passed, and failed states. Reduce each event exactly once and verify the
    resulting state only after the last event.

  - Guard asynchronous work with session identity; clear timers and abort requests when leaving or replacing a session.
  - Suspend live discovery, polling, and artifact updates throughout mock mode, including late responses and errors.
  - Capture the resolved snapshot at replay start and use it for both rendering and verification. Wait for graph layout
    readiness before playback.

  - Rerunning starts from fresh state. Return to live clears the mock and immediately resumes discovery.

  ## 2. Visual Improvement

  ### Dashboard composition

  - At widths of 1280px and above, use a two-column layout: flexible AKG panel on the left and a minimum 360px sidebar on the
    right.

  - Stack Coordinate, Conversation, and Outcomes in the sidebar. Allocate approximately 30%, 40%, and 30% of its height, with
    independent scrolling.

  - Below 1280px, place the graph above the supporting panels. Give it at least 480px height and allow page scrolling.
  - Remove duplicate panel headings and technical quadrant IDs from visible headers.
  - Add Expand to open the graph in a full-screen dialog while retaining the same live/mock session.

  ### Layout and routing

  Replace the hard-coded coordinates and custom camera calculations with React Flow (@xyflow/react) and ELK (elkjs). React Flow
  supplies viewport interaction; ELK supplies node placement and routed edges. Use the documented React Flow integration
  (https://reactflow.dev/examples/layout/elkjs-multiple-handles) and ELK layered layout
  (https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html).

  - Use a deterministic left-to-right layered layout with orthogonal connections and softly rounded bends.
  - Group related methods and confirmations by surface. Derive grouping from snapshot metadata and unambiguous non-chain
    relationships; keep shared entry/outcome nodes singular.

  - Use subtle surface headings and restrained group backgrounds. Group containers are presentation elements, excluded from
    topology verification and node counts.

  - Start with approximately 152 × 56px node cards, at least 24px between neighboring nodes, and 64px between layers.
  - Connect edges to node boundaries through explicit ports. Render ELK’s routed bend points, including return and cross-surface
    connections.

  - Show arrowheads indicating the original directed relationship. Never reverse a displayed edge because the layout algorithm
    rearranged it.

  - Lay out every snapshot node, including unfamiliar nodes. Remove the shared fallback coordinate that currently causes new
    nodes to overlap.

  - Cache layout by snapshot content and layout settings. Event updates change visual state without repositioning nodes.
  - Discard stale asynchronous layout results after snapshot changes. Show a visible layout error with retry if placement fails.

  ### Labels and visual hierarchy

  - Use a short, readable primary label with approximately 14px text at normal zoom.
  - Represent node kind separately with a small icon or badge. For example, show “IDOR” with a “Confirmed” badge instead of a
    long identifier.

  - Wrap long labels to two lines; expose the complete label and original ID through inspection.
  - Use neutral text and borders for inactive nodes. Reserve:
      - Amber: current node and latest traversed edge.
      - Muted cyan: previously traversed edges.
      - Lime: confirmed findings and achieved outcomes.
      - Red: explicit failures or mismatches.

  - Keep an outcome node neutral until achieved; node kind alone must not imply failure or success.
  - Use icons and text alongside color. A current confirmed node retains its confirmation badge and gains an amber outline.
  - Define every referenced graph color token explicitly; avoid relying on currently missing graphite shades.
  - Use a quiet, solid graph background. Remove competing grid/noise decoration inside the diagram.

  ### Edge emphasis and animation

  - Keep untraversed edges thin and subdued.
  - Highlight traversal using consecutive directed pairs from akgPath. Adjacency to the current node alone does not establish
    traversal.

  - Distinguish chain edges with a dashed pattern; draw each semantic edge once.
  - Animate only the newly traversed edge briefly. Keep labels steady and honor reduced-motion preferences.
  - Reveal edge metadata—source, target, preconditions, and target agent—on selection instead of printing it across the canvas.

  ### Controls and inspection

  Provide a compact toolbar:

  - Full graph / Focus path
  - Fit
  - Center current
  - Zoom − / +
  - Expand
  - Legend

  Behavior:

  - Full graph initially fits the complete snapshot with padding.
  - Focus path shows the complete traversed path, current/selected nodes, and immediate neighboring choices. Preserve existing
    coordinates and show visible/total counts.

  - Filtering never changes the snapshot used for verification.
  - Fit on initial layout and explicit view changes. Once the user pans or zooms, preserve their viewport through event updates.
  - Selecting a node opens a closable details drawer showing its full ID, kind, surface, and runtime state.
  - Add a compact, numbered traversal strip beneath the graph, preserving repeated visits. Selecting a step centers its node.
  - Expanded view supports Escape and restores the previous viewport and keyboard focus when closed.
  - Keep node selection and inspection keyboard accessible. Graph editing, connection creation, and node dragging remain
    disabled.

  ## 3. Tooling

  - Add Vitest, React Testing Library, and jsdom. Make npm run test execute once.
  - Restore the missing handoff requirement: upgrade ESLint to version 9 and migrate to Next.js flat configuration.
  - Use next build --webpack with experimental.useTypeScriptCli: false, retaining build-time type checking.
  - Load graph/layout dependencies through the client graph boundary.
  - Document the new dashboard layout, controls, verification behavior, and validation commands.

  ## 4. Tests and Acceptance

  Retain all original parsing, reducer, verification, pending/success/failure, rerun, Strict Mode, snapshot-drift, and live-
  isolation tests.

  Add diagram coverage for:
  - No overlapping node rectangles or edges passing through unrelated node interiors.
  - Long labels, unfamiliar nodes, shared outcomes, cycles, and return edges.
  - Stable coordinates throughout replay.
  - Accurate traversal highlighting without highlighting unrelated neighboring edges.
  - Focus filtering preserving the complete traversal and verification snapshot.
  - Fit, zoom, resize, inspection, expanded view, keyboard controls, and reduced motion.

  Use browser checks at 1440×900, 1920×1080, 1024×768, and 390×844. Capture the initial overview, a cross-surface transition,
  final replay, and a mismatch. Review label readability, clipping, routing, and panel scrolling.

  Completion requires:

  - All 18 fixture events reduced exactly once.
  - The exact 10-node path ending at data_exfiltrated.
  - All nine expected transitions visibly highlighted.
  - Success appearing only after completed verification.
  - Passing tests, type checking, lint, production build, and staged/unstaged whitespace checks.
  - Direct API and browser validation.

  ## 5. Boundaries

  - This remains a browser simulation; Python traversal, DVWA, and provider execution are outside the handoff.
  - Layout, filtering, labels, and grouping must preserve the underlying graph’s identity and topology.
  - Extend the existing staged work. The dashboard layout change is intentional and replaces the earlier four-quadrant
    arrangement.