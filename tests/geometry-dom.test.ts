// tests/geometry-dom.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomOrigin } from '../packages/designer/src/dom-origin.js';
import { geometryContext, geometryDefaults, isGeometryProperty, linearTransform, projectGeometry, validGeometryValue } from '../packages/designer/src/geometry-dom.js';
import type { GeometryProperty } from '../packages/designer/src/geometry-dom.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

function measured(): { readonly parent: HTMLDivElement; readonly element: HTMLDivElement } {
  const parent = document.createElement('div'); const element = document.createElement('div');
  element.style.width = '200px'; element.style.height = '100px'; element.style.padding = '10px'; element.style.border = '2px solid black'; element.style.fontSize = '20px';
  parent.append(element); document.body.append(parent);
  vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(224); vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(124);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, 224, 124));
  vi.spyOn(parent, 'clientWidth', 'get').mockReturnValue(800); vi.spyOn(parent, 'clientHeight', 'get').mockReturnValue(400);
  vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 800, 400));
  return { parent, element };
}

describe('spatial DOM boundary without a Timeline engine', () => {
  it('retains authored dimensions and pivot units before preview', () => {
    const { element } = measured(); element.style.width = '50%'; element.style.height = '10em'; element.style.transformOrigin = '10px 80%';
    const origin = new DomOrigin(element);
    expect(geometryDefaults(origin, element)).toMatchObject({ width: '50%', height: '10em', pivotX: '10px', pivotY: '80%', translateX: '0px', translateY: '0px', rotate: '0deg', scaleX: '1', scaleY: '1' });
  });

  it('uses explicit auto dimensions and centered pivot when no source declares them', () => {
    const element = document.createElement('div'); document.body.append(element); const origin = new DomOrigin(element);
    expect(geometryDefaults(origin, element)).toMatchObject({ width: 'auto', height: 'auto', pivotX: '50%', pivotY: '50%' });
    expect(isGeometryProperty('translateX')).toBe(true); expect(isGeometryProperty('rotation')).toBe(true);
    expect(isGeometryProperty('rotate')).toBe(false); expect(isGeometryProperty('opacity')).toBe(false);
  });

  it.each<[GeometryProperty, string, boolean]>([
    ['translateX', '-10% ', false], ['translateX', '-10%', true], ['translateY', '2.5em', true],
    ['scaleX', '1.5', true], ['scaleY', '.5', true], ['scaleX', '2e2', true], ['scaleX', '0', false], ['scaleY', '-2', false],
    ['scaleX', '1px', false], ['scaleY', 'Infinity', false], ['rotation', '0deg', true], ['rotation', '-.5turn', true],
    ['rotation', '1rad', true], ['rotation', '30', false], ['rotation', 'NaNdeg', false], ['pivotX', '20px', true],
    ['pivotY', 'calc(10px + 2%)', false], ['translateX', 'Infinitypx', false],
  ])('validates %s=%s as %s without interpreting CSS expressions', (property, value, accepted) => {
    expect(validGeometryValue(property, value)).toBe(accepted);
  });

  it('reads a conservative 2D matrix without inventing support for arbitrary transform syntax', () => {
    vi.stubGlobal('DOMMatrix', undefined);
    expect(linearTransform('none')).toEqual({ a: 1, b: 0, c: 0, d: 1 }); expect(linearTransform('')).toEqual({ a: 1, b: 0, c: 0, d: 1 });
    expect(linearTransform('matrix(2,0,0,3,20,30)')).toEqual({ a: 2, b: 0, c: 0, d: 3 });
    expect(linearTransform('rotate(90deg)')).toMatchObject({ b: 1, c: -1 });
    expect(linearTransform('matrix(1,2,3)')).toBeNull(); expect(linearTransform('matrix(1,2,3,4,NaN,6)')).toBeNull();
    expect(linearTransform('translate3d(1px,2px,3px)')).toBeNull(); expect(linearTransform('rotate(.deg)')).toBeNull();
  });

  it('uses native matrix parsing when supplied and refuses native 3D or parser failures', () => {
    const inputs: string[] = [];
    class NativeMatrix {
      public readonly a = 2; public readonly b = 0; public readonly c = 0; public readonly d = 3;
      public readonly is2D: boolean;
      public constructor(value: string) { inputs.push(value); if (value === 'invalid') throw new Error('Invalid native transform'); this.is2D = value !== '3d'; }
    }
    vi.stubGlobal('DOMMatrix', NativeMatrix);
    expect(linearTransform('scale(2,3)')).toEqual({ a: 2, b: 0, c: 0, d: 3 });
    expect(linearTransform('3d')).toBeNull(); expect(linearTransform('invalid')).toBeNull();
    expect(inputs).toEqual(['scale(2,3)', '3d', 'invalid']);
  });

  it('separates border-box measurements from CSS content dimensions', () => {
    const { element } = measured(); const result = geometryContext(element, 'none');
    expect(result.status).toBe('ready'); if (result.status !== 'ready') throw new Error('Expected measurable context');
    expect(result.metrics).toMatchObject({ width: 224, height: 124, cssWidth: 200, cssHeight: 100, parentWidth: 800, parentHeight: 400, fontSize: 20, rootFontSize: 16 });
    expect(result.metrics.viewportWidth).toBe(window.innerWidth); expect(result.metrics.viewportHeight).toBe(window.innerHeight);
  });

  it('uses measured content pixels for expressions and excludes padding and borders', () => {
    const { element } = measured(); element.style.width = 'calc(50% - 10px)'; element.style.height = 'var(--height)';
    const result = geometryContext(element, 'none'); expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected measurable context');
    expect(result.metrics.cssWidth).toBe(200); expect(result.metrics.cssHeight).toBe(100);
    element.style.boxSizing = 'border-box'; const boxed = geometryContext(element, 'none');
    if (boxed.status !== 'ready') throw new Error('Expected measurable border-box context');
    expect(boxed.metrics.cssWidth).toBe(224); expect(boxed.metrics.cssHeight).toBe(124);
  });

  it('falls back from zero client dimensions to a measured parent rectangle', () => {
    const { parent, element } = measured();
    vi.spyOn(parent, 'clientWidth', 'get').mockReturnValue(0); vi.spyOn(parent, 'clientHeight', 'get').mockReturnValue(0);
    const result = geometryContext(element, 'none'); expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected parent rectangle fallback');
    expect(result.metrics.parentWidth).toBe(800); expect(result.metrics.parentHeight).toBe(400);
  });

  it('falls back to the owner viewport when no containing parent exists', () => {
    const { element } = measured(); element.remove();
    const result = geometryContext(element, 'none'); expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected viewport fallback');
    expect(result.metrics.parentWidth).toBe(window.innerWidth); expect(result.metrics.parentHeight).toBe(window.innerHeight);
  });

  it('refuses documents without a view and unmeasurable elements', () => {
    const isolated = document.implementation.createHTMLDocument();
    expect(geometryContext(isolated.createElement('div'), 'none').status).toBe('rejected');
    const { element } = measured(); vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(0);
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 124));
    expect(geometryContext(element, 'none').status).toBe('rejected');
  });

  it.each(['perspective', 'translate', 'rotate', 'scale', 'zoom'] as const)('refuses unsupported CSS %s contexts rather than approximating', property => {
    const { element } = measured();
    const value = property === 'perspective' ? '100px' : property === 'translate' ? '10px' : property === 'rotate' ? '10deg' : '2';
    element.style.setProperty(property, value);
    expect(geometryContext(element, 'none').status).toBe('rejected');
  });

  it('refuses transformed ancestors and singular original matrices', () => {
    const { parent, element } = measured(); parent.style.transform = 'rotate(15deg)';
    expect(geometryContext(element, 'none').status).toBe('rejected'); parent.style.transform = '';
    expect(geometryContext(element, 'matrix(0,0,0,1,0,0)').status).toBe('rejected');
  });

  it('composes temporary geometry with the original raw transform and restores it exactly', () => {
    const { element } = measured(); element.style.transform = 'rotate(30deg)'; element.style.transformOrigin = '50% 50%';
    const original = element.getAttribute('style'); const origin = new DomOrigin(element);
    projectGeometry(origin, element, { translateX: '10px', rotation: '20deg', pivotX: '0%', pivotY: '100%' });
    expect(element.style.transform).toBe('translate(10px, 0px) rotate(20deg) scale(1, 1) rotate(30deg)');
    expect(element.style.transformOrigin).toBe('0% 100%');
    origin.restore(); expect(element.getAttribute('style')).toBe(original);
  });

  it('uses an explicitly evaluated raw transform instead of duplicating the original suffix', () => {
    const { element } = measured(); element.style.transform = 'rotate(30deg)'; const original = element.getAttribute('style');
    const origin = new DomOrigin(element); projectGeometry(origin, element, { translateX: '10px', transform: 'rotate(60deg)' });
    expect(element.style.transform).toContain('rotate(60deg)'); expect(element.style.transform).not.toContain('rotate(30deg)');
    origin.restore(); expect(element.getAttribute('style')).toBe(original);
  });
});
