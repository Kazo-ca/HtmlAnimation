// packages/css-properties/src/editors/background.ts
import { readColor } from './color.js';
import { CSS_LENGTH, moveItem, replaceAt, splitCssValue } from './css-value.js';
import { button, choice, field, group } from './fields.js';
import type { EditorContext } from './fields.js';
interface BackgroundLayer { readonly image: string; readonly position: string; readonly size: string; readonly repeat: string; readonly attachment: string; readonly boxes: string; readonly color: string }
const REPEATS = ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round']; const ATTACHMENTS = ['scroll', 'fixed', 'local'];
function coordinate(token: string): boolean { return CSS_LENGTH.test(token) || /^(?:calc|min|max|clamp)\(/.test(token); }
function readBackground(value: string): BackgroundLayer | null {
  const slash = splitCssValue(value, '/'); if (!slash?.length || slash.length > 2) return null;
  const first = splitCssValue(slash[0] ?? '', 'space'); const second = slash.length > 1 ? splitCssValue(slash[1] ?? '', 'space') : []; if (!first || !second) return null;
  const tokens = [...first, ...second]; const image = tokens.find(token => token === 'none' || /^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|image-set|cross-fade|image|paint)\(/.test(token)) ?? 'none';
  const color = tokens.find(token => readColor(token) || token === 'currentColor' || /^(?:hsl|hwb|lab|lch|oklab|oklch|color|color-mix)\(/.test(token)) ?? '';
  const repeats = tokens.filter(token => REPEATS.includes(token)); const attachment = tokens.find(token => ATTACHMENTS.includes(token)) ?? 'scroll'; const boxes = tokens.filter(token => ['border-box', 'padding-box', 'content-box', 'text'].includes(token));
  const leftovers = (parts: readonly string[]): readonly string[] => parts.filter(token => token !== image && token !== color && !REPEATS.includes(token) && !ATTACHMENTS.includes(token) && !boxes.includes(token));
  const positionParts = leftovers(first); const sizeParts = leftovers(second);
  // Unknown tokens can be colors, variables or future syntax. Never consume them as coordinates.
  if (positionParts.some(token => !['left', 'center', 'right', 'top', 'bottom'].includes(token) && !coordinate(token)) || sizeParts.some(token => !['auto', 'cover', 'contain'].includes(token) && !coordinate(token))) return null;
  const position = positionParts.join(' ') || '0% 0%'; const size = sizeParts.join(' ') || 'auto';
  return { image, color, repeat: repeats.join(' ') || 'repeat', attachment, boxes: boxes.join(' '), position, size };
}
function writeBackground(value: BackgroundLayer, last: boolean): string { return `${value.image} ${value.position} / ${value.size} ${value.repeat} ${value.attachment}${value.boxes ? ` ${value.boxes}` : ''}${last && value.color ? ` ${value.color}` : ''}`; }
function serialize(layers: readonly BackgroundLayer[], color: string): string { return layers.map((layer, index) => writeBackground({ ...layer, color }, index === layers.length - 1)).join(', ') || color || 'none'; }
export function renderBackground(context: EditorContext): boolean {
  if (context.property.replace(/^-(?:webkit|moz|ms|o)-/, '') !== 'background' && context.property !== 'background') return false;
  const parts = splitCssValue(context.value, ','); if (!parts?.length) return false; const parsed = parts.map(readBackground); if (parsed.some(value => !value)) return false;
  let layers = parsed.filter((value): value is BackgroundLayer => value !== null);
  let backgroundColor = layers.at(-1)?.color ?? '';
  const serializeCurrent = (values: readonly BackgroundLayer[]): string => serialize(values, backgroundColor);
  for (const [index, initial] of layers.entries()) {
    const ui = group(context, `Fond ${index + 1}`); let layer = initial;
    const update = (key: keyof BackgroundLayer, value: string): void => { if (key === 'color') backgroundColor = value; layer = { ...layer, [key]: value }; layers = [...replaceAt(layers, index, layer)]; context.update(serializeCurrent(layers)); };
    field(ui, `Image du fond ${index + 1}`, layer.image, value => update('image', value)); field(ui, `Position du fond ${index + 1}`, layer.position, value => update('position', value)); field(ui, `Taille du fond ${index + 1}`, layer.size, value => update('size', value));
    choice(ui, `Répétition du fond ${index + 1}`, layer.repeat, REPEATS, value => update('repeat', value)); choice(ui, `Attachement du fond ${index + 1}`, layer.attachment, ATTACHMENTS, value => update('attachment', value));
    field(ui, `Origine et découpe du fond ${index + 1}`, layer.boxes, value => update('boxes', value));
    if (index === layers.length - 1) field(ui, 'Couleur du fond', layer.color, value => update('color', value));
    button(ui, 'Supprimer ce fond', () => context.update(serializeCurrent(layers.filter((_, current) => current !== index)), true));
    button(ui, 'Monter ce fond', () => context.update(serializeCurrent(moveItem(layers, index, -1)), true)); button(ui, 'Descendre ce fond', () => context.update(serializeCurrent(moveItem(layers, index, 1)), true));
  }
  button(context, 'Ajouter un fond', () => context.update(serializeCurrent([{ image: 'none', position: '0% 0%', size: 'auto', repeat: 'no-repeat', attachment: 'scroll', boxes: '', color: '' }, ...layers]), true)); return true;
}
