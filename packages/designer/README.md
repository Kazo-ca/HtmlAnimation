<!-- packages/designer/README.md -->
# @kazo-ca/html-designer

Coordinates a host-owned HTML scene, `CssPropertiesPanel`, `HierarchicalDomTree`,
and a host Timeline instance through an injected, typed adapter. French UI,
ESM and TypeScript declarations. Import all three packages' `style.css` exports.

```ts
const designer = new HtmlDesigner({
  scene, propertiesContainer, treeContainer,
  timeline: hostTimeline,
  adapter: instance => createApplicationAdapter(instance),
});
designer.selectTarget('.button');
designer.editProperty('opacity', '0.5');
designer.undo();
designer.redo();
designer.dispose();
```

The factory is supplied by the application; this package does not implement a real
JsAnimationTimeline bridge. `TimelineAdapter` describes local consumer needs;
it does not claim existing Timeline package signatures. The test/demo simulation
is excluded from this package, as is the repository's limited private genuine HA7
bridge. See the repository's HA-ADAPTER-001/r4 document and real verification matrix.

Selection and frame refresh never create a key. First UI edits require an explicit
ID/class target. Persistent ID/class edits have Full XPath deltas (`documentchange`)
and a net journal (`getDocumentChanges()`); temporary preview styles are separate.
The Timeline adapter owns the combined command history and remains host-owned.

Geometry tools support one measurable 2D target, preserve known units/source transforms,
ask before unknown pixel conversions, and commit compound gestures as one undoable command.
Spatial channels add to the original transform; native CSS `rotate` stays separate from
the virtual `rotation` adjustment. Native pointer cancellation and Escape preserve redo.

Optional `adapter.conflicts` supplies authoritative periods, explicit choices and
atomic resolution commands. The Designer displays a confirmation and routes already
evaluated values using valid saved decisions. `getConflictState()` returns detached
data; `resolveConflict(id, choiceId)` applies one advertised choice. Observe
`resolutionchange` to persist the complete resolution context separately from original
HTML attributes. Choices and any announced starting key use the shared undo stack.
Older adapters retain conservative current-frame suspension and edit refusal.

Optional `adapter.gradients` supplies detached original/evaluated definitions and
independent component tracks. `editGradient`, `addGradientStop`, `removeGradientStop`
and the gradient gesture methods use its guarded atomic command. The reusable CSS
control and spatial handles share selected IDs; temporary previews are separate from
structure changes (`gradientchange`) and original DOM edits. No temporal engine lives
in this package. Missing atomic structural support is visibly disabled independently.

`faulted` command results, execution exceptions with uncertain compensation and
`TimelineState.fault` latch a visible fault. Observe `fault` or inspect `getFault()`.
Editing/history remain blocked until the Designer is recreated with a coherently
recovered host; selection or seeking does not reenable them.

These batches do not provide output export, retargeting of already animated
objects or complete real Timeline conformity. Public attribute edits allow
only ID/class and currently reject IDs requiring CSS escaping. Coordinate external
source changes by disposing/recreating the Designer. GPL-2.0-only.

`validateEditableProject`, `encodeEditableProject` and `decodeEditableProject` provide
a pure version-1 authoring envelope. The host supplies native validation ports for
the complete temporal document and HTML context; no Timeline dependency is introduced.
The envelope retains the source reference `{id, revision}`, provenance, original
keys/curves/transitions/easings, context and stable IDs, net Full XPath journal and
optional metadata. It does not contain per-frame samples or temporary preview styles.

Validation copies and freezes data before calling the ports, retains warnings such
as stale decisions, and rejects invalid authoring data explicitly. Configurable limits
default to depth 64, 1,000,000 data nodes and 10 MiB of UTF-8 JSON. Accessors, functions,
non-finite numbers, cycles and non-JSON objects are not executed or serialized. Native
JSON property names are retained safely, including names matching prototype fields.
`ProjectValidationError.issues` exposes French diagnostics and stable issue paths.

This codec does not load the source, alter DOM/history, save a file or invoke playback
compilers. The host must supply and verify the original HTML/CSS revision. A successful
JSON round-trip alone does not prove source reattachment or native Timeline reload.

For coordinated opening, `prepareProjectRehydration(readNext, direction)` captures a
prepared participant with exact private-state compensation. The host mounts its checked
source and journal, installs a preview owner for the same permanent root, then applies
this participant inside its existing atomic history. It performs no independent DOM write
or temporal operation. `executeProjectMutation(action)` brackets the trusted synchronous
host transaction and suppresses success if its final flush faults. Do not use these methods
as an independent history or a substitute for the host's source validation/compensation.

`getProjectState()` returns a detached source reference, optional metadata and net journal
after opening. Observe `projectchange` for the complete restored profile/journal and
execute/undo/redo direction; loading saved journal entries emits no fake attribute edits.
The private real integration and manual file demo show a verified host implementation
for their documented subset. General real CSS/group and output mapping remain separate.
