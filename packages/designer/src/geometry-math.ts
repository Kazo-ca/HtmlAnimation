// packages/designer/src/geometry-math.ts
/** Spatial-only calculations. Temporal evaluation and key history belong to Timeline. */
export type GeometryTool = 'move' | 'dimensions' | 'rotate' | 'scale' | 'pivot';
export interface Point { readonly x: number; readonly y: number }
export interface GeometryState {
  readonly translateX: string; readonly translateY: string;
  readonly rotate: string; readonly scaleX: string; readonly scaleY: string;
  readonly pivotX: string; readonly pivotY: string;
  readonly width: string; readonly height: string;
}
export interface GeometryMetrics {
  readonly width: number; readonly height: number;
  readonly cssWidth?: number; readonly cssHeight?: number;
  readonly parentWidth: number; readonly parentHeight: number;
  readonly fontSize: number; readonly rootFontSize: number;
  readonly viewportWidth: number; readonly viewportHeight: number;
  readonly baseMatrix: { readonly a: number; readonly b: number; readonly c: number; readonly d: number };
}
export interface GeometryUpdateOptions { readonly allowUnitReplacement?: boolean }
export type GeometryUpdateResult =
  | { readonly status: 'ready'; readonly values: Readonly<Partial<GeometryState>>; readonly replacements: readonly string[] }
  | { readonly status: 'confirmation-required'; readonly properties: readonly string[]; readonly message: string }
  | { readonly status: 'rejected'; readonly message: string };
export interface SnapTarget { readonly x?: number; readonly y?: number }
export interface SnapOptions { readonly enabled: boolean; readonly bypass: boolean; readonly grid: number; readonly threshold: number }
export interface GeometryGuide { readonly axis: 'x' | 'y'; readonly value: number }
export interface SnapResult { readonly position: Point; readonly guides: readonly GeometryGuide[] }

interface Length { readonly pixels: number; readonly unit: string; readonly factor: number }
interface Angle { readonly degrees: number; readonly unit: string; readonly factor: number }
const numericPattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const lengthPattern = new RegExp(`^(${numericPattern})\\s*(px|%|em|rem|vw|vh)?$`, 'i');
const anglePattern = new RegExp(`^(${numericPattern})\\s*(deg|rad|turn)?$`, 'i');
const scalePattern = new RegExp(`^${numericPattern}$`, 'i');
const MIN_DIMENSION = 1;
const MIN_SCALE = 0.01;

function format(value: number): string { return String(Number(value.toFixed(10))); }
function rejected(message: string): GeometryUpdateResult { return { status: 'rejected', message }; }
function ready(values: Readonly<Partial<GeometryState>>, replacements: readonly string[] = []): GeometryUpdateResult {
  if (Object.values(values).some(value => !Number.isFinite(Number.parseFloat(value)))) return rejected('Le calcul géométrique dépasse les valeurs prises en charge.');
  return { status: 'ready', values, replacements };
}
function length(value: string, relativeSize: number, metrics: GeometryMetrics): Length | null {
  const match = lengthPattern.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]); const unit = match[2]?.toLowerCase() ?? 'px';
  if (!Number.isFinite(amount) || (!match[2] && amount !== 0)) return null;
  const factors: Readonly<Record<string, number>> = { px: 1, '%': relativeSize / 100, em: metrics.fontSize, rem: metrics.rootFontSize, vw: metrics.viewportWidth / 100, vh: metrics.viewportHeight / 100 };
  const factor = factors[unit];
  return factor && Number.isFinite(amount * factor) ? { pixels: amount * factor, unit, factor } : null;
}
export function geometryLengthPixels(value: string, reference: number, metrics: GeometryMetrics): number | null {
  return length(value, reference, metrics)?.pixels ?? null;
}
function angle(value: string): Angle | null {
  const match = anglePattern.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]); const unit = match[2]?.toLowerCase() ?? 'deg';
  if (!Number.isFinite(amount) || (!match[2] && amount !== 0)) return null;
  const factor = unit === 'rad' ? 180 / Math.PI : unit === 'turn' ? 360 : 1;
  return Number.isFinite(amount * factor) ? { degrees: amount * factor, unit, factor } : null;
}
function scale(value: string): number | null {
  const result = Number(value);
  return scalePattern.test(value.trim()) && Number.isFinite(result) && result > 0 ? result : null;
}
function inUnit(pixels: number, source: Length): string { return `${format(pixels / source.factor)}${source.unit}`; }
function validMetrics(metrics: GeometryMetrics, delta: Point): boolean {
  const lengths = [metrics.width, metrics.height, ...(metrics.cssWidth === undefined ? [] : [metrics.cssWidth]), ...(metrics.cssHeight === undefined ? [] : [metrics.cssHeight]), metrics.parentWidth, metrics.parentHeight, metrics.fontSize, metrics.rootFontSize, metrics.viewportWidth, metrics.viewportHeight];
  return lengths.every(value => Number.isFinite(value) && value > 0) && Object.values(metrics.baseMatrix).every(Number.isFinite) && Number.isFinite(delta.x) && Number.isFinite(delta.y);
}

function move(state: GeometryState, metrics: GeometryMetrics, delta: Point): GeometryUpdateResult {
  const x = length(state.translateX, metrics.width, metrics); const y = length(state.translateY, metrics.height, metrics);
  if (!x || !y) return rejected('La translation actuelle ne peut pas être convertie fidèlement.');
  return ready({ translateX: inUnit(x.pixels + delta.x, x), translateY: inUnit(y.pixels + delta.y, y) });
}
function dimensions(state: GeometryState, metrics: GeometryMetrics, delta: Point, options: GeometryUpdateOptions): GeometryUpdateResult {
  const width = length(state.width, metrics.parentWidth, metrics); const height = length(state.height, metrics.parentHeight, metrics);
  const replacements = [...(!width ? ['width'] : []), ...(!height ? ['height'] : [])];
  if (replacements.length && !options.allowUnitReplacement) return { status: 'confirmation-required', properties: replacements, message: 'Ces dimensions utilisent une expression ou une unité non convertible. Autoriser leur remplacement par des pixels avant modification.' };
  return ready({
    width: width ? inUnit(Math.max(MIN_DIMENSION, width.pixels + delta.x), width) : `${format(Math.max(MIN_DIMENSION, (metrics.cssWidth ?? metrics.width) + delta.x))}px`,
    height: height ? inUnit(Math.max(MIN_DIMENSION, height.pixels + delta.y), height) : `${format(Math.max(MIN_DIMENSION, (metrics.cssHeight ?? metrics.height) + delta.y))}px`,
  }, replacements);
}
function rotate(state: GeometryState, delta: Point): GeometryUpdateResult {
  const current = angle(state.rotate);
  if (!current) return rejected('La rotation actuelle ne peut pas être convertie fidèlement.');
  return ready({ rotate: `${format((current.degrees + delta.x) / current.factor)}${current.unit}` });
}
function resizeScale(state: GeometryState, metrics: GeometryMetrics, delta: Point): GeometryUpdateResult {
  const x = scale(state.scaleX); const y = scale(state.scaleY);
  if (x === null || y === null) return rejected('Les facteurs d’échelle actuels doivent être des nombres positifs.');
  return ready({ scaleX: format(Math.max(MIN_SCALE, x + delta.x / metrics.width)), scaleY: format(Math.max(MIN_SCALE, y + delta.y / metrics.height)) });
}
function pivot(state: GeometryState, metrics: GeometryMetrics, delta: Point): GeometryUpdateResult {
  const x = length(state.pivotX, metrics.width, metrics); const y = length(state.pivotY, metrics.height, metrics);
  const tx = length(state.translateX, metrics.width, metrics); const ty = length(state.translateY, metrics.height, metrics);
  const rotation = angle(state.rotate); const sx = scale(state.scaleX); const sy = scale(state.scaleY);
  if (!x || !y || !tx || !ty || !rotation || sx === null || sy === null) return rejected('Le pivot exige une transformation 2D et des unités convertibles.');
  const nextX = Math.max(0, Math.min(metrics.width, x.pixels + delta.x));
  const nextY = Math.max(0, Math.min(metrics.height, y.pixels + delta.y));
  const radians = rotation.degrees * Math.PI / 180; const cosine = Math.cos(radians); const sine = Math.sin(radians);
  const base = metrics.baseMatrix;
  const a = cosine * sx * base.a - sine * sy * base.b;
  const b = sine * sx * base.a + cosine * sy * base.b;
  const c = cosine * sx * base.c - sine * sy * base.d;
  const d = sine * sx * base.c + cosine * sy * base.d;
  const dx = x.pixels - nextX; const dy = y.pixels - nextY;
  return ready({ pivotX: inUnit(nextX, x), pivotY: inUnit(nextY, y), translateX: inUnit(tx.pixels + (1 - a) * dx - c * dy, tx), translateY: inUnit(ty.pixels - b * dx + (1 - d) * dy, ty) });
}

export function updateGeometry(state: GeometryState, metrics: GeometryMetrics, tool: GeometryTool, delta: Point, options: GeometryUpdateOptions = {}): GeometryUpdateResult {
  if (!validMetrics(metrics, delta)) return rejected('Les mesures géométriques doivent être finies et strictement positives.');
  switch (tool) {
    case 'move': return move(state, metrics, delta);
    case 'dimensions': return dimensions(state, metrics, delta, options);
    case 'rotate': return rotate(state, delta);
    case 'scale': return resizeScale(state, metrics, delta);
    case 'pivot': return pivot(state, metrics, delta);
    default: return rejected('Outil géométrique inconnu.');
  }
}

function nearest(value: number, targets: readonly number[], options: SnapOptions): number | undefined {
  const grid = Number.isFinite(options.grid) && options.grid > 0 ? Math.round(value / options.grid) * options.grid : undefined;
  const candidates = [...targets.filter(Number.isFinite), ...(grid === undefined ? [] : [grid])];
  return candidates.reduce<number | undefined>((best, candidate) => {
    const distance = Math.abs(candidate - value);
    if (distance > options.threshold) return best;
    return best === undefined || distance < Math.abs(best - value) ? candidate : best;
  }, undefined);
}
export function snapPosition(position: Point, targets: readonly SnapTarget[], options: SnapOptions): SnapResult {
  if (!options.enabled || options.bypass || !Number.isFinite(options.threshold) || options.threshold < 0 || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return { position: { ...position }, guides: [] };
  const x = nearest(position.x, targets.flatMap(target => target.x === undefined ? [] : [target.x]), options);
  const y = nearest(position.y, targets.flatMap(target => target.y === undefined ? [] : [target.y]), options);
  return { position: { x: x ?? position.x, y: y ?? position.y }, guides: [...(x === undefined ? [] : [{ axis: 'x' as const, value: x }]), ...(y === undefined ? [] : [{ axis: 'y' as const, value: y }])] };
}
