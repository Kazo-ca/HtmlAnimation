// tests/node-selection.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createSceneFixture, propertyInput } from './helpers.js';

const designers: HtmlDesigner[] = [];
afterEach(() => { for (const designer of designers.splice(0)) designer.dispose(); document.body.replaceChildren(); });

function setup(): ReturnType<typeof createSceneFixture> & { readonly designer: HtmlDesigner; readonly timeline: ReturnType<typeof createRecordedTimeline> } {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline({ reference: true });
  const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer);
  return { ...fixture, timeline, designer };
}

function node(tree: HTMLElement, id: string): HTMLElement {
  const row = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(element => element.getAttribute('aria-label') === `button#${id}.button`);
  if (!row) throw new Error(`Missing DOM node ${id}`); return row;
}

function classAction(row: HTMLElement): HTMLButtonElement {
  const button = row.querySelector<HTMLButtonElement>('button[aria-label="Sélectionner tous les éléments de la classe .button"]');
  if (!button) throw new Error('The DOM row must expose its explicit class selection action.'); return button;
}

describe('individual DOM inspection with a recorded Timeline simulation', () => {
  it('keeps a node selected alone when its only matching object is a shared class', () => {
    const { designer, timeline, buttons, treeContainer, propertiesContainer } = setup();
    const selected = vi.fn(); designer.on('selectionchange', selected); const keys = timeline.getKeys();
    designer.selectElements([buttons[0]]);
    expect(selected).toHaveBeenLastCalledWith({ elements: [buttons[0]], objectId: null });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(node(treeContainer, 'button-1').getAttribute('aria-selected')).toBe('true');
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('0.5');
    expect(propertyInput(propertiesContainer, 'margin-top').disabled).toBe(false);
    expect(timeline.getState()).toMatchObject({ selectedObjectId: null, canUndo: false, canRedo: false });
    expect(timeline.getKeys()).toEqual(keys);
  });

  it('applies the same individual selection rule to a scene click', () => {
    const { designer, timeline, buttons, treeContainer } = setup(); const selected = vi.fn(); designer.on('selectionchange', selected);
    buttons[0].click();
    expect(selected).toHaveBeenLastCalledWith({ elements: [buttons[0]], objectId: null });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(timeline.getKeys()).toHaveLength(2); expect(timeline.getState().canUndo).toBe(false);
  });

  it('keeps an existing exact ID object associated with its single DOM node', () => {
    const { designer, timeline, buttons, treeContainer, propertiesContainer } = setup(); const selected = vi.fn(); designer.on('selectionchange', selected);
    node(treeContainer, 'button-2').click();
    expect(selected).toHaveBeenLastCalledWith({ elements: [buttons[1]], objectId: 'specific' });
    expect(timeline.getState().selectedObjectId).toBe('specific');
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('0.8');
    expect(timeline.getKeys()).toHaveLength(2); expect(timeline.getState().canUndo).toBe(false);
  });

  it('allows explicit Timeline or class selection to select the group, then a node returns to one element', () => {
    const { designer, timeline, buttons, treeContainer, propertiesContainer } = setup(); const selected = vi.fn(); designer.on('selectionchange', selected);
    const keys = timeline.getKeys(); timeline.selectObject('group');
    expect(selected).toHaveBeenLastCalledWith({ elements: buttons, objectId: 'group' });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(4);
    node(treeContainer, 'button-1').click();
    expect(selected).toHaveBeenLastCalledWith({ elements: [buttons[0]], objectId: null });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    classAction(node(treeContainer, 'button-1')).click();
    expect(selected).toHaveBeenLastCalledWith({ elements: buttons, objectId: 'group' });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(4);
    expect(propertyInput(propertiesContainer, 'margin-top').disabled).toBe(true);
    node(treeContainer, 'button-1').click();
    expect(selected).toHaveBeenLastCalledWith({ elements: [buttons[0]], objectId: null });
    expect(timeline.getKeys()).toEqual(keys); expect(timeline.getState().canUndo).toBe(false);
  });

  it('requires an explicit ID for a first individual edit and undo leaves the class and ID samples intact', () => {
    const { designer, timeline, buttons, treeContainer, propertiesContainer } = setup(); const keys = timeline.getKeys(); const objects = timeline.getState().objects;
    const changed = vi.fn(); const documentChanged = vi.fn(); designer.on('propertychange', changed); designer.on('documentchange', documentChanged);
    node(treeContainer, 'button-1').click();
    const opacity = propertyInput(propertiesContainer, 'opacity'); opacity.value = '0.3'; opacity.dispatchEvent(new Event('change', { bubbles: true }));
    const chooser = propertiesContainer.querySelector<HTMLSelectElement>('select[aria-label="Cibles existantes"]');
    if (!chooser) throw new Error('The first node edit must expose its target chooser.');
    expect(chooser.closest('fieldset')?.hidden).toBe(false); expect(timeline.getKeys()).toEqual(keys); expect(changed).not.toHaveBeenCalled();
    chooser.value = '#button-1'; chooser.dispatchEvent(new Event('change', { bubbles: true }));
    const save = [...propertiesContainer.querySelectorAll('button')].find(button => button.textContent === 'Enregistrer');
    if (!save) throw new Error('Missing target save button.'); save.click();
    expect(buttons.map(button => button.style.opacity)).toEqual(['0.3', '0.8', '0.5', '0.5']);
    expect(timeline.getKeys()).toHaveLength(3);
    expect(changed).toHaveBeenCalledExactlyOnceWith({ property: 'opacity', oldValue: '0.5', newValue: '0.3', frame: 1 });
    expect(documentChanged).not.toHaveBeenCalled();
    designer.undo(); expect(buttons.map(button => button.style.opacity)).toEqual(['0.5', '0.8', '0.5', '0.5']);
    expect(timeline.getKeys()).toEqual(keys); expect(timeline.getState().objects).toEqual(objects);
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  });
});
