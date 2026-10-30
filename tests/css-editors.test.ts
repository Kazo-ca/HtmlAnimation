// tests/css-editors.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CssPropertiesPanel } from '../packages/css-properties/src/index.js';
import type { CssProperty } from '../packages/css-properties/src/index.js';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture, propertyInput } from './helpers.js';

const panels: CssPropertiesPanel[] = [];
const designers: HtmlDesigner[] = [];
afterEach(() => {
  for (const designer of designers.splice(0)) designer.dispose();
  for (const panel of panels.splice(0)) panel.destroy();
  document.body.replaceChildren();
});

function setup(properties: readonly CssProperty[]): { panel: CssPropertiesPanel; container: HTMLElement } {
  const container = document.createElement('aside'); document.body.append(container);
  const panel = new CssPropertiesPanel(container); panels.push(panel); panel.setProperties(properties);
  return { panel, container };
}

function button(container: ParentNode, name: string): HTMLButtonElement {
  const result = [...container.querySelectorAll<HTMLButtonElement>('button')].find(element => element.getAttribute('aria-label') === name || element.textContent?.trim() === name);
  if (!result) throw new Error(`Missing editor action: ${name}`); return result;
}

function options(container: ParentNode): HTMLElement[] { return [...container.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')]; }
function option(container: ParentNode, value: string): HTMLElement {
  const result = options(container).find(element => element.textContent?.trim() === value);
  if (!result) throw new Error(`Missing suggested value: ${value}`); return result;
}
function openValues(container: HTMLElement, name: string): void { button(container, `Afficher les valeurs de ${name}`).click(); }
function openEditor(container: HTMLElement, name: string): HTMLElement {
  button(container, `Modifier ${name} avec un éditeur`).click();
  const result = container.querySelector<HTMLElement>('[role="dialog"]');
  if (!result) throw new Error(`Missing structured editor for ${name}`); return result;
}
function source(dialog: HTMLElement, name: string): HTMLTextAreaElement {
  const result = [...dialog.querySelectorAll<HTMLTextAreaElement>('textarea')].find(element => element.getAttribute('aria-label') === `Valeur CSS de ${name}` || [...(element.labels ?? [])].some(label => label.textContent?.trim() === `Valeur CSS de ${name}`));
  if (!result) throw new Error(`Missing CSS draft source for ${name}`); return result;
}
function draft(dialog: HTMLElement, name: string, value: string): void {
  const textarea = source(dialog, name); textarea.value = value; textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
function field(dialog: HTMLElement, label: string): HTMLInputElement {
  const input = [...dialog.querySelectorAll<HTMLInputElement>('input')].find(element => element.getAttribute('aria-label') === label);
  if (!input) throw new Error(`Missing assistant field: ${label}`); return input;
}
function changeField(dialog: HTMLElement, label: string, value: string): void {
  const input = field(dialog, label); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
}
function borderFields(dialog: HTMLElement, width: string, style: string, color: string): void {
  changeField(dialog, 'Épaisseur de bordure', width);
  const select = dialog.querySelector<HTMLSelectElement>('select[aria-label="Style de bordure"]');
  if (!select) throw new Error('Missing border style choice.'); select.value = style; select.dispatchEvent(new Event('change', { bubbles: true }));
  changeField(dialog, 'Couleur de bordure', color);
}

describe('CSS value autocomplete without host mutation', () => {
  it('keeps a visible value menu anchored when an ancestor scroll event arrives after opening', () => {
    const { panel, container } = setup([{ name: 'border-block-start-style', value: 'none' }]); const changed = vi.fn(); panel.onChange(changed);
    const input = propertyInput(container, 'border-block-start-style');
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 40, left: 20, top: 40, right: 150, bottom: 70, width: 130, height: 30, toJSON: () => ({}) });
    openValues(container, 'border-block-start-style'); container.dispatchEvent(new Event('scroll'));
    expect(option(container, 'solid')).toBeDefined(); expect(input.getAttribute('aria-expanded')).toBe('true'); expect(changed).not.toHaveBeenCalled();
  });
  it('resolves logical border styles and CSS-wide values as selectable suggestions', () => {
    const properties = Object.freeze([Object.freeze({ name: 'border-block-start-style', value: 'none' })]);
    const { panel, container } = setup(properties); const changed = vi.fn(); panel.onChange(changed);
    expect(propertyInput(container, 'border-block-start-style').getAttribute('role')).toBe('combobox');
    openValues(container, 'border-block-start-style');
    const values = options(container).map(element => element.textContent?.trim());
    expect(values).toEqual(expect.arrayContaining(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'inherit', 'initial', 'unset', 'revert', 'revert-layer']));
    expect(changed).not.toHaveBeenCalled(); option(container, 'solid').click();
    expect(changed).toHaveBeenCalledExactlyOnceWith({ property: 'border-block-start-style', oldValue: 'none', newValue: 'solid' });
    expect(properties[0]?.value).toBe('none');
  });

  it('filters suggestions while typing and commits the keyboard choice only once', () => {
    const { panel, container } = setup([{ name: 'border-block-start-style', value: 'none' }]); const changed = vi.fn(); panel.onChange(changed);
    const input = propertyInput(container, 'border-block-start-style'); input.focus(); input.value = 'da'; input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(option(container, 'dashed')).toBeDefined(); expect(changed).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(changed).toHaveBeenCalledExactlyOnceWith({ property: 'border-block-start-style', oldValue: 'none', newValue: 'dashed' });
  });

  it('cancels suggestions with Escape without emitting or replacing the accepted value', () => {
    const { panel, container } = setup([{ name: 'border-block-start-style', value: 'solid' }]); const changed = vi.fn(); panel.onChange(changed);
    const input = propertyInput(container, 'border-block-start-style'); openValues(container, 'border-block-start-style'); input.value = 'do'; input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(input.value).toBe('solid'); expect(changed).not.toHaveBeenCalled();
    expect(container.querySelector('[role="listbox"]:not([hidden])')).toBeNull();
  });

  it('retains variables and arbitrary custom property values as free text', () => {
    const { panel, container } = setup([{ name: 'border-block-start-style', value: 'var(--border-style)' }, { name: '--custom-value', value: 'a, b(var(--nested, red))' }]);
    const changed = vi.fn(); panel.onChange(changed); openValues(container, 'border-block-start-style');
    expect(propertyInput(container, 'border-block-start-style').value).toBe('var(--border-style)'); expect(changed).not.toHaveBeenCalled();
    const input = propertyInput(container, '--custom-value'); input.value = 'c(var(--nested, "quoted, item"))'; input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changed).toHaveBeenLastCalledWith({ property: '--custom-value', oldValue: 'a, b(var(--nested, red))', newValue: 'c(var(--nested, "quoted, item"))' });
  });

  it('invalidates old suggestion handlers on a silent host refresh and destroy', () => {
    const { panel, container } = setup([{ name: 'border-block-start-style', value: 'none' }]); const changed = vi.fn(); panel.onChange(changed);
    openValues(container, 'border-block-start-style'); const stale = option(container, 'solid'); const staleInput = propertyInput(container, 'border-block-start-style');
    panel.setProperties([{ name: 'border-block-start-style', value: 'dashed' }]);
    stale.click(); staleInput.value = 'dotted'; staleInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changed).not.toHaveBeenCalled(); expect(propertyInput(container, 'border-block-start-style').value).toBe('dashed');
    openValues(container, 'border-block-start-style'); const detached = option(container, 'solid'); panel.destroy(); detached.click();
    expect(changed).not.toHaveBeenCalled(); expect(container.children).toHaveLength(0);
  });

  it('honors a synchronous host refusal and closes the obsolete suggestion popup', () => {
    const { panel, container } = setup([{ name: 'border-block-start-style', value: 'solid' }]);
    const changed = vi.fn(() => panel.setProperties([{ name: 'border-block-start-style', value: 'solid' }])); panel.onChange(changed);
    openValues(container, 'border-block-start-style'); option(container, 'dashed').click();
    expect(changed).toHaveBeenCalledOnce(); expect(propertyInput(container, 'border-block-start-style').value).toBe('solid');
    expect(container.querySelector('[role="listbox"]:not([hidden])')).toBeNull();
  });

  it('does not activate suggestion or structured actions for disabled properties', () => {
    const { panel, container } = setup([{ name: 'border-block-start-style', value: 'none', disabled: true }, { name: 'border', value: '1px solid red', disabled: true }]);
    const changed = vi.fn(); panel.onChange(changed);
    expect(button(container, 'Afficher les valeurs de border-block-start-style').disabled).toBe(true);
    button(container, 'Afficher les valeurs de border-block-start-style').click();
    expect(button(container, 'Modifier border avec un éditeur').disabled).toBe(true); button(container, 'Modifier border avec un éditeur').click();
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(container.querySelector('[role="listbox"]:not([hidden])')).toBeNull(); expect(changed).not.toHaveBeenCalled();
  });
});

const families = [
  { name: 'color', value: 'rgba(10, 20, 30, 0.4)' },
  { name: 'padding', value: 'calc(1rem + 2px) 10%' },
  { name: 'border', value: '1px solid rgb(10, 20, 30)' },
  { name: 'border-radius', value: '4px 8px / 12px 16px' },
  { name: 'box-shadow', value: '1px 2px 3px rgba(0, 0, 0, 0.2), inset 0 0 2px red' },
  { name: 'transform', value: 'translate(calc(10% + 1px), 2px) rotate(20deg)' },
  { name: 'background-image', value: 'linear-gradient(45deg, rgba(1, 2, 3, 0.4), blue)' },
  { name: 'background', value: 'linear-gradient(red, blue) center / cover no-repeat' },
  { name: 'font', value: 'italic 16px/1.5 "Open Sans", sans-serif' },
];

describe('structured CSS drafts', () => {
  for (const property of families) it(`opens ${property.name} without rewriting nested or quoted source and cancels silently`, () => {
    const { panel, container } = setup([property]); const changed = vi.fn(); panel.onChange(changed);
    const dialog = openEditor(container, property.name);
    expect(dialog.getAttribute('aria-label')).toBe(`Éditer ${property.name}`); expect(source(dialog, property.name).value).toBe(property.value);
    button(dialog, 'Annuler').click(); expect(changed).not.toHaveBeenCalled();
    expect(propertyInput(container, property.name).value).toBe(property.value); expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('commits one complete property value after a draft and remains controlled by the host', () => {
    const properties = Object.freeze([Object.freeze({ name: 'border', value: '1px solid red' })]);
    const { panel, container } = setup(properties); const changed = vi.fn(); panel.onChange(changed);
    const dialog = openEditor(container, 'border'); draft(dialog, 'border', '2px dashed blue');
    expect(changed).not.toHaveBeenCalled(); expect(propertyInput(container, 'border').value).toBe('1px solid red');
    button(dialog, 'Appliquer').click();
    expect(changed).toHaveBeenCalledExactlyOnceWith({ property: 'border', oldValue: '1px solid red', newValue: '2px dashed blue' });
    expect(properties[0]?.value).toBe('1px solid red'); expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('discards a changed draft on Escape and emits nothing for an unchanged apply', () => {
    const { panel, container } = setup([{ name: 'border', value: '1px solid red' }]); const changed = vi.fn(); panel.onChange(changed);
    const dialog = openEditor(container, 'border'); draft(dialog, 'border', '3px double blue');
    source(dialog, 'border').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(changed).not.toHaveBeenCalled();
    button(openEditor(container, 'border'), 'Appliquer').click(); expect(changed).not.toHaveBeenCalled();
  });

  it('invalidates a pending editor on host refresh, including a stale Apply button', () => {
    const { panel, container } = setup([{ name: 'border', value: '1px solid red' }]); const changed = vi.fn(); panel.onChange(changed);
    const dialog = openEditor(container, 'border'); draft(dialog, 'border', '2px dashed blue'); const stale = button(dialog, 'Appliquer');
    panel.setProperties([{ name: 'border', value: '4px solid green' }]); stale.click();
    expect(changed).not.toHaveBeenCalled(); expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(propertyInput(container, 'border').value).toBe('4px solid green');
  });

  it('combines border assistant field changes into one applied event', () => {
    const { panel, container } = setup([{ name: 'border', value: '1px solid red' }]); const changed = vi.fn(); panel.onChange(changed);
    const dialog = openEditor(container, 'border'); borderFields(dialog, '3px', 'double', 'blue');
    expect(source(dialog, 'border').value).toBe('3px double blue'); expect(changed).not.toHaveBeenCalled();
    expect(propertyInput(container, 'border').value).toBe('1px solid red'); button(dialog, 'Appliquer').click();
    expect(changed).toHaveBeenCalledExactlyOnceWith({ property: 'border', oldValue: '1px solid red', newValue: '3px double blue' });
  });

  it('edits alpha through its numeric assistant and discards the draft without normalization', () => {
    const value = 'rgba(10, 20, 30, 0.75)'; const { panel, container } = setup([{ name: 'color', value }]); const changed = vi.fn(); panel.onChange(changed);
    const dialog = openEditor(container, 'color'); changeField(dialog, 'Opacité de la couleur', '0.25');
    expect(source(dialog, 'color').value).toBe('rgba(10, 20, 30, 0.25)'); expect(changed).not.toHaveBeenCalled();
    button(dialog, 'Annuler').click(); expect(propertyInput(container, 'color').value).toBe(value); expect(changed).not.toHaveBeenCalled();
  });

  it('retains literal variables and nested fallback components through open, cancel and unchanged apply', () => {
    const value = 'var(--accent-border, 1px solid rgb(1, 2, 3))'; const { panel, container } = setup([{ name: 'border', value }]); const changed = vi.fn(); panel.onChange(changed);
    let dialog = openEditor(container, 'border'); expect(source(dialog, 'border').value).toBe(value); button(dialog, 'Annuler').click();
    expect(propertyInput(container, 'border').value).toBe(value); dialog = openEditor(container, 'border'); button(dialog, 'Appliquer').click();
    expect(changed).not.toHaveBeenCalled(); expect(propertyInput(container, 'border').value).toBe(value);
  });
});

describe('Designer history with CSS assistants and a recorded Timeline simulation', () => {
  it('records one logical border dropdown change and undo restores the original preview and keys', () => {
    const fixture = createSceneFixture(); for (const element of fixture.buttons) element.style.setProperty('border-block-start-style', 'solid');
    const timeline = createRecordedTimeline(); const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer); designer.selectTarget('#button-1');
    const changed = vi.fn(); const documentChanged = vi.fn(); designer.on('propertychange', changed); designer.on('documentchange', documentChanged);
    openValues(fixture.propertiesContainer, 'border-block-start-style'); option(fixture.propertiesContainer, 'dashed').click();
    expect(timeline.getKeys()).toHaveLength(1); expect(fixture.buttons[0].style.getPropertyValue('border-block-start-style')).toBe('dashed');
    expect(fixture.buttons[1].style.getPropertyValue('border-block-start-style')).toBe('solid'); expect(changed).toHaveBeenCalledOnce(); expect(documentChanged).not.toHaveBeenCalled();
    designer.undo(); expect(timeline.getKeys()).toHaveLength(0); expect(fixture.buttons[0].style.getPropertyValue('border-block-start-style')).toBe('solid');
    expect(timeline.getState().objects).toHaveLength(0);
  });

  it('records a structured border as one undoable command without changing sibling source values', () => {
    const fixture = createSceneFixture(); for (const element of fixture.buttons) element.style.border = '1px solid red';
    const timeline = createRecordedTimeline(); const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer); designer.selectTarget('#button-1');
    const before = fixture.buttons.map(element => element.getAttribute('style')); const changed = vi.fn(); const documentChanged = vi.fn(); designer.on('propertychange', changed); designer.on('documentchange', documentChanged);
    const dialog = openEditor(fixture.propertiesContainer, 'border'); borderFields(dialog, '2px', 'dashed', 'blue');
    expect(timeline.getKeys()).toHaveLength(0); button(dialog, 'Appliquer').click();
    expect(timeline.getKeys()).toHaveLength(1); expect(fixture.buttons[0].style.border).toBe('2px dashed blue'); expect(fixture.buttons[1].getAttribute('style')).toBe(before[1]);
    expect(changed).toHaveBeenCalledOnce(); expect(documentChanged).not.toHaveBeenCalled(); designer.undo();
    expect(timeline.getKeys()).toHaveLength(0); expect(fixture.buttons.map(element => element.getAttribute('style'))).toEqual(before); expect(timeline.getState().objects).toHaveLength(0);
  });

  it('cancels an uncommitted CSS draft on frame or selection changes without history effects', () => {
    const fixture = createSceneFixture(); for (const element of fixture.buttons) element.style.border = '1px solid red';
    const timeline = createRecordedTimeline(); const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer); designer.selectTarget('#button-1');
    let dialog = openEditor(fixture.propertiesContainer, 'border'); draft(dialog, 'border', '2px dashed blue'); timeline.navigate(20);
    expect(fixture.propertiesContainer.querySelector('[role="dialog"]')).toBeNull(); expect(timeline.getKeys()).toHaveLength(0);
    dialog = openEditor(fixture.propertiesContainer, 'border'); draft(dialog, 'border', '3px dotted green'); designer.selectElements([fixture.buttons[1]]);
    expect(fixture.propertiesContainer.querySelector('[role="dialog"]')).toBeNull(); expect(timeline.getKeys()).toHaveLength(0); expect(timeline.getState().canUndo).toBe(false);
    expect(fixture.buttons[0].style.border).toBe('1px solid red');
  });
});
