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

Any CSS property, including custom properties, can use a text input. Optional French labels, diagnostics and `instant`/`interpolable` capability metadata do not limit editing to a catalog. Group incompatibility is provided by the host with `disabled` and `diagnostic`.

The control appends a `.CssPropertiesPanel` root. Compiled CSS and LESS sources are scoped to that root. `destroy` removes only the control UI and deactivates its listeners.
