<!-- packages/css-properties/README.md -->
# CSS properties panel

A dependency-free controlled TypeScript/JavaScript control. It does not inspect or mutate the source DOM and does not depend on the Designer or a Timeline.

```ts
import { CssPropertiesPanel } from '@kazo-ca/css-properties';
import '@kazo-ca/css-properties/style.css';

const panel = new CssPropertiesPanel(container, { commonProperties: true });
panel.setProperties([{ name: 'opacity', value: '1', capability: 'interpolable' }]);
const unsubscribe = panel.onChange(({ property, oldValue, newValue }) => {
  // The host validates and records an undoable edit, then refreshes the panel.
  savePropertyCommand(property, oldValue, newValue);
});
// Later:
unsubscribe();
panel.destroy();
```

`setProperties` is silent. User changes emit `{ property, oldValue, newValue }` without mutating the supplied model. The host owns validation, acceptance, persistence and history; it refreshes accepted or rejected values with `setProperties`. Unchanged or disabled values emit nothing. Escape restores the last value supplied by the host.

Any CSS property, including custom properties, keeps its free text input. Optional French labels, diagnostics and `instant`/`interpolable` capability metadata do not limit editing to a catalog. Group incompatibility is provided by the host with `disabled` and `diagnostic`.

The value combobox resolves keywords from the pinned MDN grammar, including referenced
types such as `border-block-start-style`'s `<line-style>`. Its toggle lists complete
values supported by the current browser; typing filters them, arrows navigate,
Enter chooses and Escape restores the host value. Suggestions never constrain free
CSS input. Opening, filtering or moving through the list emits no change.

Complex editors open lazily through each row's **⋯** action. Families include alpha
colors, numbers/units, box sides, borders, radii, shadow layers, ordered transforms
and filters, fonts, backgrounds and linear/radial/conic gradients. Remaining complex
grammars use component/layer/function controls. Unknown or non-decomposable expressions
retain their exact source until explicitly edited; models are explicit replacements.
**Appliquer** emits one old/new property intent. **Annuler**, Escape, `setProperties`
and `destroy` discard pending drafts and deactivate stale controls. The host still
owns every accepted write and its undo operation. No image URL is loaded by a draft.

```ts
import { getCssPropertyMetadata, getCssPropertyNames, CSS_CATALOG_REVISION } from '@kazo-ca/css-properties';
// getCssPropertyMetadata('border-block-start-style').keywords
// getCssPropertyNames(): every concrete name in mdn-data@2.37.2 (671 entries).
// CssProperty.editor and CssProperty.suggestions can override host presentation.
```

Catalogue data is generated from [MDN data](https://github.com/mdn/data), version
2.37.2, CC0-1.0. It is shipped statically; `mdn-data` is a development-only workspace
dependency. Run `npm run generate:css-catalog` to regenerate and
`npm run check:css-catalog` to check the reviewed snapshot. The per-property coverage
inventory lives in `doc/implementation/css-catalog-coverage.json`. Catalogue membership
does not claim browser, interpolation or export support. CSS gradient drafts do not
implement temporal stop identities/tracks or depend on Timeline.

`GradientEditor` is a second autonomous controlled control for **host-supplied structured
gradients**. Import it from the same package and stylesheet, then use
`setGradients(definitions, viewOptions)` and `setSelection(gradientId, stopId)`.
`onChange` emits an edit/add-stop intent; `onPreview` emits a draft or `null`;
`onSelectionChange` carries stable IDs. These callbacks do not create history or keys.
The host owns acceptance, structure and temporal evaluation. Opaque color and alpha
are independent fields; absent points keep their IDs and can be restored. The bar
renders crossed stops sorted by position without changing structural identity/order.

The controls append `.CssPropertiesPanel` and `.CssGradientEditor` roots respectively.
Compiled CSS and LESS sources are scoped to these roots. `destroy` removes only the
control UI, discards previews and deactivates its listeners.
