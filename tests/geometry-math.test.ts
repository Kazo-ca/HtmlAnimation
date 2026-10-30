// tests/geometry-math.test.ts
import { describe, expect, it } from 'vitest';
import { snapPosition, updateGeometry } from '../packages/designer/src/geometry-math.js';
import type { GeometryMetrics, GeometryState, GeometryUpdateResult, Point } from '../packages/designer/src/geometry-math.js';

const state: GeometryState = { translateX: '0px', translateY: '0px', rotate: '0deg', scaleX: '1', scaleY: '1', pivotX: '50%', pivotY: '50%', width: '200px', height: '100px' };
const metrics: GeometryMetrics = { width: 200, height: 100, parentWidth: 800, parentHeight: 400, fontSize: 20, rootFontSize: 16, viewportWidth: 1200, viewportHeight: 900, baseMatrix: { a: 1, b: 0, c: 0, d: 1 } };
function values(result: GeometryUpdateResult): Readonly<Partial<GeometryState>> {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected ready geometry');
  return result.values;
}
function visualPosition(point: Point, data: GeometryState, matrix: GeometryMetrics['baseMatrix']): Point {
  const angle = Number.parseFloat(data.rotate) * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const sx = Number(data.scaleX), sy = Number(data.scaleY);
  const a = cosine * sx * matrix.a - sine * sy * matrix.b;
  const b = sine * sx * matrix.a + cosine * sy * matrix.b;
  const c = cosine * sx * matrix.c - sine * sy * matrix.d;
  const d = sine * sx * matrix.c + cosine * sy * matrix.d;
  const origin = { x: Number.parseFloat(data.pivotX) * metrics.width / 100, y: Number.parseFloat(data.pivotY) * metrics.height / 100 };
  return { x: a * (point.x - origin.x) + c * (point.y - origin.y) + origin.x + Number.parseFloat(data.translateX), y: b * (point.x - origin.x) + d * (point.y - origin.y) + origin.y + Number.parseFloat(data.translateY) };
}

describe('pure spatial geometry without Timeline evaluation', () => {
  it('keeps independent X/Y lengths and does not mutate captured state', () => {
    expect(values(updateGeometry(state, metrics, 'move', { x: 24, y: -12 }))).toEqual({ translateX: '24px', translateY: '-12px' });
    expect(state.translateX).toBe('0px');
  });
  it('preserves translation percentages against the element, rather than its parent', () => {
    expect(values(updateGeometry({ ...state, translateX: '10%', translateY: '20%' }, metrics, 'move', { x: 20, y: 10 }))).toEqual({ translateX: '20%', translateY: '30%' });
  });
  it.each([
    ['50%', '25%', 80, 40, '60%', '35%'],
    ['10em', '5em', 20, 40, '11em', '7em'],
    ['10rem', '5rem', 16, 32, '11rem', '7rem'],
    ['10vw', '10vh', 120, 90, '20vw', '20vh'],
  ])('preserves authored dimension units %s/%s', (width, height, x, y, expectedWidth, expectedHeight) => {
    expect(values(updateGeometry({ ...state, width, height }, metrics, 'dimensions', { x, y }))).toEqual({ width: expectedWidth, height: expectedHeight });
  });
  it('clamps dimension shrinking before crossing zero', () => {
    expect(values(updateGeometry(state, metrics, 'dimensions', { x: -500, y: -1000 }))).toEqual({ width: '1px', height: '1px' });
  });
  it('does not conflate dimensions and independent scales', () => {
    expect(values(updateGeometry({ ...state, scaleX: '2', scaleY: '3' }, metrics, 'scale', { x: 100, y: -50 }))).toEqual({ scaleX: '2.5', scaleY: '2.5' });
    expect(values(updateGeometry(state, metrics, 'scale', { x: -400, y: -400 }))).toEqual({ scaleX: '0.01', scaleY: '0.01' });
  });
  it.each([['20deg', 90, '110deg'], ['0.5turn', 90, '0.75turn'], ['0rad', 180, `${Math.PI}rad`]])('keeps rotation unit %s', (rotate, delta, expected) => {
    const output = values(updateGeometry({ ...state, rotate }, metrics, 'rotate', { x: delta, y: 0 }));
    expect(Number.parseFloat(output.rotate ?? '')).toBeCloseTo(Number.parseFloat(expected), 8);
    expect(output.rotate?.replace(/[+\-\d.]/g, '')).toBe(expected.replace(/[+\-\d.]/g, ''));
  });
  it('requests explicit approval before replacing expressions, with no proposed preview values', () => {
    const result = updateGeometry({ ...state, width: 'calc(50% - 2em)', height: 'var(--height)' }, metrics, 'dimensions', { x: 20, y: 10 });
    expect(result).toMatchObject({ status: 'confirmation-required', properties: ['width', 'height'] });
    expect('values' in result).toBe(false);
  });
  it('uses the supplied measured dimensions after explicit expression replacement approval', () => {
    expect(updateGeometry({ ...state, width: 'calc(50% - 2em)', height: 'auto' }, metrics, 'dimensions', { x: 20, y: 10 }, { allowUnitReplacement: true })).toEqual({ status: 'ready', values: { width: '220px', height: '110px' }, replacements: ['width', 'height'] });
  });
  it('replaces expressions using CSS box dimensions while retaining the border box for pivots', () => {
    const bordered = { ...metrics, width: 124, height: 90, cssWidth: 100, cssHeight: 70 };
    expect(values(updateGeometry({ ...state, width: 'calc(50% - 2em)', height: 'auto' }, bordered, 'dimensions', { x: 10, y: 5 }, { allowUnitReplacement: true }))).toEqual({ width: '110px', height: '75px' });
    expect(values(updateGeometry(state, bordered, 'pivot', { x: 62, y: 45 }))).toMatchObject({ pivotX: '100%', pivotY: '100%' });
  });
  it.each(['cssWidth', 'cssHeight'] as const)('rejects an invalid optional CSS measure %s', key => {
    for (const value of [0, -1, NaN, Infinity]) expect(updateGeometry(state, { ...metrics, [key]: value }, 'move', { x: 0, y: 0 }).status).toBe('rejected');
  });
  it('requests replacement only for the unconvertible dimension', () => {
    expect(updateGeometry({ ...state, height: 'min-content' }, metrics, 'dimensions', { x: 0, y: 10 })).toMatchObject({ status: 'confirmation-required', properties: ['height'] });
  });
  it('moves an identity pivot without shifting the visual position', () => {
    expect(values(updateGeometry(state, metrics, 'pivot', { x: -100, y: 50 }))).toEqual({ pivotX: '0%', pivotY: '100%', translateX: '0px', translateY: '0px' });
  });
  it('compensates a pivot under baseline skew, rotation and nonuniform scale for every corner', () => {
    const transformed = { ...state, translateX: '13px', translateY: '-7px', rotate: '37deg', scaleX: '1.7', scaleY: '0.6' };
    const localMetrics = { ...metrics, baseMatrix: { a: 1.2, b: 0.3, c: -0.2, d: 0.8 } };
    const result = values(updateGeometry(transformed, localMetrics, 'pivot', { x: 60, y: -20 }));
    const next = { ...transformed, ...result };
    for (const corner of [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }]) {
      const before = visualPosition(corner, transformed, localMetrics.baseMatrix);
      const after = visualPosition(corner, next, localMetrics.baseMatrix);
      expect(after.x).toBeCloseTo(before.x, 5); expect(after.y).toBeCloseTo(before.y, 5);
    }
  });
  it('clamps pivots to element bounds and preserves its authored length unit', () => {
    expect(values(updateGeometry({ ...state, pivotX: '100px', pivotY: '50px' }, metrics, 'pivot', { x: 500, y: -500 }))).toMatchObject({ pivotX: '200px', pivotY: '0px' });
  });
  it('preserves percent translation during pivot compensation', () => {
    expect(values(updateGeometry({ ...state, translateX: '10%', translateY: '20%', rotate: '90deg' }, metrics, 'pivot', { x: 100, y: 0 }))).toMatchObject({ translateX: '-40%', translateY: '120%', pivotX: '100%' });
  });
  it.each(['width', 'height', 'parentWidth', 'parentHeight', 'fontSize', 'rootFontSize', 'viewportWidth', 'viewportHeight'] as const)('rejects invalid measure %s before any output', (key) => {
    expect(updateGeometry(state, { ...metrics, [key]: 0 }, 'move', { x: 2, y: 4 }).status).toBe('rejected');
  });
  it('rejects nonfinite deltas, matrix entries, scale and malformed translations', () => {
    expect(updateGeometry(state, metrics, 'move', { x: NaN, y: 0 }).status).toBe('rejected');
    expect(updateGeometry(state, { ...metrics, baseMatrix: { ...metrics.baseMatrix, a: Infinity } }, 'move', { x: 0, y: 0 }).status).toBe('rejected');
    expect(updateGeometry({ ...state, scaleX: '-1' }, metrics, 'pivot', { x: 0, y: 0 }).status).toBe('rejected');
    expect(updateGeometry({ ...state, translateX: 'var(--x)' }, metrics, 'move', { x: 1, y: 0 }, { allowUnitReplacement: true }).status).toBe('rejected');
    expect(updateGeometry({ ...state, rotate: 'calc(10deg)' }, metrics, 'rotate', { x: 1, y: 0 }).status).toBe('rejected');
  });
});

describe('spatial snapping', () => {
  const options = { enabled: true, bypass: false, grid: 10, threshold: 4 };
  it('snaps both axes to nearest grid or target and reports guides', () => {
    expect(snapPosition({ x: 12, y: 28 }, [{ x: 13, y: 25 }], options)).toEqual({ position: { x: 13, y: 30 }, guides: [{ axis: 'x', value: 13 }, { axis: 'y', value: 30 }] });
  });
  it('prefers a real guide over grid on a distance tie', () => {
    expect(snapPosition({ x: 12, y: 26 }, [{ x: 14, y: 24 }], options)).toEqual({ position: { x: 14, y: 24 }, guides: [{ axis: 'x', value: 14 }, { axis: 'y', value: 24 }] });
  });
  it('retains position outside threshold and permits target-only snapping', () => {
    expect(snapPosition({ x: 15, y: 25 }, [], { ...options, threshold: 1 })).toEqual({ position: { x: 15, y: 25 }, guides: [] });
    expect(snapPosition({ x: 12, y: 28 }, [{ x: 13 }], { ...options, grid: 0 })).toEqual({ position: { x: 13, y: 28 }, guides: [{ axis: 'x', value: 13 }] });
  });
  it.each([{ enabled: false, bypass: false }, { enabled: true, bypass: true }])('bypasses snap without mutating source values: %o', overrides => {
    const point = { x: 12, y: 28 };
    expect(snapPosition(point, [{ x: 12 }], { ...options, ...overrides })).toEqual({ position: point, guides: [] });
    expect(point).toEqual({ x: 12, y: 28 });
  });
  it('ignores nonfinite targets and invalid snapping settings', () => {
    expect(snapPosition({ x: 12, y: 28 }, [{ x: NaN, y: Infinity }], { ...options, grid: NaN })).toEqual({ position: { x: 12, y: 28 }, guides: [] });
    expect(snapPosition({ x: 12, y: 28 }, [{ x: 12 }], { ...options, threshold: -1 })).toEqual({ position: { x: 12, y: 28 }, guides: [] });
  });
});
