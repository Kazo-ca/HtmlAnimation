// tests/css-complex-models.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createComplexEditor } from '../packages/css-properties/src/complex-editors.js';
import { splitCssValue } from '../packages/css-properties/src/editors/css-value.js';
import type { CssEditorKind } from '../packages/css-properties/src/catalog.js';

const editors: ReturnType<typeof createComplexEditor>[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); document.body.replaceChildren(); });

function setup(kind: CssEditorKind, value: string, property = kind): { root: HTMLElement; apply: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  const apply = vi.fn(); const close = vi.fn(); const editor = createComplexEditor(document, { property, value, kind, onApply: apply, onClose: close });
  editors.push(editor); document.body.append(editor.element); return { root: editor.element, apply, close };
}
function field(root: HTMLElement, name: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const result = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')].find(input => input.getAttribute('aria-label') === name);
  if (!result) throw new Error(`Missing editor field ${name}`); return result;
}
function set(root: HTMLElement, name: string, value: string): void { const input = field(root, name); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
function click(root: HTMLElement, text: string): void { const button = [...root.querySelectorAll('button')].find(button => button.textContent === text); if (!button) throw new Error(`Missing editor action ${text}`); button.click(); }

describe('balanced CSS value components', () => {
  it('splits layers without splitting nested colors, functions, strings or comments', () => {
    expect(splitCssValue('linear-gradient(90deg, rgb(1, 2, 3), var(--end, blue)), url("a,b.png")', ',')).toEqual(['linear-gradient(90deg, rgb(1, 2, 3), var(--end, blue))', 'url("a,b.png")']);
    expect(splitCssValue('1px calc(2px + var(--gap, 1px)) /* keep, comment */ "a b"', 'space')).toEqual(['1px', 'calc(2px + var(--gap, 1px))', '/* keep, comment */', '"a b"']);
    expect(splitCssValue('"A, \\"B\\"" , serif', ',')).toHaveLength(2);
  });
  it('rejects unbalanced input instead of inventing a decomposition', () => { for (const value of ['rgb(1, 2', '"unfinished', '1px /* open', 'value)']) expect(splitCssValue(value, ',')).toBeNull(); });
});

describe('controlled complex CSS editor drafts', () => {
  for (const [kind, value] of [
    ['color', 'rgba(20, 40, 60, 0.4)'], ['dimension', 'calc(100% - var(--gap, 2px))'], ['box', '1px 2px 3px 4px'],
    ['border', '1px solid rgb(20, 40, 60)'], ['radius', '10px 20px / 30% 40%'], ['shadow', '1px 2px 3px rgba(1, 2, 3, .4), inset 0 0 2px red'],
    ['gradient', 'linear-gradient(90deg, rgba(1, 2, 3, .4) 0%, blue 100%)'], ['transform', 'translate(1px, calc(2px + 3%)) rotate(20deg)'],
    ['font', 'italic 700 16px/1.5 "A, B", serif'], ['background', 'url("a,b.png") center / cover no-repeat, red'], ['structured', 'repeat(3, minmax(0, 1fr))'],
  ] as const) it(`opens and cancels ${kind} without normalizing the source or emitting a mutation`, () => {
    const { root, apply, close } = setup(kind, value); expect(root.getAttribute('role')).toBe('dialog'); expect(root.getAttribute('aria-label')).toBe(`Éditer ${kind}`);
    expect(field(root, `Valeur CSS de ${kind}`).value).toBe(value); expect(apply).not.toHaveBeenCalled(); click(root, 'Annuler'); expect(apply).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
  });
  it('applies one complete CSS value and supports Escape cancellation and disabled controls', () => {
    const { root, apply } = setup('border', '1px solid red'); set(root, 'Valeur CSS de border', '2px dashed blue'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('2px dashed blue');
    const second = setup('structured', 'var(--raw, calc(1px + 2px))'); second.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(second.apply).not.toHaveBeenCalled(); expect(second.close).toHaveBeenCalledOnce();
    const onApply = vi.fn(); const disabled = createComplexEditor(document, { property: 'border', value: '1px solid red', kind: 'border', disabled: true, onApply, onClose: vi.fn() }); editors.push(disabled); document.body.append(disabled.element); click(disabled.element, 'Appliquer'); expect(onApply).not.toHaveBeenCalled();
  });
  it('edits the alpha channel through a numeric control', () => { const { root, apply } = setup('color', 'rgba(20, 40, 60, 0.4)'); set(root, 'Opacité de la couleur', '0.7'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('rgba(20, 40, 60, 0.7)'); });
  it('edits box sides while retaining nested expressions', () => { const { root, apply } = setup('box', 'calc(1px + 2%) 2px'); set(root, 'Côté gauche', '8px'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('calc(1px + 2%) 2px calc(1px + 2%) 8px'); });
  it('edits a border style independently of its width and color', () => { const { root, apply } = setup('border', '1px solid rgb(20, 40, 60)'); set(root, 'Style de bordure', 'dashed'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('1px dashed rgb(20, 40, 60)'); });
  it('edits an elliptical corner independently', () => { const { root, apply } = setup('radius', '10px 20px / 30% 40%'); set(root, 'Rayon vertical haut gauche', '50%'); click(root, 'Appliquer'); expect(apply.mock.calls[0]?.[0]).toBe('10px 20px 10px 20px / 50% 40% 30% 40%'); });
  it('adds and removes shadow layers as a local draft', () => { const { root, apply } = setup('shadow', '1px 2px 3px red'); click(root, 'Ajouter une ombre'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(splitCssValue(String(apply.mock.calls[0]?.[0]), ',')).toHaveLength(2); });
  it('adds a gradient stop without writing until apply', () => { const { root, apply } = setup('gradient', 'linear-gradient(90deg, red 0%, blue 100%)'); click(root, 'Ajouter un point'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(String(apply.mock.calls[0]?.[0])).toContain('linear-gradient('); expect(splitCssValue(String(apply.mock.calls[0]?.[0]).slice(16, -1), ',')).toHaveLength(4); });
  it('keeps transform order and nested arguments when editing one function', () => { const { root, apply } = setup('transform', 'translate(1px, calc(2px + 3%)) rotate(20deg)'); set(root, 'Argument 1 de rotate 2', '40deg'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('translate(1px, calc(2px + 3%)) rotate(40deg)'); });
  it('edits a font size while preserving a quoted family containing a comma', () => { const { root, apply } = setup('font', 'italic 700 16px/1.5 "A, B", serif', 'font'); set(root, 'Taille de police', '20px'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('italic 700 20px/1.5 "A, B", serif'); });
  it('provides component and layer controls for arbitrary composite values', () => { const { root, apply } = setup('structured', 'repeat(3, minmax(0, 1fr))'); expect(root.querySelector('[data-complex-components]')).not.toBeNull(); click(root, 'Ajouter une composante'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(String(apply.mock.calls[0]?.[0])).toContain('repeat(3, minmax(0, 1fr))'); });
  it('does not mutate from detached controls after destroy', () => { const { root, apply } = setup('border', '1px solid red'); const editor = editors.at(-1); editor?.destroy(); set(root, 'Valeur CSS de border', '3px solid blue'); click(root, 'Appliquer'); expect(apply).not.toHaveBeenCalled(); });
});
