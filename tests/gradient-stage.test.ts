// tests/gradient-stage.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GradientDefinition } from '../packages/css-properties/src/gradient-types.js';
import { GradientControls } from '../packages/designer/src/gradient-controls.js';
import type { GradientStageView } from '../packages/designer/src/gradient-controls.js';

const instances: GradientControls[] = [];
afterEach(() => { for (const controls of instances.splice(0)) controls.destroy(); document.body.replaceChildren(); vi.restoreAllMocks(); });
function setup(type: GradientDefinition['type'] = 'linear'): { controls: GradientControls; options: ConstructorParameters<typeof GradientControls>[1]; element: HTMLElement; setView(patch: Partial<GradientStageView>): void } {
  const element = document.createElement('div'); const container = document.createElement('aside'); document.body.append(element, container);
  element.style.cssText = 'color: red; background-image: linear-gradient(red,blue)';
  const gradient: GradientDefinition = { id: 'main', cssName: 'background-image', type, angle: 90, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, stops: [
    { id: 'first', color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 1, position: 0, present: true },
    { id: 'last', color: { kind: 'color', r: 0, g: 0, b: 1, a: 1 }, opacity: 1, position: 100, present: true },
  ] };
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 100, left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100, toJSON: () => ({}) });
  let view: GradientStageView = { element, gradient, stopId: 'last', visible: true, interactive: true, active: false };
  const options = {
    read: () => view,
    begin: vi.fn(() => { view = { ...view, active: true }; }),
    preview: vi.fn(), commit: vi.fn(() => { view = { ...view, active: false }; }), cancel: vi.fn(() => { view = { ...view, active: false }; }),
  };
  const controls = new GradientControls(container, options); instances.push(controls);
  return { controls, options, element, setView: patch => { view = { ...view, ...patch }; } };
}
function handle(name = 'stop'): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-gradient-handle="${name}"]`); if (!button) throw new Error(`Missing handle ${name}`);
  const captured = new Set<number>();
  Object.defineProperties(button, { setPointerCapture: { configurable: true, value: (id: number) => { captured.add(id); } }, hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) }, releasePointerCapture: { configurable: true, value: (id: number) => { captured.delete(id); } } });
  return button;
}
function pointer(target: EventTarget, type: string, x: number, y: number, id = 7, button = 0): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }); Object.defineProperty(event, 'pointerId', { value: id }); target.dispatchEvent(event);
}

describe('host-controlled gradient stage UI', () => {
  it('unwraps a continuous conic stop gesture using the previous preview across half and full turns', () => {
    const { controls, options, setView } = setup('conic'); const original = options.read().gradient; if (!original) throw new Error('Missing gradient');
    setView({ gradient: { ...original, angle: 0 }, stopId: 'first' }); controls.refresh();
    const button = handle('stop'); const visual = { x: Number.parseFloat(button.style.left), y: Number.parseFloat(button.style.top) };
    const offset = { x: visual.x - 100, y: visual.y - 15 };
    pointer(button, 'pointerdown', 100 + visual.x, 100 + visual.y);
    for (const degrees of [90, 170, 180, 190, 270, 350, 360, 370]) {
      const radians = degrees * Math.PI / 180;
      pointer(window, 'pointermove', 200 + Math.sin(radians) * 35 + offset.x, 150 - Math.cos(radians) * 35 + offset.y);
      const edit = vi.mocked(options.preview).mock.calls.at(-1)?.[0][0];
      expect(edit?.stopId).toBe('first'); expect(Number(edit?.value)).toBeCloseTo(degrees / 3.6, 6);
    }
    pointer(window, 'pointerup', 200 + offset.x, 115 + offset.y); expect(options.commit).toHaveBeenCalledOnce();
  });
  it.each([{ type: 'linear', shown: ['angle', 'stop'] }, { type: 'radial', shown: ['center', 'radiusX', 'radiusY', 'stop'] }, { type: 'conic', shown: ['angle', 'center', 'stop'] }] as const)('exposes the relevant $type handles and leaves source HTML unchanged', ({ type, shown }) => {
    const { element } = setup(type); const original = element.outerHTML;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-gradient-handle]')) expect(button.hidden).toBe(!shown.some(name => name === button.dataset.gradientHandle));
    expect(handle('stop').getAttribute('aria-label')).toBe('Position du point sélectionné'); expect(element.outerHTML).toBe(original);
  });
  it('previews independent edits and commits once on pointerup without writing source styles', () => {
    const { element, options } = setup(); const original = element.outerHTML;
    pointer(handle(), 'pointerdown', 300, 150); pointer(window, 'pointermove', 250, 150, 99); expect(options.preview).not.toHaveBeenCalled();
    pointer(window, 'pointermove', 250, 150); pointer(window, 'pointermove', 260, 150);
    expect(options.preview).toHaveBeenLastCalledWith([{ gradientId: 'main', stopId: 'last', component: 'position', value: 80 }]); expect(options.commit).not.toHaveBeenCalled();
    pointer(window, 'pointerup', 260, 150); expect(options.begin).toHaveBeenCalledOnce(); expect(options.commit).toHaveBeenCalledOnce(); expect(element.outerHTML).toBe(original);
  });
  it.each(['pointercancel', 'lostpointercapture', 'Escape'] as const)('cancels %s without committing or accepting a later pointerup', reason => {
    const { options } = setup(); const button = handle(); pointer(button, 'pointerdown', 300, 150); pointer(window, 'pointermove', 250, 150); vi.mocked(options.cancel).mockClear();
    if (reason === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    else pointer(reason === 'pointercancel' ? window : button, reason, 250, 150);
    pointer(window, 'pointerup', 250, 150); expect(options.cancel).toHaveBeenCalledOnce(); expect(options.commit).not.toHaveBeenCalled();
  });
  it('does not open a command on a disabled handle or a non-primary pointer', () => {
    const { options, controls, setView } = setup(); pointer(handle(), 'pointerdown', 300, 150, 7, 2); expect(options.begin).not.toHaveBeenCalled();
    setView({ interactive: false }); controls.refresh(); expect(handle().disabled).toBe(true); pointer(handle(), 'pointerdown', 300, 150); expect(options.begin).not.toHaveBeenCalled();
  });
  it('drops an externally cancelled draft before the old pointerup can commit', () => {
    const { controls, setView, options } = setup(); pointer(handle(), 'pointerdown', 300, 150); pointer(window, 'pointermove', 250, 150);
    setView({ active: false }); controls.refresh(); pointer(window, 'pointerup', 250, 150); expect(options.commit).not.toHaveBeenCalled();
  });
  it('does not attach a click to a different host selection changed during begin', () => {
    const { options, setView } = setup();
    vi.mocked(options.begin).mockImplementation(() => { setView({ active: true, stopId: 'first' }); });
    pointer(handle(), 'pointerdown', 300, 150); pointer(window, 'pointermove', 250, 150); pointer(window, 'pointerup', 250, 150);
    expect(options.preview).not.toHaveBeenCalled(); expect(options.commit).not.toHaveBeenCalled(); expect(options.cancel).toHaveBeenCalledOnce();
  });
  it('cancels if pointer capture fails instead of retaining a half-open command', () => {
    const { options } = setup(); const button = handle();
    Object.defineProperty(button, 'setPointerCapture', { configurable: true, value: () => { throw new Error('Inactive pointer'); } });
    pointer(button, 'pointerdown', 300, 150); pointer(window, 'pointermove', 250, 150); pointer(window, 'pointerup', 250, 150);
    expect(options.cancel).toHaveBeenCalledOnce(); expect(options.preview).not.toHaveBeenCalled(); expect(options.commit).not.toHaveBeenCalled();
  });
  it('cancels a pointer draft if external scrolling changes its captured scene coordinates', () => {
    const { options, element } = setup(); pointer(handle(), 'pointerdown', 300, 150); vi.mocked(options.cancel).mockClear();
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ x: 100, y: 80, left: 100, top: 80, right: 300, bottom: 180, width: 200, height: 100, toJSON: () => ({}) });
    document.dispatchEvent(new Event('scroll')); pointer(window, 'pointermove', 250, 150); pointer(window, 'pointerup', 250, 150);
    expect(options.cancel).toHaveBeenCalledOnce(); expect(options.preview).not.toHaveBeenCalled(); expect(options.commit).not.toHaveBeenCalled();
  });
  it('cancels a gesture if the host changes its selected stop', () => {
    const { controls, setView, options } = setup(); pointer(handle(), 'pointerdown', 300, 150); pointer(window, 'pointermove', 250, 150); vi.mocked(options.cancel).mockClear();
    setView({ stopId: 'first' }); controls.refresh(); pointer(window, 'pointerup', 250, 150); expect(options.commit).not.toHaveBeenCalled(); expect(options.cancel).toHaveBeenCalledOnce();
  });
  it('rechecks host selection before publishing the next pointer event even without an explicit refresh', () => {
    const { setView, options } = setup(); pointer(handle(), 'pointerdown', 300, 150); vi.mocked(options.cancel).mockClear();
    setView({ stopId: 'first' }); pointer(window, 'pointermove', 250, 150); pointer(window, 'pointerup', 250, 150);
    expect(options.preview).not.toHaveBeenCalled(); expect(options.commit).not.toHaveBeenCalled(); expect(options.cancel).toHaveBeenCalledOnce();
  });
  it('updates coordinates silently after scrolling and hides the overlay in Test mode', () => {
    const { controls, options, setView, element } = setup(); expect(handle().style.left).toBe('200px');
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ x: 20, y: 40, left: 20, top: 40, right: 220, bottom: 140, width: 200, height: 100, toJSON: () => ({}) });
    document.dispatchEvent(new Event('scroll')); expect(document.querySelector<HTMLElement>('.HtmlDesignerGradientOverlay')?.style.left).toBe('20px'); expect(options.begin).not.toHaveBeenCalled();
    setView({ visible: false }); controls.refresh(); expect(document.querySelector<HTMLElement>('.HtmlDesignerGradientOverlay')?.hidden).toBe(true);
  });
  it.each([{ origin: 'border-box', left: '100px', top: '100px', width: '200px' }, { origin: 'padding-box', left: '110px', top: '110px', width: '180px' }, { origin: 'content-box', left: '118px', top: '118px', width: '164px' }])('uses the CSS $origin positioning area for the gradient handles', ({ origin, left, top, width }) => {
    const { controls, element } = setup(); element.style.border = '10px solid black'; element.style.padding = '8px'; element.style.backgroundOrigin = origin;
    controls.refresh(); const overlay = document.querySelector<HTMLElement>('.HtmlDesignerGradientOverlay');
    expect(overlay?.style.left).toBe(left); expect(overlay?.style.top).toBe(top); expect(overlay?.style.width).toBe(width);
    expect(handle().style.left).toBe(width);
  });
  it('does not guess which positioning area to use for mixed per-layer origins', () => {
    const { controls, element } = setup(); element.style.backgroundOrigin = 'border-box, content-box'; controls.refresh();
    expect(document.querySelector<HTMLElement>('.HtmlDesignerGradientOverlay')?.hidden).toBe(true);
  });
  it('uses selected-stop arrow keys as a single precise command and ignores unrelated keys', () => {
    const { options } = setup(); const button = handle();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    expect(options.begin).toHaveBeenCalledOnce(); expect(options.preview).toHaveBeenLastCalledWith([{ gradientId: 'main', stopId: 'last', component: 'position', value: 110 }]); expect(options.commit).toHaveBeenCalledOnce();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })); expect(options.commit).toHaveBeenCalledOnce();
  });
  it('separates coincident conic handles while pointer edits retain the exact gradient coordinate', () => {
    const { options } = setup('conic'); const angle = handle('angle'); const stop = handle('stop');
    const anglePoint = { x: Number.parseFloat(angle.style.left), y: Number.parseFloat(angle.style.top) };
    const stopPoint = { x: Number.parseFloat(stop.style.left), y: Number.parseFloat(stop.style.top) };
    expect(Math.hypot(anglePoint.x - stopPoint.x, anglePoint.y - stopPoint.y)).toBeGreaterThanOrEqual(32);
    const offset = { x: stopPoint.x - 135, y: stopPoint.y - 50 };
    pointer(stop, 'pointerdown', 100 + stopPoint.x, 100 + stopPoint.y);
    pointer(window, 'pointermove', 200 + offset.x, 185 + offset.y);
    expect(options.preview).toHaveBeenLastCalledWith([{ gradientId: 'main', stopId: 'last', component: 'position', value: 125 }]);
    pointer(window, 'pointerup', 200 + offset.x, 185 + offset.y); expect(options.commit).toHaveBeenCalledOnce();
  });
  it('keeps radial center and zero-radius handles independently reachable without changing their values', () => {
    const { controls, options, setView } = setup('radial'); const source = options.read().gradient;
    if (!source) throw new Error('Missing gradient'); setView({ gradient: { ...source, radiusX: 0, radiusY: 0 } }); controls.refresh();
    const points = ['center', 'radiusX', 'radiusY'].map(name => ({ x: Number.parseFloat(handle(name).style.left), y: Number.parseFloat(handle(name).style.top) }));
    for (const [index, point] of points.entries()) for (const other of points.slice(index + 1)) expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(32);
    const radius = handle('radiusX'); const x = Number.parseFloat(radius.style.left); const y = Number.parseFloat(radius.style.top);
    pointer(radius, 'pointerdown', 100 + x, 100 + y); pointer(window, 'pointermove', 120 + x, 100 + y);
    expect(options.preview).toHaveBeenLastCalledWith([{ gradientId: 'main', component: 'radiusX', value: 10 }]);
    pointer(window, 'pointerup', 120 + x, 100 + y); expect(options.commit).toHaveBeenCalledOnce();
  });
  it('releases an in-flight preview and removes handlers and overlay on disposal', () => {
    const { controls, options } = setup(); const button = handle(); pointer(button, 'pointerdown', 300, 150); pointer(window, 'pointermove', 250, 150); vi.mocked(options.cancel).mockClear();
    controls.destroy(); pointer(window, 'pointerup', 250, 150); pointer(button, 'pointerdown', 300, 150);
    expect(options.cancel).toHaveBeenCalledOnce(); expect(options.commit).not.toHaveBeenCalled(); expect(document.querySelector('.HtmlDesignerGradientOverlay')).toBeNull();
  });
});
