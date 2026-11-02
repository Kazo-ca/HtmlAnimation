// packages/designer/src/geometry-dom.ts
import type { DomOrigin } from './dom-origin.js';
import type { GeometryMetrics, GeometryState } from './geometry-math.js';
import { authoredStyles } from './authored-styles.js';

export const geometryProperties = ['translateX', 'translateY', 'rotation', 'scaleX', 'scaleY', 'pivotX', 'pivotY'] as const;
export type GeometryProperty = typeof geometryProperties[number];
export function isGeometryProperty(property: string): property is GeometryProperty { return geometryProperties.some(name => name === property); }
export function geometryStateKey(property: GeometryProperty): keyof GeometryState { return property === 'rotation' ? 'rotate' : property; }
export function geometryValues(state: Readonly<Partial<GeometryState>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(state).map(([name, value]) => [name === 'rotate' ? 'rotation' : name, value]));
}

export function geometryDefaults(origin: DomOrigin, element: HTMLElement): GeometryState {
  const liveOrigin = element.ownerDocument.defaultView?.getComputedStyle(element).transformOrigin;
  const pivot = pivotCoordinates(origin.authoredValue(element, 'transform-origin') || liveOrigin || origin.value(element, 'transform-origin') || '50% 50%');
  return { translateX: '0px', translateY: '0px', rotate: '0deg', scaleX: '1', scaleY: '1', ...pivot, width: origin.authoredValue(element, 'width') || 'auto', height: origin.authoredValue(element, 'height') || 'auto' };
}
export function geometryBoxMetrics(element: HTMLElement): { width: number; height: number; cssWidth: number; cssHeight: number } {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element); const rect = element.getBoundingClientRect();
  const number = (property: string): number => Number.parseFloat(style?.getPropertyValue(property) ?? '') || 0;
  const horizontal = ['padding-left', 'padding-right', 'border-left-width', 'border-right-width'].reduce((sum, name) => sum + number(name), 0);
  const vertical = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'].reduce((sum, name) => sum + number(name), 0);
  const pixels = (property: string): number | null => /^\d*\.?\d+px$/.test(style?.getPropertyValue(property) ?? '') ? number(property) : null;
  const cssWidth = pixels('width'); const cssHeight = pixels('height'); const borderBox = style?.boxSizing === 'border-box';
  const width = cssWidth === null ? element.offsetWidth || rect.width : cssWidth + (borderBox ? 0 : horizontal);
  const height = cssHeight === null ? element.offsetHeight || rect.height : cssHeight + (borderBox ? 0 : vertical);
  return { width, height, cssWidth: cssWidth ?? width - (borderBox ? 0 : horizontal), cssHeight: cssHeight ?? height - (borderBox ? 0 : vertical) };
}
export function pivotCoordinates(value: string): { pivotX: string; pivotY: string } {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1 && (parts[0] === 'top' || parts[0] === 'bottom')) return { pivotX: '50%', pivotY: parts[0] === 'top' ? '0%' : '100%' };
  if (parts[0] === 'top' || parts[0] === 'bottom' || parts[1] === 'left' || parts[1] === 'right') parts.reverse();
  const keyword: Readonly<Record<string, string>> = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
  return { pivotX: keyword[parts[0] ?? ''] ?? parts[0] ?? '50%', pivotY: keyword[parts[1] ?? ''] ?? parts[1] ?? '50%' };
}
export function unresolvedPercentageHeight(element: HTMLElement, value: string): boolean {
  if (!value.trim().endsWith('%')) return false;
  const view = element.ownerDocument.defaultView;
  const position = view?.getComputedStyle(element).position;
  if (position === 'absolute' || position === 'fixed') return false;
  for (let parent = element.parentElement; parent && parent !== element.ownerDocument.documentElement; parent = parent.parentElement) {
    const height = authoredStyles(parent).get('height') ?? '';
    if (!height || height === 'auto' || /var\(/i.test(height)) return true;
    if (!height.trim().endsWith('%')) return false;
  }
  return false;
}
export function validGeometryValue(property: GeometryProperty, value: string): boolean {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return false;
  if (property === 'scaleX' || property === 'scaleY') return /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && number > 0;
  if (property === 'rotation') return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:deg|rad|turn)$/.test(value);
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:px|%|em|rem|vw|vh)$/.test(value);
}

export function linearTransform(value: string): GeometryMetrics['baseMatrix'] | null {
  if (!value || value === 'none') return { a: 1, b: 0, c: 0, d: 1 };
  if (typeof DOMMatrix !== 'undefined') {
    try {
      const matrix = new DOMMatrix(value);
      return matrix.is2D ? { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d } : null;
    } catch { return null; }
  }
  // A conservative non-layout DOM fallback; browsers use their native DOMMatrix above.
  const matrix = /^matrix\(([^)]+)\)$/.exec(value);
  if (matrix) {
    const [a, b, c, d, e, f] = (matrix[1] ?? '').split(',').map(Number);
    if ([a, b, c, d, e, f].every(number => number !== undefined && Number.isFinite(number))) return { a: a ?? 1, b: b ?? 0, c: c ?? 0, d: d ?? 1 };
  }
  const rotation = /^rotate\(([+-]?[\d.]+)deg\)$/.exec(value);
  if (!rotation) return null;
  const angle = Number(rotation[1]) * Math.PI / 180;
  return Number.isFinite(angle) ? { a: Math.cos(angle), b: Math.sin(angle), c: -Math.sin(angle), d: Math.cos(angle) } : null;
}

export function geometryContext(element: HTMLElement, baseTransform: string, currentState?: GeometryState): { readonly status: 'ready'; readonly metrics: GeometryMetrics } | { readonly status: 'rejected'; readonly message: string } {
  const view = element.ownerDocument.defaultView;
  if (!view) return { status: 'rejected', message: 'Contexte de mesure indisponible.' };
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    const unsupported = ['perspective', 'translate', 'rotate', 'scale'].some(name => { const value = style.getPropertyValue(name); return value && value !== 'none'; });
    const zoom = style.getPropertyValue('zoom');
    if (unsupported || (node !== element && style.transform && style.transform !== 'none') || (zoom && zoom !== '1' && zoom !== 'normal')) return { status: 'rejected', message: 'Ce contexte contient une transformation d’ancêtre, une transformation individuelle, un zoom ou une perspective non pris en charge. Utilisez un contexte 2D sans ces transformations.' };
  }
  let baseMatrix = linearTransform(baseTransform);
  if (currentState && typeof DOMMatrix !== 'undefined') {
    const full = linearTransform(view.getComputedStyle(element).transform);
    const degrees = Number.parseFloat(currentState.rotate) * (currentState.rotate.endsWith('rad') ? 180 / Math.PI : currentState.rotate.endsWith('turn') ? 360 : 1);
    const cosine = Math.cos(degrees * Math.PI / 180); const sine = Math.sin(degrees * Math.PI / 180);
    const sx = Number(currentState.scaleX); const sy = Number(currentState.scaleY);
    if (full && sx > 0 && sy > 0) baseMatrix = { a: (cosine * full.a + sine * full.b) / sx, b: (-sine * full.a + cosine * full.b) / sy, c: (cosine * full.c + sine * full.d) / sx, d: (-sine * full.c + cosine * full.d) / sy };
  }
  if (!baseMatrix || Math.abs(baseMatrix.a * baseMatrix.d - baseMatrix.b * baseMatrix.c) < 1e-9) return { status: 'rejected', message: 'La transformation 3D ou singulière ne peut pas être manipulée fidèlement.' };
  const style = view.getComputedStyle(element); const box = geometryBoxMetrics(element);
  const visible = element.getBoundingClientRect();
  if (visible.width <= 0 || visible.height <= 0) return { status: 'rejected', message: 'Les dimensions résolues doivent être visibles et strictement positives.' };
  const positioned = style.position === 'absolute' || style.position === 'fixed';
  const parent = positioned ? element.offsetParent instanceof HTMLElement ? element.offsetParent : null : element.parentElement;
  const jsdomFallback = positioned && !parent && typeof DOMMatrix === 'undefined' ? element.parentElement : parent;
  const parentStyle = jsdomFallback ? view.getComputedStyle(jsdomFallback) : null;
  const initialBlock = positioned && (!jsdomFallback || (jsdomFallback === element.ownerDocument.body && parentStyle?.position === 'static'));
  const parentBox = jsdomFallback ? geometryBoxMetrics(jsdomFallback) : null;
  const border = (axis: 'x' | 'y'): number => (axis === 'x' ? ['border-left-width', 'border-right-width'] : ['border-top-width', 'border-bottom-width']).reduce((sum, name) => sum + (Number.parseFloat(parentStyle?.getPropertyValue(name) ?? '') || 0), 0);
  const metrics: GeometryMetrics = { ...box, parentWidth: initialBlock ? view.innerWidth : positioned ? (parentBox?.width ?? 0) - border('x') : parentBox?.cssWidth || jsdomFallback?.clientWidth || view.innerWidth,
    parentHeight: initialBlock ? view.innerHeight : positioned ? (parentBox?.height ?? 0) - border('y') : parentBox?.cssHeight || jsdomFallback?.clientHeight || view.innerHeight,
    fontSize: Number.parseFloat(style.fontSize) || 16, rootFontSize: Number.parseFloat(view.getComputedStyle(element.ownerDocument.documentElement).fontSize) || 16, viewportWidth: view.innerWidth, viewportHeight: view.innerHeight, baseMatrix };
  if (![metrics.width, metrics.height, metrics.parentWidth, metrics.parentHeight, metrics.cssWidth, metrics.cssHeight].every(value => value !== undefined && Number.isFinite(value) && value > 0)) return { status: 'rejected', message: 'Les dimensions résolues doivent être mesurables et strictement positives.' };
  return { status: 'ready', metrics };
}

export function projectGeometry(origin: DomOrigin, element: HTMLElement, values: Readonly<Record<string, string>>): void {
  const defaults = geometryDefaults(origin, element);
  const state = { ...defaults, ...values, rotate: values.rotation ?? defaults.rotate };
  const raw = values.transform ?? (origin.authoredValue(element, 'transform') || origin.value(element, 'transform'));
  if (values.transform !== undefined) origin.applyPreview(element, 'transform', values.transform);
  const resolved = element.ownerDocument.defaultView?.getComputedStyle(element).transform || origin.value(element, 'transform');
  const base = !resolved || resolved === 'none' || raw === 'initial' || raw === 'unset' ? 'none' : /^(?:inherit|revert|revert-layer)$/.test(raw) ? resolved : raw;
  const suffix = base && base !== 'none' ? ` ${base}` : '';
  origin.applyPreview(element, 'transform', `translate(${state.translateX}, ${state.translateY}) rotate(${state.rotate}) scale(${state.scaleX}, ${state.scaleY})${suffix}`);
  if (values.pivotX !== undefined || values.pivotY !== undefined) origin.applyPreview(element, 'transform-origin', `${state.pivotX} ${state.pivotY}`);
}
