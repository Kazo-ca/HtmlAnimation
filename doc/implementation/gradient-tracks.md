<!-- doc/implementation/gradient-tracks.md -->
# Batch 3b — independent gradient tracks

Reference HA-DESIGN-GRADIENT-001/r1. Date: 2026-10-31.
Branch `codex/gradient-tracks`, based on the unmerged conflict-resolution branch.
Consumes HA-DESIGN-001/r1 and HA-TL-001/r2 unchanged.

## Authorized scope and decisions

The ECC planner established this slice: host-supplied initial structure; reusable
controlled gradient editor; synchronized spatial handles; independently written
type, geometry, color, opacity, position and presence; stable point identities;
one shared undo for a gesture or structural change; reusable fixtures and demo.
The original arbitrary-CSS assistant remains available outside structured targets.

Benoit's choices relayed by coordination are explicit: install the genuine packages
locally for verification, without publication; render crossed points ordered by
their evaluated positions while preserving identities. Equal-position points retain
their structural order. Rendering never renumbers or mutates the stored points.

Initial structure is supplied by the host. A removed point retains its definition
and other tracks; only presence changes. A new point has absent initial presence
and explicit current-frame values, with no previous-frame keys or invented fade.
Structure/bindings and writes must commit and undo atomically through the adapter.

## Plan and evidence contract

1. Implement the autonomous CSS control/model and spatial-only handles.
2. Add optional local HA-ADAPTER-001/r4 capability and Designer coordination.
3. Exercise explicit recorded simulations, gestures, identity, history and events.
4. Install a coherent pinned real Timeline archive set; exercise supported real
   component edits and record unsupported atomic operations without emulation.
5. Run lint/typecheck, coverage, package/demo/consumer builds, CI=1 browser checks,
   four viewport captures and ECC general/TypeScript/security reviews; prepare PR.

Use the existing paper/green authoring workbench. Stop selection and its color,
opacity and position precede geometric detail. The gradient bar and scene handles
reflect the same selected ID. Viewports: 320x960, 768x960, 1024x960, 1440x960.
Keyboard selection, Escape, pointer cancellation, focus, reduced motion and overflow
must be checked in rendered browsers. Empty: no host definition; error: refused or
stale edit; partial: unavailable handles/group property with fields still usable;
success: accepted component edit and shared undo. No network-loading or permission
state is introduced by the reusable control.

## Current validation record

- RED `3b9c07a`: two loaded Designer tests fail on missing gradient APIs.
- Before the credit interruption: strict typecheck and 18 Designer tests passed
  against the simulation. Further validation is ongoing and will be recorded only
  when executed.
- Reusable control worker: 35 focused model/control tests passed; spatial worker:
  41 math/handle tests passed. Parent integration/browser validation is separate.
- ECC general, TypeScript and security final reviews approved the implemented scope.
  General findings reproduced and fixed: stale marker feedback, unsupported background
  attachment, observer-induced receipt loss, unexpected nested backend writes and
  public metadata source leakage. TypeScript findings reproduced and fixed: duplicate
  component addresses, continuous conic winding and empty fault messages.
- TDD fault injection: 18 RED cases, then 24 GREEN cases including later coverage
  reinforcements; two empty-message regressions separately RED then GREEN. Fault tests
  are simulations, not an HA8 conformance result. General/TypeScript reviewers also
  ran the 18 genuine HA7 tests. Security's final delta pass was static; its interrupted
  targeted run is not claimed. Registry audit was inaccessible, so no zero-vulnerability
  claim is made.
- Three package builds, both demo entries and an offline packed-consumer build passed.
  Final clean installation/full coverage/browser results are still being collected.
  The current full 240-case browser run has timeouts under concurrent workstream load;
  no complete-green result is claimed until an isolated complete run passes.

## Real integration boundary

The initial HA6 and active HA7 archives are pinned by commit and SHA-256, not their
shared 1.0.0 labels. See `timeline-real-matrix.md`. HA7's crossing correction is now
installed from its immutable functional reference. Genuine Designer journeys are
being checked separately from the simulations.

HA6/HA7 lack an atomic public transaction for HTML context + keys + host effects.
The real adapter must refuse structural addition until that extension exists.
Pre-registering an invisible point can test presence, but is not structural addition.
No second history, document replacement or side effect hidden inside a pure command
may disguise the gap. Existing r3 geometry uses added transforms; HA4 uses decomposed
components. A name match is not sufficient to prove a spatial mapping.

No Timeline repository change, deployment, public publication, tag or merge is part
of this delivery. The incoming integration documents remain untouched.
