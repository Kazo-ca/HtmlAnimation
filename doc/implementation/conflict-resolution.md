<!-- doc/implementation/conflict-resolution.md -->
# Batch 3a — explicit conflict resolution

Reference: HA-DESIGN-CONFLICT-001/r1. Date: 2026-10-30.
Consumes HA-DESIGN-001/r1 and HA-TL-001/r2 without changing either document.
Branch: `codex/conflict-resolution`, based on `codex/css-property-editors`.

## Scope and plan

The ECC planner selected the conflict-resolution portion of production-plan step 3.
Independent gradient tracks remain batch 3b. The incoming HA3/HA4 API notes and
HTML-context schema are read-only coordination inputs; no executable Timeline
reference is available or claimed by this batch.

1. Add an optional, versioned local adapter conflict capability. It supplies
   authoritative diagnostic periods, choices, saved decisions and atomic commands.
2. Present diagnostics and an explicit confirmation in the Designer. Route only
   already evaluated values on the affected overlap. Keep older adapters conservative.
3. Add shared prerecorded simulation fixtures and an interactive conflict workshop.
4. Validate undo, events, stale drafts, case59, browsers and package consumers;
   run ECC general, TypeScript and security reviews and prepare a stacked draft PR.

No interpolation, hold, frame scanning, key management or tween splitting moves
into the Designer. A choice that creates a starting key is available only when
the adapter advertises that exact, resolving action, including its announced writes.
One adapter command must undo both the decision and its writes.

## User journeys and UI contract

The author inspects the affected property, objects, elements and explicit interval,
opens a choice, reads its consequences and confirms or cancels. A saved choice is
independent of selection and can be undone through the shared history. A stale
signature suspends unsafe routing and requires a new choice. The group/ID reference
case remains automatic with no dialogue or additional key.

Use the existing paper/green authoring workbench and amber diagnostic treatment.
The affected property and interval precede target details; a modal confirmation
contains the choice, consequence and any explicitly announced keys. Test 320x960,
768x960, 1024x960 and 1440x960, wrapping long selectors and preserving keyboard focus.
Empty: no issues. Partial: suspend only unresolved overlap/property. Error: show
refusal/stale diagnostic with a fresh choice. Success: saved decision and shared undo.
Loading/permission states do not apply to this synchronous local simulation.

## Validation record

Pending implementation. Only completed commands and reviews will be recorded here.
