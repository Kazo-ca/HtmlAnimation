<!-- doc/implementation/css-property-editors.md -->
# CSS value editors — HA-CSS-EDIT-001/r1

The 2026-10-30 user request adds selectable CSS value suggestions and editors for
complex properties to the standalone panel. The ECC planner established this scope
against specification sections 7 and 9. The existing selection clarification and
shared Timeline contract remain unchanged.

## Plan

1. Generate a versioned catalogue from the primary MDN CSS data, including referenced
   grammar types and shorthand longhands. Keep runtime dependencies at zero and
   publish an inventory mapping every known property to its editor family.
2. Add a searchable keyboard/pointer combobox to the canonical free-text input.
   Opening and navigating suggestions never writes a value. Whole-value suggestions
   must be accepted by the current browser; the catalogue itself is not a validator.
3. Open complex editors lazily: numbers/units, alpha colors, box sides, borders,
   elliptical radii, shadow layers, transforms/filters, fonts, backgrounds/gradients
   and ordered lists. Other grammars receive a structured component/function editor.
4. Keep edits in a local draft. Apply emits one old/new value intent; cancel, Escape,
   host refresh, selection/frame change and disposal discard it. The host owns
   validation, accepted preview and one undoable command.
5. Expose supported catalogue properties and missing shorthands in Designer. Compare
   their original longhands when deciding group compatibility. Reuse permanent CSS
   fixtures for tests and the local demonstration.

## Data and boundaries

The source is `mdn-data@2.37.2`, CC0-1.0, pinned as a development-only dependency.
No catalogue request is made at runtime. Sources:
[MDN CSS data](https://github.com/mdn/data/tree/main/css),
[licence](https://github.com/mdn/data/blob/main/LICENSE).
The reference logical border style follows its resolved `<line-style>` grammar:
[border-block-start-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/border-block-start-style).

Existing CSS expressions are not silently normalized on opening/canceling an editor.
Nested functions, quoted strings, commas and layers require balanced parsing. A
non-decomposable expression remains available in the source field; replacement uses
an explicit user action. Unknown/custom properties remain editable.

All accepted property writes use the existing recorded Timeline simulation. CSS
gradient editing does not complete temporal stop identities/tracks, interpolation,
hold, MotionTween splitting, faithful exports or the real Timeline adapter. Those
responsibilities and conformance checks remain separate. Original-document attribute
changes stay distinct from temporary CSS preview.

## Evidence

Initial panel tests executed before implementation: 22 runtime UI failures for the
missing combobox/assistants. Catalogue and model tests additionally record missing
module import RED, with zero runtime cases executed at that stage. Preserve these
distinctions in the PR. Final counts, catalogue coverage, package consumer, browser
checks, screenshots and ECC general/TypeScript/security review results belong in the
delivery record and PR body.

The first full validation exposed excessive repeated style reads and eager value
validation during row construction. Refresh now reads one computed style per selected
element and validates suggested whole values lazily when opening the list. The focused
profile measured approximately 1.1 seconds down to 130 ms for 555 rows; no timeout
threshold was raised to hide the regression.

General and TypeScript review additionally reproduced seven cases covering loss of a
named background color, oblique font angles, gradient interpolation preambles, empty
alpha and the three individual transform longhands. Their regressions were RED before
the targeted corrections, then all 55 model/assistant tests passed. Unknown background
syntax falls back to structure; it is never silently discarded by another field edit.
