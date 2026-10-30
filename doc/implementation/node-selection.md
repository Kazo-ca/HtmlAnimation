<!-- doc/implementation/node-selection.md -->
# DOM node selection clarification — HA-DESIGN-SEL-001/r1

The user's 2026-10-30 clarification supersedes the fallback in section 4 of
HA-DESIGN-001/r1 that associated a clicked node with its sole matching animation
object. A class object can match many nodes: clicking one node must never expand
the inspected selection to that class implicitly. The original handoff and shared
Timeline contract are preserved unchanged.

## Plan and behavior

1. Keep node selection exact and separate from explicit animation targeting.
   Inspect the effective preview for that node; do not create an object, key or ID.
   First edits without an individual target keep the existing explicit target picker.
2. Display the actual DOM hierarchy. Tag/ID selects the node; each separate class
   button selects all members of that literal class within the inspected root.
   The reusable tree remains independent of Timeline.
3. Remove the reference demo's automatic class selection. Preserve the approved
   group/ID sample values and explicit group/object actions.

The tree selection callback keeps its element-array argument. Only an explicit
class action adds optional `{ kind: 'class', className }` context; ordinary node
callbacks still receive exactly one argument. The Designer uses that context to
choose a class target explicitly. Literal class names outside its supported target
syntax remain inspectable without silently creating an unsupported animation target.

## Validation scope

Use ECC planner and TDD guide, then general, TypeScript and security reviews.
Record RED/GREEN checkpoints, meaningful individual-edit undo tests, unchanged
source markup and event/history checks. Browser journeys cover initial inspection,
node → class → node, keyboard class actions, first ID edit and undo, accessibility
and responsive layout. Counts and hosted CI results belong in the PR body.

All Timeline behavior is tested on the existing recorded simulation. No real
Timeline integration, temporal engine change, merge or package publication is part
of this correction.
