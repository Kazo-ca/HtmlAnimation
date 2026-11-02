// packages/css-properties/src/editors/basic.ts
import { getCssPropertyMetadata } from '../catalog.js';
import { boxValues, CSS_LENGTH, replaceAt, splitCssValue } from './css-value.js';
import { choice, field, group } from './fields.js';
import type { EditorContext } from './fields.js';

const UNITS = ['', 'px', '%', 'em', 'rem', 'vw', 'vh', 'vmin', 'vmax', 'svh', 'lvh', 'dvh', 'ch', 'ex', 'lh', 'rlh', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'rad', 'grad', 'turn', 's', 'ms', 'fr'];
export function renderDimension(context: EditorContext, allowUnits = true): boolean {
  const match = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(%|[a-z]*)$/i.exec(context.value.trim()); if (!match) return false;
  let number = match[1] ?? '0'; let unit = match[2] ?? ''; const update = (): void => context.update(number + unit);
  field(context, 'Nombre', number, value => { if (!value || !Number.isFinite(Number(value))) return; number = value; update(); }, 'number', { step: 'any' });
  if (allowUnits) {
    const types = getCssPropertyMetadata(context.property).types.join(' ');
    const units = /\bangle\b/.test(types) ? ['deg', 'rad', 'grad', 'turn'] : /\btime\b/.test(types) ? ['s', 'ms'] : /\blength\b/.test(types) ? UNITS.filter(value => !['deg', 'rad', 'grad', 'turn', 's', 'ms', 'fr'].includes(value)) : UNITS;
    choice(context, 'Unité', unit, units, value => { unit = value; update(); });
  }
  return true;
}
export function renderBox(context: EditorContext): boolean {
  const property = context.property.replace(/^-(?:webkit|moz|ms|o)-/, '');
  const paired = /-(?:block|inline)(?:-(?:color|style|width))?$/.test(property) || ['gap', 'border-spacing', 'place-content', 'place-items', 'place-self', 'perspective-origin'].includes(property);
  if (paired || property === 'transform-origin') {
    const count = property === 'transform-origin' ? 3 : 2; const parts = splitCssValue(context.value, 'space'); if (!parts?.length || parts.length > count) return false;
    if (property.endsWith('-origin') && !parts.every(value => CSS_LENGTH.test(value) || /^(?:calc|min|max|clamp)\(/.test(value))) return false;
    const origin = property.endsWith('-origin'); const place = property.startsWith('place-');
    let values = Array.from({ length: count }, (_, index) => parts[index] ?? (origin ? index === 1 ? '50%' : '0px' : place ? '' : parts[0] ?? ''));
    const labels = origin ? ['Axe X', 'Axe Y', 'Axe Z'] : place ? ['Alignement', 'Justification'] : ['Début logique', 'Fin logique'];
    for (const [index, name] of labels.slice(0, count).entries()) field(context, name, values[index] ?? '', value => { values = [...replaceAt(values, index, value)]; context.update(values.filter(Boolean).join(' ')); }); return true;
  }
  let values: readonly string[] | null = boxValues(context.value); if (!values) return false;
  for (const [index, name] of ['haut', 'droit', 'bas', 'gauche'].entries()) field(context, `Côté ${name}`, values[index] ?? '', value => { if (!values) return; values = replaceAt(values, index, value); context.update(values.join(' ')); });
  return true;
}
export function renderBorder(context: EditorContext): boolean {
  const parts = splitCssValue(context.value, 'space'); if (!parts?.length) return false;
  const styles = getCssPropertyMetadata('border-top-style').keywords.filter(value => !['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(value));
  const styleIndex = parts.findIndex(part => styles.includes(part));
  const widthIndex = parts.findIndex((part, index) => index !== styleIndex && (CSS_LENGTH.test(part) || ['thin', 'medium', 'thick'].includes(part)));
  if (styleIndex < 0 && widthIndex < 0) return false;
  let width = parts[widthIndex] ?? 'medium'; let style = parts[styleIndex] ?? 'none';
  let color = parts.filter((_, index) => index !== widthIndex && index !== styleIndex).join(' ') || 'currentColor';
  const update = (): void => context.update(`${width} ${style} ${color}`);
  field(context, 'Épaisseur de bordure', width, value => { width = value; update(); });
  choice(context, 'Style de bordure', style, styles, value => { style = value; update(); });
  field(context, 'Couleur de bordure', color, value => { color = value; update(); }); return true;
}
export function renderRadius(context: EditorContext): boolean {
  const property = context.property.replace(/^-(?:webkit|moz|ms|o)-/, '');
  if (property !== 'border-radius' && property !== 'radius') {
    const parts = splitCssValue(context.value, 'space'); if (!parts?.length || parts.length > 2 || context.value.includes('/')) return false;
    let horizontal = parts[0] ?? ''; let vertical = parts[1] ?? horizontal;
    field(context, 'Rayon horizontal', horizontal, value => { horizontal = value; context.update(`${horizontal} ${vertical}`); });
    field(context, 'Rayon vertical', vertical, value => { vertical = value; context.update(`${horizontal} ${vertical}`); }); return true;
  }
  const axes = splitCssValue(context.value, '/'); if (!axes?.length || axes.length > 2) return false;
  let horizontal: readonly string[] | null = boxValues(axes[0] ?? ''); let vertical: readonly string[] | null = boxValues(axes[1] ?? axes[0] ?? '');
  if (!horizontal || !vertical) return false;
  const update = (): void => { if (horizontal && vertical) context.update(`${horizontal.join(' ')} / ${vertical.join(' ')}`); };
  for (const [index, corner] of ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'].entries()) {
    const cornerContext = group(context, `Coin ${corner}`);
    field(cornerContext, `Rayon horizontal ${corner}`, horizontal[index] ?? '', value => { if (horizontal) horizontal = replaceAt(horizontal, index, value); update(); });
    field(cornerContext, `Rayon vertical ${corner}`, vertical[index] ?? '', value => { if (vertical) vertical = replaceAt(vertical, index, value); update(); });
  }
  return true;
}
