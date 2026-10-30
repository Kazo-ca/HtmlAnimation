<!-- doc/implementation/adapter-contract.md -->
# HA-ADAPTER-001 — local consumer boundary, revision 1

Date: 2026-10-30. Consumes HA-TL-001/r1 and HA-DESIGN-001/r1 unchanged.
Status: **proposal implemented and tested with a simulation only**. This document
does not amend a shared Timeline guarantee or claim a published Timeline signature.
Changes to this boundary require a revision and migration notes. Changes to the shared
contract must separately follow the revision/copy process in `doc/integration/README.md`.

The host gives `HtmlDesigner` its original Timeline instance and an adapter factory.
Types live in `packages/designer/src/timeline-adapter.ts`.

| Boundary | Required behavior |
| --- | --- |
| `kind`, `contractRevision` | Declare `simulation`/`real` and consumed shared revision. |
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
