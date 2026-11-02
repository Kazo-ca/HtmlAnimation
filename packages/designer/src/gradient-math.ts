// packages/designer/src/gradient-math.ts
import type { GradientDefinition, GradientEdit } from '@kazo-ca/css-properties';

export type GradientHandle = 'angle' | 'center' | 'radiusX' | 'radiusY' | 'stop';
export interface GradientBox { readonly width: number; readonly height: number }
export interface GradientPoint { readonly x: number; readonly y: number }

const DEGREES_PER_TURN = 360;
const DEGREES_PER_PERCENT = 3.6;
const HANDLE_RADIUS = 0.35;
function validBox(box: GradientBox): boolean { return Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0; }
function clean(value: number): number { return Number(value.toFixed(10)); }
function radians(angle: number): number { return angle * Math.PI / 180; }
function normalizeAngle(angle: number): number { return (angle % DEGREES_PER_TURN + DEGREES_PER_TURN) % DEGREES_PER_TURN; }
function center(gradient: GradientDefinition, box: GradientBox): GradientPoint {
  return gradient.type === 'linear' ? { x: box.width / 2, y: box.height / 2 } : { x: gradient.centerX * box.width / 100, y: gradient.centerY * box.height / 100 };
}
function axis(angle: number): GradientPoint { const value = radians(angle); return { x: Math.sin(value), y: -Math.cos(value) }; }
function pointOnAxis(origin: GradientPoint, direction: GradientPoint, distance: number): GradientPoint { return { x: clean(origin.x + direction.x * distance), y: clean(origin.y + direction.y * distance) }; }
function lineExtent(gradient: GradientDefinition, box: GradientBox): number {
  const direction = axis(gradient.angle); return Math.abs(direction.x) * box.width / 2 + Math.abs(direction.y) * box.height / 2;
}
function available(gradient: GradientDefinition, handle: GradientHandle): boolean {
  if (handle === 'stop') return true;
  if (handle === 'angle') return gradient.type !== 'radial';
  if (handle === 'center') return gradient.type !== 'linear';
  return gradient.type === 'radial';
}
function validGeometry(gradient: GradientDefinition): boolean {
  return [gradient.angle, gradient.centerX, gradient.centerY, gradient.radiusX, gradient.radiusY].every(Number.isFinite) && gradient.radiusX >= 0 && gradient.radiusY >= 0;
}

/** Spatial coordinates only. Evaluated component values are supplied by the host. */
export function gradientHandlePoint(gradient: GradientDefinition, handle: GradientHandle, stopId: string | null, box: GradientBox): GradientPoint | null {
  if (!validBox(box) || !validGeometry(gradient) || !available(gradient, handle)) return null;
  const origin = center(gradient, box);
  if (handle === 'center') return origin;
  if (handle === 'angle') return pointOnAxis(origin, axis(gradient.angle), Math.min(box.width, box.height) * HANDLE_RADIUS);
  if (handle === 'radiusX') return { x: origin.x + gradient.radiusX * box.width / 100, y: origin.y };
  if (handle === 'radiusY') return { x: origin.x, y: origin.y + gradient.radiusY * box.height / 100 };
  const stop = gradient.stops.find(candidate => candidate.id === stopId && candidate.present);
  if (!stop || !Number.isFinite(stop.position)) return null;
  if (gradient.type === 'linear') return pointOnAxis(origin, axis(gradient.angle), (stop.position / 50 - 1) * lineExtent(gradient, box));
  if (gradient.type === 'radial') return gradient.radiusX > 0 ? { x: clean(origin.x + gradient.radiusX * box.width * stop.position / 10_000), y: origin.y } : null;
  return pointOnAxis(origin, axis(gradient.angle + stop.position * DEGREES_PER_PERCENT), Math.min(box.width, box.height) * HANDLE_RADIUS);
}

/** Absolute pointer position -> independent component edits, without sorting stops. */
export function gradientHandleEdits(gradient: GradientDefinition, handle: GradientHandle, stopId: string | null, box: GradientBox, pointer: GradientPoint): readonly GradientEdit[] {
  if (!validBox(box) || !validGeometry(gradient) || !available(gradient, handle) || ![pointer.x, pointer.y].every(Number.isFinite)) return [];
  const origin = center(gradient, box); const dx = pointer.x - origin.x; const dy = pointer.y - origin.y;
  const edit = (component: GradientEdit['component'], value: number): GradientEdit => ({ gradientId: gradient.id, component, value: clean(value) });
  if (handle === 'center') return [edit('centerX', pointer.x * 100 / box.width), edit('centerY', pointer.y * 100 / box.height)];
  if (handle === 'radiusX') return [edit('radiusX', Math.abs(dx) * 100 / box.width)];
  if (handle === 'radiusY') return [edit('radiusY', Math.abs(dy) * 100 / box.height)];
  if (handle === 'angle') return dx || dy ? [edit('angle', normalizeAngle(Math.atan2(dx, -dy) * 180 / Math.PI))] : [];
  const stop = gradient.stops.find(candidate => candidate.id === stopId && candidate.present);
  if (!stop || !Number.isFinite(stop.position)) return [];
  let position: number;
  if (gradient.type === 'linear') { const direction = axis(gradient.angle); position = (0.5 + (dx * direction.x + dy * direction.y) / (lineExtent(gradient, box) * 2)) * 100; }
  else if (gradient.type === 'radial') { if (!gradient.radiusX) return []; position = dx * 10_000 / (gradient.radiusX * box.width); }
  else {
    if (!dx && !dy) return [];
    const nominal = normalizeAngle(Math.atan2(dx, -dy) * 180 / Math.PI - gradient.angle) / DEGREES_PER_PERCENT;
    // Keep the existing winding; a point at 150% must not become 50% on pickup.
    position = nominal + Math.round((stop.position - nominal) / 100) * 100;
  }
  return [{ gradientId: gradient.id, stopId: stop.id, component: 'position', value: clean(position) }];
}
