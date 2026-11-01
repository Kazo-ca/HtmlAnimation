// packages/css-properties/src/gradient-model.ts
import type { GradientColor, GradientDefinition, GradientEdit, GradientStop, GradientValue } from './gradient-types.js';

const geometry = ['angle', 'centerX', 'centerY', 'radiusX', 'radiusY'] as const;
const point = ['color', 'opacity', 'position', 'present'] as const;
function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => 'value' in descriptor);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function identity(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 512; }
function color(value: unknown): value is GradientColor {
  return record(value) && value.kind === 'color' && value.a === 1 && [value.r, value.g, value.b].every(channel => finite(channel) && channel >= 0 && channel <= 1);
}
function stop(value: unknown): value is GradientStop {
  return record(value) && identity(value.id) && color(value.color) && finite(value.position) && finite(value.opacity) && value.opacity >= 0 && value.opacity <= 1 && typeof value.present === 'boolean';
}
function definition(value: unknown): value is GradientDefinition {
  if (!record(value) || !identity(value.id) || value.cssName !== 'background-image' || (value.type !== 'linear' && value.type !== 'radial' && value.type !== 'conic')) return false;
  if (!geometry.every(key => finite(value[key])) || Number(value.radiusX) < 0 || Number(value.radiusY) < 0) return false;
  if (!Array.isArray(value.stops) || !value.stops.every(stop)) return false;
  return value.stops.filter(entry => entry.present).length >= 2 && new Set(value.stops.map(entry => entry.id)).size === value.stops.length;
}
/** Validates untyped host values as well as TypeScript consumers. No CSS is parsed. */
export function validateGradientDefinitions(values: unknown): string | null {
  if (!Array.isArray(values) || !values.every(definition)) return 'Définition de dégradé non valide : vérifiez les points, les couleurs et la géométrie.';
  return new Set(values.map(value => value.id)).size === values.length ? null : 'Chaque dégradé doit conserver une identité unique.';
}
export function cloneGradientDefinitions(values: readonly GradientDefinition[]): readonly GradientDefinition[] {
  const error = validateGradientDefinitions(values); if (error) throw new Error(error);
  return values.map(value => ({ ...value, stops: value.stops.map(entry => ({ ...entry, color: { ...entry.color } })) }));
}
export function readGradientComponent(values: readonly GradientDefinition[], edit: Pick<GradientEdit, 'gradientId' | 'stopId' | 'component'>): GradientValue | undefined {
  const gradient = values.find(value => value.id === edit.gradientId); if (!gradient) return undefined;
  if (edit.stopId !== undefined) {
    const current = gradient.stops.find(value => value.id === edit.stopId); if (!current) return undefined;
    switch (edit.component) { case 'color': return { ...current.color }; case 'opacity': return current.opacity; case 'position': return current.position; case 'present': return current.present; default: return undefined; }
  }
  switch (edit.component) { case 'type': return gradient.type; case 'angle': return gradient.angle; case 'centerX': return gradient.centerX; case 'centerY': return gradient.centerY; case 'radiusX': return gradient.radiusX; case 'radiusY': return gradient.radiusY; default: return undefined; }
}
function editStop(current: GradientStop, edit: GradientEdit): GradientStop {
  switch (edit.component) {
    case 'color': if (color(edit.value)) return { ...current, color: { ...edit.value } }; break;
    case 'opacity': if (finite(edit.value) && edit.value >= 0 && edit.value <= 1) return { ...current, opacity: edit.value }; break;
    case 'position': if (finite(edit.value)) return { ...current, position: edit.value }; break;
    case 'present': if (typeof edit.value === 'boolean') return { ...current, present: edit.value }; break;
  }
  throw new Error('Valeur du point non valide.');
}
function editDefinition(current: GradientDefinition, edit: GradientEdit): GradientDefinition {
  if (edit.stopId !== undefined) {
    if (!point.includes(edit.component as typeof point[number]) || !current.stops.some(value => value.id === edit.stopId)) throw new Error('Point du dégradé introuvable.');
    return { ...current, stops: current.stops.map(value => value.id === edit.stopId ? editStop(value, edit) : value) };
  }
  if (edit.component === 'type' && (edit.value === 'linear' || edit.value === 'radial' || edit.value === 'conic')) return { ...current, type: edit.value };
  if (geometry.includes(edit.component as typeof geometry[number]) && finite(edit.value)) {
    if ((edit.component === 'radiusX' || edit.component === 'radiusY') && edit.value < 0) throw new Error('Le rayon doit être positif ou nul.');
    return { ...current, [edit.component]: edit.value };
  }
  throw new Error('Composante du dégradé non valide.');
}
/** Applies one explicit compound value change, with no key/frame/hold semantics. */
export function applyGradientEdits(values: readonly GradientDefinition[], edits: readonly GradientEdit[]): readonly GradientDefinition[] {
  let result = cloneGradientDefinitions(values);
  for (const edit of edits) {
    if (!record(edit) || !result.some(value => value.id === edit.gradientId)) throw new Error('Dégradé introuvable.');
    result = result.map(value => value.id === edit.gradientId ? editDefinition(value, edit) : value);
  }
  const error = validateGradientDefinitions(result); if (error) throw new Error(error); return result;
}
function number(value: number): string { return String(Object.is(value, -0) ? 0 : value); }
/** Static visual projection only; render order never changes stored point identities. */
export function gradientCss(value: GradientDefinition): string {
  const error = validateGradientDefinitions([value]); if (error) throw new Error(error);
  const stops = value.stops.filter(entry => entry.present).map((entry, index) => ({ entry, index })).sort((a, b) => a.entry.position - b.entry.position || a.index - b.index).map(value => value.entry);
  const prefix = value.type === 'linear' ? `${number(value.angle)}deg` : value.type === 'radial' ? `ellipse ${number(value.radiusX)}% ${number(value.radiusY)}% at ${number(value.centerX)}% ${number(value.centerY)}%` : `from ${number(value.angle)}deg at ${number(value.centerX)}% ${number(value.centerY)}%`;
  return `${value.type}-gradient(${prefix}, ${stops.map(entry => `rgba(${number(entry.color.r * 255)}, ${number(entry.color.g * 255)}, ${number(entry.color.b * 255)}, ${number(entry.opacity)}) ${number(entry.position)}%`).join(', ')})`;
}
