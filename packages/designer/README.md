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
JsAnimationTimeline bridge yet. `TimelineAdapter` describes local consumer needs;
it does not claim existing Timeline package signatures. The test/demo simulation
is excluded from this package. See the repository's HA-ADAPTER-001/r3 document.

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

These batches do not provide independent gradient tracks,
project reload/export, retargeting of already animated objects
or verified integration with a real Timeline version. Public attribute edits allow
only ID/class and currently reject IDs requiring CSS escaping. Coordinate external
source changes by disposing/recreating the Designer. GPL-2.0-only.
