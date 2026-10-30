// tests/css-complex-models.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createComplexEditor } from '../packages/css-properties/src/complex-editors.js';
import { splitCssValue } from '../packages/css-properties/src/editors/css-value.js';
import type { CssEditorKind } from '../packages/css-properties/src/catalog.js';

const editors: ReturnType<typeof createComplexEditor>[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); document.body.replaceChildren(); });

function setup(kind: CssEditorKind, value: string, property: string = kind): { root: HTMLElement; apply: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
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
  it('retains nested blocks and escaped separators', () => { expect(splitCssValue('a[b,c] d{e,f}, tail', ',')).toEqual(['a[b,c] d{e,f}', 'tail']); expect(splitCssValue('first\\ second third', 'space')).toEqual(['first\\ second', 'third']); });
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
  it('uses two components for a logical box shorthand rather than four physical sides', () => { const { root, apply } = setup('box', '1px 2px', 'margin-block'); set(root, 'Fin logique', '8px'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('1px 8px'); });
  it('uses a single horizontal and vertical pair for an individual corner', () => { const { root, apply } = setup('radius', '10px 20%', 'border-top-left-radius'); set(root, 'Rayon vertical', '30%'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('10px 30%'); });
  it('keeps background longhands in the structural editor without inventing a full shorthand', () => { const { root, apply } = setup('background', '10px 20%', 'background-position'); set(root, 'Composante 1 du calque 1', '15px'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('15px 20%'); });
  it('does not offer units for an intrinsically unitless number', () => { const { root } = setup('number', '0.4', 'opacity'); expect(root.querySelector('[aria-label="Unité"]')).toBeNull(); });
  for (const [kind, property, value] of [['font', 'font-family', '"Arial", sans-serif'], ['transform', 'filter', 'blur(0px) brightness(1)'], ['transform', 'rotate', '0deg'], ['radius', 'border-top-left-radius', '8px 8px'], ['shadow', 'text-shadow', '0px 2px 8px rgba(0, 0, 0, 0.25)'], ['background', 'background-repeat', 'no-repeat'], ['structured', 'grid-template-areas', 'initial']] as const) it(`offers a ${property} template appropriate to its own grammar`, () => {
    const { root, apply } = setup(kind, 'var(--source)', property); click(root, 'Utiliser ce modèle'); expect(apply).not.toHaveBeenCalled(); expect(field(root, `Valeur CSS de ${property}`).value).toBe(value); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith(value);
  });
  it('edits an elliptical corner independently', () => { const { root, apply } = setup('radius', '10px 20px / 30% 40%'); set(root, 'Rayon vertical haut gauche', '50%'); click(root, 'Appliquer'); expect(apply.mock.calls[0]?.[0]).toBe('10px 20px 10px 20px / 50% 40% 30% 40%'); });
  it('adds and removes shadow layers as a local draft', () => { const { root, apply } = setup('shadow', '1px 2px 3px red'); click(root, 'Ajouter une ombre'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(splitCssValue(String(apply.mock.calls[0]?.[0]), ',')).toHaveLength(2); });
  it('adds a gradient stop without writing until apply', () => { const { root, apply } = setup('gradient', 'linear-gradient(90deg, red 0%, blue 100%)'); click(root, 'Ajouter un point'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(String(apply.mock.calls[0]?.[0])).toContain('linear-gradient('); expect(splitCssValue(String(apply.mock.calls[0]?.[0]).slice(16, -1), ',')).toHaveLength(4); });
  it('keeps transform order and nested arguments when editing one function', () => { const { root, apply } = setup('transform', 'translate(1px, calc(2px + 3%)) rotate(20deg)'); set(root, 'Argument 1 de rotate 2', '40deg'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('translate(1px, calc(2px + 3%)) rotate(40deg)'); });
  it('edits a font size while preserving a quoted family containing a comma', () => { const { root, apply } = setup('font', 'italic 700 16px/1.5 "A, B", serif', 'font'); set(root, 'Taille de police', '20px'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('italic 700 20px/1.5 "A, B", serif'); });
  it('provides component and layer controls for arbitrary composite values', () => { const { root, apply } = setup('structured', 'repeat(3, minmax(0, 1fr))'); expect(root.querySelector('[data-complex-components]')).not.toBeNull(); click(root, 'Ajouter une composante'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(String(apply.mock.calls[0]?.[0])).toContain('repeat(3, minmax(0, 1fr))'); });
  it('does not mutate from detached controls after destroy', () => { const { root, apply } = setup('border', '1px solid red'); const editor = editors.at(-1); editor?.destroy(); set(root, 'Valeur CSS de border', '3px solid blue'); click(root, 'Appliquer'); expect(apply).not.toHaveBeenCalled(); });
  it('keeps an unchanged apply silent and focuses the CSS source', () => { const { root, apply, close } = setup('box', '1px'); editors.at(-1)?.focus(); expect(document.activeElement).toBe(field(root, 'Valeur CSS de box')); click(root, 'Appliquer'); expect(apply).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce(); });
  it('invalidates old component controls after manual CSS edits and explicitly rebuilds them', () => {
    const { root, apply } = setup('border', '1px solid red'); const old = field(root, 'Épaisseur de bordure'); set(root, 'Valeur CSS de border', '2px dotted blue');
    old.value = '99px'; old.dispatchEvent(new Event('input', { bubbles: true })); expect(field(root, 'Valeur CSS de border').value).toBe('2px dotted blue');
    click(root, 'Actualiser les contrôles'); set(root, 'Épaisseur de bordure', '3px'); set(root, 'Couleur de bordure', 'green'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('3px dotted green');
  });
  it('changes dimensions through number and unit controls', () => { const { root, apply } = setup('dimension', '2px', 'width'); set(root, 'Nombre', '3.5'); set(root, 'Unité', 'em'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('3.5em'); });
  it('changes a color picker while retaining its existing alpha', () => { const { root, apply } = setup('color', '#1234'); set(root, 'Couleur', '#ff0000'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('rgba(255, 0, 0, 0.2667)'); });
  it('edits an origin coordinate without creating a four-value box shorthand', () => { const { root, apply } = setup('box', '10px 20px', 'transform-origin'); set(root, 'Axe Z', '3px'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('10px 20px 3px'); });
  it('edits independent horizontal elliptical radii', () => { const { root, apply } = setup('radius', '10px / 20px'); set(root, 'Rayon horizontal haut gauche', '5px'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('5px 10px 10px 10px / 20px 20px 20px 20px'); });
  it('reorders shadow layers and edits their offsets, inset and alpha without writing early', () => {
    const { root, apply } = setup('shadow', '1px 2px 3px red, 4px 5px 6px blue'); click(root, 'Descendre cette ombre'); expect(field(root, 'Valeur CSS de shadow').value).toMatch(/^4px 5px 6px/);
    set(root, 'Décalage X de l’ombre 1', '8px'); const inset = field(root, 'Ombre intérieure 1'); if (!(inset instanceof HTMLInputElement)) throw new Error('Expected inset checkbox'); inset.checked = true; inset.dispatchEvent(new Event('change', { bubbles: true }));
    set(root, 'Opacité de l’ombre 1', '0.5'); expect(apply).not.toHaveBeenCalled(); click(root, 'Supprimer cette ombre'); click(root, 'Ajouter une ombre'); click(root, 'Monter cette ombre'); click(root, 'Appliquer'); expect(String(apply.mock.calls[0]?.[0])).toContain('1px 2px 3px');
  });
  it('creates and edits ordered transform functions', () => {
    const { root, apply } = setup('transform', 'none', 'transform'); set(root, 'Nouvelle fonction', 'rotate'); click(root, 'Ajouter une fonction'); set(root, 'Argument 1 de rotate 1', '30deg');
    set(root, 'Nouvelle fonction', 'scale'); click(root, 'Ajouter une fonction'); click(root, 'Descendre cette fonction'); expect(field(root, 'Valeur CSS de transform').value).toMatch(/^scale\(/);
    set(root, 'Fonction 1', 'translate'); set(root, 'Argument 1 de translate 1', '5px'); click(root, 'Monter cette fonction'); click(root, 'Supprimer cette fonction'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith('rotate(30deg)');
  });
  it('edits gradient type, geometry, opacity, points and image layers as one draft', () => {
    const { root, apply } = setup('gradient', 'linear-gradient(90deg, red 0%, blue 100%)'); set(root, 'Type de dégradé 1', 'conic-gradient'); set(root, 'Géométrie du dégradé 1', 'from 20deg at center');
    const repeat = field(root, 'Répéter le dégradé 1'); if (!(repeat instanceof HTMLInputElement)) throw new Error('Expected repeat checkbox'); repeat.checked = true; repeat.dispatchEvent(new Event('change', { bubbles: true }));
    set(root, 'Opacité du point 1', '0.4'); set(root, 'Position du point 1', '10deg'); click(root, 'Ajouter un point'); click(root, 'Descendre ce point'); click(root, 'Monter ce point'); click(root, 'Supprimer ce point');
    click(root, 'Ajouter un dégradé'); click(root, 'Descendre cette image'); click(root, 'Monter cette image'); click(root, 'Supprimer cette image'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledOnce();
  });
  it('edits a quoted font stack and shorthand fields without splitting quoted commas', () => {
    const stack = setup('font', '"A, B", serif', 'font-family'); set(stack.root, 'Famille 1', '"Open Sans"'); click(stack.root, 'Ajouter une famille'); click(stack.root, 'Descendre cette famille'); click(stack.root, 'Monter cette famille'); click(stack.root, 'Supprimer cette famille'); click(stack.root, 'Appliquer'); expect(String(stack.apply.mock.calls[0]?.[0])).toContain('"Open Sans"');
    const font = setup('font', 'italic 700 16px/1.5 "A, B", serif', 'font'); set(font.root, 'Style de police', 'normal'); set(font.root, 'Graisse', '400'); set(font.root, 'Variantes et chasse', 'small-caps'); set(font.root, 'Hauteur de ligne', '2'); set(font.root, 'Familles de police', 'serif'); click(font.root, 'Appliquer'); expect(font.apply).toHaveBeenCalledExactlyOnceWith('normal 400 small-caps 16px/2 serif');
  });
  it('preserves the background color while reordering and removing image layers', () => {
    const { root, apply } = setup('background', 'url("first.png") left top / cover no-repeat, url("second.png") center / contain repeat red', 'background');
    click(root, 'Descendre ce fond'); expect(field(root, 'Valeur CSS de background').value).toMatch(/red$/); click(root, 'Supprimer ce fond'); expect(field(root, 'Valeur CSS de background').value).toMatch(/red$/);
    set(root, 'Position du fond 1', 'right bottom'); set(root, 'Taille du fond 1', '50%'); set(root, 'Répétition du fond 1', 'round'); set(root, 'Attachement du fond 1', 'fixed'); set(root, 'Origine et découpe du fond 1', 'padding-box border-box'); set(root, 'Couleur du fond', 'blue');
    click(root, 'Ajouter un fond'); click(root, 'Monter ce fond'); expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer'); expect(String(apply.mock.calls[0]?.[0])).toContain('right bottom / 50% round fixed padding-box border-box blue');
  });
  it('edits structural function names and arguments without using a stale function name', () => {
    const { root, apply } = setup('structured', 'mystery(1, calc(2px + 3px))'); set(root, 'Fonction 1 du calque 1', 'other'); set(root, 'Argument 1 de la composante 1', '2'); click(root, 'Ajouter une composante'); click(root, 'Descendre la composante'); click(root, 'Monter la composante'); click(root, 'Supprimer la composante'); click(root, 'Ajouter un calque'); click(root, 'Descendre le calque'); click(root, 'Monter le calque'); click(root, 'Supprimer le calque'); click(root, 'Appliquer'); expect(apply).toHaveBeenCalledOnce();
  });
  for (const property of ['rotate', 'translate', 'scale']) it(`keeps ${property}: none out of the transform-function assistant`, () => {
    const { root, apply } = setup('transform', 'none', property);
    expect(root.querySelector('[aria-label="Nouvelle fonction"]')).toBeNull();
    set(root, 'Composante 1 du calque 1', property === 'rotate' ? '20deg' : property === 'translate' ? '10px 20px' : '2');
    click(root, 'Appliquer'); expect(apply).toHaveBeenCalledExactlyOnceWith(property === 'rotate' ? '20deg' : property === 'translate' ? '10px 20px' : '2');
  });
  it('preserves unfamiliar background color tokens through conservative structural edits', () => {
    const { root, apply } = setup('background', 'skyblue center / cover no-repeat', 'background');
    expect(root.querySelector('[aria-label="Position du fond 1"]')).toBeNull();
    set(root, 'Composante 2 du calque 1', 'right center'); click(root, 'Appliquer');
    expect(apply).toHaveBeenCalledExactlyOnceWith('skyblue right center / cover no-repeat');
  });
  it('distinguishes an oblique font angle from its size and preserves their adjacency', () => {
    const { root, apply } = setup('font', 'oblique 20deg 700 16px serif', 'font');
    expect(field(root, 'Taille de police').value).toBe('16px');
    set(root, 'Taille de police', '24px'); set(root, 'Graisse', '500'); click(root, 'Appliquer');
    expect(apply).toHaveBeenCalledExactlyOnceWith('oblique 20deg 500 24px serif');
  });
  it('preserves gradient interpolation geometry while editing and adding actual color stops', () => {
    const { root, apply } = setup('gradient', 'linear-gradient(in oklab, red 0%, blue 100%)');
    expect(field(root, 'Géométrie du dégradé 1').value).toBe('in oklab');
    expect(root.querySelector('[aria-label="Position du point 3"]')).toBeNull();
    set(root, 'Position du point 1', '10%'); expect(field(root, 'Valeur CSS de gradient').value).toBe('linear-gradient(in oklab, red 10%, blue 100%)');
    click(root, 'Ajouter un point'); expect(field(root, 'Valeur CSS de gradient').value).toBe('linear-gradient(in oklab, red 10%, rgba(128, 128, 128, 1) 50%, blue 100%)'); click(root, 'Supprimer ce point');
    expect(apply).not.toHaveBeenCalled(); click(root, 'Appliquer');
    expect(apply).toHaveBeenCalledExactlyOnceWith('linear-gradient(in oklab, rgba(128, 128, 128, 1) 50%, blue 100%)');
  });
  it('does not interpret clearing opacity as an explicit zero or emit an unchanged draft', () => {
    const { root, apply } = setup('color', 'rgba(20, 40, 60, 0.4)');
    set(root, 'Opacité de la couleur', ''); expect(field(root, 'Valeur CSS de color').value).toBe('rgba(20, 40, 60, 0.4)');
    click(root, 'Appliquer'); expect(apply).not.toHaveBeenCalled();
  });
});
