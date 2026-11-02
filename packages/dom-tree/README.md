<!-- packages/dom-tree/README.md -->
# HierarchicalDomTree

A dependency-free controlled DOM tree for JavaScript and TypeScript. No Designer, properties panel or Timeline is required.

```ts
import { HierarchicalDomTree } from '@kazo-ca/hierarchical-dom-tree';
import '@kazo-ca/hierarchical-dom-tree/style.css';

const tree = new HierarchicalDomTree(treeContainer, { root: existingHtmlContainer });
const unsubscribe = tree.onSelectionChange((elements, context) => {
  selectInHost(elements);
  // Only an explicit class action provides { kind: 'class', className }.
  if (context) observeClassSelection(context.className);
});
tree.setSelection([existingButton]); // Silent host update, including multiple elements.
tree.refresh(); // Explicitly reflect changes to the host DOM or identifiers.
// Later:
unsubscribe();
tree.destroy();
```

The source root appears as the first tree item. The tree reads the DOM and creates its own nested ARIA tree without altering source elements. Put `treeContainer` outside the inspected root. Each row shows its real tag and ID plus one native button per class. The complete tag/ID/classes label remains the tree item's accessible name.

Clicking a tag/ID or selecting a focused tree item selects that element alone and emits the legacy single argument, `elements`. A class button selects all HTML elements with that literal class inside the inspected root, including the root itself when applicable, and emits `elements` plus the optional `TreeSelectionContext`. It never changes the hierarchy, creates a synthetic group, or parses the token as a CSS selector. Class buttons support native keyboard activation; their click does not also select the row. Existing one-argument listeners continue to receive every selection.

Up/Down and Home/End move focus. Right opens a branch or enters it; Left closes it or focuses its parent. Enter/Space selects the focused element. Disclosure buttons also support pointer/touch input. Only user selection emits an event; `setSelection` and `refresh` are silent.

A selected descendant temporarily reveals collapsed ancestors. A subsequent selection restores their manual expansion choices; explicit disclosure changes remain manual choices. The control owns this view state, while the host owns document commands and history.

The appended `.HierarchicalDomTree` root scopes compiled CSS and LESS. `destroy` removes only its own UI and deactivates its listeners.
