<!-- doc/implementation/adapter-contract.md -->
# HA-ADAPTER-001 — local consumer boundary, revision 5

Date: 2026-10-31. Consumes HA-TL-001/r2 and HA-DESIGN-001/r1 unchanged.
Status: **local proposal; simulations plus an in-progress private HA8 bridge**. This document
does not amend a shared Timeline guarantee or claim a published Timeline signature.
Changes to this boundary require a revision and migration notes. Changes to the shared
contract must separately follow the revision/copy process in `doc/integration/README.md`.

The host gives `HtmlDesigner` its original Timeline instance and an adapter factory.
Types live in `packages/designer/src/timeline-adapter.ts`. The revision 1 document
is archived as `adapter-contract-r1.md`; revisions 2 and 3 are in
`adapter-contract-r2.md`, `adapter-contract-r3.md` and `adapter-contract-r4.md`.
Existing r1/r2 adapters remain accepted;
the declared shared revision is a consumed document reference, not a conformity claim.

Revision 2 added atomic multi-property edits, explicit equal-value key writes for
consented source conversions, spatial channels and preview-only gesture sessions.
It does not add temporal evaluation, a second history or a real Timeline mapping.

| Boundary | Required behavior |
| --- | --- |
| `kind`, `contractRevision` | Declare `simulation`/`real` and consumed shared revision (r1 or r2). |
| `getState()` | Read frame 1..N, duration, stable object IDs/selectors, selected object, evaluated values, history availability. No mutation. Values describe each object's own properties before HTML specificity resolution. |
| `execute(label, writes, effect?)` | One atomic public command; each write carries object ID, selector, property, value, frame. A new target object and its first key are one command. Optional HTML effect participates in the same history. |
| result | `changed`, `unchanged`, `rejected` or `faulted`. The latter two retain a French user-facing reason. Rejection guarantees no effects; fault means compensation is uncertain and editing/history must stop. |
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

Without the optional r3 conflict capability, equal-specificity, different-value winners
still produce a current-frame diagnostic and no preview for that overlap/property.
A more specific object still wins. No full-period analysis is invented for older adapters.

## Explicit conflict capability (r3)

`TimelineAdapter.conflicts` is optional. Its local types live in `conflict-types.ts`.
`read()` supplies a detached `ConflictSnapshot`: an opaque revision, authoritative
diagnostics and stored resolutions. A diagnostic includes ID/signature, code, property,
object IDs/selectors, affected selectors, interval with an explicit exclusive/inclusive
end, blocking state, explanation and choices. Each choice announces consequences,
the winning object and **all** initial-key writes it would create.

The Designer does not scan frames to create these intervals. It only routes the chosen
object's already evaluated contribution among tied winners on the supplied overlap
and interval. Other properties/elements and higher-specificity objects remain intact.
Missing, stale or contradictory decisions suspend ambiguous preview.

`resolve({id, signature, choiceId, revision}, isCurrent)` must validate the ticket,
choice, capabilities and guard before and after host validation callbacks. It commits
the decision and advertised key writes as **one** command in the existing adapter
history, or rejects without changes. No-op confirmation adds no history. Undo/redo
must restore all effects atomically and recheck current capabilities. Existing
`onChange` supplies synchronous post-commit notifications; there is no second history.

The Designer captures frame, selection/lifecycle epoch, adapter revision and target
membership/ID/class/inline context. Context changes close the draft; the adapter's
guard prevents reentrant host callbacks from committing an obsolete confirmation.
External stylesheet/source changes still require the host coordination described below.

`getConflictState()` returns a detached snapshot; `resolveConflict(id, choiceId)` is
also available to host UI. Selection may propose a choice but never applies it.
`resolutionchange` carries complete saved decisions and execute/undo/redo direction,
only when that project context changes after commit. It does not report an original
HTML change and never substitutes for `documentchange`/Full XPath tracking.

The exact case59 remains automatic. Solution A is shown only when explicitly offered
by the adapter and announces its starting key. The simulation includes a choice that
sets priority **and** creates the initial key; a key alone does not break a priority tie.

This is not the HA4 wire schema. A future real bridge must map `winnerObjectId` to
HA4's stable layer identity, map each opaque `choiceId` to an explicit winner/prefix
policy, preserve HA4 context signatures, supply authoritative diagnostics and integrate
host context effects into shared history through public APIs. HA4 documentation alone
does not verify that mapping. No real TL-C14 conformity is claimed.

## Independent structured gradients (r4)

`TimelineAdapter.gradients` is optional; its consumer types live in `gradient-types.ts`.
`read(objectId)` returns a detached snapshot with original `definitions`, evaluated
`gradients`, explicit component `tracks`, opaque revision and capability diagnostics.
`canAddStop:false` independently disables structural creation while supported component
fields remain usable. The host supplies the initial structure; no arbitrary CSS parser
or temporal evaluator is added to the Designer.

Each stable gradient/point ID addresses type, angle, center, radii, opaque normalized
sRGB color, independent opacity, position or presence. A removed point remains in the
structure and retains its other channels. Crossed points render sorted by evaluated
position, ties by structural order; the saved structure and IDs never change order.

`compose(request)` is pure static composition for a gesture draft. `execute(request,
isCurrent)` validates revision, frame, selection/lifecycle and target membership before
and after callbacks, then commits context/bindings and keys in one shared history entry.
Its accepted-change receipt is detached and captured **before** backend notifications;
the Designer must not infer accepted values by rereading after a callback seeks or undoes.
Duplicate component addresses are refused. A new point has initial presence false and
four explicit current-frame writes; no earlier key or fade is invented.

Public methods: `getGradientState`, `editGradient`, `addGradientStop`,
`removeGradientStop`, `selectGradient`, `beginGradientGesture`, `previewGradient`,
`commitGradientGesture`, `cancelGradientGesture`. Drafts create no key, history entry
or edit event; context changes cancel them. Raw `background`/`background-image` edits
are refused when structured channels own that background, pending explicit conflict
resolution. Single-element handles share selected point identity with the panel;
unsupported origin/crop/transform/attachment contexts keep fields and explain the limit.

The r4 checkpoint's private bridge used pinned HA7 packages and refused structural/host
effects. The current bridge is moving to the verified public HA8 inspection stage and
atomic transaction surface. Its consumer verification, supported subset and remaining
render-notification gap are explicit in `ha8-transactions.md` and
`timeline-real-matrix.md`. Installing the provider's implementation does not certify
the adapter or complete the product's remaining mappings.

## Persistent compensation faults (r4)

`MutationResult` and `GradientMutationResult` preserve `faulted` and its message.
`TimelineState.fault` optionally exposes a host fault. An unexpected exception from an
executing command/history operation is conservatively treated as uncertain, rather than
as an ordinary no-effects rejection. `getFault()` returns the first latched diagnostic.
`fault` is emitted once; editing, drafts and undo/redo remain disabled for this instance.
Selection and frame inspection do not clear it. Recreate the Designer with a coherently
recovered host; omitting `fault` from a later snapshot does not silently rearm editing.

Success notifications are deferred until the command returns an accepted result.
An uncertain ID/class effect clears pending success events without claiming the source
was restored. The visible journal is marked uncertain. This local fault path does not
invent a public HA8 signature or certify a decorated stage participant.

## Prepared host participation (r5)

`ReversibleEffect.prepare(direction)` optionally returns `PreparedEffect` with
`changed`, `apply()` and `rollback()`. Preparation is pure and captures the exact current
participant state. Rollback compensates even a partially applied action without
executing a new user intent. The existing `redo/undo` remain for older adapters;
the real bridge explicitly refuses effects without prepared support and maps the
prepared shape to the installed public `IHostHistoryEffect`.

The Designer's ID/class participant captures raw attribute presence/value, net journal,
pending document notification, deferred notifications, target and legacy first-execution
flag. It restores all captured values on compensation. Preparation revalidates source
availability, expected raw value and ID uniqueness; it does not overwrite an external
source change. Undo/redo use the actual direction, original XPath and one shared backend
history. Failed preparation preserves the earlier redo stack. No second history or
`load(document)` replacement is introduced.

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
- `resolutionchange`: complete detached saved resolutions and history direction.
  No notification for open/cancel, selection, frame changes, no-op or refusal.
- `gradientchange`: detached original definitions and history direction when structure
  changes. Component key edits are `propertychange`, not original DOM changes.
- `fault`: the first persistent uncertain-state diagnostic; no success is implied.

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

`fixtures/conflict-timeline.ts` supplies fixed contributions at frames
1/20/49/50/75/100 and an explicit diagnostic schedule. Decisions and advertised writes
use the same fake command history. It includes a reversible scripted contribution
change to demonstrate stale signatures, without deriving any temporal behavior.
The starting-key variant has separate authored pending/accepted prefix samples.
Before confirmation, the non-overlapping member retains its base before key 50;
only the explicitly accepted A outcome supplies the recorded prefix value.
Unrelated properties and subsequent exact-frame edits remain independent.
