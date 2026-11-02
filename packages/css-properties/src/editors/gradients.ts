// packages/css-properties/src/editors/gradients.ts
import { colorFields } from './color.js';
import { CSS_LENGTH, moveItem, replaceAt, splitCssValue } from './css-value.js';
import { button, choice, field, group, toggle } from './fields.js';
import type { EditorContext } from './fields.js';
import { renderStructured } from './structured.js';
interface GradientStop { readonly color: string; readonly position: string }
interface Gradient { readonly type: string; readonly repeating: boolean; readonly geometry: string; readonly stops: readonly GradientStop[] }
interface ImageLayer { readonly raw: string; readonly gradient: Gradient | null }
const TYPES = ['linear-gradient', 'radial-gradient', 'conic-gradient'];
const GEOMETRY: Readonly<Record<string, string>> = { 'linear-gradient': '90deg', 'radial-gradient': 'circle at center', 'conic-gradient': 'from 0deg at center' };
function readGradient(value: string): Gradient | null {
  const match = /^(repeating-)?(linear-gradient|radial-gradient|conic-gradient)\(([\s\S]*)\)$/.exec(value.trim()); if (!match) return null;
  const args = splitCssValue(match[3] ?? '', ','); if (!args || args.length < 2) return null;
  const first = args[0] ?? ''; const geometry = /^(?:in\s|to\s|from\s|at\s|circle(?:\s|$)|ellipse(?:\s|$)|closest-|farthest-|[+-]?(?:\d*\.)?\d+(?:deg|grad|rad|turn)(?:\s|$))/.test(first);
  const stops = args.slice(geometry ? 1 : 0).map(value => { const parts = splitCssValue(value, 'space'); if (!parts?.length || parts.length > 3 || CSS_LENGTH.test(parts[0] ?? '')) return null; return { color: parts[0] ?? '', position: parts.slice(1).join(' ') }; });
  if (stops.length < 2 || stops.some(stop => !stop)) return null;
  return { type: match[2] ?? 'linear-gradient', repeating: Boolean(match[1]), geometry: geometry ? first : '', stops: stops.filter((stop): stop is GradientStop => stop !== null) };
}
function writeGradient(value: Gradient): string { return `${value.repeating ? 'repeating-' : ''}${value.type}(${[...(value.geometry ? [value.geometry] : []), ...value.stops.map(stop => `${stop.color}${stop.position ? ` ${stop.position}` : ''}`)].join(', ')})`; }
function writeLayer(layer: ImageLayer): string { return layer.gradient ? writeGradient(layer.gradient) : layer.raw; }
export function renderGradients(context: EditorContext): boolean {
  const parts = context.value.trim() === 'none' ? [] : splitCssValue(context.value, ','); if (!parts) return false;
  let layers: readonly ImageLayer[] = parts.map(raw => ({ raw, gradient: readGradient(raw) }));
  const update = (index: number, gradient: Gradient, rebuild = false): void => { layers = replaceAt(layers, index, { raw: '', gradient }); context.update(layers.map(writeLayer).join(', ') || 'none', rebuild); };
  for (const [index, layer] of layers.entries()) {
    const ui = group(context, `Image ${index + 1}`); let gradient = layer.gradient;
    if (!gradient) renderStructured({ ...ui, value: layer.raw, update: (value, rebuild) => { layers = replaceAt(layers, index, { raw: value, gradient: readGradient(value) }); context.update(layers.map(writeLayer).join(', ') || 'none', rebuild); } });
    else {
      choice(ui, `Type de dégradé ${index + 1}`, gradient.type, TYPES, type => { if (!gradient) return; gradient = { ...gradient, type, geometry: GEOMETRY[type] ?? '' }; update(index, gradient, true); });
      toggle(ui, `Répéter le dégradé ${index + 1}`, gradient.repeating, repeating => { if (gradient) { gradient = { ...gradient, repeating }; update(index, gradient); } });
      field(ui, `Géométrie du dégradé ${index + 1}`, gradient.geometry, geometry => { if (gradient) { gradient = { ...gradient, geometry }; update(index, gradient); } });
      for (const [stopIndex, initial] of gradient.stops.entries()) {
        const stopUi = group(ui, `Point ${stopIndex + 1}`); let stop = initial;
        const updateStop = (): void => { if (gradient) { gradient = { ...gradient, stops: replaceAt(gradient.stops, stopIndex, stop) }; update(index, gradient); } };
        colorFields(stopUi, stop.color, color => { stop = { ...stop, color }; updateStop(); }, `le point ${stopIndex + 1}`);
        field(stopUi, `Position du point ${stopIndex + 1}`, stop.position, position => { stop = { ...stop, position }; updateStop(); });
        const remove = button(stopUi, 'Supprimer ce point', () => { if (gradient && gradient.stops.length > 2) { gradient = { ...gradient, stops: gradient.stops.filter((_, current) => current !== stopIndex) }; update(index, gradient, true); } }); remove.disabled = gradient.stops.length <= 2;
        button(stopUi, 'Monter ce point', () => { if (gradient) update(index, { ...gradient, stops: moveItem(gradient.stops, stopIndex, -1) }, true); });
        button(stopUi, 'Descendre ce point', () => { if (gradient) update(index, { ...gradient, stops: moveItem(gradient.stops, stopIndex, 1) }, true); });
      }
      button(ui, 'Ajouter un point', () => { if (!gradient) return; const at = Math.max(1, gradient.stops.length - 1); gradient = { ...gradient, stops: [...gradient.stops.slice(0, at), { color: 'rgba(128, 128, 128, 1)', position: '50%' }, ...gradient.stops.slice(at)] }; update(index, gradient, true); });
    }
    button(ui, 'Supprimer cette image', () => context.update(layers.filter((_, current) => current !== index).map(writeLayer).join(', ') || 'none', true));
    button(ui, 'Monter cette image', () => context.update(moveItem(layers, index, -1).map(writeLayer).join(', '), true));
    button(ui, 'Descendre cette image', () => context.update(moveItem(layers, index, 1).map(writeLayer).join(', '), true));
  }
  button(context, 'Ajouter un dégradé', () => context.update([...layers.map(writeLayer), 'linear-gradient(90deg, #ffffff 0%, #176b6a 100%)'].join(', '), true)); return true;
}
