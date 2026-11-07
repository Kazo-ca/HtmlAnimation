<!-- README.md -->
# HtmlAnimation

An HTML design workspace built as three independently packageable TypeScript libraries.
The interface is in French. Requires Node.js 24+ and npm 11+.

**Live demo:** <https://kazo-ca.github.io/HtmlAnimation/>, rebuilt and deployed by
`.github/workflows/pages.yml` on every push to `main`. The real Timeline workshop is at
<https://kazo-ca.github.io/HtmlAnimation/timeline-real.html>.

| Package | Role | Runtime dependencies |
| --- | --- | --- |
| `@kazo-ca/css-properties` | Controlled CSS property editor with free-text fallback | None |
| `@kazo-ca/hierarchical-dom-tree` | Keyboard-accessible DOM hierarchy and controlled selection | None |
| `@kazo-ca/html-designer` | Coordinates an existing HTML scene, both controls and an injected Timeline adapter | The two controls |

The functional batches provide inspection, synchronized selection, selection/test modes,
explicit first-edit targeting, property edits, shared undo/redo, original ID/class change tracking
with Full XPath, and temporary style preview. The main demo uses clearly labelled
recorded simulations. A separate genuine package workshop is available;
full real integration remains in progress against pinned local Timeline archives.
Batch 2 adds move, dimensions, rotation, scale, compensated pivot, grid/alignment aids,
pointer/keyboard interaction and one undo per multi-property gesture.

```sh
npm ci --ignore-scripts
npm run build
npm run build:demo
npm exec playwright install chromium firefox webkit
npm run lint
npm run typecheck
npm run check:timeline-artifacts
npm run test:coverage
npm run check:packages
CI=1 npm run test:e2e
npm run dev
```

PowerShell: use `$env:CI='1'; npm run test:e2e` for the browser check.
Development demo: <http://127.0.0.1:43127>. Production preview: `npm run preview`,
<http://127.0.0.1:43128>. Both bind to loopback and fail if the port is occupied.
Playwright owns port 43128 during tests; stop the preview before running it.

The initial scenario shows the four `.button` elements at 50% opacity and `#button-2`
at 80%, including before its sole key at frame 50. Navigate the recorded frame choices,
select the group or individual object, and try the incompatible group margin.
The tree starts with no selection and always displays the actual DOM hierarchy.
Click a tag/ID to inspect only that node; click a separate class button to explicitly
select all members of that class. A node click never promotes itself to a class group.
Use **Scène sans clés**, select a button, edit **Opacité**, then explicitly choose an ID
or class and save. **Annuler/Rétablir** restores the key, object and preview together.
In that fresh scene, **Nouvel identifiant** and **Classes du document** demonstrate the
persistent change journal and its original Full XPath. Scene samples are in `fixtures/`
and reused by the automated tests.

Use **Atelier géométrique**, choose a tool and drag its handle. Escape cancels; movement
arrows use 1px, Shift uses10px, Alt bypasses snapping. **Dimensions** edits width/height,
while **Échelle** edits independent factors. **Pivot** exposes nine presets and preserves
the visible position. **Expression CSS** demonstrates an explicit pixel-conversion choice.
The **Scénario géométrique** selector also loads containing-block, stylesheet, nesting and
identity cases reused by browser tests. Source transforms are retained; the new spatial
channels are adjustments over that base. See the batch2 support limits before integrating.

Use **Atelier CSS** to try value suggestions and complex assistants. Search for
`border-block-start-style`, open **▾**, then select a style with mouse or arrows/Enter.
Each **⋯** action opens a draft editor for its property; **Appliquer** creates one
undoable change and **Annuler** discards the draft. Colors/alpha, borders, shadows,
ordered transforms, gradients and typography share the same controlled contract.
The static MDN catalogue covers 671 property names, with structured editors for
remaining complex grammars and free CSS input for arbitrary values.

Use **Atelier des conflits** beside its scenario selector to inspect a deliberate
class overlap. Open **Résoudre le conflit**, read the consequences, choose a priority
and confirm. Undo restores the unresolved state; selection and recorded-frame navigation
preserve the decision. Other scenarios demonstrate an explicitly announced starting
key and a decision made stale by changed simulated contributions. These diagnostics
and samples are simulations; no real Timeline connection is claimed.

Use **Atelier des dégradés** for independent type, geometry, color, opacity, position
and presence tracks. Select a point in its bar or scene handles; Escape discards a
gesture and one undo restores a compound edit. Structural addition/removal and their
history are demonstrated with the simulation. Crossed points preserve their IDs and
render sorted by evaluated position.

The [genuine package workshop](http://127.0.0.1:43127/timeline-real.html) uses the three
immutable HA9B archives recorded in `vendor/timeline/manifest.json`. It exercises runtime
hold, direct seeks, component gestures, real structural point addition, first opacity
object creation and ID/class effects with shared history. General CSS and the existing
r3 element-geometry mapping remain explicit limits. Prepared host rendering now exposes
the committed preview to backend observers before notifications. Public undo/redo refusal
reasons pass their genuine regression tests; full-product conformity is still separate.
See [the real evidence matrix](doc/implementation/timeline-real-matrix.md) for limits.

In that genuine workshop, **Enregistrer le projet** downloads native editable data,
context and the net original-document journal. Choose a file, then **Ouvrir le projet**
to restore it in the same undo history. The host provides the original HTML/CSS again;
this demo knows only its three gradient source fixtures. Unknown sources remain unopened.
Checking a file alone changes no project. The versioned codec is reusable without Timeline;
the private native capture/opening examples and limits are in
[the persistence record](doc/implementation/editable-project.md).
The workshop's **Exemple conique · image 50** link downloads a reusable genuine saved
fixture. Choose that file, open it, then seek to frame 50 to inspect its saved angle.

## Consumer API

```ts
import { HtmlDesigner } from '@kazo-ca/html-designer';
import '@kazo-ca/css-properties/style.css';
import '@kazo-ca/hierarchical-dom-tree/style.css';
import '@kazo-ca/html-designer/style.css';

const designer = new HtmlDesigner({
  scene: existingHtmlContainer,
  propertiesContainer,
  treeContainer,
  timeline: hostTimelineInstance,
  adapter: instance => createHostAdapter(instance),
});
designer.on('documentchange', ({ changes, direction }) => {
  // Each change retains the ORIGINAL Full XPath and old/new ID or class.
  // On undo, reapply oldValue; on execute/redo, reapply newValue.
  hostPersistOriginalAttributes(changes, direction);
});
designer.on('propertychange', ({ property, oldValue, newValue, frame }) => {
  hostObserveAcceptedEdit({ property, oldValue, newValue, frame });
});
// Later: designer.dispose(); the host still owns its Timeline instance.
```

`createHostAdapter` is application-provided; its local proposed interface is documented
in [HA-ADAPTER-001/r5](doc/implementation/adapter-contract.md). It is **not** an existing
JsAnimationTimeline API. No fake is exported from the three libraries. Build outputs
include ESM, declarations, CSS and the existing GPL-2.0 license. Package names are
provisional; nothing has been published.

Read [the production plan](doc/implementation/plan.md),
[API gaps and batch status](doc/implementation/status.md), and the unchanged
[product handoff](doc/integration/README.md) before extending the implementation.
Geometry delivery and support limits are documented in [geometry batch status](doc/implementation/geometry-batch.md).
Explicit conflict decisions are documented in [batch 3a](doc/implementation/conflict-resolution.md).
Independent gradients are documented in [batch 3b](doc/implementation/gradient-tracks.md).
