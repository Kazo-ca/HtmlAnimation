// Genuine installed Timeline packages. This is not the recorded Timeline simulation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommand } from '@kazo-ca/timeline-editor';
import type { IHtmlAnimationContext, ITimelineDocument } from '@kazo-ca/timeline-runtime';
import type * as TimelineRuntime from '@kazo-ca/timeline-runtime';
import { cloneHtmlAnimationContext } from '@kazo-ca/timeline-runtime';
import { gradientCss } from '@kazo-ca/css-properties';
import { HtmlDesigner, decodeEditableProject, encodeEditableProject } from '../packages/designer/src/index.js';
import type { EditableProject } from '../packages/designer/src/index.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import { encodeCurrentRealProject } from '../integration/project-capture.js';
import { createTimelineProjectValidationPorts } from '../integration/project-codecs.js';
import { openRealProject } from '../integration/project-open.js';
import nativeFixture from '../fixtures/native-editable-project.json';

const clockFault = vi.hoisted(() => ({ armed: false }));
let sourceGuardSequence = 0;
vi.mock('@kazo-ca/timeline-runtime', async importOriginal => {
  const runtime = await importOriginal<typeof TimelineRuntime>();
  return { ...runtime, createManualClock: (...args: Parameters<typeof runtime.createManualClock>) => {
    const clock = runtime.createManualClock(...args); const advance = clock.advance.bind(clock);
    vi.spyOn(clock, 'advance').mockImplementation((...parameters) => { advance(...parameters); if (clockFault.armed && parameters[0] === 0) { clockFault.armed = false; throw new Error('Injected project post-commit clock failure'); } });
    return clock;
  } };
});
const cleanup: (() => void)[] = [];
afterEach(() => { clockFault.armed = false; for (const dispose of cleanup.splice(0).reverse()) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function setup(decorate?: (scene: HTMLElement) => void) {
  const scene = createGradientScene(document); scene.id = 'scene-A';
  decorate?.(scene);
  const editorContainer = document.createElement('div'); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
  document.body.append(scene, editorContainer, propertiesContainer, treeContainer);
  const host = createRealGradientHost(editorContainer, scene); cleanup.push(() => host.dispose());
  const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter }); cleanup.push(() => designer.dispose());
  const initialProfile = { source: { id: 'source-A', revision: 'r1' }, metadata: { name: 'Project A' } };
  designer.selectTarget('#gradient-box'); host.navigate(50);
  const root = createGradientScene(document); root.id = 'scene-B-original';
  const subject = root.querySelector<HTMLElement>('#gradient-box'); if (!subject) throw new Error('Missing B subject');
  const initialGradient = host.stage.animationContext.gradients?.gradientObject?.[0]; if (!initialGradient) throw new Error('Missing native gradient definition');
  const gradient = { ...initialGradient, angle: 120, stops: initialGradient.stops.map(stop => {
    if (stop.color.a !== 1) throw new Error('Native fixture colors must be opaque');
    return { ...stop, color: { ...stop.color, a: 1 as const } };
  }) }; subject.style.backgroundImage = gradientCss(gradient);
  const button = document.createElement('button'); button.textContent = 'B action'; root.append(button);
  const empty = document.createElement('span'); empty.setAttribute('class', ''); root.append(empty);
  const before = decodeEditableProject(encodeCurrentRealProject({ host, designer, ...initialProfile }), createTimelineProjectValidationPorts());
  const timeline: ITimelineDocument = { ...host.editor.document, layers: host.editor.document.layers.map(layer => layer.type !== 'layer' ? layer : { ...layer, propertyTimelines: { gradientChannel2: { initialValue: { kind: 'number', value: 120 }, keys: [{ frame: 1, value: { kind: 'number', value: 55 } }] } } }) };
  const htmlContext: IHtmlAnimationContext = { ...host.stage.animationContext, gradients: { gradientObject: [gradient] } };
  const project = decodeEditableProject(encodeEditableProject({ ...before, source: { id: 'source-B', revision: 'r2' }, timeline, htmlContext,
    documentChanges: [
      { fullXPath: '/html/body/section', attribute: 'id', oldValue: 'scene-B-original', newValue: 'scene-B-edited' },
      { fullXPath: '/html/body/section/button', attribute: 'id', oldValue: null, newValue: 'B-action' },
      { fullXPath: '/html/body/section/span', attribute: 'class', oldValue: '', newValue: null },
    ], metadata: { name: 'Project B' },
  }, createTimelineProjectValidationPorts()), createTimelineProjectValidationPorts());
  const source = { reference: project.source, root, isCurrent: vi.fn(() => true) };
  const open = (input: EditableProject = project) => openRealProject({ host, designer, scene, project: input, source, initialProfile });
  return { scene, host, designer, initialProfile, project, source, root, subject, button, empty, open };
}

describe('undoable native project opening', () => {
  it('withholds project success when the genuine post-commit clock flush faults', () => {
    const { host, designer, project, open } = setup(); const success = vi.fn(); const fault = vi.fn();
    designer.on('projectchange', success); designer.on('fault', fault); clockFault.armed = true;
    expect(open().status).toBe('faulted'); expect(host.editor.document).toEqual(project.timeline);
    expect(host.adapter.getState().fault).toBeTruthy(); expect(designer.getFault()).toBeTruthy(); expect(fault).toHaveBeenCalledOnce();
    expect(success).not.toHaveBeenCalled(); expect(designer.undo().status).toBe('faulted');
    host.navigate(20); expect(success).not.toHaveBeenCalled();
  });
  it('opens source, native document, context and journal in one transaction before the first observation', () => {
    const fixture = setup(); const { scene, host, designer, project, source, subject, button, empty, open } = fixture;
    const load = vi.spyOn(host.editor, 'load'); const projectChanged = vi.fn(); const documentChanged = vi.fn(); const gradients = vi.fn();
    const observed: unknown[] = [];
    const record = (event: string): void => { observed.push({ event, rootId: scene.id, subject: scene.querySelector('#gradient-box'), css: subject.style.backgroundImage,
      angle: host.stage.animationContext.gradients?.gradientObject?.[0]?.angle, source: designer.getProjectState()?.source,
      owner: host.adapter.preview, canUndo: host.editor.canUndo, canRedo: host.editor.canRedo }); };
    host.editor.on('transaction:changed', () => record('transaction')); host.editor.on('document:changed', () => record('document')); host.editor.on('frame:render', () => record('frame'));
    designer.on('projectchange', projectChanged); designer.on('documentchange', documentChanged); designer.on('gradientchange', gradients);
    expect(open().status).toBe('changed'); expect(observed.length).toBeGreaterThanOrEqual(2);
    for (const snapshot of observed) expect(snapshot).toEqual(expect.objectContaining({ rootId: 'scene-B-edited', subject, css: expect.stringContaining('55deg'), angle: 120, source: project.source, owner: host.previewOwner, canUndo: true, canRedo: false }));
    expect(projectChanged).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: project.source, direction: 'execute' }));
    expect(documentChanged).not.toHaveBeenCalled(); expect(gradients).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
    expect(button.id).toBe('B-action'); expect(empty.hasAttribute('class')).toBe(false); expect(designer.getDocumentChanges()).toEqual(project.documentChanges);
    expect(source.isCurrent).toHaveBeenCalled(); expect(host.previewOwner.withSource(() => subject.style.backgroundImage)).toContain('120deg');
  });

  it('keeps both projects nodes and earlier commands through edit A, open B, edit B, undo and redo', () => {
    const { scene, host, designer, project, source, initialProfile, subject } = setup();
    const editor = host.editor; const originalOwner = host.previewOwner; const originalNodes = [...scene.childNodes]; const originalSubject = scene.querySelector<HTMLElement>('#gradient-box');
    const peer = scene.querySelector<HTMLElement>('#gradient-peer'); if (!peer || !originalSubject) throw new Error('Missing original nodes');
    const listenerA = vi.fn(); const listenerB = vi.fn(); const rootListener = vi.fn(); originalSubject.addEventListener('identity-probe', listenerA); subject.addEventListener('identity-probe', listenerB); scene.addEventListener('identity-probe', rootListener);
    const initialClass = peer.getAttribute('class'); const load = vi.spyOn(editor, 'load');
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
    expect(designer.setAttribute(peer, 'class', 'kept-A-command').status).toBe('changed'); const documentA = editor.document;
    const initialTicket = vi.fn(() => true);
    expect(openRealProject({ host, designer, scene, project, source, initialProfile, isCurrent: initialTicket }).status).toBe('changed');
    const ownerB = host.previewOwner; initialTicket.mockReturnValue(false);
    designer.selectTarget('#gradient-box'); expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 75 }]).status).toBe('changed'); const documentB = editor.document;
    expect(designer.undo().status).toBe('changed'); expect(subject.style.backgroundImage).toContain('55deg');
    const projectEvents = vi.fn(); designer.on('projectchange', projectEvents);
    expect(designer.undo().status).toBe('changed');
    expect(host.editor).toBe(editor); expect(host.previewOwner).toBe(originalOwner); expect([...scene.childNodes]).toEqual(originalNodes); expect(scene.querySelector('#gradient-box')).toBe(originalSubject);
    expect(originalSubject.style.backgroundImage).toContain('35deg'); expect(scene.id).toBe('scene-A'); expect(editor.document).toEqual(documentA); expect(designer.getProjectState()?.source).toEqual(initialProfile.source);
    expect(designer.undo().status).toBe('changed'); expect(peer.getAttribute('class')).toBe(initialClass);
    expect(designer.undo().status).toBe('changed'); expect(originalSubject.style.backgroundImage).toContain('90deg');
    expect(designer.redo().status).toBe('changed'); expect(originalSubject.style.backgroundImage).toContain('35deg');
    expect(designer.redo().status).toBe('changed'); expect(peer.getAttribute('class')).toBe('kept-A-command');
    host.navigate(20); designer.selectElements([peer]); const ticketCalls = initialTicket.mock.calls.length;
    expect(designer.redo().status).toBe('changed'); expect(initialTicket).toHaveBeenCalledTimes(ticketCalls);
    expect(scene.querySelector('#gradient-box')).toBe(subject); expect(host.previewOwner).toBe(ownerB); expect(subject.style.backgroundImage).toContain('55deg');
    host.navigate(50);
    expect(designer.redo().status).toBe('changed'); expect(subject.style.backgroundImage).toContain('75deg'); expect(editor.document).toEqual(documentB);
    expect(projectEvents).toHaveBeenCalledTimes(2); expect(projectEvents.mock.calls.map(call => call[0].direction)).toEqual(['undo', 'redo']);
    originalSubject.dispatchEvent(new Event('identity-probe')); subject.dispatchEvent(new Event('identity-probe', { bubbles: true }));
    expect(listenerA).toHaveBeenCalledOnce(); expect(listenerB).toHaveBeenCalledOnce(); expect(rootListener).toHaveBeenCalledOnce(); expect(load).not.toHaveBeenCalled();
    expect(designer.getDocumentChanges()).toEqual(project.documentChanges); expect(source.isCurrent.mock.calls.length).toBeGreaterThan(3);
  });

  for (const problem of ['original-value', 'missing-path', 'reference', 'root-type', 'unavailable'] as const) it(`refuses ${problem} with the old source, preview and redo branch intact`, () => {
    const { scene, host, designer, project, source, initialProfile } = setup();
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed'); expect(designer.undo().status).toBe('changed');
    const before = { document: host.editor.document, context: host.stage.animationContext, nodes: [...scene.childNodes], css: scene.innerHTML, owner: host.previewOwner, projection: host.previewOwner.getProjection(), profile: designer.getProjectState() };
    const success = vi.fn(); designer.on('projectchange', success);
    let input = project;
    if (problem === 'original-value' || problem === 'missing-path') input = { ...project, documentChanges: project.documentChanges.map((change, index) => index ? change : { ...change, ...(problem === 'original-value' ? { oldValue: 'different' } : { fullXPath: '/html/body/section/button[9]' }) }) };
    const prepared = problem === 'reference' ? { ...source, reference: { ...source.reference, revision: 'wrong' } } : problem === 'root-type' ? { ...source, root: document.createElement('article') } : source;
    if (problem === 'unavailable') source.isCurrent.mockReturnValue(false);
    expect(openRealProject({ host, designer, scene, project: input, source: prepared, initialProfile }).status).toBe('rejected');
    expect(host.editor.document).toBe(before.document); expect(host.stage.animationContext).toEqual(before.context); expect([...scene.childNodes]).toEqual(before.nodes); expect(scene.innerHTML).toBe(before.css);
    expect(host.previewOwner).toBe(before.owner); expect(host.previewOwner.getProjection()).toEqual(before.projection); expect(designer.getProjectState()).toEqual(before.profile); expect(host.editor.canRedo).toBe(true); expect(success).not.toHaveBeenCalled();
    expect(designer.redo().status).toBe('changed'); expect(scene.querySelector<HTMLElement>('#gradient-box')?.style.backgroundImage).toContain('35deg'); expect(success).not.toHaveBeenCalled();
  });

  for (const participant of ['source', 'renderer', 'designer'] as const) it(`compensates an interrupted ${participant} after its real writes and preserves redo`, () => {
    const { scene, host, designer, subject, root, open } = setup(); const sourceNodes = [...root.childNodes];
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed'); expect(designer.undo().status).toBe('changed');
    const before = { document: host.editor.document, context: host.stage.animationContext, nodes: [...scene.childNodes], css: scene.innerHTML, owner: host.previewOwner, projection: host.previewOwner.getProjection(), profile: designer.getProjectState() };
    const success = vi.fn(); designer.on('projectchange', success); let fail = true;
    if (participant === 'source') {
      const replace = scene.replaceChildren.bind(scene);
      vi.spyOn(scene, 'replaceChildren').mockImplementation((...nodes) => { replace(...nodes); if (fail) { fail = false; throw new Error('Source interrupted after mounting'); } });
    } else if (participant === 'renderer') {
      const set = subject.style.setProperty.bind(subject.style);
      vi.spyOn(subject.style, 'setProperty').mockImplementation((name, value, priority) => { set(name, value, priority); if (name === 'background-image' && value?.includes('55deg') && fail) { fail = false; throw new Error('Renderer interrupted after CSS write'); } });
    } else {
      const prepare = designer.prepareProjectRehydration.bind(designer);
      vi.spyOn(designer, 'prepareProjectRehydration').mockImplementation((...args) => { const effect = prepare(...args); return { ...effect, apply() { effect.apply(); if (fail) { fail = false; throw new Error('Designer interrupted after adoption'); } } }; });
    }
    expect(open().status).toBe('rejected'); expect(fail).toBe(false);
    expect(host.editor.document).toBe(before.document); expect(host.stage.animationContext).toEqual(before.context); expect([...scene.childNodes]).toEqual(before.nodes); expect(scene.innerHTML).toBe(before.css);
    expect(host.previewOwner).toBe(before.owner); expect(host.previewOwner.getProjection()).toEqual(before.projection); expect(designer.getProjectState()).toEqual(before.profile); expect(host.editor.canRedo).toBe(true);
    expect([...root.childNodes]).toEqual(sourceNodes); expect(sourceNodes.every((node, index) => root.childNodes[index] === node)).toBe(true);
    expect(designer.getFault()).toBeNull(); expect(success).not.toHaveBeenCalled(); host.navigate(20); expect(designer.redo().status).toBe('changed'); expect(success).not.toHaveBeenCalled();
    expect(open().status).toBe('changed'); expect(scene.querySelector('#gradient-box')).toBe(subject);
  });

  for (const invalidation of ['mount', 'renderer'] as const) it(`compensates source availability invalidated during ${invalidation} without publishing project success`, () => {
    const { scene, host, designer, source, subject, root, open } = setup(); const sourceNodes = [...root.childNodes];
    const before = { document: host.editor.document, context: host.stage.animationContext, nodes: [...scene.childNodes], css: scene.innerHTML, owner: host.previewOwner };
    if (invalidation === 'mount') {
      const name = `project-source-guard-${++sourceGuardSequence}`;
      customElements.define(name, class extends HTMLElement { connectedCallback(): void { source.isCurrent.mockReturnValue(false); } });
      root.append(document.createElement(name)); sourceNodes.push(root.lastChild!);
    } else {
      const set = subject.style.setProperty.bind(subject.style);
      vi.spyOn(subject.style, 'setProperty').mockImplementation((name, value, priority) => { set(name, value, priority); if (name === 'background-image' && value?.includes('55deg')) source.isCurrent.mockReturnValue(false); });
    }
    const success = vi.fn(); designer.on('projectchange', success);
    expect(open().status).toBe('rejected'); expect(source.isCurrent()).toBe(false);
    expect(host.editor.document).toBe(before.document); expect(host.stage.animationContext).toEqual(before.context); expect([...scene.childNodes]).toEqual(before.nodes); expect(scene.innerHTML).toBe(before.css);
    expect(host.previewOwner).toBe(before.owner); expect([...root.childNodes]).toEqual(sourceNodes); expect(designer.getFault()).toBeNull(); expect(success).not.toHaveBeenCalled();
  });

  for (const direction of ['undo', 'redo'] as const) for (const invalidation of ['mount', 'renderer'] as const) it(`keeps ${direction} retryable when its ${invalidation} invalidates durable source resources`, () => {
    let armed = false; let invalidate = (): void => undefined;
    const name = `project-replay-guard-${++sourceGuardSequence}`;
    customElements.define(name, class extends HTMLElement { connectedCallback(): void { if (armed && invalidation === 'mount') invalidate(); } });
    const { scene, host, designer, source, root, subject, open } = setup(scene => { scene.append(document.createElement(name)); });
    root.append(document.createElement(name)); invalidate = () => { source.isCurrent.mockReturnValue(false); };
    const original = scene.querySelector<HTMLElement>('#gradient-box'); if (!original) throw new Error('Missing original subject');
    expect(open().status).toBe('changed'); if (direction === 'redo') expect(designer.undo().status).toBe('changed');
    const before = { document: host.editor.document, context: host.stage.animationContext, nodes: [...scene.childNodes], css: scene.innerHTML, owner: host.previewOwner, policy: host.projectRenderPolicy };
    if (invalidation === 'renderer') {
      const element = direction === 'undo' ? original : subject; const set = element.style.setProperty.bind(element.style);
      vi.spyOn(element.style, 'setProperty').mockImplementation((name, value, priority) => { set(name, value, priority); if (armed && name === 'background-image') invalidate(); });
    }
    const success = vi.fn(); designer.on('projectchange', success); armed = true;
    expect(designer[direction]().status).toBe('rejected'); expect(source.isCurrent()).toBe(false);
    expect(host.editor.document).toBe(before.document); expect(host.stage.animationContext).toEqual(before.context); expect([...scene.childNodes]).toEqual(before.nodes); expect(scene.innerHTML).toBe(before.css);
    expect(host.previewOwner).toBe(before.owner); expect(host.projectRenderPolicy).toBe(before.policy); expect(designer.getFault()).toBeNull(); expect(success).not.toHaveBeenCalled();
    armed = false; source.isCurrent.mockReturnValue(true);
    expect(designer[direction]().status).toBe('changed'); expect(success).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ direction }));
    expect(scene.querySelector('#gradient-box')).toBe(direction === 'undo' ? original : subject);
  });

  it('keeps inactive B resources out of A rendering while refusing and preserving a redo of B', () => {
    const { scene, host, designer, source, open } = setup();
    expect(open().status).toBe('changed'); expect(designer.undo().status).toBe('changed');
    source.isCurrent.mockReturnValue(false); host.navigate(20);
    expect(designer.redo().status).toBe('rejected'); expect(host.editor.canRedo).toBe(true);
    source.isCurrent.mockReturnValue(true); expect(designer.redo().status).toBe('changed'); expect(designer.undo().status).toBe('changed');
    source.isCurrent.mockReturnValue(false); designer.selectTarget('#gradient-box');
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 37 }]).status).toBe('changed');
    expect(scene.querySelector<HTMLElement>('#gradient-box')?.style.backgroundImage).toContain('37deg');
    // A new A edit intentionally creates a new branch and discards B's redo.
    expect(host.editor.canRedo).toBe(false); expect(designer.getFault()).toBeNull();
    expect(designer.undo().status).toBe('changed'); expect(designer.redo().status).toBe('changed');
  });

  it('finishes the opening transition when undo restores A without any CSS projection', () => {
    const { scene, host, designer, source, open } = setup(); const ownerA = host.previewOwner; const original = host.editor.document;
    expect(host.executeTransaction({ label: 'Hide unprojected A', commands: [createCommand('Hide unprojected A', document => ({ ...document, layers: document.layers.map(layer => ({ ...layer, visible: false })) }), () => original)] }).status).toBe('changed');
    expect(ownerA.getProjection()).toEqual([]);
    expect(open().status).toBe('changed'); expect(designer.undo().status).toBe('changed'); expect(host.previewOwner).toBe(ownerA); expect(ownerA.getProjection()).toEqual([]);
    source.isCurrent.mockReturnValue(false);
    expect(() => host.navigate(20)).not.toThrow(); expect(designer.getFault()).toBeNull(); expect(host.editor.canRedo).toBe(true);
    expect(designer.redo().status).toBe('rejected'); expect(host.editor.canRedo).toBe(true);
    source.isCurrent.mockReturnValue(true); expect(designer.redo().status).toBe('changed');
    expect(scene.querySelector<HTMLElement>('#gradient-box')?.style.backgroundImage).toContain('55deg');
  });

  for (const unsupported of ['folder', 'gradient-selector', 'gradient-owner'] as const) it(`refuses an unmapped ${unsupported} before a transaction while preserving its source and redo`, () => {
    const { scene, host, designer, project, source, root, initialProfile } = setup();
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed'); expect(designer.undo().status).toBe('changed');
    const data = project.timeline as unknown as ITimelineDocument; const context = host.stage.animationContext;
    const timeline = unsupported === 'folder' ? { ...data, layers: [{ id: 'folder', type: 'folder', name: 'Folder', children: data.layers }] } : { ...data, layers: data.layers.map(layer => layer.type !== 'layer' ? layer : { ...layer, ...(unsupported === 'gradient-selector' ? { target: { selector: '#another-gradient' } } : { id: 'otherGradientObject' }) }) };
    const htmlContext = unsupported === 'gradient-owner' ? { ...context, gradients: { otherGradientObject: context.gradients?.gradientObject ?? [] }, bindings: { otherGradientObject: context.bindings?.gradientObject ?? {} } } : context;
    const input = decodeEditableProject(encodeEditableProject({ ...project, timeline, htmlContext }, createTimelineProjectValidationPorts()), createTimelineProjectValidationPorts());
    const before = { document: host.editor.document, nodes: [...root.childNodes], source: root.innerHTML, scene: scene.innerHTML }; const transaction = vi.spyOn(host, 'executeTransaction');
    expect(openRealProject({ host, designer, scene, project: input, source, initialProfile })).toEqual({ status: 'rejected', message: expect.stringContaining('atelier') });
    expect(transaction).not.toHaveBeenCalled(); expect(host.editor.document).toBe(before.document); expect(root.innerHTML).toBe(before.source); expect([...root.childNodes]).toEqual(before.nodes); expect(scene.innerHTML).toBe(before.scene); expect(host.editor.canRedo).toBe(true);
  });

  it('keeps native time, document settings and observed rendering coherent when the opened duration shrinks', () => {
    const { scene, host, designer, project, source, initialProfile, subject } = setup();
    const input = { ...project, timeline: { ...project.timeline, settings: { fps: 60, totalFrames: 20 } } };
    const samples: { readonly frame: number; readonly total: number; readonly fps: number; readonly transport: number }[] = [];
    host.editor.on('frame:render', event => { samples.push({ frame: event.sample.time.frame, total: host.editor.document.settings.totalFrames, fps: host.editor.document.settings.fps, transport: host.editor.playback.time.frame }); });
    expect(host.editor.playback.frame).toBe(50);
    expect(openRealProject({ host, designer, scene, project: input, source, initialProfile }).status).toBe('changed');
    expect(host.editor.playback.frame).toBeLessThanOrEqual(20); expect(host.adapter.getState().frame).toBe(host.editor.playback.frame); expect(subject.style.backgroundImage).toContain('55deg');
    expect(designer.undo().status).toBe('changed'); expect(host.editor.document.settings).toMatchObject({ fps: 24, totalFrames: 100 });
    expect(designer.redo().status).toBe('changed'); expect(host.editor.document.settings).toEqual({ fps: 60, totalFrames: 20 }); expect(host.editor.playback.frame).toBeLessThanOrEqual(20);
    expect(samples.length).toBeGreaterThan(0); for (const sample of samples) { expect(sample.frame).toBe(sample.transport); expect(sample.frame).toBeLessThanOrEqual(sample.total); }
  });

  it('preserves retained native curve sources, transitions and easing through open, history and saving', () => {
    const { scene, host, designer, project, source, initialProfile, subject } = setup();
    const validatedFixture = decodeEditableProject(JSON.stringify(nativeFixture), createTimelineProjectValidationPorts());
    const native = validatedFixture.timeline as unknown as ITimelineDocument; const layer = native.layers[0];
    const track = layer?.type === 'layer' ? layer.propertyTimelines?.opacity : undefined; if (!track) throw new Error('Missing retained native curve fixture');
    const documentA = host.editor.document; const data = project.timeline as unknown as ITimelineDocument;
    const timeline = { ...data, settings: native.settings, layers: data.layers.map(layer => layer.type !== 'layer' ? layer : { ...layer, propertyTimelines: { gradientChannel2: track } }) };
    expect(openRealProject({ host, designer, scene, project: { ...project, timeline }, source, initialProfile }).status).toBe('changed');
    expect(host.editor.document).toEqual(timeline); expect(host.previewOwner.withSource(() => subject.style.backgroundImage)).toContain('120deg');
    expect(designer.undo().status).toBe('changed'); expect(host.editor.document).toEqual(documentA);
    expect(designer.redo().status).toBe('changed'); expect(host.editor.document).toEqual(timeline);
    const profile = designer.getProjectState(); if (!profile) throw new Error('Missing adopted B profile');
    const saved = decodeEditableProject(encodeCurrentRealProject({ host, designer, ...profile }), createTimelineProjectValidationPorts());
    expect(saved.timeline).toEqual(timeline); expect(saved.htmlContext).toEqual(project.htmlContext); expect(saved.documentChanges).toEqual(project.documentChanges);
  });

  it('binds an animated ID assigned from null by the journal before observations, history and capture', () => {
    const { scene, host, designer, project, source, initialProfile, button } = setup();
    const nodesA = [...scene.childNodes]; const ownerA = host.previewOwner; const data = project.timeline as unknown as ITimelineDocument;
    const timeline: ITimelineDocument = { ...data, layers: [...data.layers, { id: 'buttonObject', type: 'layer', name: 'Animated journal ID', target: { selector: '#B-action' }, spans: [],
      propertyTimelines: { opacity: { initialValue: { kind: 'number', value: 1 }, keys: [{ frame: 1, value: { kind: 'number', value: 0.4 } }] } },
    }] };
    const context = cloneHtmlAnimationContext(project.htmlContext);
    const htmlContext: IHtmlAnimationContext = { ...context, bindings: { ...context.bindings, buttonObject: { opacity: { kind: 'style', cssName: 'opacity' } } } };
    const observed: { readonly source: string | undefined; readonly node: Element | null; readonly opacity: string | undefined }[] = [];
    host.editor.on('transaction:changed', () => { const node = scene.querySelector<HTMLElement>('#B-action'); observed.push({ source: designer.getProjectState()?.source.id, node, opacity: node?.style.opacity }); });
    expect(button.getAttribute('id')).toBeNull();
    expect(openRealProject({ host, designer, scene, project: { ...project, timeline, htmlContext }, source, initialProfile }).status).toBe('changed');
    const ownerB = host.previewOwner; expect(button.id).toBe('B-action'); expect(button.style.opacity).toBe('0.4');
    expect(host.previewOwner.withSource(() => button.getAttribute('style'))).toBeNull();
    expect(designer.undo().status).toBe('changed'); expect(host.previewOwner).toBe(ownerA); expect(nodesA.every((node, index) => scene.childNodes[index] === node)).toBe(true);
    expect(designer.redo().status).toBe('changed'); expect(host.previewOwner).toBe(ownerB); expect(scene.querySelector('#B-action')).toBe(button); expect(button.style.opacity).toBe('0.4');
    expect(observed).toEqual([{ source: 'source-B', node: button, opacity: '0.4' }, { source: 'source-A', node: null, opacity: undefined }, { source: 'source-B', node: button, opacity: '0.4' }]);
    const profile = designer.getProjectState(); if (!profile) throw new Error('Missing restored B profile');
    const saved = decodeEditableProject(encodeCurrentRealProject({ host, designer, ...profile }), createTimelineProjectValidationPorts());
    expect(saved.timeline).toEqual(timeline); expect(saved.htmlContext).toEqual(htmlContext); expect(saved.documentChanges).toEqual(project.documentChanges);
    expect(saved.documentChanges.find(change => change.newValue === 'B-action')?.oldValue).toBeNull();
  });

  it('latches an unrecoverable source compensation fault instead of returning a clean refusal', () => {
    const { scene, host, designer, open } = setup(); const projectChanged = vi.fn(); designer.on('projectchange', projectChanged);
    const replace = scene.replaceChildren.bind(scene);
    vi.spyOn(scene, 'replaceChildren').mockImplementation((...nodes) => { replace(...nodes); throw new Error('Source apply and rollback interrupted'); });
    expect(open().status).toBe('faulted'); expect(host.editor.transactions.fault).toBeDefined(); expect(host.adapter.getState().fault).toBeTruthy(); expect(designer.getFault()).toBeTruthy();
    expect(projectChanged).not.toHaveBeenCalled(); expect(designer.undo().status).toBe('faulted'); expect(designer.redo().status).toBe('faulted');
  });
});
