// packages/css-properties/src/editors/shadows.ts
import { colorFields } from './color.js';
import { CSS_LENGTH, moveItem, replaceAt, splitCssValue } from './css-value.js';
import { button, field, group, toggle } from './fields.js';
import type { EditorContext } from './fields.js';
interface Shadow { readonly inset: boolean; readonly sizes: readonly string[]; readonly color: string }
function readShadow(value: string, text: boolean): Shadow | null {
  const tokens = splitCssValue(value, 'space'); if (!tokens) return null;
  const sizes = tokens.filter(token => CSS_LENGTH.test(token) || /^(?:calc|min|max|clamp)\(/.test(token));
  const inset = tokens.includes('inset'); const colors = tokens.filter(token => token !== 'inset' && !sizes.includes(token));
  if (sizes.length < 2 || sizes.length > (text ? 3 : 4) || colors.length > 1 || (text && inset)) return null;
  return { inset, sizes: [...sizes, ...Array.from({ length: (text ? 3 : 4) - sizes.length }, () => '0')], color: colors[0] ?? 'currentColor' };
}
function writeShadow(value: Shadow): string { return `${value.inset ? 'inset ' : ''}${value.sizes.join(' ')} ${value.color}`; }
export function renderShadows(context: EditorContext): boolean {
  const text = context.property === 'text-shadow'; const layers = context.value.trim() === 'none' ? [] : splitCssValue(context.value, ','); if (!layers) return false;
  const parsed = layers.map(layer => readShadow(layer, text)); if (parsed.some(layer => !layer)) return false;
  let shadows = parsed.filter((layer): layer is Shadow => layer !== null);
  const update = (index: number, value: Shadow): void => { shadows = [...replaceAt(shadows, index, value)]; context.update(shadows.map(writeShadow).join(', ') || 'none'); };
  for (const [index, initial] of shadows.entries()) {
    const ui = group(context, `Ombre ${index + 1}`); let shadow = initial;
    for (const [axis, label] of ['Décalage X', 'Décalage Y', 'Flou', ...(text ? [] : ['Étalement'])].entries()) field(ui, `${label} de l’ombre ${index + 1}`, shadow.sizes[axis] ?? '0', value => { shadow = { ...shadow, sizes: replaceAt(shadow.sizes, axis, value) }; update(index, shadow); });
    if (!text) toggle(ui, `Ombre intérieure ${index + 1}`, shadow.inset, inset => { shadow = { ...shadow, inset }; update(index, shadow); });
    colorFields(ui, shadow.color, color => { shadow = { ...shadow, color }; update(index, shadow); }, `l’ombre ${index + 1}`);
    button(ui, 'Supprimer cette ombre', () => context.update(shadows.filter((_, current) => current !== index).map(writeShadow).join(', ') || 'none', true));
    button(ui, 'Monter cette ombre', () => context.update(moveItem(shadows, index, -1).map(writeShadow).join(', '), true));
    button(ui, 'Descendre cette ombre', () => context.update(moveItem(shadows, index, 1).map(writeShadow).join(', '), true));
  }
  button(context, 'Ajouter une ombre', () => context.update([...shadows, { inset: false, sizes: text ? ['0px', '2px', '4px'] : ['0px', '2px', '4px', '0px'], color: 'rgba(0, 0, 0, 0.3)' }].map(writeShadow).join(', '), true)); return true;
}
