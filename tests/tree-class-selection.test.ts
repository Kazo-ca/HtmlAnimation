// tests/tree-class-selection.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HierarchicalDomTree } from '../packages/dom-tree/src/index.js';

const trees: HierarchicalDomTree[] = [];
afterEach(() => { for (const tree of trees.splice(0)) tree.destroy(); document.body.replaceChildren(); });

function setup(): { root: HTMLElement; first: HTMLElement; second: HTMLElement; nested: HTMLElement; container: HTMLElement; tree: HierarchicalDomTree } {
  const root = document.createElement('section'); root.id = 'source'; root.className = 'button';
  const group = document.createElement('div'); group.id = 'group';
  const first = document.createElement('button'); first.id = 'first'; first.className = 'button primary';
  const second = document.createElement('span'); second.id = 'second'; second.className = 'button a:b.c';
  const nested = document.createElement('i'); nested.id = 'nested'; nested.className = 'a:b.c';
  second.append(nested); group.append(first, second); root.append(group);
  const outside = document.createElement('button'); outside.className = 'button a:b.c';
  const container = document.createElement('aside'); document.body.append(root, outside, container);
  const tree = new HierarchicalDomTree(container, { root }); trees.push(tree);
  return { root, first, second, nested, container, tree };
}

function row(container: HTMLElement, id: string): HTMLElement {
  const result = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(element => element.getAttribute('aria-label')?.includes(`#${id}`));
  if (!result) throw new Error(`The DOM tree row ${id} is missing.`); return result;
}

function classButton(container: HTMLElement, id: string, className: string): HTMLButtonElement {
  const result = [...row(container, id).querySelectorAll<HTMLButtonElement>(':scope > .tree-row button')]
    .find(button => button.getAttribute('aria-label') === `Sélectionner tous les éléments de la classe .${className}`);
  if (!result) throw new Error(`The class action .${className} is missing.`); return result;
}

describe('literal class actions preserve the real DOM hierarchy', () => {
  it('selects the class explicitly once, including the root, then returns to one node without changing source DOM', () => {
    const { root, first, second, container, tree } = setup(); const source = root.outerHTML; const listener = vi.fn(); tree.onSelectionChange(listener);
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(5);
    row(container, 'first').querySelector<HTMLElement>('.tree-label')?.click();
    expect(listener).toHaveBeenLastCalledWith([first]); expect(listener.mock.calls[0]).toHaveLength(1);
    classButton(container, 'first', 'button').click();
    expect(listener).toHaveBeenCalledTimes(2); expect(listener).toHaveBeenLastCalledWith([root, first, second], { kind: 'class', className: 'button' });
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(3);
    row(container, 'first').querySelector<HTMLElement>('.tree-label')?.click();
    expect(listener).toHaveBeenCalledTimes(3); expect(listener).toHaveBeenLastCalledWith([first]); expect(listener.mock.calls[2]).toHaveLength(1);
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(5); expect(root.outerHTML).toBe(source);
  });

  it('treats punctuation as a literal class token and never selects a node outside the source root', () => {
    const { second, nested, container, tree } = setup(); const listener = vi.fn(); tree.onSelectionChange(listener);
    classButton(container, 'second', 'a:b.c').click();
    expect(listener).toHaveBeenCalledExactlyOnceWith([second, nested], { kind: 'class', className: 'a:b.c' });
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(2);
    expect(row(container, 'second').getAttribute('aria-label')).toBe('span#second.button.a:b.c');
  });

  it('keeps each token separate and leaves native class button keyboard activation available', () => {
    const { first, container, tree } = setup(); const listener = vi.fn(); tree.onSelectionChange(listener);
    const primary = classButton(container, 'first', 'primary'); expect(primary.type).toBe('button'); primary.focus();
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); primary.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
    }
    expect(listener).not.toHaveBeenCalled(); primary.click();
    expect(listener).toHaveBeenCalledExactlyOnceWith([first], { kind: 'class', className: 'primary' });
    expect(document.activeElement).toBe(primary);
    expect(container.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
  });

  it('temporarily reveals class members and restores a manually collapsed ancestor after node selection', () => {
    const { root, container, tree } = setup(); const listener = vi.fn(); tree.onSelectionChange(listener);
    const group = row(container, 'group'); group.querySelector<HTMLButtonElement>(':scope > .tree-row .tree-disclosure')?.click(); expect(group.getAttribute('aria-expanded')).toBe('false');
    classButton(container, 'source', 'button').click(); expect(group.getAttribute('aria-expanded')).toBe('true');
    row(container, 'source').querySelector<HTMLElement>('.tree-label')?.click(); expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(listener).toHaveBeenLastCalledWith([root]);
  });

  it('refreshes current class memberships silently and deactivates detached class actions after destroy', () => {
    const { first, second, container, tree } = setup(); const listener = vi.fn(); const unsubscribe = tree.onSelectionChange(listener);
    tree.setSelection([first]); second.className = 'primary'; tree.refresh(); expect(listener).not.toHaveBeenCalled();
    const action = classButton(container, 'first', 'primary'); action.click();
    expect(listener).toHaveBeenCalledExactlyOnceWith([first, second], { kind: 'class', className: 'primary' });
    unsubscribe(); tree.destroy(); action.click(); expect(listener).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
  });
});
