// tests/shared-preview-designer.test.ts
// Local shared-owner orchestration with recorded fixtures; no HA9 API claim.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomPreviewOwner, HtmlDesigner } from '../packages/designer/src/index.js';
import type { TimelineAdapter } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createGradientTimeline } from '../fixtures/gradient-timeline.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { propertyInput } from './helpers.js';

const designers: HtmlDesigner[] = [];
const cleanup: (() => void)[] = [];
afterEach(() => { for (const designer of designers.splice(0)) designer.dispose(); for (const dispose of cleanup.splice(0)) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function publish(scene: HTMLElement, owner: DomPreviewOwner, timeline: TimelineAdapter): void {
  const state = timeline.getState();
  owner.prepare(state.objects.flatMap(object => [...scene.querySelectorAll<HTMLElement>(object.selector)].map(element => ({ element, declarations: state.values[object.id] ?? {} })))).apply();
}

function groupSetup() {
  const scene = document.createElement('section'); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
  const first = document.createElement('button'); const second = document.createElement('button');
  first.id = 'first'; second.id = 'second'; first.className = 'subject'; second.className = 'subject';
  first.setAttribute('style', 'opacity: 0.2 !important; color: red; position: relative; width: 100px; height: 50px; transform-origin: 50% 50%;'); second.setAttribute('style', 'opacity: 0.8;');
  scene.append(first, second); document.body.append(scene, propertiesContainer, treeContainer);
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 100, 50));
  vi.spyOn(first, 'offsetWidth', 'get').mockReturnValue(100); vi.spyOn(first, 'offsetHeight', 'get').mockReturnValue(50);
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
  vi.spyOn(scene, 'clientWidth', 'get').mockReturnValue(400); vi.spyOn(scene, 'clientHeight', 'get').mockReturnValue(300);
  const source = [first.getAttribute('style'), second.getAttribute('style')]; const owner = new DomPreviewOwner(scene);
  const timeline = createRecordedTimeline({ initialKeys: [{ objectId: 'group', selector: '.subject', property: 'opacity', frame: 1, value: '0.4' }], samples: { 50: { group: { opacity: '0.6' } } } });
  publish(scene, owner, timeline); Reflect.set(timeline, 'preview', owner);
  const observer = new MutationObserver(() => undefined); observer.observe(scene, { attributes: true, subtree: true, attributeFilter: ['style'] });
  cleanup.push(() => observer.disconnect(), timeline.onChange(reason => { if (reason !== 'selection') { publish(scene, owner, timeline); observer.takeRecords(); } }));
  const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: instance => instance }); designers.push(designer);
  return { designer, timeline, owner, observer, first, second, source, propertiesContainer };
}

function gradientSetup() {
  const scene = createGradientScene(document); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
  document.body.append(scene, propertiesContainer, treeContainer);
  const element = scene.querySelector<HTMLElement>('#gradient-box'); if (!element) throw new Error('Missing gradient fixture');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 300, 180));
  const source = element.getAttribute('style'); const owner = new DomPreviewOwner(scene); const timeline = createGradientTimeline();
  publish(scene, owner, timeline); Reflect.set(timeline, 'preview', owner);
  const observer = new MutationObserver(() => undefined); observer.observe(scene, { attributes: true, subtree: true, attributeFilter: ['style'] });
  cleanup.push(() => observer.disconnect(), timeline.onChange(reason => { if (reason !== 'selection') { publish(scene, owner, timeline); observer.takeRecords(); } }));
  const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: instance => instance }); designers.push(designer); designer.selectTarget('#gradient-box');
  return { designer, timeline, owner, observer, element, source, propertiesContainer };
}

function field(container: HTMLElement, label: string): HTMLInputElement {
  const input = [...container.querySelectorAll<HTMLInputElement>('input')].find(candidate => candidate.getAttribute('aria-label') === label);
  if (!input) throw new Error(`Missing shared field ${label}`); return input;
}

describe('Designer using a host-owned transactional preview', () => {
  it('uses the early source capture for incompatible group values instead of the common preview', () => {
    const { designer, owner, first, second, propertiesContainer } = groupSetup();
    designer.selectTarget('.subject');

    expect([first.style.opacity, second.style.opacity]).toEqual(['0.4', '0.4']);
    expect(propertyInput(propertiesContainer, 'opacity').disabled).toBe(true);
    expect(designer.editProperty('opacity', '0.6').status).toBe('rejected');
    expect(owner.withSource(() => [first.style.opacity, second.style.opacity])).toEqual(['0.2', '0.8']);
  });

  it('does not write source styles during construction, selection or mode-only UI refreshes', () => {
    const { designer, timeline, observer, first, second, propertiesContainer } = groupSetup();
    expect(observer.takeRecords()).toEqual([]);
    designer.selectTarget('#first'); const retained = propertyInput(propertiesContainer, 'opacity');
    designer.selectTarget('#second'); designer.setMode('test'); designer.setMode('select'); timeline.selectObject('group');
    expect(observer.takeRecords()).toEqual([]);
    const before = timeline.getKeys(); const execute = vi.spyOn(timeline, 'execute');
    retained.value = '0.9'; retained.dispatchEvent(new Event('change', { bubbles: true }));
    expect(execute).not.toHaveBeenCalled(); expect(timeline.getKeys()).toEqual(before);
    expect([first.style.opacity, second.style.opacity]).toEqual(['0.4', '0.4']);
  });

  it('observes a newly committed frame without becoming a second style writer', () => {
    const { designer, timeline, observer, first, second, propertiesContainer } = groupSetup(); designer.selectTarget('.subject'); observer.takeRecords();
    const before = timeline.getKeys(); const property = vi.fn(); designer.on('propertychange', property);
    timeline.navigate(50);
    expect([first.style.opacity, second.style.opacity]).toEqual(['0.6', '0.6']);
    expect(observer.takeRecords()).toEqual([]); expect(propertyInput(propertiesContainer, 'opacity').disabled).toBe(true);
    expect(timeline.getKeys()).toEqual(before); expect(property).not.toHaveBeenCalled();
  });

  it('keeps host preview on Designer disposal and lets only the owner restore the exact source', () => {
    const { designer, owner, observer, first, second, source } = groupSetup(); observer.takeRecords();
    const preview = [first.getAttribute('style'), second.getAttribute('style')]; const projection = owner.getCommittedProjection();
    designer.dispose();
    expect([first.getAttribute('style'), second.getAttribute('style')]).toEqual(preview); expect(observer.takeRecords()).toEqual([]);
    expect(owner.getCommittedProjection()).toEqual(projection);
    owner.prepareRestore().apply(); expect([first.getAttribute('style'), second.getAttribute('style')]).toEqual(source);
  });

  it('uses the same owner for gradient draft and cancel without history or original-document changes', () => {
    const { designer, timeline, owner, element } = gradientSetup(); const committed = owner.getCommittedProjection(); const background = element.style.backgroundImage; const keys = timeline.getKeys();
    const property = vi.fn(); const original = vi.fn(); designer.on('propertychange', property); designer.on('documentchange', original);
    expect(designer.beginGradientGesture().status).toBe('changed');
    expect(designer.previewGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
    expect(owner.getProjection()).not.toEqual(committed); expect(owner.getCommittedProjection()).toEqual(committed); expect(element.style.backgroundImage).not.toBe(background);
    expect(timeline.getKeys()).toEqual(keys); designer.cancelGradientGesture();
    expect(owner.getProjection()).toEqual(committed); expect(element.style.backgroundImage).toBe(background);
    expect(property).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled(); expect(designer.getDocumentChanges()).toEqual([]);
  });

  it('keeps the new host commit when a frame cancels a pending gradient draft', () => {
    const { designer, timeline, owner, observer, element, propertiesContainer } = gradientSetup(); designer.selectGradient('main', 'middle');
    const retained = field(propertiesContainer, 'Déplacer le point dans la barre'); const keys = timeline.getKeys();
    retained.value = '70'; retained.dispatchEvent(new Event('input', { bubbles: true }));
    expect(owner.getProjection()).not.toEqual(owner.getCommittedProjection()); observer.takeRecords();
    timeline.navigate(50);
    expect(observer.takeRecords()).toEqual([]); expect(owner.getProjection()).toEqual(owner.getCommittedProjection());
    expect(field(propertiesContainer, 'Position du point').value).toBe('60');
    const committed = element.style.backgroundImage;
    retained.value = '80'; retained.dispatchEvent(new Event('change', { bubbles: true }));
    expect(timeline.getKeys()).toEqual(keys); expect(element.style.backgroundImage).toBe(committed);
  });

  it('cancels only a local gradient draft on disposal while preserving the host commit', () => {
    const { designer, timeline, owner, element, source } = gradientSetup(); const committed = owner.getCommittedProjection();
    const background = element.style.backgroundImage; const keys = timeline.getKeys();
    designer.beginGradientGesture(); designer.previewGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
    expect(owner.getProjection()).not.toEqual(committed);
    designer.dispose();
    expect(owner.getProjection()).toEqual(committed); expect(owner.getCommittedProjection()).toEqual(committed);
    expect(element.style.backgroundImage).toBe(background); expect(timeline.getKeys()).toEqual(keys);
    owner.prepareRestore().apply(); expect(element.getAttribute('style')).toBe(source);
  });

  it('only detaches on disposal after a fault instead of rewriting an uncertain host preview', () => {
    const { designer, timeline, owner, observer, element } = gradientSetup();
    designer.beginGradientGesture(); designer.previewGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
    Reflect.set(timeline.gradients, 'execute', () => ({ status: 'faulted', message: 'Simulation : compensation incertaine.' }));
    expect(designer.commitGradientGesture().status).toBe('faulted'); expect(designer.getFault()).toBeTruthy();
    const uncertainStyle = element.getAttribute('style'); const uncertainProjection = owner.getProjection(); const committed = owner.getCommittedProjection(); observer.takeRecords();
    designer.dispose();
    expect(observer.takeRecords()).toEqual([]); expect(element.getAttribute('style')).toBe(uncertainStyle);
    expect(owner.getProjection()).toEqual(uncertainProjection); expect(owner.getCommittedProjection()).toEqual(committed);
  });

  it('commits and undoes gradient edits through the host while UI observers never rewrite styles', () => {
    const { designer, timeline, owner, observer, element, source } = gradientSetup(); const keys = timeline.getKeys(); const background = element.style.backgroundImage; observer.takeRecords();
    const property = vi.fn(); const original = vi.fn(); designer.on('propertychange', property); designer.on('documentchange', original);
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
    expect(observer.takeRecords()).toEqual([]); expect(timeline.getKeys()).toHaveLength(keys.length + 1); expect(property).toHaveBeenCalledOnce();
    expect(owner.getProjection()).toEqual(owner.getCommittedProjection()); expect(element.style.backgroundImage).not.toBe(background);
    expect(designer.undo().status).toBe('changed'); expect(timeline.getKeys()).toEqual(keys); expect(element.style.backgroundImage).toBe(background); expect(observer.takeRecords()).toEqual([]);
    expect(original).not.toHaveBeenCalled(); designer.dispose(); owner.prepareRestore().apply(); expect(element.getAttribute('style')).toBe(source);
  });

  it('explicitly refuses unsupported shared-owner geometry instead of approximating a second preview', () => {
    const { designer, timeline, observer, propertiesContainer } = groupSetup(); designer.selectTarget('#first'); observer.takeRecords(); const before = timeline.getKeys();
    const result = designer.beginGeometryGesture('move'); expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') throw new Error('Expected an explicit unavailable geometry path');
    expect(result.message).toContain('aperçu partagé'); expect(designer.isGeometryGestureActive()).toBe(false);
    expect(designer.setGeometryPivot(20, 30).status).toBe('rejected'); expect(timeline.getKeys()).toEqual(before); expect(observer.takeRecords()).toEqual([]);
    expect(propertiesContainer.textContent).toContain(result.message);
  });
});
