<!-- doc/implementation/adapter-contract.md -->
# HA-ADAPTER-001 — local consumer boundary, revision 2

Date: 2026-10-30. Consumes HA-TL-001/r2 and HA-DESIGN-001/r1 unchanged.
Status: **proposal implemented and tested with a simulation only**. This document
does not amend a shared Timeline guarantee or claim a published Timeline signature.
Changes to this boundary require a revision and migration notes. Changes to the shared
contract must separately follow the revision/copy process in `doc/integration/README.md`.

The host gives `HtmlDesigner` its original Timeline instance and an adapter factory.
Types live in `packages/designer/src/timeline-adapter.ts`. The revision 1 document
is archived as `adapter-contract-r1.md`. Existing r1 adapters remain accepted;
the declared shared revision is a consumed document reference, not a conformity claim.

Revision 2 adds atomic multi-property edits, explicit equal-value key writes for
consented source conversions, spatial channels and preview-only gesture sessions.
It does not add temporal evaluation, a second history or a real Timeline mapping.

| Boundary | Required behavior |
| --- | --- |
| `kind`, `contractRevision` | Declare `simulation`/`real` and consumed shared revision (r1 or r2). |
| `getState()` | Read frame 1..N, duration, stable object IDs/selectors, selected object, evaluated values, history availability. No mutation. Values describe each object's own properties before HTML specificity resolution. |
| `execute(label, writes, effect?)` | One atomic public command; each write carries object ID, selector, property, value, frame. A new target object and its first key are one command. Optional HTML effect participates in the same history. |
| result | `changed`, `unchanged`, or `rejected` plus French user-facing reason. A rejected transaction applies neither writes nor HTML effects. |
| `effect.redo/undo` | The adapter applies the effect and temporal changes atomically and rolls back both if a command fails. It retains the effect as part of history; never silently replaces the whole temporal document to emulate editing. |
| `undo/redo()` | Restore keys, target creation, effects and evaluated preview coherently. |
| `selectObject()` | Selection only; no animation mutation. |
| `onChange()` | Synchronous post-commit notification: frame, selection, execute, undo or redo. The returned function unsubscribes. No half-committed observations. |

The Designer supplies HTML target matching, class/ID specificity and group compatibility
from values captured outside preview. It applies only values received from the adapter;
it never derives hold values, interpolates, splits tweens or inserts implied keys.
Supported r1 target syntax: unescaped IDs and combinations of classes (Unicode letters,
digits after the initial identifier character, underscores and hyphens). Broader selectors
and escaped identifiers require an explicit extension. Arbitrary names are never generated.

## Spatial channels and compound gestures (r2)

`editProperties([{property,newValue,capture?}], label?)` validates the complete set,
then calls `execute` once. There is one accepted `propertychange` per written property
and one undo entry. A rejected property or adapter command leaves the entire set intact.
`capture:true` explicitly writes a key even when the supplied value equals the displayed
value; it is used when the user agrees to freeze an unknown source matrix. This flag
does not sample a curve or implement Timeline's capture/splitting operation.

| Property | Representation | HTML projection |
| --- | --- | --- |
| `translateX`, `translateY` | CSS length, default `0px` | Additional translation before the other transforms. |
| `rotation` | CSS angle, default `0deg` | Additional 2D rotation; distinct from the native CSS `rotate` property. |
| `scaleX`, `scaleY` | Positive number strings, default `1` | Multipliers over the retained source transform. |
| `pivotX`, `pivotY` | Length or percentage | `transform-origin` coordinates; a pivot move compensates translation atomically. |
| `width`, `height` | Normal CSS declarations | Dimensions, independent of scale channels. |

The projection is `translate · rotate · scale · sourceTransform`, with CSS matrix
order preserved. These are adjustments over the original transform, not a decomposition
or rewrite of its functions. The raw source declaration is retained when its winning
syntax can be recovered conservatively from inline CSS or an unambiguous applicable
stylesheet. Native `rotate` and other CSS declarations still use free-text CSS editing.

`beginGeometryGesture(tool)`, `updateGeometryGesture(delta, options)`,
`commitGeometryGesture()` and `cancelGeometryGesture()` operate on one selected HTML
target. Preview writes no key and emits no user edit. The commit supplies independent
property writes in one adapter command. Escape, selection/frame changes, Test mode,
loss of pointer capture and disposal cancel without changing the redo stack.

Delta is absolute from the start of the gesture: pixels for move/dimensions/pivot,
degrees in `x` for rotation, local pixel increments for scale. Unit conversion uses
the real containing block, fractional border-box measurements, fonts and viewport.
Source expressions, ambiguous/inaccessible/nested cascades and indefinite percentage
heights require explicit consent to every replacement. An unknown source transform
is then captured as an announced matrix key in the same undoable command.

Only measurable single-target 2D contexts are handled by the gestures. Ancestor
transforms, individual CSS transforms, perspective/zoom, singular mappings and
unresolved origins are rejected with a diagnostic. Dimensions handles also reject
variable/percentage base transforms whose derivative is not modeled; free-text CSS
dimension editing remains available and preserves the source expression. Multiple
targets remain editable through compound property commands with compatibility checks.
No unsupported mapping is approximated silently.

The HA2 document describes `editor.propertyTimelines.beginTransaction()` and typed
property commands. Their future adapter mapping must wrap all writes, cancel on refusal,
supply original `initialValue` and preserve post-commit observations. Object creation,
reversible HTML effects and spatial CSS-value typing still need an agreed real API
mapping and exact Timeline reference. No such bridge is included in this batch.

Equal-specificity, different-value winners produce a diagnostic and no preview for that
property. A more specific object still wins. Diagnostics include selectors, property and
current frame; affected-range analysis and persistent user conflict resolution are future
work. This batch cannot apply solution A or claim TL-C14 compliance.

## Designer observations and document changes

- `selectionchange`: current elements and optional associated object ID. No edits.
- `propertychange`: accepted user edit with `property`, `oldValue`, `newValue`, `frame`.
  A frame update or history restoration does not repeat a user intent.
- `documentchange`: command delta `changes` and `direction` (`execute`, `undo`, `redo`).
  Each delta retains original `fullXPath`, `attribute`, `oldValue` and `newValue`.
  For undo the host reapplies `oldValue`; execute/redo uses `newValue`. Notifications
  occur after adapter commit. `getDocumentChanges()` separately returns net changes
  against the original attributes; undo to the original removes that journal entry.
- `diagnostic`: a French explanation. Observer exceptions are contained and reported
  through this event so they cannot interrupt a committed command or its undo.

The host owns source persistence and coordinates external DOM/CSS mutations. Preview
restoration touches only driven properties and preserves unrelated live inline styles.
Original inline spelling/priority/attribute absence is restored when the preview remains
untouched. An external write to a driven property needs explicit host coordination.
Current base snapshots are captured at construction; replace/dispose and recreate the
Designer after intentional external source/style-sheet changes. Structural editing and
automatic source reattachment are outside batch 1. Renaming an already animated target is
refused until public Timeline retargeting can preserve its keys and undo state.

## Simulation limits

`fixtures/recorded-timeline.ts` is shared by tests and demo and is never packaged.
It returns stored values for frames 1/20/49/50/75/100 of the exact group/ID case, with
editable keys retained at 1 for the group and 50 for the ID. It does not infer the ID
value before 50 or synthesize a key: the fixture simply contains those recorded samples.
Edits change only their exact frame in this fake. Other frames and hold/interpolation
semantics are not implemented. Tests prove consumer routing, targeting and UI behavior;
they do not establish TL-C04/TL-C05/TL-C06 temporal engine conformity.
