// tests/gradient-math.test.ts
import { describe, expect, it } from 'vitest';
import type { GradientDefinition } from '../packages/css-properties/src/gradient-types.js';
import { gradientHandleEdits, gradientHandlePoint } from '../packages/designer/src/gradient-math.js';

const box = { width: 200, height: 100 };
function gradient(patch: Partial<GradientDefinition> = {}): GradientDefinition {
  return { id: 'main', cssName: 'background-image', type: 'linear', angle: 90, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, stops: [
    { id: 'first', color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 1, position: 0, present: true },
    { id: 'middle', color: { kind: 'color', r: 0, g: 1, b: 0, a: 1 }, opacity: 0.5, position: 50, present: true },
    { id: 'last', color: { kind: 'color', r: 0, g: 0, b: 1, a: 1 }, opacity: 1, position: 100, present: true },
  ], ...patch };
}
function expectPoint(point: { readonly x: number; readonly y: number } | null, x: number, y: number): void {
  expect(point).not.toBeNull(); expect(point?.x).toBeCloseTo(x, 8); expect(point?.y).toBeCloseTo(y, 8);
}

describe('spatial-only gradient handles', () => {
  it.each([{ angle: 90, x: 200, y: 50 }, { angle: 0, x: 100, y: 0 }, { angle: 180, x: 100, y: 100 }, { angle: 270, x: 0, y: 50 }])('places a linear stop using the CSS angle convention at $angle degrees', ({ angle, x, y }) => {
    expectPoint(gradientHandlePoint(gradient({ angle }), 'stop', 'last', box), x, y);
  });
  it('uses the true diagonal CSS gradient line extent and preserves point identity', () => {
    const source = gradient({ angle: 45 }); const original = JSON.stringify(source);
    expectPoint(gradientHandlePoint(source, 'stop', 'last', box), 175, -25);
    const edits = gradientHandleEdits(source, 'stop', 'middle', box, { x: 175, y: -25 });
    expect(edits).toEqual([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 100 }]);
    expect(JSON.stringify(source)).toBe(original);
  });
  it('allows linear positions outside the nominal interval without clamping or renumbering stops', () => {
    expect(gradientHandleEdits(gradient(), 'stop', 'middle', box, { x: 300, y: 50 })).toEqual([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 150 }]);
  });
  it('edits one angle in degrees from an absolute pointer position', () => {
    expect(gradientHandleEdits(gradient(), 'angle', null, box, { x: 100, y: 0 })).toEqual([{ gradientId: 'main', component: 'angle', value: 0 }]);
    expect(gradientHandleEdits(gradient(), 'angle', null, box, { x: 200, y: 50 })).toEqual([{ gradientId: 'main', component: 'angle', value: 90 }]);
  });
  it('moves a radial center with two independent component writes and preserves percentages', () => {
    const source = gradient({ type: 'radial', centerX: 25, centerY: 40 });
    expectPoint(gradientHandlePoint(source, 'center', null, box), 50, 40);
    expect(gradientHandleEdits(source, 'center', null, box, { x: 140, y: 75 })).toEqual([
      { gradientId: 'main', component: 'centerX', value: 70 }, { gradientId: 'main', component: 'centerY', value: 75 },
    ]);
  });
  it('keeps radial radii independent and locates a selected position on the horizontal radius', () => {
    const source = gradient({ type: 'radial', centerX: 25, centerY: 40, radiusX: 30, radiusY: 20 });
    expectPoint(gradientHandlePoint(source, 'radiusX', null, box), 110, 40);
    expectPoint(gradientHandlePoint(source, 'radiusY', null, box), 50, 60);
    expectPoint(gradientHandlePoint(source, 'stop', 'middle', box), 80, 40);
    expect(gradientHandleEdits(source, 'radiusY', null, box, { x: 190, y: 75 })).toEqual([{ gradientId: 'main', component: 'radiusY', value: 35 }]);
    expect(gradientHandleEdits(source, 'stop', 'middle', box, { x: 95, y: 5 })).toEqual([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 75 }]);
  });
  it('uses absolute radius lengths on either side of the center', () => {
    expect(gradientHandleEdits(gradient({ type: 'radial' }), 'radiusX', null, box, { x: 40, y: 80 })).toEqual([{ gradientId: 'main', component: 'radiusX', value: 30 }]);
  });
  it('positions conic stops relative to their own starting angle and keeps winding stable', () => {
    const source = gradient({ type: 'conic', angle: 90, centerX: 50, centerY: 50 });
    expectPoint(gradientHandlePoint(source, 'stop', 'middle', box), 65, 50);
    expect(gradientHandleEdits(source, 'stop', 'middle', box, { x: 65, y: 50 })).toEqual([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 50 }]);
    const wound = { ...source, stops: source.stops.map(stop => stop.id === 'middle' ? { ...stop, position: 150 } : stop) };
    expect(gradientHandleEdits(wound, 'stop', 'middle', box, { x: 65, y: 50 })).toEqual([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 150 }]);
  });
  it('does not invent an angle for a pointer exactly at the center', () => {
    expect(gradientHandleEdits(gradient(), 'angle', null, box, { x: 100, y: 50 })).toEqual([]);
  });
  it('does not offer hidden or unknown stops as editable stage handles', () => {
    const source = gradient(); const hidden = { ...source, stops: source.stops.map(stop => stop.id === 'middle' ? { ...stop, present: false } : stop) };
    expect(gradientHandlePoint(hidden, 'stop', 'middle', box)).toBeNull();
    expect(gradientHandleEdits(source, 'stop', 'missing', box, { x: 30, y: 10 })).toEqual([]);
  });
  it.each([{ width: 0, height: 100 }, { width: 200, height: 0 }, { width: -1, height: 100 }, { width: Number.NaN, height: 100 }])('rejects singular box $width/$height without an approximate coordinate', invalid => {
    expect(gradientHandlePoint(gradient(), 'angle', null, invalid)).toBeNull();
    expect(gradientHandleEdits(gradient(), 'center', null, invalid, { x: 10, y: 10 })).toEqual([]);
  });
  it('refuses a radial stop position conversion when its radius is zero', () => {
    expect(gradientHandlePoint(gradient({ type: 'radial', radiusX: 0 }), 'stop', 'middle', box)).toBeNull();
    expect(gradientHandleEdits(gradient({ type: 'radial', radiusX: 0 }), 'stop', 'middle', box, { x: 120, y: 50 })).toEqual([]);
  });
});
