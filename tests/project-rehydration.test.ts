// tests/project-rehydration.test.ts
// Same-root host simulation only; not native project loading or HA9 conformity.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomPreviewOwner, HtmlDesigner } from '../packages/designer/src/index.js';
import type { EditableProject, HistoryDirection, ProjectValidationPorts, TimelineAdapter, TimelineReason } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createGradientTimeline } from '../fixtures/gradient-timeline.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createProjectCodecData } from '../fixtures/project-codec-data.js';

interface Bundle { readonly project: EditableProject; readonly nodes: readonly HTMLElement[]; owner?: DomPreviewOwner }
const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function bundle(label: 'A' | 'B'): Bundle {
  const first = document.createElement('button'); const second = document.createElement('button');
  first.id = `${label}-1`; first.className = 'shared'; second.className = 'shared';
  first.style.opacity = label === 'A' ? '0.2' : '0.7'; second.style.opacity = label === 'A' ? '0.8' : '0.3';
  return { nodes: [first, second], project: { ...createProjectCodecData(), source: { id: `source-${label}`, revision: 'r1' },
    documentChanges: [
      { fullXPath: '/html/body/section/button[1]', attribute: 'id', oldValue: null, newValue: `${label}-1` },
      { fullXPath: '/html/body/section/button[2]', attribute: 'id', oldValue: '', newValue: null },
    ], metadata: { label, nested: { value: `metadata-${label}` } } } };
}

function setup(gradients = false) {
  const scene = document.createElement('section'); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
  document.body.append(scene, propertiesContainer, treeContainer);
  const first = bundle('A'); const second = bundle('B');
  if (gradients) {
    const gradientScene = createGradientScene(document);
    Reflect.set(first, 'nodes', [...gradientScene.children]); Reflect.set(first.project, 'documentChanges', []);
  }
  const timeline = gradients ? createGradientTimeline() : createRecordedTimeline();
  let current = first;
  function mount(next: Bundle): void {
    current = next; scene.replaceChildren(...next.nodes);
    if (!next.owner) {
      next.owner = new DomPreviewOwner(scene);
      const state = timeline.getState();
      const evaluated = state.objects.flatMap(object => [...scene.querySelectorAll<HTMLElement>(object.selector)].map(element => ({ element, declarations: state.values[object.id] ?? {} })));
      next.owner.prepare(evaluated.length ? evaluated : next.nodes.map(element => ({ element, declarations: { opacity: next === first ? '0.4' : '0.6' } }))).apply();
    }
  }
  mount(first);
  const listeners = new Set<(reason: TimelineReason) => void>();
  const notify = (reason: TimelineReason): void => { for (const listener of listeners) listener(reason); };
  const forward = timeline.onChange(notify); cleanup.push(forward);
  const adapter: TimelineAdapter = { ...timeline,
    get preview() { if (!current.owner) throw new Error('Host source must be mounted first'); return current.owner; },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const validation: ProjectValidationPorts = { validateTimeline: () => [], validateHtmlContext: () => [] };
  const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: () => adapter }); cleanup.push(() => designer.dispose());
  expect(designer.getProjectState()).toBeNull();
  function transition(next: Bundle, direction: HistoryDirection = 'execute', override?: DomPreviewOwner, ports = validation) {
    const readNext = vi.fn(() => ({ project: next.project, preview: override ?? adapter.preview!, validation: ports }));
    const prepared = designer.prepareProjectRehydration(readNext, direction);
    return { prepared, readNext };
  }
  const initial = transition(first); initial.prepared.apply(); notify('execute');
  return { scene, designer, first, second, timeline, adapter, validation, mount, notify, transition, propertiesContainer };
}

function observe(designer: HtmlDesigner) {
  const project = vi.fn(); const property = vi.fn(); const document = vi.fn(); const gradient = vi.fn(); const resolution = vi.fn();
  designer.on('projectchange', project); designer.on('propertychange', property); designer.on('documentchange', document); designer.on('gradientchange', gradient); designer.on('resolutionchange', resolution);
  return { project, property, document, gradient, resolution };
}
function noSuccess(events: ReturnType<typeof observe>): void { for (const listener of Object.values(events)) expect(listener).not.toHaveBeenCalled(); }

describe('transactional Designer project rehydration', () => {
  it('exposes rehydration on the existing Designer class rather than replacing its instance', async () => {
    const { HtmlDesigner } = await import('../packages/designer/src/index.js');
    expect(typeof Reflect.get(HtmlDesigner.prototype, 'prepareProjectRehydration')).toBe('function');
    expect(typeof Reflect.get(HtmlDesigner.prototype, 'getProjectState')).toBe('function');
  });

  it('prepares without reading the future host and rehydrates journal/profile without a DOM write', () => {
    const { designer, first, second, scene, mount, notify, transition, propertiesContainer } = setup(); designer.selectTarget('#A-1');
    const before = designer.getProjectState(); const events = observe(designer); const next = transition(second);
    expect(next.prepared.changed).toBe(true); expect(next.readNext).not.toHaveBeenCalled(); expect(designer.getProjectState()).toEqual(before);
    expect(scene.firstElementChild).toBe(first.nodes[0]); mount(second);
    const ui = propertiesContainer.innerHTML;
    const observer = new MutationObserver(() => undefined); observer.observe(scene, { attributes: true, childList: true, subtree: true }); observer.observe(propertiesContainer, { attributes: true, childList: true, subtree: true }); cleanup.push(() => observer.disconnect());
    next.prepared.apply(); expect(next.readNext).toHaveBeenCalledOnce();
    expect(designer.getDocumentChanges()).toEqual(second.project.documentChanges);
    expect(designer.getProjectState()).toEqual({ source: second.project.source, documentChanges: second.project.documentChanges, metadata: second.project.metadata });
    expect(observer.takeRecords()).toEqual([]); expect(propertiesContainer.innerHTML).toBe(ui); noSuccess(events);
    notify('frame'); notify('selection'); noSuccess(events); notify('execute');
    expect(events.project).toHaveBeenCalledOnce(); expect(events.project).toHaveBeenCalledWith(expect.objectContaining({ direction: 'execute' }));
    expect(events.property).not.toHaveBeenCalled(); expect(events.document).not.toHaveBeenCalled(); expect(events.gradient).not.toHaveBeenCalled(); expect(events.resolution).not.toHaveBeenCalled();
    notify('execute'); expect(events.project).toHaveBeenCalledOnce();
  });

  it('publishes each accepted execute, undo and redo rehydration exactly once at its terminal notification', () => {
    const { designer, first, second, mount, notify, transition } = setup(); const events = observe(designer);
    const steps = [[second, 'execute'], [first, 'undo'], [second, 'redo']] as const;
    for (const [index, [next, direction]] of steps.entries()) {
      const operation = transition(next, direction); mount(next); operation.prepared.apply();
      expect(events.project).toHaveBeenCalledTimes(index); notify(direction);
      expect(events.project).toHaveBeenCalledTimes(index + 1); expect(events.project).toHaveBeenLastCalledWith(expect.objectContaining({ direction }));
      notify(direction); expect(events.project).toHaveBeenCalledTimes(index + 1);
    }
    expect(events.property).not.toHaveBeenCalled(); expect(events.document).not.toHaveBeenCalled(); expect(events.gradient).not.toHaveBeenCalled(); expect(events.resolution).not.toHaveBeenCalled();
  });

  it('returns detached source/profile metadata and preserves null versus empty journal history', () => {
    const { designer, second, mount, transition } = setup(); const next = transition(second); mount(second); next.prepared.apply();
    const expected: unknown = JSON.parse(JSON.stringify({ source: second.project.source, documentChanges: second.project.documentChanges, metadata: second.project.metadata }));
    Reflect.set(second.project.source, 'id', 'caller-mutated'); Reflect.set(second.project.metadata ?? {}, 'nested', { value: 'caller-mutated' });
    const snapshot = designer.getProjectState(); expect(snapshot).toEqual(expected);
    Reflect.set(snapshot?.source ?? {}, 'revision', 'mutated-copy'); Reflect.set(snapshot?.metadata ?? {}, 'nested', { value: 'mutated-copy' });
    expect(designer.getProjectState()).toEqual(expected);
    expect(designer.getDocumentChanges().map(change => change.oldValue)).toEqual([null, '']);
    expect(second.nodes[0]?.id).toBe('B-1'); expect(second.nodes[1]?.hasAttribute('id')).toBe(false);
  });

  it('cancels an applied swap by restoring exact old project, target and source ownership with no phantom event', () => {
    const { designer, first, second, scene, mount, notify, transition, timeline } = setup(); designer.selectTarget('#A-1');
    const before = designer.getProjectState(); const events = observe(designer); const next = transition(second); mount(second); next.prepared.apply();
    mount(first); const source = scene.innerHTML; next.prepared.rollback();
    expect(designer.getProjectState()).toEqual(before); expect(scene.innerHTML).toBe(source);
    notify('frame'); notify('execute'); noSuccess(events);
    expect(designer.editProperty('opacity', '0.5').status).toBe('changed');
    expect(timeline.getKeys()).toEqual([expect.objectContaining({ selector: '#A-1', value: '0.5' })]);
  });

  it('compensates an interrupted private-state write instead of keeping a partly adopted project', () => {
    const { designer, first, second, scene, mount, notify, transition, timeline } = setup(); designer.selectTarget('#A-1');
    const before = designer.getProjectState(); const events = observe(designer);
    const originalDescriptor = Object.getOwnPropertyDescriptor(designer, 'origin'); let origin: unknown = Reflect.get(designer, 'origin'); const originalOrigin = origin; let fail = true;
    Object.defineProperty(designer, 'origin', { configurable: true, get: () => origin, set: (value: unknown) => {
      origin = value; if (fail) { fail = false; throw new Error('Injected failure after adopting the new source origin'); }
    } });
    const next = transition(second); mount(second);
    expect(() => next.prepared.apply()).toThrow('Injected failure after adopting the new source origin');
    expect(origin).not.toBe(originalOrigin); mount(first);
    const observer = new MutationObserver(() => undefined); observer.observe(scene, { attributes: true, childList: true, subtree: true }); cleanup.push(() => observer.disconnect());
    next.prepared.rollback(); expect(origin).toBe(originalOrigin); expect(designer.getProjectState()).toEqual(before); expect(observer.takeRecords()).toEqual([]);
    notify('execute'); noSuccess(events);
    if (originalDescriptor) Object.defineProperty(designer, 'origin', originalDescriptor);
    expect(designer.editProperty('opacity', '0.5').status).toBe('changed'); expect(timeline.getKeys()[0]?.selector).toBe('#A-1');
  });

  it('keeps old attribute commands usable after returning from B to the same A nodes without disposal', () => {
    const { designer, first, second, mount, notify, transition } = setup(); const element = first.nodes[0]; if (!element) throw new Error('Missing A target');
    expect(designer.setAttribute(element, 'class', 'shared edited-in-A').status).toBe('changed');
    const profileA = designer.getProjectState(); if (!profileA) throw new Error('Missing A profile');
    const savedA: Bundle = { ...first, project: { ...first.project, ...profileA } };
    const toB = transition(second); mount(second); toB.prepared.apply(); notify('execute');
    const toA = transition(savedA, 'undo'); mount(savedA); toA.prepared.apply(); notify('undo');
    const original = vi.fn(); designer.on('documentchange', original);
    expect(designer.undo().status).toBe('changed'); expect(element.className).toBe('shared');
    expect(original).toHaveBeenCalledWith(expect.objectContaining({ direction: 'undo', changes: [expect.objectContaining({ fullXPath: '/html/body/section/button[1]', attribute: 'class' })] }));
    expect(designer.redo().status).toBe('changed'); expect(element.className).toBe('shared edited-in-A');
    expect(designer.getProjectState()?.source).toEqual(first.project.source); expect(designer.getDocumentChanges()).toHaveLength(3);
  });

  it('restores an old pending attribute notification when a provisional rehydration is compensated', () => {
    const { designer, first, second, adapter, timeline, mount, transition } = setup(); const events = observe(designer); const element = first.nodes[0];
    if (!element) throw new Error('Missing pending attribute target');
    vi.spyOn(adapter, 'execute').mockImplementation((label, writes, effect) => {
      effect?.redo();
      const before = designer.getProjectState(); const next = transition(second); mount(second); next.prepared.apply(); mount(first); next.prepared.rollback();
      expect(designer.getProjectState()).toEqual(before);
      return timeline.execute(label, writes, { redo: () => undefined, undo: () => undefined });
    });
    expect(designer.setAttribute(element, 'class', 'shared pending').status).toBe('changed');
    expect(events.project).not.toHaveBeenCalled(); expect(events.property).not.toHaveBeenCalled();
    expect(events.document).toHaveBeenCalledExactlyOnceWith({ direction: 'execute', changes: [{ fullXPath: '/html/body/section/button[1]', attribute: 'class', oldValue: 'shared', newValue: 'shared pending' }] });
  });

  it('restores a captured A gradient draft through its original owner after cancellation of B', () => {
    const { designer, first, second, mount, transition, timeline } = setup(true); designer.selectTarget('#gradient-box'); designer.selectGradient('main', 'middle');
    designer.beginGradientGesture(); designer.previewGradient([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 70 }]);
    const owner = first.owner; if (!owner) throw new Error('Missing original A owner');
    const draft = owner.getProjection(); const committed = owner.getCommittedProjection(); const keys = timeline.getKeys();
    const next = transition(second); mount(second); next.prepared.apply(); mount(first);
    const observer = new MutationObserver(() => undefined); observer.observe(first.nodes[0]!, { attributes: true, childList: true, subtree: true }); cleanup.push(() => observer.disconnect());
    next.prepared.rollback();
    expect(observer.takeRecords()).toEqual([]); expect(owner.getProjection()).toEqual(draft); expect(owner.getCommittedProjection()).toEqual(committed);
    expect(designer.getGradientState()?.gradients[0]?.stops.find(stop => stop.id === 'middle')?.position).toBe(70);
    designer.cancelGradientGesture(); expect(owner.getProjection()).toEqual(committed); expect(timeline.getKeys()).toEqual(keys);
  });

  for (const invalid of ['data', 'foreign-root', 'old-owner'] as const) it(`refuses ${invalid} before keeping any partial project state`, () => {
    const { designer, first, second, mount, notify, transition } = setup(); designer.selectTarget('#A-1'); const before = designer.getProjectState(); const events = observe(designer);
    let wrong: DomPreviewOwner | undefined;
    if (invalid === 'foreign-root') { const foreign = document.createElement('section'); wrong = new DomPreviewOwner(foreign); }
    if (invalid === 'old-owner') wrong = first.owner;
    if (invalid === 'data') Reflect.set(second.project, 'version', 99);
    const next = transition(second, 'execute', wrong); mount(second);
    expect(() => next.prepared.apply()).toThrow(); expect(designer.getProjectState()).toEqual(before);
    mount(first); next.prepared.rollback(); notify('execute'); noSuccess(events); expect(designer.getProjectState()).toEqual(before);
  });

  it('clears an old gradient draft and aborts stale fields after adopting another source', () => {
    const { designer, second, mount, notify, transition, propertiesContainer, adapter, timeline } = setup(true);
    designer.selectTarget('#gradient-box'); designer.selectGradient('main', 'middle');
    const retained = [...propertiesContainer.querySelectorAll<HTMLInputElement>('input')].find(input => input.getAttribute('aria-label') === 'Déplacer le point dans la barre');
    if (!retained) throw new Error('Missing A gradient field');
    retained.value = '70'; retained.dispatchEvent(new Event('input', { bubbles: true }));
    const keys = timeline.getKeys(); const events = observe(designer); const next = transition(second); mount(second); next.prepared.apply(); notify('execute');
    expect(designer.getGradientState()).toBeNull(); expect(designer.isGeometryGestureActive()).toBe(false); expect(designer.commitGradientGesture().status).toBe('unchanged');
    const execute = vi.spyOn(adapter, 'execute'); const gradients = adapter.gradients;
    if (!gradients) throw new Error('Missing fixture gradient capability'); const gradientExecute = vi.spyOn(gradients, 'execute');
    retained.value = '80'; retained.dispatchEvent(new Event('change', { bubbles: true }));
    expect(execute).not.toHaveBeenCalled(); expect(gradientExecute).not.toHaveBeenCalled(); expect(timeline.getKeys()).toEqual(keys);
    expect(events.project).toHaveBeenCalledOnce(); expect(events.property).not.toHaveBeenCalled(); expect(events.document).not.toHaveBeenCalled();
  });
});
