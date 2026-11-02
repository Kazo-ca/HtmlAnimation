// tests/geometry-controls.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeometryControls } from '../packages/designer/src/geometry-controls.js';
import type { GeometryControlsOptions, GeometryView } from '../packages/designer/src/geometry-controls.js';

const instances: GeometryControls[] = [];
afterEach(() => { for (const controls of instances.splice(0)) controls.destroy(); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(): { controls: GeometryControls; container: HTMLElement; element: HTMLElement; options: GeometryControlsOptions; setView: (patch: Partial<GeometryView>) => void; read: () => GeometryView } {
  const scene = document.createElement('section'); const element = document.createElement('div'); const container = document.createElement('aside');
  element.style.cssText = 'width:160px;height:96px;transform-origin:80px 48px'; scene.append(element); document.body.append(scene, container);
  Object.defineProperties(element, { offsetWidth: { value: 160, configurable: true }, offsetHeight: { value: 96, configurable: true } });
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 100, left: 100, top: 100, right: 260, bottom: 196, width: 160, height: 96, toJSON: () => ({}) });
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 40, left: 20, top: 40, right: 420, bottom: 360, width: 400, height: 320, toJSON: () => ({}) });
  let view: GeometryView = { element, state: { translateX: '0px', translateY: '0px', rotate: '0deg', scaleX: '1', scaleY: '1', pivotX: '50%', pivotY: '50%', width: '160px', height: '96px' }, tool: 'move', mode: 'select', active: false, options: { grid: false, snap: false, guides: true, gridSize: 10 }, guides: [] };
  const options: GeometryControlsOptions = {
    scene, read: () => view,
    setTool: vi.fn<GeometryControlsOptions['setTool']>(tool => { view = { ...view, tool }; }),
    begin: vi.fn<GeometryControlsOptions['begin']>(tool => { view = { ...view, tool, active: true }; return { status: 'changed' }; }),
    update: vi.fn<GeometryControlsOptions['update']>(() => ({ status: 'changed' })),
    commit: vi.fn<GeometryControlsOptions['commit']>(() => { view = { ...view, active: false }; return { status: 'changed' }; }),
    cancel: vi.fn<GeometryControlsOptions['cancel']>(() => { view = { ...view, active: false }; }),
    setOptions: vi.fn<GeometryControlsOptions['setOptions']>(changes => { view = { ...view, options: { ...view.options, ...changes } }; }),
    setPivot: vi.fn<GeometryControlsOptions['setPivot']>(() => ({ status: 'changed' })),
  };
  const controls = new GeometryControls(container, options); instances.push(controls);
  return { controls, container, element, options, setView: patch => { view = { ...view, ...patch }; }, read: () => view };
}
function action(container: ParentNode, label: string): HTMLButtonElement {
  const result = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label);
  if (!result) throw new Error(`Action missing: ${label}`); return result;
}
function handle(tool = 'move'): HTMLButtonElement {
  const result = document.querySelector<HTMLButtonElement>(`[data-geometry-handle="${tool}"]`); if (!result) throw new Error(`Handle missing: ${tool}`);
  const captured = new Set<number>();
  Object.defineProperties(result, { setPointerCapture: { value: (id: number) => { captured.add(id); }, configurable: true }, hasPointerCapture: { value: (id: number) => captured.has(id), configurable: true }, releasePointerCapture: { value: (id: number) => { captured.delete(id); }, configurable: true } });
  return result;
}
function pointer(target: EventTarget, type: string, x: number, y: number, id = 7, extra: MouseEventInit = {}): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...extra }); Object.defineProperty(event, 'pointerId', { value: id }); target.dispatchEvent(event);
}
function fakeMatrix(): void {
  vi.stubGlobal('DOMMatrix', class {
    public readonly a: number; public readonly b: number; public readonly c: number; public readonly d: number; public readonly e: number; public readonly f: number; public readonly is2D = true;
    public constructor(source: string) { const values = source.slice(source.indexOf('(') + 1, -1).split(',').map(Number); this.a = values[0] ?? 1; this.b = values[1] ?? 0; this.c = values[2] ?? 0; this.d = values[3] ?? 1; this.e = values[4] ?? 0; this.f = values[5] ?? 0; }
  });
}

describe('host-controlled geometry UI', () => {
  it('exposes tools, presets, optional aids and values without changing the host element', () => {
    const { container, element, options, controls, setView } = setup(); const original = element.outerHTML;
    action(container, 'Dimensions').click(); expect(options.setTool).toHaveBeenCalledWith('dimensions');
    action(container, 'Pivot haut droite').click(); expect(options.setPivot).toHaveBeenCalledWith(100, 0);
    const grid = [...container.querySelectorAll('label')].find(label => label.textContent === 'Grille')?.querySelector('input'); grid?.click();
    expect(options.setOptions).toHaveBeenCalledWith({ grid: true }); expect(document.querySelector<HTMLElement>('.HtmlDesignerGeometryGrid')?.hidden).toBe(false);
    setView({ guides: [{ axis: 'x', value: 150 }, { axis: 'y', value: 220 }] }); controls.refresh();
    expect(document.querySelector<HTMLElement>('.geometry-guide-x')?.style.left).toBe('150px'); expect(document.querySelector<HTMLElement>('.geometry-guide-y')?.style.top).toBe('220px');
    expect(element.outerHTML).toBe(original);
    setView({ mode: 'test' }); controls.refresh(); expect(action(container, 'Dimensions').disabled).toBe(true); expect(document.querySelector<HTMLElement>('.HtmlDesignerGeometryOverlay')?.hidden).toBe(true);
    setView({ state: null, element: null, mode: 'select' }); controls.refresh(); expect(container.textContent).toContain('Sélectionnez une cible individuelle');
  });

  it('routes absolute pointer deltas and Alt to one host commit after preview', () => {
    const { options, element } = setup(); const original = element.outerHTML; const button = handle();
    pointer(button, 'pointerdown', 180, 90); pointer(window, 'pointermove', 190, 105, 99); expect(options.update).not.toHaveBeenCalled();
    pointer(window, 'pointermove', 190, 105); pointer(window, 'pointermove', 204, 109, 7, { altKey: true });
    expect(options.update).toHaveBeenLastCalledWith({ x: 24, y: 19 }, { bypassSnap: true }); expect(options.commit).not.toHaveBeenCalled();
    pointer(window, 'pointerup', 204, 109); expect(options.commit).toHaveBeenCalledOnce(); expect(element.outerHTML).toBe(original);
  });

  it.each(['pointercancel', 'lostpointercapture', 'Escape'] as const)('cancels %s without committing a preview', event => {
    const { options } = setup(); const button = handle(); pointer(button, 'pointerdown', 180, 90); pointer(window, 'pointermove', 200, 110);
    vi.mocked(options.cancel).mockClear();
    if (event === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    else pointer(event === 'pointercancel' ? window : button, event, 200, 110);
    pointer(window, 'pointerup', 200, 110); expect(options.cancel).toHaveBeenCalledOnce(); expect(options.commit).not.toHaveBeenCalled();
  });

  it('requires explicit unit conversion consent and applies the latest pending delta', () => {
    const { options, container } = setup(); const button = handle('dimensions');
    vi.mocked(options.update).mockImplementation((_delta, options) => options?.allowUnitReplacement ? { status: 'changed' } : { status: 'confirmation-required', properties: ['width'], message: 'Autoriser le remplacement de calc(...) par des pixels.' });
    pointer(button, 'pointerdown', 260, 196); pointer(window, 'pointermove', 270, 201); pointer(window, 'pointermove', 280, 206); pointer(window, 'pointerup', 280, 206);
    expect(options.commit).not.toHaveBeenCalled(); expect(container.textContent).toContain('Autoriser le remplacement');
    action(container, 'Convertir en pixels et appliquer').click();
    expect(options.update).toHaveBeenLastCalledWith({ x: 20, y: 10 }, { allowUnitReplacement: true, bypassSnap: false }); expect(options.commit).toHaveBeenCalledOnce();
    expect(container.querySelector<HTMLElement>('.geometry-confirmation')?.hidden).toBe(true);
  });

  it('cancels an unaccepted conversion and drops stale consent after an external cancellation', () => {
    const { options, container, controls, setView } = setup(); const button = handle('dimensions');
    vi.mocked(options.update).mockReturnValue({ status: 'confirmation-required', properties: ['width'], message: 'Conversion requise.' });
    pointer(button, 'pointerdown', 260, 196); pointer(window, 'pointermove', 280, 206); pointer(window, 'pointerup', 280, 206);
    action(container, 'Annuler le geste').click(); expect(options.commit).not.toHaveBeenCalled();
    pointer(button, 'pointerdown', 260, 196); pointer(window, 'pointermove', 280, 206); setView({ active: false }); controls.refresh(); pointer(window, 'pointerup', 280, 206);
    action(container, 'Convertir en pixels et appliquer').click(); expect(options.commit).not.toHaveBeenCalled(); expect(container.querySelector<HTMLElement>('.geometry-confirmation')?.hidden).toBe(true);
  });

  it('accounts for a relative origin when resizing but inverts the full matrix for pivot movement', () => {
    const { options, element } = setup(); fakeMatrix(); element.style.transform = 'matrix(2,0,0,3,0,0)';
    for (const tool of ['dimensions', 'pivot']) {
      pointer(handle(tool), 'pointerdown', 260, 196); pointer(window, 'pointermove', 272, 214); pointer(window, 'pointerup', 272, 214);
      expect(options.update).toHaveBeenLastCalledWith(tool === 'dimensions' ? { x: 8, y: 9 } : { x: 6, y: 6 }, { bypassSnap: false });
    }
  });

  it.each([
    { pivotX: '50%', pivotY: '50%', x: 20, y: -20 },
    { pivotX: '80px', pivotY: '48px', x: 0, y: -20 },
    { pivotX: '0%', pivotY: '50%', x: 20, y: -40 },
  ])('maps dimensions through the corner Jacobian for $pivotX / $pivotY', ({ pivotX, pivotY, x, y }) => {
    const { options, element, setView, read } = setup(); fakeMatrix(); element.style.transform = 'matrix(0,1,-1,0,0,0)';
    const state = read().state; if (!state) throw new Error('Missing state'); setView({ state: { ...state, pivotX, pivotY, rotate: '90deg' } });
    pointer(handle('dimensions'), 'pointerdown', 260, 196); pointer(window, 'pointermove', 280, 196); pointer(window, 'pointerup', 280, 196);
    expect(options.update).toHaveBeenLastCalledWith({ x, y }, { bypassSnap: false });
  });

  it('cancels a singular dimensions gesture without sending an approximate delta', () => {
    const { options, element, container } = setup(); fakeMatrix(); element.style.transform = 'matrix(-1,0,0,-1,0,0)';
    pointer(handle('dimensions'), 'pointerdown', 260, 196); pointer(window, 'pointermove', 280, 206); pointer(window, 'pointerup', 280, 206);
    expect(options.update).not.toHaveBeenCalled(); expect(options.commit).not.toHaveBeenCalled(); expect(container.textContent).toContain('origine');
  });

  it('refuses an unresolved relative-origin expression instead of treating it as a fixed origin', () => {
    const { options, container, setView, read } = setup(); const state = read().state; if (!state) throw new Error('Missing state');
    setView({ state: { ...state, pivotX: 'calc(50% + 10px)' } });
    pointer(handle('dimensions'), 'pointerdown', 260, 196); pointer(window, 'pointermove', 280, 206); pointer(window, 'pointerup', 280, 206);
    expect(options.update).not.toHaveBeenCalled(); expect(options.commit).not.toHaveBeenCalled(); expect(container.textContent).toContain('origine');
  });

  it('includes controlled percentage translations in the dimensions corner Jacobian', () => {
    const { options, setView, read } = setup(); const state = read().state; if (!state) throw new Error('Missing state');
    setView({ state: { ...state, translateX: '50%', translateY: '25%' } });
    pointer(handle('dimensions'), 'pointerdown', 260, 196); pointer(window, 'pointermove', 272, 211); pointer(window, 'pointerup', 272, 211);
    expect(options.update).toHaveBeenLastCalledWith({ x: 8, y: 12 }, { bypassSnap: false });
  });

  it('computes rotation around the visual pivot and keeps the delta in degrees', () => {
    const { options } = setup(); pointer(handle('rotate'), 'pointerdown', 180, 70); pointer(window, 'pointermove', 258, 148); pointer(window, 'pointerup', 258, 148);
    expect(options.update).toHaveBeenLastCalledWith({ x: 90, y: 0 }, { bypassSnap: false });
  });

  it('maps a second scale gesture independently of the current nonuniform scale', () => {
    const { options, element, setView, read } = setup(); fakeMatrix(); element.style.transform = 'matrix(0,2,-3,0,0,0)';
    const state = read().state; if (!state) throw new Error('Missing state'); setView({ state: { ...state, scaleX: '2', scaleY: '3', rotate: '90deg' } });
    pointer(handle('scale'), 'pointerdown', 260, 196); pointer(window, 'pointermove', 245.6, 212); pointer(window, 'pointerup', 245.6, 212);
    expect(options.update).toHaveBeenLastCalledWith({ x: expect.closeTo(32, 6), y: expect.closeTo(28.8, 6) }, { bypassSnap: false });
  });

  it('includes a constant baseline translation in the scale axis after removing the controlled translation', () => {
    const { options, element, setView, read } = setup(); fakeMatrix(); element.style.transform = 'matrix(0,2,-3,0,10,60)';
    const state = read().state; if (!state) throw new Error('Missing state'); setView({ state: { ...state, scaleX: '2', scaleY: '3', rotate: '90deg', translateX: '10px', translateY: '20px' } });
    pointer(handle('scale'), 'pointerdown', 260, 196); pointer(window, 'pointermove', 245.6, 216); pointer(window, 'pointerup', 245.6, 216);
    expect(options.update).toHaveBeenLastCalledWith({ x: expect.closeTo(32, 6), y: expect.closeTo(28.8, 6) }, { bypassSnap: false });
  });

  it('places a corner handle from fractional border-box dimensions rather than rounded offsets', () => {
    const { controls, element } = setup(); fakeMatrix(); element.style.width = '160.4px'; element.style.height = '96.4px'; element.style.transform = 'matrix(0,3,-2,0,0,0)';
    controls.refresh(); expect(handle('dimensions').style.left).toBe('0px'); expect(Number.parseFloat(handle('dimensions').style.top)).toBeCloseTo(481.2, 6);
  });

  it('refuses a scale handle coinciding with its pivot instead of inventing a conversion', () => {
    const { options, element, container } = setup(); element.style.transformOrigin = '160px 96px';
    pointer(handle('scale'), 'pointerdown', 260, 196); pointer(window, 'pointermove', 280, 206); pointer(window, 'pointerup', 280, 206);
    expect(options.update).not.toHaveBeenCalled(); expect(options.commit).not.toHaveBeenCalled(); expect(container.textContent).toContain('Déplacez le pivot');
  });

  it('performs precise keyboard commands only from its movement handle', () => {
    const { options, container } = setup(); const input = document.createElement('input'); container.append(input); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(options.begin).not.toHaveBeenCalled(); const button = handle();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(options.update).toHaveBeenLastCalledWith({ x: 1, y: 0 }, { bypassSnap: true });
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
    expect(options.update).toHaveBeenLastCalledWith({ x: 0, y: 10 }, { bypassSnap: true }); expect(options.commit).toHaveBeenCalledTimes(2);
  });

  it('reports refused gestures and removes every owned UI surface on destruction', () => {
    const { options, container, controls } = setup(); vi.mocked(options.begin).mockReturnValue({ status: 'rejected', message: 'Cible incompatible.' });
    const button = handle(); pointer(button, 'pointerdown', 180, 90); expect(container.textContent).toContain('Cible incompatible.');
    vi.mocked(options.begin).mockClear(); controls.destroy(); controls.destroy(); pointer(button, 'pointerdown', 180, 90); pointer(window, 'pointermove', 190, 100);
    expect(options.begin).not.toHaveBeenCalled(); expect(options.update).not.toHaveBeenCalled(); expect(container.childElementCount).toBe(0); expect(document.querySelector('.HtmlDesignerGeometryOverlay')).toBe(null); expect(document.querySelector('.HtmlDesignerGeometryGrid')).toBe(null);
  });
});
