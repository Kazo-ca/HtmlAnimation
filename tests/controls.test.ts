// tests/controls.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CssPropertiesPanel } from '../packages/css-properties/src/index.js';
import { HierarchicalDomTree } from '../packages/dom-tree/src/index.js';

afterEach(() => document.body.replaceChildren());

function host(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

function input(container: HTMLElement, property: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`input[data-property="${property}"]`);
  if (!element) throw new Error(`Missing input ${property}`);
  return element;
}

function scene(): { root: HTMLElement; parent: HTMLElement; child: HTMLElement; sibling: HTMLElement } {
  const root = host();
  root.id = 'scene';
  const parent = document.createElement('section');
  parent.id = 'parent';
  const child = document.createElement('button');
  child.id = 'child';
  child.className = 'button';
  const sibling = document.createElement('aside');
  sibling.id = 'sibling';
  root.append(parent, sibling);
  parent.append(child);
  return { root, parent, child, sibling };
}

function row(container: HTMLElement, name: string): HTMLElement {
  const match = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    .find((element) => element.getAttribute('aria-label')?.includes(name));
  if (!match) throw new Error(`Missing row ${name}`);
  return match;
}

describe('CssPropertiesPanel autonomous controlled view', () => {
  it('emits old/new intent without mutating supplied values and refreshes silently', () => {
    const container = host();
    const panel = new CssPropertiesPanel(container, { commonProperties: true });
    const listener = vi.fn();
    panel.onChange(listener);
    const properties = Object.freeze([Object.freeze({ name: 'opacity', value: '1' })]);
    panel.setProperties(properties);
    expect(listener).not.toHaveBeenCalled();
    input(container, 'opacity').value = '0.6';
    input(container, 'opacity').dispatchEvent(new Event('change', { bubbles: true }));
    expect(listener).toHaveBeenCalledExactlyOnceWith({ property: 'opacity', oldValue: '1', newValue: '0.6' });
    expect(properties[0]?.value).toBe('1');
    panel.setProperties([{ name: 'opacity', value: '0.7' }]);
    expect(input(container, 'opacity').value).toBe('0.7');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Propriétés courantes');
  });

  it('does not emit for unchanged or disabled entries and Escape restores the host value', () => {
    const container = host();
    const panel = new CssPropertiesPanel(container);
    const listener = vi.fn();
    panel.onChange(listener);
    panel.setProperties([{ name: 'opacity', value: '1' }, { name: 'margin-top', value: '', disabled: true, diagnostic: 'Valeurs différentes. Utilisez des ID individuels.' }]);
    input(container, 'opacity').dispatchEvent(new Event('change', { bubbles: true }));
    input(container, 'margin-top').value = '12px';
    input(container, 'margin-top').dispatchEvent(new Event('change', { bubbles: true }));
    expect(listener).not.toHaveBeenCalled();
    expect(input(container, 'margin-top').disabled).toBe(true);
    expect(container.textContent).toContain('Valeurs différentes');
    input(container, 'opacity').value = '0.2';
    input(container, 'opacity').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input(container, 'opacity').value).toBe('1');
    expect(listener).not.toHaveBeenCalled();
  });

  it('supports arbitrary CSS properties, safe labels, search and lifecycle cleanup', () => {
    const container = host();
    const marker = document.createElement('p');
    marker.textContent = 'Contenu hôte';
    container.append(marker);
    const panel = new CssPropertiesPanel(container);
    const listener = vi.fn();
    const unsubscribe = panel.onChange(listener);
    panel.setProperties([{ name: '--custom-color', label: '<img src=x onerror=alert(1)>', value: 'rebeccapurple', capability: 'instant' }, { name: 'width', value: '20px', capability: 'interpolable' }]);
    expect(container.querySelector('img')).toBeNull();
    expect(input(container, '--custom-color').value).toBe('rebeccapurple');
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Search missing');
    search.value = 'custom';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input(container, 'width').closest('[data-property-row]')?.hasAttribute('hidden')).toBe(true);
    expect(input(container, '--custom-color').closest('[data-property-row]')?.hasAttribute('hidden')).toBe(false);
    unsubscribe();
    const detached = input(container, '--custom-color');
    detached.value = 'red';
    detached.dispatchEvent(new Event('change', { bubbles: true }));
    panel.destroy();
    detached.value = 'blue';
    detached.dispatchEvent(new Event('change', { bubbles: true }));
    expect(listener).not.toHaveBeenCalled();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(marker);
  });

  it('shows an actionable empty state', () => {
    const container = host();
    const panel = new CssPropertiesPanel(container);
    panel.setProperties([]);
    expect(container.textContent).toContain('Sélectionnez');
    panel.destroy();
    const listener = vi.fn();
    panel.onChange(listener)();
    panel.setProperties([{ name: 'opacity', value: '1' }]);
    expect(container.querySelector('input')).toBeNull();
  });
});

describe('HierarchicalDomTree autonomous selection', () => {
  it('renders nested safe labels and distinguishes user selection from silent refresh', () => {
    const { root, child } = scene();
    child.id = '<img src=x>';
    const container = host();
    const tree = new HierarchicalDomTree(container, { root });
    const listener = vi.fn();
    tree.onSelectionChange(listener);
    expect(container.querySelector('[role="tree"]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    tree.setSelection([child]);
    expect(listener).not.toHaveBeenCalled();
    expect(row(container, '<img').getAttribute('aria-selected')).toBe('true');
    row(container, '<img').click();
    expect(listener).toHaveBeenCalledExactlyOnceWith([child]);
    expect(root.querySelectorAll('*')).toHaveLength(3);
  });

  it('temporarily reveals collapsed ancestors and restores manual decisions', () => {
    const { root, child, sibling } = scene();
    const container = host();
    const tree = new HierarchicalDomTree(container, { root });
    const parentRow = row(container, '#parent');
    parentRow.querySelector('button')?.click();
    expect(parentRow.getAttribute('aria-expanded')).toBe('false');
    tree.setSelection([child]);
    expect(row(container, '#parent').getAttribute('aria-expanded')).toBe('true');
    tree.setSelection([sibling]);
    expect(row(container, '#parent').getAttribute('aria-expanded')).toBe('false');
    row(container, '#parent').querySelector('button')?.click();
    tree.setSelection([child]);
    tree.setSelection([sibling]);
    expect(row(container, '#parent').getAttribute('aria-expanded')).toBe('true');
  });

  it('supports roving keyboard focus, selection and parent disclosure', () => {
    const { root, parent, child } = scene();
    const container = host();
    const tree = new HierarchicalDomTree(container, { root });
    const listener = vi.fn();
    tree.onSelectionChange(listener);
    const first = row(container, '#scene');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(row(container, '#parent'));
    row(container, '#parent').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(row(container, '#child'));
    row(container, '#child').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(listener).toHaveBeenLastCalledWith([child]);
    row(container, '#child').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(row(container, '#parent'));
    row(container, '#parent').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(listener).toHaveBeenLastCalledWith([parent]);
    row(container, '#parent').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(row(container, '#sibling'));
    row(container, '#sibling').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(row(container, '#scene'));
    expect(container.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
  });

  it('refreshes changed DOM, supports multiple selection and removes only its own UI', () => {
    const { root, child, sibling } = scene();
    const container = host();
    const marker = document.createElement('p');
    container.append(marker);
    const tree = new HierarchicalDomTree(container, { root });
    const listener = vi.fn();
    const unsubscribe = tree.onSelectionChange(listener);
    tree.setSelection([child, sibling]);
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(2);
    child.id = 'renamed';
    tree.refresh();
    expect(row(container, '#renamed').getAttribute('aria-selected')).toBe('true');
    unsubscribe();
    const detached = row(container, '#renamed');
    detached.click();
    tree.destroy();
    detached.click();
    expect(listener).not.toHaveBeenCalled();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(marker);
    tree.setSelection([root]);
    tree.refresh();
    tree.onSelectionChange(listener)();
    expect(container.firstElementChild).toBe(marker);
  });

  it('handles collapsed keyboard branches, boundaries and non-command keys', () => {
    const { root, child } = scene();
    const container = host();
    const tree = new HierarchicalDomTree(container, { root });
    const key = (name: string, value: string): void => {
      row(container, name).dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
    };
    row(container, '#parent').focus();
    key('#parent', 'ArrowLeft');
    expect(row(container, '#parent').getAttribute('aria-expanded')).toBe('false');
    key('#parent', 'ArrowRight');
    expect(row(container, '#parent').getAttribute('aria-expanded')).toBe('true');
    key('#parent', 'ArrowUp');
    expect(document.activeElement).toBe(row(container, '#scene'));
    key('#scene', 'ArrowUp');
    key('#scene', 'Tab');
    expect(document.activeElement).toBe(row(container, '#scene'));
    row(container, '#child').focus();
    tree.refresh();
    expect(document.activeElement).toBe(row(container, '#child'));
    child.remove();
    tree.refresh();
    expect(document.activeElement).toBe(row(container, '#scene'));
  });

  it('refuses to render its UI inside the inspected source', () => {
    const { root, child } = scene();
    expect(() => new HierarchicalDomTree(child, { root })).toThrow('hors du document');
  });
});
