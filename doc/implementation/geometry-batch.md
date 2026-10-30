<!-- doc/implementation/geometry-batch.md -->
# Batch 2 — spatial gestures and compound commands

2026-10-30. Branch `codex/designer-geometry`, based on `codex/designer-foundation`.
The first PR remains unmerged; this batch is intended as a stacked PR targeting its
branch. Nothing is merged to main or published. The user authorized continuing after
the local demo restart. The demo now runs as a hidden background process on loopback
port43127, separate from Playwright's reserved43128.

## Delivered behavior

- `editProperties` validates the entire set before one adapter command, with one event
  per written property and one shared undo action.
- Single-element Move, Dimensions, Rotation, Scale and Pivot tools, pointer capture,
  keyboard precision, Shift increments, Escape/pointer cancellation and redo preservation.
- Preview-only gestures: no objects, keys, user property events or original-document
  change events until commit. Selection/frame/Test-mode changes and disposal cancel.
- Host scroll positions survive the temporary base-style reads during rendering;
  restoration is instant even with CSS smooth scrolling, then handles are recalculated.
  Real scrollable-container regressions measure the same pointer event and verify
  pointer alignment, commit and undo in all three browsers.
- Independent width/height and scaleX/scaleY writes. `rotation` is an additional spatial
  channel; the native CSS `rotate` property keeps its free-text semantics.
- Nine pivot presets and a movable pivot with translation compensation, including
  fractional boxes, rotations, non-uniform scales and supported CSS units.
- Optional parent-aligned grid, guides from parent/siblings, snapping and Alt bypass.
- Source CSS syntax retained from inline declarations or a conservatively recoverable
  stylesheet. Ambiguous/inaccessible/conditional/nested cascades require explicit
  conversion. All replacements are announced together before any preview change.
- ID/class edits invalidate stale targeting; a missing selector cannot produce orphan
  keys or a false success event. Original Full XPath tracking is unchanged.

## Source references and boundary revision

The product specification remains HA-DESIGN-001/r1. The current committed Timeline
contract is already HA-TL-001/r2; this batch does not modify it. The received local
`timeline-ha1-api.md` and `timeline-ha2-api.md` are preserved unchanged and included
as coordination references. Their reported Timeline checks are not tests run here.

The local consumer proposal is now HA-ADAPTER-001/r2, with r1 archived separately.
It accepts adapters declaring either consumed shared revision. The fixture declares r2
but still simulates only recorded samples and exact-frame writes. The adapter's
`execute(writes[])` supplies the history boundary; no interpolation, hold, easing,
transition splitting or secondary temporal history was implemented in the Designer.

HA2's typed values, required initialValue, public transaction facade and command result
names still need an exact real adapter mapping. HTML object creation, reversible host
effects and the spatial channel schema also need agreement with the real integration.
No real Timeline version or npm package was installed or validated; no Timeline repository
was changed. Full TL-C01–TL-C18 conformity remains unverified.

## Support limits

Gesture handles require a measurable, individually selected 2D HTML target. Ancestor
transforms, individual CSS transforms, perspective/zoom, singular pointer mappings and
unresolved origins are refused with a diagnostic. Relative/expression base transforms
whose width/height derivative is not modeled disable Dimensions handles; CSS dimension
editing remains available and preserves the source expression. Multi-target property
editing remains available with origin-compatibility and specificity checks.

Spatial channels are adjustments over the retained CSS transform, rather than its
decomposition. Unknown source transformations are copied to an explicit matrix key only
after consent, in the same undoable action as the gesture. Normal-flow percentage height
with an indefinite containing block requires a pixel conversion. Existing source markup
and stylesheets are never rewritten by these operations.

The host still coordinates external source DOM/stylesheet changes and recreates the
Designer after an intentional rebase. Gradient controls, persistent conflict choices,
editable project save/reload, faithful outputs and real Timeline integration are subsequent
batches. Equal-specificity ambiguities continue to be diagnosed and blocked.

## Reusable demonstration and evidence

Open `http://127.0.0.1:43127/`, choose **Atelier géométrique**, then an inspector tool.
Use **Expression CSS** for the conversion flow. The **Scénario géométrique** selector
loads containing-block, relative stylesheet transform, native CSS nesting, initial and
variable-to-none scenarios. The group/ID reference scenario remains available at startup.

Fixtures are shared from `fixtures/geometry-scene.ts`; browser scenarios are permanent
under `tests/e2e/geometry*.spec.ts`. Geometry uses only spatial DOM/matrix calculations.
The recorded Timeline fake remains outside all distributable packages.

Validation commands: lint, strict typecheck, Vitest coverage, three package builds,
production demo build, actual packed-archive offline consumer, and full Playwright with
CI=1 in Chromium/Firefox/WebKit. The dependency lockfile is unchanged and no dependency
was added. The packed consumer also enables noUncheckedSideEffectImports, which caught
and then verified the fix for nested LESS imports leaking into declarations.

Meaningful RED/GREEN evidence includes initial missing APIs, detached target commit,
pivot em conversion, fractional box measurement, rotated Dimensions pointer mapping,
second scale gestures, scrollable host preview and declaration packaging. Other reviewer cases were reproduced
in real Chromium before correction and preserved as tests/demos; no RED run is claimed
when a regression test was written only after its fix.

ECC planner and TDD guide were used before implementation; general, TypeScript and
security reviewers ran and re-reviewed their functional findings. Review scope excludes
real Timeline and deferred features. Final check counts and hosted CI status are recorded
in the PR body rather than attributed to the incoming HA1/HA2 documents.
