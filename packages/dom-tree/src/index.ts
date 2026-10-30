// packages/dom-tree/src/index.ts
import './styles.less';

export interface HierarchicalDomTreeOptions {
  readonly root: HTMLElement;
}

interface TreeEntry {
  readonly element: HTMLElement;
  readonly row: HTMLLIElement;
  readonly group: HTMLUListElement;
  readonly disclosure: HTMLButtonElement | null;
  readonly parent: HTMLElement | null;
}

/** DOM view with host-controlled selection and transient ancestor disclosure. */
export class HierarchicalDomTree {
  private readonly tree: HTMLUListElement;
  private readonly wrapper: HTMLDivElement;
  private readonly listeners = new Set<(elements: readonly HTMLElement[]) => void>();
  private readonly manualExpanded = new WeakMap<HTMLElement, boolean>();
  private entries = new Map<HTMLElement, TreeEntry>();
  private selection: readonly HTMLElement[] = [];
  private revealed = new Set<HTMLElement>();
  private focused: HTMLElement | null = null;
  private destroyed = false;

  public constructor(container: HTMLElement, private readonly options: HierarchicalDomTreeOptions) {
    if (options.root.contains(container)) {
      throw new Error('Le conteneur de l’arbre doit être situé hors du document inspecté.');
    }
    const document = container.ownerDocument;
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'HierarchicalDomTree';
    this.tree = document.createElement('ul');
    this.tree.setAttribute('role', 'tree');
    this.tree.setAttribute('aria-label', 'Hiérarchie du document HTML');
    this.tree.setAttribute('aria-multiselectable', 'true');
    this.wrapper.append(this.tree);
    container.append(this.wrapper);
    this.refresh();
  }

  public setSelection(elements: readonly HTMLElement[]): void {
    if (this.destroyed) return;
    const next = [...new Set(elements)].filter((element) => this.entries.has(element));
    const changed = next.length !== this.selection.length || next.some((element, index) => element !== this.selection[index]);
    this.selection = next;
    if (changed) {
      this.revealed = new Set();
      next.forEach((element) => {
        let ancestor = this.entries.get(element)?.parent;
        while (ancestor) {
          this.revealed.add(ancestor);
          ancestor = this.entries.get(ancestor)?.parent;
        }
      });
    }
    this.updateRows();
  }

  public onSelectionChange(listener: (elements: readonly HTMLElement[]) => void): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public refresh(): void {
    if (this.destroyed) return;
    const hadFocus = this.wrapper.contains(this.wrapper.ownerDocument.activeElement);
    this.entries = new Map();
    this.tree.replaceChildren(this.createBranch(this.options.root, null));
    if (!this.focused || !this.entries.has(this.focused)) this.focused = this.options.root;
    this.selection = this.selection.filter((element) => this.entries.has(element));
    this.updateRows();
    if (hadFocus) this.focusEntry(this.focused);
  }

  public destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
    this.entries.clear();
    this.selection = [];
    this.revealed.clear();
    this.focused = null;
    this.wrapper.remove();
  }

  private createBranch(element: HTMLElement, parent: HTMLElement | null): HTMLLIElement {
    const document = this.tree.ownerDocument;
    const branch = document.createElement('li');
    branch.setAttribute('role', 'treeitem');
    const row = document.createElement('div');
    row.className = 'tree-row';
    const name = this.label(element);
    branch.setAttribute('aria-label', name);
    const children = [...element.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
    const group = document.createElement('ul');
    group.setAttribute('role', 'group');
    const disclosure = children.length > 0 ? document.createElement('button') : null;
    this.addDisclosure(row, element, disclosure, name);
    const text = document.createElement('span');
    text.className = 'tree-label';
    text.textContent = name;
    row.append(text);
    branch.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectFromUser(element);
    });
    branch.addEventListener('focus', () => { this.focused = element; this.updateTabStops(); });
    branch.addEventListener('keydown', (event) => this.handleKey(event, element));
    this.entries.set(element, { element, row: branch, group, disclosure, parent });
    children.forEach((child) => group.append(this.createBranch(child, element)));
    branch.append(row, group);
    return branch;
  }

  private addDisclosure(row: HTMLElement, element: HTMLElement, disclosure: HTMLButtonElement | null, label: string): void {
    if (!disclosure) {
      const spacer = this.tree.ownerDocument.createElement('span');
      spacer.className = 'tree-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      row.append(spacer);
      return;
    }
    disclosure.type = 'button';
    disclosure.className = 'tree-disclosure';
    disclosure.tabIndex = -1;
    disclosure.dataset.label = label;
    disclosure.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.destroyed) return;
      this.toggle(element);
      this.focusEntry(element);
    });
    row.append(disclosure);
  }

  private label(element: HTMLElement): string {
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList].map((name) => `.${name}`).join('');
    return `${element.tagName.toLocaleLowerCase('en')}${id}${classes}`;
  }

  private isExpanded(element: HTMLElement): boolean {
    return this.revealed.has(element) || (this.manualExpanded.get(element) ?? true);
  }

  private updateRows(): void {
    this.entries.forEach((entry) => {
      entry.row.setAttribute('aria-selected', String(this.selection.includes(entry.element)));
      if (!entry.disclosure) return;
      const expanded = this.isExpanded(entry.element);
      entry.row.setAttribute('aria-expanded', String(expanded));
      entry.group.hidden = !expanded;
      entry.disclosure.textContent = expanded ? '▾' : '▸';
      entry.disclosure.setAttribute('aria-label', `${expanded ? 'Replier' : 'Déplier'} ${entry.disclosure.dataset.label ?? ''}`);
    });
    this.updateTabStops();
  }

  private updateTabStops(): void {
    this.entries.forEach((entry) => { entry.row.tabIndex = entry.element === this.focused ? 0 : -1; });
  }

  private toggle(element: HTMLElement): void {
    this.manualExpanded.set(element, !this.isExpanded(element));
    this.revealed.delete(element);
    this.updateRows();
  }

  private selectFromUser(element: HTMLElement): void {
    if (this.destroyed) return;
    this.focusEntry(element);
    this.setSelection([element]);
    this.listeners.forEach((listener) => listener([element]));
  }

  private focusEntry(element: HTMLElement): void {
    this.focused = element;
    this.updateTabStops();
    this.entries.get(element)?.row.focus();
  }

  private visibleEntries(): TreeEntry[] {
    return [...this.entries.values()].filter((entry) => {
      let parent = entry.parent;
      while (parent) {
        if (!this.isExpanded(parent)) return false;
        parent = this.entries.get(parent)?.parent ?? null;
      }
      return true;
    });
  }

  private handleKey(event: KeyboardEvent, element: HTMLElement): void {
    if (this.destroyed || event.target !== this.entries.get(element)?.row) return;
    const visible = this.visibleEntries();
    const index = visible.findIndex((entry) => entry.element === element);
    const entry = this.entries.get(element);
    if (!entry) return;
    let target: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown': target = visible[index + 1]?.element; break;
      case 'ArrowUp': target = visible[index - 1]?.element; break;
      case 'Home': target = visible[0]?.element; break;
      case 'End': target = visible.at(-1)?.element; break;
      case 'ArrowRight':
        if (entry.disclosure && !this.isExpanded(element)) this.toggle(element);
        else target = [...this.entries.values()].find((candidate) => candidate.parent === element)?.element;
        break;
      case 'ArrowLeft':
        if (entry.disclosure && this.isExpanded(element)) this.toggle(element);
        else target = entry.parent ?? undefined;
        break;
      case 'Enter': case ' ': this.selectFromUser(element); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (target) this.focusEntry(target);
  }
}
