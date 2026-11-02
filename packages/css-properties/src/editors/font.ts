// packages/css-properties/src/editors/font.ts
import { moveItem, replaceAt, splitCssValue } from './css-value.js';
import { button, choice, field, group } from './fields.js';
import type { EditorContext } from './fields.js';
const SIZES = ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger'];
const FONT_SIZE = /^(?:0|[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:%|px|cm|mm|q|in|pt|pc|(?:r)?(?:em|ex|cap|ch|ic|lh)|(?:[sld])?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max)))$/i;
const FONT_ANGLE = /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:deg|grad|rad|turn)$/i;
function families(context: EditorContext): boolean {
  let names = splitCssValue(context.value, ','); if (!names?.length) return false;
  for (const [index, name] of names.entries()) {
    const ui = group(context, `Police ${index + 1}`);
    field(ui, `Famille ${index + 1}`, name, value => { if (names) { names = replaceAt(names, index, value); context.update(names.join(', ')); } });
    button(ui, 'Supprimer cette famille', () => context.update(names?.filter((_, current) => current !== index).join(', ') || 'serif', true));
    button(ui, 'Monter cette famille', () => { if (names) context.update(moveItem(names, index, -1).join(', '), true); });
    button(ui, 'Descendre cette famille', () => { if (names) context.update(moveItem(names, index, 1).join(', '), true); });
  }
  button(context, 'Ajouter une famille', () => context.update([...(names ?? []), 'sans-serif'].join(', '), true)); return true;
}
export function renderFont(context: EditorContext): boolean {
  if (context.property === 'font-family') return families(context);
  if (context.property !== 'font' && context.property !== 'font-synthesis') return false;
  const slash = splitCssValue(context.value, '/'); if (!slash?.length || slash.length > 2) return false;
  const tokens = splitCssValue(slash[0] ?? '', 'space'); if (!tokens) return false;
  const sizeIndex = tokens.findIndex(token => SIZES.includes(token) || FONT_SIZE.test(token));
  if (sizeIndex < 0) return false;
  const before = tokens.slice(0, sizeIndex); const after = slash.length > 1 ? splitCssValue(slash[1] ?? '', 'space') : tokens.slice(sizeIndex + 1); if (!after?.length) return false;
  const styleIndex = before.findIndex(token => ['italic', 'oblique'].includes(token));
  const angle = before[styleIndex] === 'oblique' && FONT_ANGLE.test(before[styleIndex + 1] ?? '') ? before[styleIndex + 1] ?? '' : '';
  let style = [before[styleIndex] ?? '', angle].filter(Boolean).join(' '); let weight = before.find(token => ['bold', 'bolder', 'lighter'].includes(token) || /^\d+$/.test(token)) ?? '';
  let extra = before.filter((token, index) => index !== styleIndex && !(angle && index === styleIndex + 1) && token !== weight).join(' '); let size = tokens[sizeIndex] ?? ''; let line = slash.length > 1 ? after[0] ?? '' : ''; let family = after.slice(slash.length > 1 ? 1 : 0).join(' ');
  if (!family) return false;
  const update = (): void => context.update(`${[style, weight, extra, `${size}${line ? `/${line}` : ''}`].filter(Boolean).join(' ')} ${family}`);
  choice(context, 'Style de police', style, ['', 'normal', 'italic', 'oblique'], value => { style = value; update(); });
  choice(context, 'Graisse', weight, ['', 'normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'], value => { weight = value; update(); });
  field(context, 'Variantes et chasse', extra, value => { extra = value; update(); }); field(context, 'Taille de police', size, value => { size = value; update(); }); field(context, 'Hauteur de ligne', line, value => { line = value; update(); }); field(context, 'Familles de police', family, value => { family = value; update(); }); return true;
}
