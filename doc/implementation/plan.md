<!-- doc/implementation/plan.md -->
# Production plan

Current references: HA-DESIGN-001/r1, HA-TL-001/r2; implementation authorized 2026-10-30.
The foundation plan originally recorded HA-TL-001/r1. Batch 2 status and exact support
limits are recorded in `geometry-batch.md`; the shared contract is unchanged by this batch.
The original four handoff documents remain unchanged. The ECC planner established
this scope before implementation; the TDD guide authored the initial integration tests.

1. **Foundation and usable inspection/editing slice (batch 1).** Three framework-free
   TS libraries, independent controls, typed adapter boundary, original scene inspection,
   selection, explicit first-edit targets, reversible property edits and ID/class changes,
   recorded-sample demo, package-consumer smoke and browser checks.
2. **Geometry and compound commands (batch 2).** Move, dimensions, rotation, scale and pivot,
   gestures/escape, CSS unit preservation, snapping/guides and one undo per gesture.
   Depends on an adapter transaction that can atomically accept multiple properties.
3. **Gradients and conflict resolution.** Stable stop identities, independent property
   lines, diagnostics and explicit persistent resolution commands. Until this exists,
   unresolved equal-specificity conflicts are rejected/suspended; no arbitrary winner.
   Batch 3a delivers the explicit-conflict UI/adapter/simulation slice described in
   `conflict-resolution.md`; independent gradient tracks remain the next sublot.
4. **Persistence and faithful outputs.** Versioned editable project schema, original keys
   and decisions, JSON/JS/CSS fidelity and explicit unsupported-output diagnostics.
5. **Real Timeline integration.** Receive exact API mapping and version/commit from the
   Timeline workstream; adapt public commands and run TL-C01–TL-C18 and browser suites
   against the same reference. Never replace this evidence with simulation tests.

Each batch includes undo tests, reused fixtures, a usable demo and a coherent reviewed PR.
No merge to main and no package publication without the user's explicit authorization.

## UI contract for batch 1

An authoring workbench, not a marketing page: structure first, host scene central,
property inspector alongside it. Calm paper/green surfaces, amber for simulation and
persistent-document feedback, monospace for selectors and frames, serif scene heading.
Local product references: specification sections 4/7/11/13 define the selection,
property and change-log hierarchy; the shared fixture is the inspectable subject.

Primary action: inspect an existing node, change a property, choose its target, then undo.
Viewports: 320x960, 768x960, 1024x960, 1440x960. Narrow layouts stack the workbench and
bound the scrolling inspector. Visible focus, keyboard tree navigation, labels,
contrast and reduced-motion settings are tested in rendered browsers.

States: initial inspection has no keys; no selection explains the next action; invalid
CSS or targets show a diagnostic and restore the accepted value; partial group compatibility
disables only divergent properties; successful changes expose undo; persistent changes
show original paths. No network loading or permission grant is part of this local demo.
