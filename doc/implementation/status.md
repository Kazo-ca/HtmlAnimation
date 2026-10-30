<!-- doc/implementation/status.md -->
# Batch 1 status and Timeline API requests

2026-10-30. Branch: `codex/designer-foundation`. Consumed documents:
HA-DESIGN-001/r1, HA-TL-001/r1. Original handoff content is preserved byte-for-byte.
This branch contains the first functional batch, not the entire product scope.
No Timeline repository was read for implementation or changed. No package published.

## Delivered

Three separately packed ESM/TS/CSS libraries, framework-free controls, French demo,
original-scene inspection, selection from scene/tree/adapter, Test mode, explicit
first-edit targets with multiple-match warning, common-value and divergent-origin
diagnostics, reversible property/object creation, reversible original ID/class
changes, original Full XPath deltas and net journal, preview cleanup and disposal.

HTML specificity resolution is implemented for the supported ID/class target syntax.
The exact case59 is displayed using pre-recorded adapter samples, with the two
original editable keys retained; no first key or temporal inference is added.
Equal-specificity conflicts remain blocked and visibly diagnosed pending explicit
resolution support. No selection-dependent animation priority is saved or inferred.

## Validation executed locally

| Check | Result |
| --- | --- |
| `npm ci --offline --ignore-scripts --cache .npm-cache --no-audit --no-fund` | Passed from lockfile and local cache; initial install fetched pinned packages. |
| `npm run lint` | Passed, zero warnings. Explicit `any` prohibited. |
| `npm run typecheck` | Passed, strict TS, no unchecked indexed access. |
| `npm run test:coverage` | 44 passed; 98.60% statements, 90.75% branches, 99.30% functions, 99.79% lines. |
| `npm run build` | Three independent package builds and declarations passed. |
| `npm run build:demo` | Production demo passed. |
| `npm run check:packages` | Three actual archives packed, installed offline into separate consumer, typechecked and bundled. No simulation leaked into archives. |
| `CI=1 npm run test:e2e` | 33 passed across Chromium, Firefox and WebKit. |
| axe WCAG 2 A/AA and 2.1 AA | No violation in tested initial scenario, all three browsers. |
| Rendered captures / overflow | 320x960, 768x960, 1024x960, 1440x960, all browsers. Reduced-motion setting included. |
| `npm audit --cache .npm-cache --json` | Online registry check: 0 vulnerabilities, performed by ECC security reviewer. |

Tests use shared **simulation fixtures only**. No TL-C01–TL-C16 result against a
real Timeline version is claimed. The group/ID samples test routing and HTML priorities,
not temporal evaluation. Easing, hold, transition splitting, playback and exports are
not implemented or proved by this fake. Initial browser sandbox launch failed before
execution; validation then passed with browser process access. Native WebKit button
click focus differs from Chromium/Firefox; the interaction test checks delivered
events rather than requiring a non-native focus behavior.

Meaningful RED/GREEN evidence: initially missing runtime; then bubbling tree selections,
triple equal-specificity conflicts, stale pending selection edits, wrong group value
under an ID override (including an absent group property), refused UI values, unrelated
live styles, throwing observers, unsafe attribute names and invalid identifiers.

ECC roles actually run: planner and TDD guide before implementation; general code,
TypeScript and security reviewers after implementation. General and TypeScript findings
were reproduced with regression tests and corrected, then the reviewers approved their
focused re-reviews with no open findings. Security review has no open finding.
CI YAML was reviewed, but hosted execution is a separate result visible on the PR.
No C# scope exists. Real Timeline, deferred capabilities and a production deployment
have not been reviewed or tested. UI design evidence is in `artifacts/evidence/`.

## Requests for the Timeline workstream

This list records needs, not changes to HA-TL-001. The local proposal is versioned as
HA-ADAPTER-001/r1 in `adapter-contract.md`. An agreed shared change needs a separate
revision and explicit synchronization; no API is silently assumed to exist.

| Need / gap | Required integration evidence |
| --- | --- |
| Exact runtime API mapping | Public methods/types and version or commit corresponding to each local boundary operation. |
| Original target state | How HTML base values are supplied and refreshed without DOM logic in the generic engine. |
| Independent property keys and evaluations | Non-numeric CSS values, per-object samples, frame notifications and declined mutations. |
| Shared atomic history | Public property/object commands plus reversible host ID/class effects, grouped multi-property gestures, rollback and post-commit notifications. |
| Recorded overlap policy | Represent exact case59 without editable first-key insertion and without generalizing to non-overlapping or generic targets; engine and export tests required. |
| Retargeting an existing object | Preserve stable ID, original keys and undo when selector changes; currently refused in Designer. |
| Selection and disclosure | Observe object/property/key selection and restore Timeline manual expansion independently of the DOM tree. |
| Capabilities / conflicts | Per-property edit/tween/export diagnostics, affected frame ranges, explicit persistent choices including solution A when it actually resolves the conflict. |
| Project/export | Original keys/transitions/easings, generic frame dictionaries, direct seeking fidelity and explicit JS/CSS refusal where needed. |

## Next batches and current limits

See `plan.md`: geometry/compound gestures; gradient tracks and persistent conflict
resolution; project save/load and faithful exports; real adapter and conformity.
The current selector support excludes escaped identifiers and arbitrary CSS syntax.
New attributes require explicit names; already animated targets cannot yet be renamed.
Base snapshots require Designer recreation after coordinated source stylesheet/DOM
changes. Unrelated live inline properties survive preview restoration. The source
HTML is host-owned and assumed trusted; this is not an untrusted-HTML sandbox.
