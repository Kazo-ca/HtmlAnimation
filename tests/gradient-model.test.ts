// tests/gradient-model.test.ts
import { describe, expect, it, vi } from 'vitest';
import { applyGradientEdits, cloneGradientDefinitions, gradientCss, validateGradientDefinitions } from '../packages/css-properties/src/gradient-model.js';
import type { GradientDefinition } from '../packages/css-properties/src/gradient-types.js';

function definitions(): readonly GradientDefinition[] {
  return [{ id: 'main', cssName: 'background-image', type: 'linear', angle: 90, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, stops: [
    { id: 'first', color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 1, position: 0, present: true },
    { id: 'middle', color: { kind: 'color', r: 0, g: 1, b: 0, a: 1 }, opacity: 0.4, position: 50, present: true },
    { id: 'last', color: { kind: 'color', r: 0, g: 0, b: 1, a: 1 }, opacity: 1, position: 100, present: true },
  ] }];
}

describe('structured gradient values without temporal evaluation', () => {
  it('clones nested values without sharing a stop or color object', () => {
    const source = definitions(); const copy = cloneGradientDefinitions(source);
    expect(copy).toEqual(source); expect(copy).not.toBe(source);
    expect(copy[0]?.stops[0]).not.toBe(source[0]?.stops[0]); expect(copy[0]?.stops[0]?.color).not.toBe(source[0]?.stops[0]?.color);
  });

  it('writes one independent point component while preserving all identities and other components', () => {
    const source = definitions(); const result = applyGradientEdits(source, [{ gradientId: 'main', stopId: 'middle', component: 'opacity', value: 0.7 }]);
    expect(source[0]?.stops[1]?.opacity).toBe(0.4); expect(result[0]?.stops[1]?.opacity).toBe(0.7);
    expect(result[0]?.stops.map(stop => stop.id)).toEqual(['first', 'middle', 'last']);
    expect(result[0]?.stops[1]?.color).toEqual(source[0]?.stops[1]?.color); expect(result[0]?.angle).toBe(90);
  });

  it('changes the type and compound center without resetting latent geometry or points', () => {
    const source = definitions();
    const result = applyGradientEdits(source, [{ gradientId: 'main', component: 'type', value: 'radial' }, { gradientId: 'main', component: 'centerX', value: 35 }, { gradientId: 'main', component: 'centerY', value: 65 }]);
    expect(result[0]).toMatchObject({ type: 'radial', angle: 90, centerX: 35, centerY: 65, radiusX: 50, radiusY: 50 });
    expect(result[0]?.stops).toEqual(source[0]?.stops);
  });

  it('retains absent point identities and refuses fewer than two visible points atomically', () => {
    const source = definitions(); const hidden = applyGradientEdits(source, [{ gradientId: 'main', stopId: 'middle', component: 'present', value: false }]);
    expect(hidden[0]?.stops[1]).toMatchObject({ id: 'middle', present: false, position: 50 });
    expect(gradientCss(hidden[0] ?? source[0] as GradientDefinition)).not.toContain('50%');
    expect(() => applyGradientEdits(source, [{ gradientId: 'main', stopId: 'middle', component: 'present', value: false }, { gradientId: 'main', stopId: 'first', component: 'present', value: false }])).toThrow();
    expect(source[0]?.stops.every(stop => stop.present)).toBe(true);
  });

  it('accepts finite percentages outside the nominal range and preserves source point order', () => {
    const result = applyGradientEdits(definitions(), [{ gradientId: 'main', stopId: 'first', component: 'position', value: -25 }, { gradientId: 'main', stopId: 'last', component: 'position', value: 125 }]);
    expect(result[0]?.stops.map(stop => stop.id)).toEqual(['first', 'middle', 'last']);
    expect(gradientCss(result[0] as GradientDefinition)).toContain('125%');
  });

  it('renders crossed points by evaluated position while preserving structural order, IDs and alpha', () => {
    const source = definitions(); const before = JSON.stringify(source);
    const crossed = applyGradientEdits(source, [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 125 }]);
    expect(crossed[0]?.stops.map(stop => stop.id)).toEqual(['first', 'middle', 'last']);
    const css = gradientCss(crossed[0] as GradientDefinition);
    expect(css.indexOf('100%')).toBeLessThan(css.indexOf('125%'));
    expect(css).toContain('rgba(0, 255, 0, 0.4) 125%');
    expect(JSON.stringify(source)).toBe(before); expect(crossed[0]?.stops[1]?.opacity).toBe(0.4);
  });

  it('keeps equal-position points in their structural order for a deterministic hard stop', () => {
    const equal = applyGradientEdits(definitions(), [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 0 }]);
    const css = gradientCss(equal[0] as GradientDefinition);
    expect(css.indexOf('rgba(255, 0, 0')).toBeLessThan(css.indexOf('rgba(0, 255, 0'));
    expect(equal[0]?.stops.map(stop => stop.id)).toEqual(['first', 'middle', 'last']);
  });

  it.each(['linear', 'radial', 'conic'] as const)('serializes a %s definition with separate stop alpha', type => {
    const value = { ...definitions()[0] as GradientDefinition, type };
    const css = gradientCss(value); expect(css).toContain(`${type}-gradient(`); expect(css).toContain('0.4'); expect(css).toContain('50%');
    expect(css).not.toContain('[object Object]');
  });

  it.each([
    { component: 'angle', value: Number.NaN }, { component: 'radiusX', value: -1 },
    { component: 'opacity', stopId: 'middle', value: 1.1 }, { component: 'present', stopId: 'middle', value: 'true' },
    { component: 'type', value: 'arbitrary-css' }, { component: 'color', stopId: 'middle', value: { kind: 'color', r: 1, g: 0, b: 0, a: 0.5 } },
  ])('rejects malformed component input %# without altering the supplied definition', change => {
    const source = definitions(); const before = JSON.stringify(source);
    expect(() => Reflect.apply(applyGradientEdits, undefined, [source, [{ gradientId: 'main', ...change }]])).toThrow();
    expect(JSON.stringify(source)).toBe(before);
  });

  it('refuses unknown gradients/points and invalid selector-like component names', () => {
    const source = definitions();
    expect(() => applyGradientEdits(source, [{ gradientId: 'missing', component: 'angle', value: 20 }])).toThrow();
    expect(() => applyGradientEdits(source, [{ gradientId: 'main', stopId: 'missing', component: 'position', value: 20 }])).toThrow();
    expect(() => Reflect.apply(applyGradientEdits, undefined, [source, [{ gradientId: 'main', component: '__proto__', value: 1 }]])).toThrow();
  });

  it('validates unique gradient/stop identities and normalized opaque color', () => {
    const source = definitions(); const gradient = source[0] as GradientDefinition;
    expect(validateGradientDefinitions(source)).toBeNull();
    expect(validateGradientDefinitions([...source, gradient])).not.toBeNull();
    expect(validateGradientDefinitions([{ ...gradient, stops: [gradient.stops[0] as GradientDefinition['stops'][number], gradient.stops[0] as GradientDefinition['stops'][number]] }])).not.toBeNull();
    expect(Reflect.apply(validateGradientDefinitions, undefined, [[{ ...gradient, stops: gradient.stops.map(stop => ({ ...stop, color: { ...stop.color, r: Number.POSITIVE_INFINITY } })) }]])).not.toBeNull();
  });

  it('rejects executable type coercion without invoking a host object', () => {
    const stringify = vi.fn(() => 'linear'); const source = definitions()[0] as GradientDefinition;
    expect(validateGradientDefinitions([{ ...source, type: { toString: stringify } }])).not.toBeNull(); expect(stringify).not.toHaveBeenCalled();
  });
});
