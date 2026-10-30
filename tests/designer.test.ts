// tests/designer.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import type { RecordedTimeline } from '../fixtures/recorded-timeline.js';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createSceneFixture, propertyInput } from './helpers.js';

const designers: HtmlDesigner[] = [];

afterEach(() => {
  for (const designer of designers.splice(0)) designer.dispose();
  document.body.replaceChildren();
});

function setup(timeline = createRecordedTimeline(), prepare?: (fixture: ReturnType<typeof createSceneFixture>) => void): ReturnType<typeof createSceneFixture> & {
  readonly designer: HtmlDesigner;
  readonly timeline: RecordedTimeline;
} {
  const fixture = createSceneFixture();
  prepare?.(fixture);
  const hostTimeline = { identity: 'host-owned-timeline' };
  const adapter = vi.fn((instance: typeof hostTimeline) => {
    expect(instance).toBe(hostTimeline);
    return timeline;
  });
  const designer = new HtmlDesigner({ ...fixture, timeline: hostTimeline, adapter });
  designers.push(designer);
  expect(adapter).toHaveBeenCalledExactlyOnceWith(hostTimeline);
  return { ...fixture, designer, timeline };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const element = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  if (!element) throw new Error(`Missing action: ${label}`);
  return element;
}

function field(container: HTMLElement, label: string): HTMLInputElement {
  const element = [...container.querySelectorAll<HTMLInputElement>('input[aria-label]')]
    .find((candidate) => candidate.getAttribute('aria-label') === label);
  if (!element) throw new Error(`Missing field: ${label}`);
  return element;
}

function changeProperty(container: HTMLElement, property: string, value: string): void {
  const input = propertyInput(container, property);
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('HtmlDesigner integration with a scripted simulation, not a real Timeline', () => {
  it('inspects scene elements and synchronizes the tree and panel without creating an object', () => {
    const { designer, timeline, scene, buttons, propertiesContainer, treeContainer } = setup();
    const listener = vi.fn();
    designer.on('selectionchange', listener);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttons[1].dispatchEvent(click);
    expect(listener).toHaveBeenLastCalledWith({ elements: [buttons[1]], objectId: null });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('1');
    expect(timeline.getState().objects).toEqual([]);
    expect(timeline.getKeys()).toEqual([]);
    expect(scene.querySelectorAll('button')).toHaveLength(4);
    expect(click.defaultPrevented).toBe(true);
  });

  it('requires explicit first-edit targeting and leaves data unchanged when no target is chosen', () => {
    const { designer, timeline, buttons } = setup();
    designer.selectElements([buttons[0]]);
    expect(designer.editProperty('opacity', '0.4').status).toBe('rejected');
    expect(timeline.getState().objects).toEqual([]);
    expect(timeline.getKeys()).toEqual([]);
    expect(buttons[0].style.opacity).toBe('1');
    designer.selectTarget('#button-1');
    expect(timeline.getState().objects).toEqual([]);
    expect(designer.editProperty('opacity', '0.4')).toEqual({ status: 'changed' });
    expect(timeline.getState().objects).toHaveLength(1);
  });

  it('offers first-edit ID/class choices, warns for multiple targets, and cancels without creating data', () => {
    const { designer, timeline, buttons, propertiesContainer } = setup(createRecordedTimeline(), ({ buttons }) => { buttons[0].className = 'button primary'; });
    designer.selectElements([buttons[0]]);
    changeProperty(propertiesContainer, 'opacity', '0.4');
    const chooser = propertiesContainer.querySelector<HTMLSelectElement>('select[aria-label="Cibles existantes"]');
    expect(chooser).not.toBeNull();
    expect([...chooser?.options ?? []].map((option) => option.value)).toEqual(expect.arrayContaining(['#button-1', '.button', '.primary', '.button.primary']));
    if (!chooser) throw new Error('Missing target chooser');
    chooser.value = '.button';
    chooser.dispatchEvent(new Event('change', { bubbles: true }));
    expect(field(propertiesContainer, 'Sélecteur cible').value).toBe('.button');
    expect(propertiesContainer.textContent).toContain('Attention : 4 éléments seront ciblés.');
    expect(timeline.getState().objects).toEqual([]);
    button(propertiesContainer, 'Annuler le choix').click();
    expect(chooser.closest('fieldset')?.hidden).toBe(true);
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('1');
    expect(timeline.getKeys()).toEqual([]);
    button(propertiesContainer, 'Enregistrer').click();
    expect(timeline.getKeys()).toEqual([]);
  });

  it('records a pending panel edit only after a valid matching target is explicitly saved', () => {
    const { designer, timeline, buttons, propertiesContainer } = setup();
    const diagnostic = vi.fn();
    designer.on('diagnostic', diagnostic);
    designer.selectElements([buttons[0]]);
    changeProperty(propertiesContainer, 'opacity', '0.4');
    const target = field(propertiesContainer, 'Sélecteur cible');
    target.value = '#button-2';
    button(propertiesContainer, 'Enregistrer').click();
    expect(timeline.getKeys()).toEqual([]);
    expect(diagnostic).toHaveBeenLastCalledWith({ message: 'La cible doit contenir les éléments inspectés.' });
    target.value = '.button';
    target.dispatchEvent(new Event('input'));
    button(propertiesContainer, 'Enregistrer').click();
    expect(timeline.getKeys()).toEqual([expect.objectContaining({ selector: '.button', property: 'opacity', value: '0.4', frame: 1 })]);
    expect(buttons.map((element) => element.style.opacity)).toEqual(['0.4', '0.4', '0.4', '0.4']);
    expect(target.closest('fieldset')?.hidden).toBe(true);
    designer.undo();
    expect(buttons.map((element) => element.style.opacity)).toEqual(['1', '1', '1', '1']);
    expect(timeline.getKeys()).toEqual([]);
  });

  it('clears a pending first edit when the inspected element changes', () => {
    const { designer, timeline, buttons, propertiesContainer } = setup();
    designer.selectElements([buttons[0]]);
    changeProperty(propertiesContainer, 'opacity', '0.4');
    const chooser = field(propertiesContainer, 'Sélecteur cible');
    designer.selectElements([buttons[1]]);
    expect(chooser.closest('fieldset')?.hidden).toBe(true);
    chooser.value = '#button-2';
    button(propertiesContainer, 'Enregistrer').click();
    expect(timeline.getKeys()).toEqual([]);
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('1');
  });

  it.each(['target', 'timeline'] as const)('cancels pending first-edit data after selection changes from %s', (source) => {
    const timeline = createRecordedTimeline();
    timeline.execute('Recorded individual target', [
      { objectId: 'specific', selector: '#button-2', property: 'opacity', value: '0.8', frame: 1 },
    ]);
    const { designer, buttons, propertiesContainer } = setup(timeline);
    const originalKeys = timeline.getKeys();
    designer.selectElements([buttons[0]]);
    changeProperty(propertiesContainer, 'opacity', '0.4');
    const target = field(propertiesContainer, 'Sélecteur cible');
    target.value = '.button';
    if (source === 'target') designer.selectTarget('#button-2');
    else timeline.selectObject('specific');
    expect(target.closest('fieldset')?.hidden).toBe(true);
    button(propertiesContainer, 'Enregistrer').click();
    expect(timeline.getKeys()).toEqual(originalKeys);
    expect(buttons[0].style.opacity).toBe('1');
    expect(buttons[1].style.opacity).toBe('0.8');
  });

  it('writes only the edited property at the current frame and undo/redo restores values and preview', () => {
    const { designer, timeline, buttons } = setup();
    const propertyChange = vi.fn();
    designer.on('propertychange', propertyChange);
    timeline.navigate(50);
    designer.selectTarget('#button-2');
    expect(designer.editProperty('opacity', '0.6')).toEqual({ status: 'changed' });
    expect(timeline.getKeys()).toEqual([expect.objectContaining({ selector: '#button-2', property: 'opacity', value: '0.6', frame: 50 })]);
    expect(propertyChange).toHaveBeenCalledExactlyOnceWith({ property: 'opacity', oldValue: '1', newValue: '0.6', frame: 50 });
    expect(buttons[1].style.opacity).toBe('0.6');
    expect(buttons[0].style.opacity).toBe('1');
    expect(designer.getDocumentChanges()).toEqual([]);
    expect(designer.undo()).toEqual({ status: 'changed' });
    expect(buttons[1].style.opacity).toBe('1');
    expect(timeline.getState().objects).toEqual([]);
    expect(designer.redo()).toEqual({ status: 'changed' });
    expect(buttons[1].style.opacity).toBe('0.6');
    expect(propertyChange).toHaveBeenCalledTimes(1);
  });

  it('refuses group properties with divergent original values even after a common preview', () => {
    const timeline = createRecordedTimeline();
    timeline.execute('Recorded common preview', [
      { objectId: 'group', selector: '.button', property: 'margin-top', value: '7px', frame: 1 },
      { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
    ]);
    const originalKeys = timeline.getKeys();
    const { designer, buttons, propertiesContainer } = setup(timeline);
    designer.selectTarget('.button');
    expect(buttons.map((button) => button.style.marginTop)).toEqual(['7px', '7px', '7px', '7px']);
    expect(propertyInput(propertiesContainer, 'margin-top').disabled).toBe(true);
    expect(propertiesContainer.textContent).toMatch(/ID individuels/);
    expect(designer.editProperty('margin-top', '10px').status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(originalKeys);
    expect(designer.editProperty('opacity', '0.3')).toEqual({ status: 'changed' });
    expect(buttons.map((button) => button.style.opacity)).toEqual(['0.3', '0.3', '0.3', '0.3']);
    expect(designer.undo()).toEqual({ status: 'changed' });
    expect(buttons.map((button) => button.style.opacity)).toEqual(['0.5', '0.5', '0.5', '0.5']);
  });

  it('updates evaluated values on navigation without creating a key or a user edit', () => {
    const timeline = createRecordedTimeline({ reference: true });
    const originalKeys = timeline.getKeys();
    const { designer, propertiesContainer, buttons } = setup(timeline);
    const propertyChange = vi.fn();
    designer.on('propertychange', propertyChange);
    designer.selectTarget('#button-2');
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('0.8');
    timeline.navigate(2);
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('1');
    expect(buttons[1].style.opacity).toBe('1');
    timeline.navigate(20);
    expect(propertyInput(propertiesContainer, 'opacity').value).toBe('0.8');
    expect(buttons[1].style.opacity).toBe('0.8');
    expect(propertyChange).not.toHaveBeenCalled();
    expect(timeline.getKeys()).toEqual(originalKeys);
    expect(timeline.getState().canUndo).toBe(false);
  });

  it('selects all group matches from Timeline and prefers the existing ID object from the scene', () => {
    const timeline = createRecordedTimeline({ reference: true });
    const originalKeys = timeline.getKeys();
    const { designer, buttons, treeContainer } = setup(timeline);
    const selectionChange = vi.fn();
    designer.on('selectionchange', selectionChange);
    timeline.selectObject('group');
    expect(selectionChange).toHaveBeenLastCalledWith({ elements: buttons, objectId: 'group' });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(4);
    designer.selectElements([buttons[1]]);
    expect(timeline.getState().selectedObjectId).toBe('specific');
    expect(selectionChange).toHaveBeenLastCalledWith({ elements: [buttons[1]], objectId: 'specific' });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(timeline.getKeys()).toEqual(originalKeys);
  });

  it('reports ambiguous scene associations and leaves the target choice explicit', () => {
    const timeline = createRecordedTimeline();
    timeline.execute('Recorded ambiguous targets', [
      { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
      { objectId: 'other', selector: '.primary', property: 'color', value: 'red', frame: 1 },
    ]);
    const { designer, buttons } = setup(timeline, ({ buttons }) => { buttons[0].className = 'button primary'; });
    const diagnostic = vi.fn();
    designer.on('diagnostic', diagnostic);
    designer.selectElements([buttons[0]]);
    expect(timeline.getState().selectedObjectId).toBeNull();
    expect(diagnostic).toHaveBeenLastCalledWith({ message: 'Plusieurs objets correspondent. Choisissez une cible explicitement.' });
    expect(designer.editProperty('opacity', '0.4').status).toBe('rejected');
    expect(timeline.getKeys()).toHaveLength(2);
  });

  it('ignores detached or external elements and clears selection when Timeline clears it', () => {
    const { designer, timeline, buttons, treeContainer } = setup();
    const selectionChange = vi.fn();
    designer.on('selectionchange', selectionChange);
    designer.selectElements([document.createElement('aside')]);
    expect(selectionChange).toHaveBeenLastCalledWith({ elements: [], objectId: null });
    designer.selectTarget('#button-1');
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    timeline.selectObject(null);
    expect(selectionChange).toHaveBeenLastCalledWith({ elements: [], objectId: null });
    expect(treeContainer.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    buttons[0].remove();
    designer.selectElements([buttons[0]]);
    expect(selectionChange).toHaveBeenLastCalledWith({ elements: [], objectId: null });
  });

  it('reports persistent ID changes with original full XPath and reverses them in shared history', () => {
    const { designer, buttons } = setup();
    const documentChange = vi.fn();
    designer.on('documentchange', documentChange);
    expect(designer.setAttribute(buttons[1], 'id', 'MonBouton')).toEqual({ status: 'changed' });
    const change = { fullXPath: '/html/body/section/div/button[2]', attribute: 'id', oldValue: 'button-2', newValue: 'MonBouton' };
    expect(buttons[1].id).toBe('MonBouton');
    expect(designer.getDocumentChanges()).toEqual([change]);
    expect(documentChange).toHaveBeenLastCalledWith({ changes: [change], direction: 'execute' });
    expect(document.body.textContent).toMatch(/document original/i);
    expect(document.body.textContent).toContain('MonBouton');
    expect(designer.undo()).toEqual({ status: 'changed' });
    expect(buttons[1].id).toBe('button-2');
    expect(designer.getDocumentChanges()).toEqual([]);
    // Events carry the reversible operation; the query above returns the cumulative journal.
    expect(documentChange).toHaveBeenLastCalledWith({ changes: [change], direction: 'undo' });
    expect(designer.redo()).toEqual({ status: 'changed' });
    expect(buttons[1].id).toBe('MonBouton');
    expect(designer.getDocumentChanges()).toEqual([change]);
    expect(documentChange).toHaveBeenLastCalledWith({ changes: [change], direction: 'redo' });
  });

  it('tracks class and absent ID changes separately from preview and restores absent attributes on undo', () => {
    const fixture = setup(createRecordedTimeline(), ({ buttons }) => buttons[2].removeAttribute('id'));
    const { designer, buttons } = fixture;
    expect(designer.setAttribute(buttons[0], 'class', 'button primary')).toEqual({ status: 'changed' });
    expect(designer.getDocumentChanges()[0]).toEqual({ fullXPath: '/html/body/section/div/button[1]', attribute: 'class', oldValue: 'button', newValue: 'button primary' });
    expect(designer.undo()).toEqual({ status: 'changed' });
    expect(buttons[0].className).toBe('button');
    const newElement = buttons[2];
    expect(designer.setAttribute(newElement, 'id', 'MonElement')).toEqual({ status: 'changed' });
    expect(designer.getDocumentChanges()[0]).toEqual({ fullXPath: '/html/body/section/div/button[3]', attribute: 'id', oldValue: null, newValue: 'MonElement' });
    expect(designer.undo()).toEqual({ status: 'changed' });
    expect(newElement.hasAttribute('id')).toBe(false);
  });

  it('applies attribute controls explicitly, coalesces the journal and undoes each change', () => {
    const { designer, buttons, propertiesContainer } = setup();
    designer.selectElements([buttons[0]]);
    const id = field(propertiesContainer, 'Nouvel identifiant');
    id.value = 'Premier';
    button(propertiesContainer, 'Appliquer l’ID').click();
    expect(buttons[0].id).toBe('Premier');
    id.value = 'Deuxieme';
    button(propertiesContainer, 'Appliquer l’ID').click();
    expect(designer.getDocumentChanges()).toEqual([{ fullXPath: '/html/body/section/div/button[1]', attribute: 'id', oldValue: 'button-1', newValue: 'Deuxieme' }]);
    id.value = 'button-1';
    button(propertiesContainer, 'Appliquer l’ID').click();
    expect(designer.getDocumentChanges()).toEqual([]);
    designer.undo();
    expect(buttons[0].id).toBe('Deuxieme');
    designer.undo();
    expect(buttons[0].id).toBe('Premier');
    designer.undo();
    expect(buttons[0].id).toBe('button-1');
    const classes = field(propertiesContainer, 'Classes du document');
    classes.value = '';
    button(propertiesContainer, 'Appliquer les classes').click();
    expect(buttons[0].hasAttribute('class')).toBe(false);
    designer.undo();
    expect(buttons[0].className).toBe('button');
  });

  it('rejects invalid identifiers, elements absent from the original, and renaming animated targets', () => {
    const { designer, timeline, scene, buttons } = setup();
    expect(designer.setAttribute(buttons[0], 'id', 'bad name').status).toBe('rejected');
    expect(designer.setAttribute(buttons[0], 'id', ' ').status).toBe('rejected');
    expect(designer.setAttribute(buttons[0], 'class', ' ').status).toBe('rejected');
    expect(designer.setAttribute(buttons[0], 'id', 'button-1')).toEqual({ status: 'unchanged' });
    const added = document.createElement('aside');
    scene.append(added);
    expect(designer.setAttribute(added, 'id', 'Added').status).toBe('rejected');
    expect(added.hasAttribute('id')).toBe(false);
    designer.selectTarget('#button-1');
    designer.editProperty('opacity', '0.5');
    const before = timeline.getKeys();
    expect(designer.setAttribute(buttons[0], 'id', 'Animated').status).toBe('rejected');
    expect(buttons[0].id).toBe('button-1');
    expect(timeline.getKeys()).toEqual(before);
    expect(designer.getDocumentChanges()).toEqual([]);
  });

  it('rejects invalid targeting and CSS without applying partial changes', () => {
    const { designer, timeline, buttons } = setup();
    const original = buttons[0].getAttribute('style');
    expect(designer.setAttribute(buttons[0], 'id', 'button-2').status).toBe('rejected');
    expect(buttons[0].id).toBe('button-1');
    designer.selectTarget('#button-1');
    expect(designer.editProperty('opacity', 'not-an-opacity').status).toBe('rejected');
    expect(buttons[0].getAttribute('style')).toBe(original);
    expect(timeline.getKeys()).toEqual([]);
    expect(designer.getDocumentChanges()).toEqual([]);
  });

  it('reports an unsupported selector, a refused Timeline command and harmless no-op edits', () => {
    const { designer, timeline, buttons } = setup();
    const diagnostic = vi.fn();
    const propertyChange = vi.fn();
    const off = designer.on('diagnostic', diagnostic);
    designer.on('propertychange', propertyChange);
    designer.selectTarget('button');
    expect(diagnostic).toHaveBeenCalledOnce();
    expect(timeline.getState().objects).toEqual([]);
    designer.selectTarget('#button-1');
    expect(designer.editProperty('opacity', '1')).toEqual({ status: 'unchanged' });
    expect(designer.editProperty('opacity', '').status).toBe('rejected');
    const execute = vi.spyOn(timeline, 'execute').mockReturnValue({ status: 'rejected', message: 'Transition incompatible simulée.' });
    expect(designer.editProperty('opacity', '0.4')).toEqual({ status: 'rejected', message: 'Transition incompatible simulée.' });
    expect(diagnostic).toHaveBeenLastCalledWith({ message: 'Transition incompatible simulée.' });
    expect(buttons[0].style.opacity).toBe('1');
    expect(propertyChange).not.toHaveBeenCalled();
    off();
    const eventCount = diagnostic.mock.calls.length;
    designer.selectTarget('#missing');
    expect(diagnostic).toHaveBeenCalledTimes(eventCount);
    execute.mockRestore();
    expect(designer.undo()).toEqual({ status: 'unchanged' });
    expect(designer.redo()).toEqual({ status: 'unchanged' });
  });

  it('does not choose an arbitrary winner for equal-specificity preview or edits', () => {
    const timeline = createRecordedTimeline();
    timeline.execute('Recorded conflicting rules', [
      { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
      { objectId: 'other', selector: '.primary', property: 'opacity', value: '0.8', frame: 1 },
    ]);
    const { designer, buttons } = setup(timeline, ({ buttons }) => { buttons[0].className = 'button primary'; });
    const diagnostic = vi.fn();
    designer.on('diagnostic', diagnostic);
    const originalKeys = timeline.getKeys();
    expect(buttons[0].style.opacity).toBe('1');
    expect(buttons[1].style.opacity).toBe('0.5');
    designer.selectTarget('.button');
    expect(designer.editProperty('opacity', '0.4').status).toBe('rejected');
    expect(diagnostic).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Conflit non résolu') }));
    expect(timeline.getKeys()).toEqual(originalKeys);
  });

  it('keeps an unresolved property suspended when a third equal-specificity selector overlaps', () => {
    const timeline = createRecordedTimeline();
    timeline.execute('Recorded three-way conflict', [
      { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
      { objectId: 'second', selector: '.primary', property: 'opacity', value: '0.8', frame: 1 },
      { objectId: 'third', selector: '.alternate', property: 'opacity', value: '0.9', frame: 1 },
    ]);
    const { buttons } = setup(timeline, ({ buttons }) => { buttons[0].className = 'button primary alternate'; });
    expect(buttons[0].style.opacity).toBe('1');
    expect(buttons[1].style.opacity).toBe('0.5');
  });

  it('prioritizes combined classes per property while leaving other group properties active', () => {
    const timeline = createRecordedTimeline();
    timeline.execute('Recorded specificity example', [
      { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
      { objectId: 'group', selector: '.button', property: 'color', value: 'red', frame: 1 },
      { objectId: 'specific', selector: '.button.primary', property: 'opacity', value: '0.9', frame: 1 },
    ]);
    const { designer, buttons } = setup(timeline, ({ buttons }) => { buttons[0].className = 'button primary'; });
    expect(buttons[0].style.opacity).toBe('0.9');
    expect(buttons[0].style.color).toBe('red');
    expect(buttons[1].style.opacity).toBe('0.5');
    designer.selectElements([buttons[1]]);
    expect(timeline.getState().selectedObjectId).toBe('group');
  });

  it('lets Test mode deliver normal content clicks and restores selection interception afterward', () => {
    const { designer, buttons } = setup();
    const hostClick = vi.fn();
    buttons[0].addEventListener('click', hostClick);
    designer.selectElements([buttons[0]]);
    expect(document.querySelectorAll('.HtmlDesignerOverlay')).toHaveLength(1);
    designer.setMode('test');
    expect(document.querySelectorAll('.HtmlDesignerOverlay')).toHaveLength(0);
    const testClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttons[0].dispatchEvent(testClick);
    expect(hostClick).toHaveBeenCalledOnce();
    expect(testClick.defaultPrevented).toBe(false);
    designer.setMode('select');
    const selectClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttons[0].dispatchEvent(selectClick);
    expect(hostClick).toHaveBeenCalledOnce();
    expect(selectClick.defaultPrevented).toBe(true);
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('scroll'));
    expect(document.querySelectorAll('.HtmlDesignerOverlay')).toHaveLength(1);
  });

  it('rejects incompatible adapter revisions before taking ownership of the scene', () => {
    const fixture = createSceneFixture();
    const timeline = createRecordedTimeline();
    const incompatible: unknown = { ...timeline, contractRevision: 'HA-TL-001/unknown' };
    expect(() => new HtmlDesigner({ ...fixture, timeline, adapter: () => incompatible as RecordedTimeline })).toThrow('Révision de contrat Timeline incompatible.');
    expect(fixture.propertiesContainer.children).toHaveLength(0);
    expect(fixture.treeContainer.children).toHaveLength(0);
    expect(timeline.listenerCount).toBe(0);
  });

  it('consumes the recorded group/ID reference samples without adding an initial key or dialogue', () => {
    const timeline = createRecordedTimeline({ reference: true });
    const originalKeys = timeline.getKeys();
    const { designer, buttons } = setup(timeline);
    const propertyChange = vi.fn();
    designer.on('propertychange', propertyChange);
    for (const frame of [1, 20, 49, 50, 75, 100]) {
      timeline.navigate(frame);
      expect(buttons.map((button) => button.style.opacity)).toEqual(['0.5', '0.8', '0.5', '0.5']);
      expect(timeline.getKeys()).toEqual(originalKeys);
    }
    expect(timeline.getKeys().filter((key) => key.objectId === 'specific')).toEqual([
      { objectId: 'specific', selector: '#button-2', property: 'opacity', value: '0.8', frame: 50 },
    ]);
    expect(document.querySelector('dialog[open], [role="dialog"]')).toBeNull();
    expect(propertyChange).not.toHaveBeenCalled();
  });

  it('restores exact inline styles, removes preview attributes and unsubscribes on disposal', () => {
    const fixture = createSceneFixture();
    fixture.buttons[0].setAttribute('style', 'opacity: 1 !important; color: red !important;');
    fixture.buttons[1].removeAttribute('style');
    const original = fixture.buttons[0].getAttribute('style');
    const timeline = createRecordedTimeline({ reference: true });
    const designer = new HtmlDesigner({ ...fixture, timeline, adapter: (instance) => instance });
    designers.push(designer);
    designer.selectTarget('.button');
    expect(fixture.buttons[0].style.opacity).toBe('0.5');
    expect(fixture.buttons[1].style.opacity).toBe('0.8');
    expect(timeline.listenerCount).toBe(1);
    designer.dispose();
    expect(fixture.buttons[0].getAttribute('style')).toBe(original);
    expect(fixture.buttons[1].hasAttribute('style')).toBe(false);
    expect(timeline.listenerCount).toBe(0);
    expect(fixture.treeContainer.querySelector('[role="tree"]')).toBeNull();
    timeline.navigate(50);
    expect(fixture.buttons[0].getAttribute('style')).toBe(original);
    expect(fixture.buttons[1].hasAttribute('style')).toBe(false);
    expect(designer.editProperty('opacity', '0.4').status).toBe('rejected');
    expect(designer.setAttribute(fixture.buttons[0], 'id', 'Closed').status).toBe('rejected');
    expect(designer.undo()).toEqual({ status: 'unchanged' });
    expect(designer.redo()).toEqual({ status: 'unchanged' });
    designer.selectElements([fixture.buttons[0]]);
    designer.selectTarget('.button');
    expect(document.querySelectorAll('.HtmlDesignerOverlay')).toHaveLength(0);
  });
});
