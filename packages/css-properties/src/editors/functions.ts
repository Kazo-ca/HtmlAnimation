// packages/css-properties/src/editors/functions.ts
import { moveItem, readCssFunction, replaceAt, splitCssValue, writeCssFunction } from './css-value.js';
import type { CssFunctionValue } from './css-value.js';
import { button, choice, field, group } from './fields.js';
import type { EditorContext } from './fields.js';
const TRANSFORMS: Readonly<Record<string, readonly string[]>> = { translate: ['0px', '0px'], translateX: ['0px'], translateY: ['0px'], translateZ: ['0px'], translate3d: ['0px', '0px', '0px'], rotate: ['0deg'], rotateX: ['0deg'], rotateY: ['0deg'], rotateZ: ['0deg'], rotate3d: ['0', '0', '1', '0deg'], scale: ['1', '1'], scaleX: ['1'], scaleY: ['1'], scaleZ: ['1'], scale3d: ['1', '1', '1'], skew: ['0deg', '0deg'], skewX: ['0deg'], skewY: ['0deg'], matrix: ['1', '0', '0', '1', '0', '0'], matrix3d: ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1'], perspective: ['500px'] };
const FILTERS: Readonly<Record<string, readonly string[]>> = { blur: ['0px'], brightness: ['1'], contrast: ['1'], grayscale: ['0'], 'hue-rotate': ['0deg'], invert: ['0'], opacity: ['1'], saturate: ['1'], sepia: ['0'], 'drop-shadow': ['0px 2px 4px rgba(0, 0, 0, .3)'], url: ['"#filtre"'] };
export function renderFunctions(context: EditorContext): boolean {
  if (['rotate', 'rotation', 'translate', 'scale'].includes(context.property.replace(/^-(?:webkit|moz|ms|o)-/, ''))) return false;
  const parts = context.value.trim() === 'none' ? [] : splitCssValue(context.value, 'space'); if (!parts) return false;
  const parsed = parts.map(readCssFunction); if (parsed.some(part => !part)) return false;
  let functions = parsed.filter((part): part is CssFunctionValue => part !== null); const templates = context.property.includes('filter') ? FILTERS : TRANSFORMS;
  const update = (index: number, value: CssFunctionValue): void => { functions = [...replaceAt(functions, index, value)]; context.update(functions.map(writeCssFunction).join(' ') || 'none'); };
  for (const [index, initial] of functions.entries()) {
    const ui = group(context, `Fonction ${index + 1}`); let fn = initial;
    choice(ui, `Fonction ${index + 1}`, fn.name, Object.keys(templates), name => { fn = { name, args: templates[name] ?? fn.args, separator: ', ' }; functions = [...replaceAt(functions, index, fn)]; context.update(functions.map(writeCssFunction).join(' '), true); });
    for (const [argument, value] of fn.args.entries()) field(ui, `Argument ${argument + 1} de ${fn.name} ${index + 1}`, value, content => { fn = { ...fn, args: replaceAt(fn.args, argument, content) }; update(index, fn); });
    button(ui, 'Supprimer cette fonction', () => context.update(functions.filter((_, current) => current !== index).map(writeCssFunction).join(' ') || 'none', true));
    button(ui, 'Monter cette fonction', () => context.update(moveItem(functions, index, -1).map(writeCssFunction).join(' '), true));
    button(ui, 'Descendre cette fonction', () => context.update(moveItem(functions, index, 1).map(writeCssFunction).join(' '), true));
  }
  let nextName = Object.keys(templates)[0] ?? 'translate'; choice(context, 'Nouvelle fonction', nextName, Object.keys(templates), value => { nextName = value; });
  button(context, 'Ajouter une fonction', () => context.update([...functions, { name: nextName, args: templates[nextName] ?? ['0'], separator: ', ' }].map(writeCssFunction).join(' '), true)); return true;
}
