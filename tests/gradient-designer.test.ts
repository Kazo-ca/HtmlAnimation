// tests/gradient-designer.test.ts
// Designer orchestration against explicit simulations; no real Timeline conformity claim.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture } from './helpers.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createGradientTimeline } from '../fixtures/gradient-timeline.js';
import { gradientCss } from '@kazo-ca/css-properties';

const designers: HtmlDesigner[] = [];
afterEach(() => { for (const designer of designers.splice(0)) designer.dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function legacySetup(): { readonly designer: HtmlDesigner; readonly timeline: ReturnType<typeof createRecordedTimeline> } {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer);
  designer.selectTarget('#button-2'); return { designer, timeline };
}

function setup(): { readonly designer: HtmlDesigner; readonly timeline: ReturnType<typeof createGradientTimeline>; readonly scene: HTMLElement; readonly element: HTMLElement; readonly propertiesContainer: HTMLElement } {
  const scene = createGradientScene(document); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
  document.body.append(scene, propertiesContainer, treeContainer);
  const element = scene.querySelector<HTMLElement>('#gradient-box'); if (!element) throw new Error('Missing gradient scene target');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 300, 180));
  const timeline = createGradientTimeline(); const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: instance => instance });
  designers.push(designer); designer.selectTarget('#gradient-box'); return { designer, timeline, scene, element, propertiesContainer };
}
function current(designer: HtmlDesigner) {
  const gradient = designer.getGradientState()?.gradients.find(candidate => candidate.id === 'main'); if (!gradient) throw new Error('Missing evaluated gradient'); return gradient;
}
function input(container: HTMLElement, label: string): HTMLInputElement {
  const field = [...container.querySelectorAll<HTMLInputElement>('input')].find(field => field.getAttribute('aria-label') === label);
  if (!field) throw new Error(`Missing gradient field ${label}`); return field;
}

describe('independent gradient tracks through an optional adapter capability', () => {
  it('reports the committed frame and value when a post-commit host observer seeks elsewhere', () => {
    const { designer, timeline } = setup(); const event = vi.fn(); designer.on('propertychange', event);
    timeline.onChange(reason => { if (reason === 'execute') timeline.navigate(50); });
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
    expect(timeline.getState().frame).toBe(50); expect(event).toHaveBeenCalledOnce();
    expect(event).toHaveBeenCalledWith(expect.objectContaining({ frame: 1, oldValue: '90', newValue: '35' }));
  });

  it('retains accepted addition receipts even when a post-commit observer immediately undoes them', () => {
    const { designer, timeline } = setup(); const event = vi.fn(); designer.on('propertychange', event); const keys = timeline.getKeys();
    let first = true; timeline.onChange(reason => { if (reason === 'execute' && first) { first = false; timeline.undo(); } });
    expect(designer.addGradientStop('main', { color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 0.6, position: 30 }).status).toBe('changed');
    expect(timeline.getKeys()).toEqual(keys); expect(event).toHaveBeenCalledTimes(4);
    expect(event.mock.calls.some(([change]) => change?.newValue === 'true' && change.frame === 1)).toBe(true);
  });
  it('rejects duplicate component addresses without keys or duplicate user events', () => {
    const { designer, timeline } = setup(); const keys = timeline.getKeys(); const event = vi.fn(); designer.on('propertychange', event);
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }, { gradientId: 'main', component: 'angle', value: 45 }]).status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys); expect(event).not.toHaveBeenCalled();
  });

  for (const attachment of ['fixed', 'local']) it(`disables inaccurate ${attachment} background handles while retaining the fields`, () => {
    const { designer, element, propertiesContainer } = setup(); element.style.backgroundAttachment = attachment;
    designer.selectTarget('#gradient-box');
    const handle = document.querySelector<HTMLButtonElement>('[data-gradient-handle="angle"]'); expect(handle?.disabled).toBe(true);
    expect(propertiesContainer.textContent).toContain('attachement');
    expect(input(propertiesContainer, 'Angle du dégradé').disabled).toBe(false);
  });
  it('keeps an older string-value adapter inspectable without inventing structured gradients', () => {
    const { designer, timeline } = legacySetup();
    expect(typeof designer.getGradientState).toBe('function');
    expect(designer.getGradientState()).toBeNull();
    expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
  });

  it('refuses a structured gradient command without the optional capability and leaves history intact', () => {
    const { designer, timeline } = legacySetup(); const execute = vi.spyOn(timeline, 'execute');
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 45 }]).status).toBe('rejected');
    expect(execute).not.toHaveBeenCalled(); expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
  });

  it('writes only the selected component and restores its key and preview with one undo', () => {
    const { designer, timeline, element } = setup(); const before = timeline.getKeys(); const background = element.style.backgroundImage;
    const change = vi.fn(); const source = vi.fn(); designer.on('propertychange', change); designer.on('documentchange', source);
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
    expect(current(designer).angle).toBe(35); expect(timeline.getKeys()).toHaveLength(before.length + 1); expect(change).toHaveBeenCalledOnce();
    expect(element.style.backgroundImage).not.toBe(background); expect(source).not.toHaveBeenCalled();
    designer.undo(); expect(timeline.getKeys()).toEqual(before); expect(element.style.backgroundImage).toBe(background);
    designer.redo(); expect(current(designer).angle).toBe(35); expect(source).not.toHaveBeenCalled();
  });

  it('keeps stop color and alpha as separate channels and never renumbers other points', () => {
    const { designer, timeline } = setup(); const before = current(designer); const keys = timeline.getKeys();
    const color = { kind: 'color' as const, r: 0.2, g: 0.5, b: 0.7, a: 1 as const };
    expect(designer.editGradient([{ gradientId: 'main', stopId: 'middle', component: 'color', value: color }]).status).toBe('changed');
    const colored = current(designer); expect(colored.stops.map(stop => stop.id)).toEqual(before.stops.map(stop => stop.id));
    expect(colored.stops.find(stop => stop.id === 'middle')?.color).toEqual(color);
    expect(colored.stops.find(stop => stop.id === 'middle')?.opacity).toBe(before.stops.find(stop => stop.id === 'middle')?.opacity);
    expect(designer.editGradient([{ gradientId: 'main', stopId: 'middle', component: 'opacity', value: 0.35 }]).status).toBe('changed');
    expect(current(designer).stops.find(stop => stop.id === 'middle')?.color).toEqual(color);
    expect(timeline.getKeys()).toHaveLength(keys.length + 2);
    designer.undo(); expect(current(designer).stops.find(stop => stop.id === 'middle')?.color).toEqual(color);
    designer.undo(); expect(current(designer)).toEqual(before); expect(timeline.getKeys()).toEqual(keys);
  });

  it('adds one stable point at the chosen frame atomically with absent initial presence', () => {
    const { designer, timeline } = setup(); timeline.navigate(50); const before = current(designer); const keys = timeline.getKeys();
    const context = vi.fn(); const original = vi.fn(); const property = vi.fn();
    designer.on('gradientchange', context); designer.on('documentchange', original); designer.on('propertychange', property);
    expect(designer.addGradientStop('main', { color: { kind: 'color', r: 1, g: 0.5, b: 0, a: 1 }, opacity: 0.6, position: 35 }).status).toBe('changed');
    const after = current(designer); const added = after.stops.find(stop => !before.stops.some(prior => prior.id === stop.id));
    if (!added) throw new Error('Missing added stable point'); expect(added.present).toBe(true);
    expect(after.stops.filter(stop => stop.id !== added.id)).toEqual(before.stops);
    const definition = designer.getGradientState()?.definitions.find(gradient => gradient.id === 'main');
    expect(definition?.stops.find(stop => stop.id === added.id)?.present).toBe(false);
    expect(timeline.getKeys()).toHaveLength(keys.length + 4); expect(context).toHaveBeenCalledOnce(); expect(original).not.toHaveBeenCalled(); expect(property).toHaveBeenCalledTimes(4);
    timeline.navigate(1); expect(current(designer).stops.find(stop => stop.id === added.id)?.present).toBe(false);
    expect(timeline.getKeys().filter(key => !keys.some(prior => prior.property === key.property)).every(write => write.frame === 50)).toBe(true);
    designer.undo(); expect(timeline.getKeys()).toEqual(keys); expect(current(designer).stops.map(stop => stop.id)).toEqual(before.stops.map(stop => stop.id));
    expect(context).toHaveBeenLastCalledWith(expect.objectContaining({ objectId: 'gradient-object', direction: 'undo' }));
    designer.redo(); timeline.navigate(50); expect(current(designer).stops.find(stop => stop.id === added.id)?.present).toBe(true);
    expect(context).toHaveBeenLastCalledWith(expect.objectContaining({ objectId: 'gradient-object', direction: 'redo' })); expect(property).toHaveBeenCalledTimes(4);
  });

  it('removes presence only while retaining the point identity and its other existing tracks', () => {
    const { designer, timeline } = setup(); timeline.navigate(50); const before = current(designer); const keys = timeline.getKeys();
    expect(designer.removeGradientStop('main', 'middle').status).toBe('changed');
    expect(current(designer).stops.map(stop => stop.id)).toEqual(before.stops.map(stop => stop.id));
    expect(current(designer).stops.find(stop => stop.id === 'middle')?.present).toBe(false);
    for (const key of keys) expect(timeline.getKeys()).toContainEqual(key);
    expect(designer.removeGradientStop('main', 'first').status).toBe('rejected');
    designer.undo(); expect(current(designer)).toEqual(before); expect(timeline.getKeys()).toEqual(keys);
    designer.redo(); expect(current(designer).stops.find(stop => stop.id === 'middle')?.present).toBe(false);
  });

  it('rejects invalid or incompatible compound values without partial writes', () => {
    const { designer, timeline } = setup(); const before = current(designer); const keys = timeline.getKeys();
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }, { gradientId: 'main', stopId: 'middle', component: 'opacity', value: 2 }]).status).toBe('rejected');
    expect(current(designer)).toEqual(before); expect(timeline.getKeys()).toEqual(keys);
    expect(designer.editGradient([{ gradientId: 'main', stopId: 'missing', component: 'position', value: 20 }]).status).toBe('rejected');
    const invalidColor: unknown = Reflect.apply(designer.editGradient, designer, [[{ gradientId: 'main', stopId: 'middle', component: 'color', value: { kind: 'color', r: 1, g: 0, b: 0, a: 0.4 } }]]);
    expect(invalidColor).toMatchObject({ status: 'rejected' });
    expect(timeline.getKeys()).toEqual(keys);
  });

  it('previews compound geometry without keys, then commits one shared undo action', () => {
    const { designer, timeline, element } = setup(); const before = timeline.getKeys(); const background = element.style.backgroundImage;
    designer.editGradient([{ gradientId: 'main', component: 'type', value: 'radial' }]); const radial = element.style.backgroundImage; const keys = timeline.getKeys();
    expect(designer.beginGradientGesture().status).toBe('changed');
    expect(designer.previewGradient([{ gradientId: 'main', component: 'centerX', value: 35 }, { gradientId: 'main', component: 'centerY', value: 60 }]).status).toBe('changed');
    expect(timeline.getKeys()).toEqual(keys); expect(element.style.backgroundImage).not.toBe(radial);
    expect(designer.commitGradientGesture().status).toBe('changed'); expect(timeline.getKeys()).toHaveLength(keys.length + 2);
    designer.undo(); expect(element.style.backgroundImage).toBe(radial); expect(timeline.getKeys()).toEqual(keys);
    designer.undo(); expect(element.style.backgroundImage).toBe(background); expect(timeline.getKeys()).toEqual(before);
  });

  for (const cancel of ['explicit', 'frame', 'selection', 'mode', 'dispose'] as const) it(`discards a ${cancel} gesture interruption without a key or lost redo`, () => {
    const { designer, timeline, element } = setup(); designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]); designer.undo();
    const keys = timeline.getKeys(); const background = element.style.backgroundImage; expect(timeline.getState().canRedo).toBe(true);
    designer.beginGradientGesture(); designer.previewGradient([{ gradientId: 'main', component: 'angle', value: 50 }]);
    if (cancel === 'explicit') designer.cancelGradientGesture();
    if (cancel === 'frame') timeline.navigate(50);
    if (cancel === 'selection') designer.selectElements([]);
    if (cancel === 'mode') designer.setMode('test');
    if (cancel === 'dispose') designer.dispose();
    expect(timeline.getKeys()).toEqual(keys); expect(timeline.getState().canRedo).toBe(true);
    if (cancel !== 'frame') expect(element.style.backgroundImage).toBe(background);
  });

  it('refreshes evaluated controls on seeking and selection without repeating user events', () => {
    const { designer, timeline } = setup(); const keys = timeline.getKeys(); const property = vi.fn(); const source = vi.fn();
    designer.on('propertychange', property); designer.on('documentchange', source);
    designer.selectGradient('main', 'middle'); timeline.navigate(50);
    expect(current(designer).stops.find(stop => stop.id === 'middle')?.position).toBe(60);
    timeline.navigate(1); expect(current(designer).stops.find(stop => stop.id === 'middle')?.position).toBe(50);
    expect(timeline.getKeys()).toEqual(keys); expect(property).not.toHaveBeenCalled(); expect(source).not.toHaveBeenCalled();
  });

  it('returns detached definitions and evaluated colors so callers cannot change adapter state', () => {
    const { designer } = setup(); const state = designer.getGradientState(); const color = state?.gradients[0]?.stops[0]?.color;
    if (!color) throw new Error('Missing color'); const before = { ...color }; Reflect.set(color, 'r', 0.123);
    expect(designer.getGradientState()?.gradients[0]?.stops[0]?.color).toEqual(before);
    const definition = state?.definitions[0]; if (!definition) throw new Error('Missing definition'); Reflect.set(definition, 'angle', 123);
    expect(designer.getGradientState()?.definitions[0]?.angle).not.toBe(123);
  });

  it('refuses an obsolete component command when host validation changes the current frame', () => {
    const { designer, timeline } = setup(); const keys = timeline.getKeys(); const capability = timeline.gradients;
    const execute = capability.execute; const property = vi.fn(); designer.on('propertychange', property);
    vi.spyOn(capability, 'execute').mockImplementation((request, isCurrent) => { timeline.navigate(50); return execute(request, isCurrent); });
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys); expect(property).not.toHaveBeenCalled();
  });

  it('blocks a raw background collision instead of silently overriding structured channels', () => {
    const { designer, timeline } = setup(); const before = current(designer); const keys = timeline.getKeys();
    expect(designer.editProperty('background-image', 'linear-gradient(0deg, red, blue)').status).toBe('rejected');
    expect(current(designer)).toEqual(before); expect(timeline.getKeys()).toEqual(keys);
  });

  it('shares history with an unrelated CSS property while preserving the independent gradient channel', () => {
    const { designer, timeline, element } = setup(); const before = timeline.getKeys();
    designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]); const angleKeys = timeline.getKeys();
    expect(designer.editProperty('background-color', 'purple').status).toBe('changed'); expect(element.style.backgroundColor).toBe('purple');
    designer.undo(); expect(current(designer).angle).toBe(35); expect(timeline.getKeys()).toEqual(angleKeys);
    designer.undo(); expect(timeline.getKeys()).toEqual(before); expect(current(designer).angle).not.toBe(35);
    designer.redo(); designer.redo(); expect(current(designer).angle).toBe(35); expect(element.style.backgroundColor).toBe('purple');
  });

  it('does not reinstate a stale preview when the composing host callback changes the frame', () => {
    const { designer, timeline, propertiesContainer } = setup(); const keys = timeline.getKeys(); const compose = timeline.gradients.compose;
    vi.spyOn(timeline.gradients, 'compose').mockImplementation(request => { const result = compose(request); timeline.navigate(50); return result; });
    designer.beginGradientGesture();
    expect(designer.previewGradient([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 75 }]).status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys);
    expect(current(designer).stops.find(stop => stop.id === 'middle')?.position).toBe(60);
    designer.selectGradient('main', 'middle'); expect(input(propertiesContainer, 'Position du point').value).toBe('60');
  });

  it('refuses a range commit whose validation callback changes the frame and discards its draft', () => {
    const { designer, timeline, propertiesContainer } = setup(); designer.selectGradient('main', 'middle'); const keys = timeline.getKeys();
    const event = vi.fn(); designer.on('propertychange', event); const execute = timeline.gradients.execute;
    vi.spyOn(timeline.gradients, 'execute').mockImplementation((request, isCurrent) => { timeline.navigate(50); return execute(request, isCurrent); });
    const range = input(propertiesContainer, 'Déplacer le point dans la barre'); range.value = '75'; range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(timeline.getKeys()).toEqual(keys); expect(event).not.toHaveBeenCalled();
    expect(input(propertiesContainer, 'Position du point').value).toBe('60');
    expect(current(designer).stops.find(stop => stop.id === 'middle')?.position).toBe(60);
    range.dispatchEvent(new Event('change', { bubbles: true })); expect(timeline.getKeys()).toEqual(keys);
  });

  it('keeps the selected stable point and refreshed field values synchronized across identical IDs', () => {
    const { designer, timeline, propertiesContainer } = setup(); const keys = timeline.getKeys(); const event = vi.fn(); designer.on('propertychange', event);
    designer.selectGradient('main', 'middle'); expect(input(propertiesContainer, 'Position du point').value).toBe('50');
    timeline.navigate(50); expect(input(propertiesContainer, 'Position du point').value).toBe('60');
    expect(propertiesContainer.querySelector('[data-gradient-stop="middle"]')?.getAttribute('aria-pressed')).toBe('true');
    timeline.navigate(1); expect(input(propertiesContainer, 'Position du point').value).toBe('50');
    propertiesContainer.querySelector<HTMLButtonElement>('[data-gradient-stop="last"]')?.click();
    expect(input(propertiesContainer, 'Position du point').value).toBe('100');
    expect(propertiesContainer.querySelector('[data-gradient-stop="last"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(timeline.getKeys()).toEqual(keys); expect(event).not.toHaveBeenCalled();
  });

  it('refreshes a different selected object with the same gradient and point IDs and aborts old fields', () => {
    const scene = createGradientScene(document); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div'); document.body.append(scene, propertiesContainer, treeContainer);
    const timeline = createGradientTimeline(); const read = timeline.gradients.read; const getState = timeline.getState;
    const first = read('gradient-object'); if (!first) throw new Error('Missing first object gradient');
    const peerGradients = first.gradients.map(gradient => ({ ...gradient, angle: 135, stops: gradient.stops.map(stop => stop.id === 'middle' ? { ...stop, position: 40, opacity: 0.25 } : stop) }));
    const execute = vi.fn(timeline.gradients.execute);
    const adapter = { ...timeline, getState: () => { const state = getState(); return { ...state, objects: [...state.objects, { id: 'gradient-peer-object', selector: '#gradient-peer' }], values: { ...state.values, 'gradient-peer-object': { 'background-image': peerGradients.map(gradientCss).join(', ') } } }; }, gradients: { ...timeline.gradients, execute, read: (id: string) => id === 'gradient-peer-object' ? { ...first, objectId: id, selector: '#gradient-peer', revision: 'peer', gradients: peerGradients } : read(id) } };
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: () => adapter }); designers.push(designer); const property = vi.fn(); designer.on('propertychange', property);
    designer.selectTarget('#gradient-box'); designer.selectGradient('main', 'middle'); const obsolete = input(propertiesContainer, 'Position du point');
    designer.selectTarget('#gradient-peer');
    expect(designer.getGradientState()?.objectId).toBe('gradient-peer-object'); expect(input(propertiesContainer, 'Angle du dégradé').value).toBe('135');
    expect(input(propertiesContainer, 'Position du point').value).toBe('40'); expect(input(propertiesContainer, 'Opacité du point').value).toBe('0.25');
    obsolete.value = '80'; obsolete.dispatchEvent(new Event('change')); expect(execute).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled();
    designer.selectTarget('#gradient-box'); expect(input(propertiesContainer, 'Angle du dégradé').value).toBe('90'); expect(input(propertiesContainer, 'Position du point').value).toBe('50');
  });

  it('renders crossed points by evaluated position without changing stored identities or other tracks', () => {
    const { designer, timeline, element } = setup(); const before = current(designer); const keys = timeline.getKeys(); const css = element.style.backgroundImage;
    expect(designer.editGradient([{ gradientId: 'main', stopId: 'first', component: 'position', value: 75 }]).status).toBe('changed');
    const snapshot = designer.getGradientState(); expect(current(designer).stops.map(stop => stop.id)).toEqual(before.stops.map(stop => stop.id));
    expect(snapshot?.definitions[0]?.stops.map(stop => stop.id)).toEqual(before.stops.map(stop => stop.id));
    expect(element.style.backgroundImage.indexOf('50%')).toBeLessThan(element.style.backgroundImage.indexOf('75%'));
    expect(element.style.backgroundImage.indexOf('75%')).toBeLessThan(element.style.backgroundImage.indexOf('100%'));
    for (const key of keys) expect(timeline.getKeys()).toContainEqual(key);
    designer.undo(); expect(current(designer)).toEqual(before); expect(element.style.backgroundImage).toBe(css); expect(timeline.getKeys()).toEqual(keys);
    designer.redo(); expect(current(designer).stops.find(stop => stop.id === 'first')?.position).toBe(75);
  });

  it('exposes a divergent group capability but refuses its collective gradient command', () => {
    const scene = createGradientScene(document); const peer = scene.querySelector<HTMLElement>('#gradient-peer'); if (!peer) throw new Error('Missing group member');
    peer.style.backgroundImage = 'linear-gradient(90deg, red, blue)';
    const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div'); document.body.append(scene, propertiesContainer, treeContainer);
    const timeline = createGradientTimeline(); const getState = timeline.getState; const read = timeline.gradients.read;
    const execute = vi.fn(timeline.gradients.execute);
    const adapter = { ...timeline, getState: () => { const state = getState(); return { ...state, objects: state.objects.map(object => object.id === 'gradient-object' ? { ...object, selector: '.gradient-subject' } : object), values: {} }; }, gradients: { ...timeline.gradients, execute, read: (id: string) => {
      const state = read(id); return state ? { ...state, selector: '.gradient-subject', editable: false, reason: 'Fonds d’origine différents : utilisez des ID individuels.' } : null;
    } } };
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: () => adapter }); designers.push(designer); designer.selectTarget('.gradient-subject');
    const keys = timeline.getKeys(); expect(designer.getGradientState()?.editable).toBe(false); expect(input(propertiesContainer, 'Angle du dégradé').disabled).toBe(true);
    expect(propertiesContainer.textContent).toContain('Fonds d’origine différents');
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys); expect(execute).not.toHaveBeenCalled();
  });
});
