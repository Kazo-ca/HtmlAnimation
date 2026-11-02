// Genuine installed HA9 renderer integration. Fault injection uses only public owner methods.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomPreviewOwner, HtmlDesigner } from '../packages/designer/src/index.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import { createGradientScene, gradientFixtureDefinition } from '../fixtures/gradient-scene.js';
import { createScene } from '../fixtures/scene.js';
import type { IHtmlAnimationContext, ITimelineDocument } from '@kazo-ca/timeline-runtime';
import { createCommand } from '@kazo-ca/timeline-editor';
import type * as TimelineEditor from '@kazo-ca/timeline-editor';
import { gradientCss } from '../packages/css-properties/src/index.js';
import { propertyInput } from './helpers.js';

const cleanup: (() => void)[] = [];
const bootstrapFault = vi.hoisted(() => ({ armed: false, editor: undefined as TimelineEditor.IEditor | undefined }));
vi.mock('@kazo-ca/timeline-editor', async importOriginal => {
    const native = await importOriginal<typeof TimelineEditor>();
    return { ...native, createEditor: (...args: Parameters<typeof native.createEditor>) => {
        const editor = native.createEditor(...args);
        if (bootstrapFault.armed) {
            bootstrapFault.editor = editor;
            vi.spyOn(editor, 'sample').mockImplementation(() => { throw new Error('Bootstrap sample unavailable'); });
        }
        return editor;
    } };
});
afterEach(() => { vi.restoreAllMocks(); for (const dispose of cleanup.splice(0).reverse()) dispose(); if (bootstrapFault.editor && !bootstrapFault.editor.isDestroyed) bootstrapFault.editor.destroy(); bootstrapFault.armed = false; bootstrapFault.editor = undefined; document.body.replaceChildren(); });
function setup(initial = 35, grouped = false, frame = 1) {
    const scene = createGradientScene(document); const editorContainer = document.createElement('div');
    const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
    document.body.append(scene, editorContainer, propertiesContainer, treeContainer);
    const element = scene.querySelector<HTMLElement>('#gradient-box'); const peer = scene.querySelector<HTMLElement>('#gradient-peer');
    if (!element || !peer) throw new Error('Missing real fixture');
    if (grouped) { element.style.opacity = '0.2'; peer.style.opacity = '0.8'; }
    const source = element.getAttribute('style');
    const id = grouped ? 'group' : 'gradientObject'; const property = grouped ? 'opacity' : 'gradientChannel2';
    const data: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [{ id, type: 'layer', name: 'Fixture', target: { selector: grouped ? '.gradient-subject' : '#gradient-box' }, spans: [], propertyTimelines: { [property]: { initialValue: { kind: 'number', value: grouped ? 0.2 : 90 }, keys: [{ frame, value: { kind: 'number', value: initial } }] } } }] };
    const context: IHtmlAnimationContext = grouped ? { version: 1, bindings: { group: { opacity: { kind: 'style', cssName: 'opacity' } } } } : { version: 1, gradients: { gradientObject: [gradientFixtureDefinition()] }, bindings: { gradientObject: { gradientChannel2: { kind: 'gradient', gradientId: 'main', component: 'angle' } } } };
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context });
    cleanup.push(() => host.dispose());
    const mount = () => {
        const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
        cleanup.push(() => designer.dispose()); designer.selectTarget(grouped ? '.gradient-subject' : '#gradient-box'); return designer;
    };
    return { host, mount, element, peer, source, scene, editorContainer, propertiesContainer };
}
describe('genuine HA9 prepared host renderer', () => {
    it('reads native color and text tracks without coercing them to numeric CSS values', () => {
        const scene = createGradientScene(document); const container = document.createElement('div'); document.body.append(scene, container);
        const documentData: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [{ id: 'peerObject', type: 'layer', name: 'Typed source', target: { selector: '#gradient-peer' }, spans: [], propertyTimelines: {
            color: { initialValue: { kind: 'color', r: 0, g: 0, b: 0, a: 1 }, keys: [{ frame: 1, value: { kind: 'color', r: 1, g: 0, b: 0, a: 1 } }] },
            fontFamily: { initialValue: { kind: 'text', value: 'serif' }, keys: [{ frame: 1, value: { kind: 'text', value: 'sans-serif' } }] },
        } }] };
        const context: IHtmlAnimationContext = { version: 1, bindings: { peerObject: { color: { kind: 'style', cssName: 'color' }, fontFamily: { kind: 'style', cssName: 'font-family' } } } };
        const host = createRealGradientHost(container, scene, 'linear', { document: documentData, context }); cleanup.push(() => host.dispose());
        expect(host.adapter.getState().values.peerObject).toMatchObject({ color: expect.any(String), 'font-family': 'sans-serif' });
        expect(scene.querySelector<HTMLElement>('#gradient-peer')?.style.color).toBe('rgb(255, 0, 0)');
        expect(scene.querySelector<HTMLElement>('#gradient-peer')?.style.fontFamily).toBe('sans-serif');
    });
    it('destroys an initialized Editor and restores source if bridge bootstrap fails', () => {
        const scene = createGradientScene(document); const container = document.createElement('div'); document.body.append(scene, container); const source = scene.innerHTML;
        bootstrapFault.armed = true;
        expect(() => createRealGradientHost(container, scene)).toThrow('Bootstrap sample unavailable');
        expect(bootstrapFault.editor?.isDestroyed).toBe(true); expect(scene.innerHTML).toBe(source); expect(container.childElementCount).toBe(0);
    });
    it('renders the first real key before Designer construction while inspection keeps its original base', () => {
        const { host, mount, element, source } = setup();
        expect(element.style.backgroundImage).toContain('35deg');
        const owner = host.adapter.preview; if (!owner) throw new Error('Missing shared owner');
        expect(owner.withSource(() => element.getAttribute('style'))).toBe(source);
        const preview = element.getAttribute('style');
        const inspection = host.stage.inspectProperty({ selector: '#gradient-box' }, 'gradientChannel2', { layerId: 'gradientObject', valueKind: 'number' });
        expect(inspection.initialValue).toEqual({ kind: 'number', value: 90 }); expect(element.getAttribute('style')).toBe(preview);
        const render = vi.spyOn(owner, 'prepare');
        const designer = mount(); expect(designer.getGradientState()?.gradients[0]?.angle).toBe(35);
        expect(render).not.toHaveBeenCalled(); expect(element.getAttribute('style')).toBe(preview);
        expect(host.editor.propertyTimelines.capture('gradientObject', 'gradientChannel2', { frame: 10, initialValue: { kind: 'number', value: 90 } }).status).toBe('changed');
        const layer = host.editor.document.layers[0]; if (!layer || layer.type !== 'layer') throw new Error('Missing layer');
        expect(layer.propertyTimelines?.gradientChannel2?.keys.at(-1)).toEqual({ frame: 10, value: { kind: 'number', value: 35 } });
        expect(host.stage.inspectProperty({ selector: '#gradient-box' }, 'gradientChannel2', { layerId: 'gradientObject', valueKind: 'number' }).initialValue).toEqual({ kind: 'number', value: 90 });
        designer.dispose(); expect(element.style.backgroundImage).toContain('35deg'); host.dispose(); expect(element.getAttribute('style')).toBe(source);
    });
    it('keeps divergent original group sources even when initialize renders a common value before Designer exists', () => {
        const { host, mount, element, peer, propertiesContainer } = setup(0.4, true);
        expect([element.style.opacity, peer.style.opacity]).toEqual(['0.4', '0.4']);
        const designer = mount();
        expect(propertyInput(propertiesContainer, 'opacity').disabled).toBe(true); expect(designer.editProperty('opacity', '0.6').status).toBe('rejected');
        expect(host.adapter.preview?.withSource(() => [element.style.opacity, peer.style.opacity])).toEqual(['0.2', '0.8']);
    });
    it('compensates a partially applied renderer and preserves the previous redo on request failure', () => {
        const { host, mount, element } = setup(); const designer = mount();
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 55 }]).status).toBe('changed');
        expect(designer.undo().status).toBe('changed');
        const owner = host.adapter.preview; if (!owner) throw new Error('Missing owner');
        const before = host.editor.document; const context = structuredClone(host.stage.animationContext); const style = element.getAttribute('style'); const projection = owner.getProjection();
        const prepare = owner.prepare.bind(owner); let fail = true;
        vi.spyOn(owner, 'prepare').mockImplementation(projection => {
            const effect = prepare(projection);
            return { ...effect, apply: () => { effect.apply(); if (fail) { fail = false; throw new Error('Renderer interrupted after actual writes'); } } };
        });
        const accepted = vi.fn(); designer.on('propertychange', accepted); designer.on('documentchange', accepted);
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 70 }]).status).toBe('rejected');
        expect(host.editor.document).toBe(before); expect(host.stage.animationContext).toEqual(context); expect(element.getAttribute('style')).toBe(style); expect(owner.getProjection()).toEqual(projection);
        expect(host.editor.transactions.fault).toBeUndefined(); expect(host.editor.canRedo).toBe(true); expect(accepted).not.toHaveBeenCalled();
        expect(designer.redo().status).toBe('changed'); expect(element.style.backgroundImage).toContain('55deg');
    });
    it('retains a real renderer compensation fault and destroys without masking the host state to repair', () => {
        const { host, mount, element } = setup(); const designer = mount();
        const owner = host.adapter.preview; if (!owner) throw new Error('Missing owner');
        const prepare = owner.prepare.bind(owner);
        vi.spyOn(owner, 'prepare').mockImplementation(projection => {
            const effect = prepare(projection);
            return { ...effect, apply: () => { effect.apply(); throw new Error('Renderer apply failed'); }, rollback: () => { throw new Error('Renderer rollback failed'); } };
        });
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 70 }]).status).toBe('faulted');
        expect(host.editor.transactions.fault).toBeDefined(); expect(host.adapter.getState().fault).toBeTruthy(); expect(host.canCaptureProject()).toBe(false);
        expect(host.adapter.undo().status).toBe('faulted'); expect(host.adapter.redo().status).toBe('faulted');
        const uncertain = element.getAttribute('style'); const restore = vi.spyOn(owner, 'prepareRestore');
        designer.dispose(); host.dispose();
        expect(host.editor.isDestroyed).toBe(true); expect(restore).not.toHaveBeenCalled(); expect(element.getAttribute('style')).toBe(uncertain);
    });
    it('keeps a compensated destruction retryable and restores source only after a successful retry', () => {
        const { host, mount, element, source } = setup(); const designer = mount(); designer.dispose();
        const owner = host.adapter.preview; if (!owner) throw new Error('Missing owner');
        const preview = element.getAttribute('style'); const projection = owner.getProjection(); const restore = owner.prepareRestore.bind(owner); let fail = true;
        vi.spyOn(owner, 'prepareRestore').mockImplementation(() => {
            const effect = restore();
            return { ...effect, apply: () => { effect.apply(); if (fail) { fail = false; throw new Error('Destroy renderer interrupted'); } } };
        });
        expect(() => host.dispose()).toThrow();
        expect(host.editor.isDestroyed).toBe(false); expect(host.canCaptureProject()).toBe(true); expect(host.adapter.getState().canUndo).toBe(false);
        expect(element.getAttribute('style')).toBe(preview); expect(owner.getProjection()).toEqual(projection);
        host.dispose(); expect(host.editor.isDestroyed).toBe(true); expect(element.getAttribute('style')).toBe(source); expect(host.canCaptureProject()).toBe(false);
    });
    it('compensates a failed seek render without rewinding transport or publishing a successful frame', () => {
        const { host, mount, element } = setup(35, false, 50); mount(); host.navigate(20);
        const owner = host.adapter.preview; if (!owner) throw new Error('Missing owner');
        const before = host.editor.document; const style = element.getAttribute('style'); const projection = owner.getProjection(); const prepare = owner.prepare.bind(owner); let fail = true;
        vi.spyOn(owner, 'prepare').mockImplementation(projection => {
            const effect = prepare(projection);
            return { ...effect, apply: () => { effect.apply(); if (fail) { fail = false; throw new Error('Seek renderer interrupted'); } } };
        });
        const frame = vi.fn(); host.editor.on('frame:render', frame);
        expect(() => host.navigate(75)).toThrow();
        expect(host.editor.playback.frame).toBe(75); expect(host.editor.document).toBe(before); expect(element.getAttribute('style')).toBe(style); expect(owner.getProjection()).toEqual(projection); expect(frame).not.toHaveBeenCalled();
        expect(host.editor.transactions.fault).toBeUndefined(); host.navigate(75); expect(element.style.backgroundImage).toContain('35deg');
        expect(host.editor.canUndo).toBe(false);
    });
    it('compensates an interrupted initial render before exposing any Editor or Designer', () => {
        const scene = createGradientScene(document); const container = document.createElement('div'); document.body.append(scene, container);
        const element = scene.querySelector<HTMLElement>('#gradient-box'); if (!element) throw new Error('Missing target');
        const source = element.getAttribute('style'); const prepare = DomPreviewOwner.prototype.prepare;
        vi.spyOn(DomPreviewOwner.prototype, 'prepare').mockImplementation(function (this: DomPreviewOwner, projection) {
            const effect = prepare.call(this, projection);
            return { ...effect, apply: () => { effect.apply(); throw new Error('Initialize renderer interrupted'); } };
        });
        expect(() => createRealGradientHost(container, scene)).toThrow();
        expect(element.getAttribute('style')).toBe(source); expect(container.children).toHaveLength(0);
    });
    it('loads a new temporal document before its observers without recapturing the active preview as source', () => {
        const { host, mount, element, source } = setup(); const designer = mount();
        const data: ITimelineDocument = { ...host.editor.document, layers: host.editor.document.layers.map(layer => layer.type !== 'layer' ? layer : { ...layer, propertyTimelines: { gradientChannel2: { initialValue: { kind: 'number', value: 90 }, keys: [{ frame: 1, value: { kind: 'number', value: 60 } }] } } }) };
        const observed: string[] = []; host.editor.on('document:loaded', () => { observed.push(element.style.backgroundImage); expect(host.editor.canUndo).toBe(false); });
        host.editor.load(data);
        expect(observed).toEqual([expect.stringContaining('60deg')]); designer.selectTarget('#gradient-box'); expect(designer.getGradientState()?.gradients[0]?.angle).toBe(60);
        expect(host.previewOwner.withSource(() => element.getAttribute('style'))).toBe(source);
        expect(host.stage.inspectProperty({ selector: '#gradient-box' }, 'gradientChannel2', { layerId: 'gradientObject', valueKind: 'number' }).initialValue).toEqual({ kind: 'number', value: 90 });
    });
    it('renders fractional playback from the genuine candidate evaluation without generating additional history', () => {
        const { host, mount, element } = setup(); const designer = mount();
        expect(host.editor.propertyTimelines.set('gradientObject', 'gradientChannel2', { kind: 'number', value: 55 }, { frame: 50, initialValue: { kind: 'number', value: 90 } }).status).toBe('changed');
        expect(host.editor.propertyTimelines.createTransition('gradientObject', 'gradientChannel2', [1, 50]).status).toBe('changed');
        const before = host.editor.document; host.editor.playback.play(); host.advance(1025);
        const sampled = host.editor.sample(host.editor.playback.time.frame).layer('gradientObject')?.propertyValues?.gradientChannel2;
        if (sampled?.kind !== 'number') throw new Error('Missing genuine sampled angle');
        expect(host.editor.playback.time.frame % 1).not.toBe(0);
        const angle = /^linear-gradient\(([-+\d.e]+)deg/.exec(element.style.backgroundImage)?.[1];
        expect(Number(angle)).toBeCloseTo(sampled.value, 6); expect(designer.getGradientState()?.gradients[0]?.angle).toBeCloseTo(sampled.value, 6);
        host.editor.playback.pause(); host.advance(0); expect(host.editor.document).toBe(before);
    });
    it('renders the canonical four-button reference with the sole ID key at50 and no implicit key', () => {
        const scene = createScene(document); const container = document.createElement('div');
        // Unanimated bootstrap node required by this private gradient/peer host factory.
        const bootstrap = document.createElement('div'); bootstrap.id = 'gradient-box'; scene.append(bootstrap);
        document.body.append(scene, container);
        const buttons = [...scene.querySelectorAll<HTMLButtonElement>('.button')];
        expect(buttons).toHaveLength(4); expect(buttons.map(button => button.style.opacity)).toEqual(['1', '1', '1', '1']);
        const source = buttons.map(button => button.getAttribute('style'));
        const context: IHtmlAnimationContext = { version: 1, bindings: { group: { opacity: { kind: 'style', cssName: 'opacity' } }, specific: { opacity: { kind: 'style', cssName: 'opacity' } } } };
        const data: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [
            { id: 'group', type: 'layer', name: 'Group', target: { selector: '.button' }, spans: [], propertyTimelines: { opacity: { initialValue: { kind: 'number', value: 1 }, keys: [{ frame: 1, value: { kind: 'number', value: 0.5 } }] } } },
            { id: 'specific', type: 'layer', name: 'ID', target: { selector: '#button-2' }, spans: [], propertyTimelines: { opacity: { initialValue: { kind: 'number', value: 1 }, keys: [{ frame: 50, value: { kind: 'number', value: 0.8 } }] } } },
        ] };
        const host = createRealGradientHost(container, scene, 'linear', { document: data, context }); cleanup.push(() => host.dispose());
        const before = host.editor.document;
        for (const frame of [1, 20, 49, 50]) { host.navigate(frame); expect(buttons.map(button => button.style.opacity)).toEqual(['0.5', '0.8', '0.5', '0.5']); }
        expect(host.editor.document).toBe(before); expect(host.editor.canUndo).toBe(false); expect(host.stage.diagnostics).toEqual([]); expect(host.stage.animationContext.resolutions ?? []).toEqual([]);
        expect(host.previewOwner.withSource(() => buttons.map(button => button.style.opacity))).toEqual(['1', '1', '1', '1']);
        host.dispose(); expect(buttons.map(button => button.getAttribute('style'))).toEqual(source);
    });
    it('switches only the prepared owner pointer when a permanent root receives new source nodes', () => {
        const { host, mount, scene, element } = setup(); const designer = mount();
        const before = host.editor.document; const initialContext = structuredClone(host.stage.animationContext); const initialOwner = host.previewOwner; const initialNodes = [...scene.childNodes];
        const template = createGradientScene(document); const replacement = template.querySelector<HTMLElement>('#gradient-box'); if (!replacement) throw new Error('Missing new source');
        const gradient = { ...gradientFixtureDefinition(), angle: 120 }; replacement.style.backgroundImage = gradientCss(gradient);
        const next: ITimelineDocument = { ...before, layers: before.layers.map(layer => layer.type !== 'layer' ? layer : { ...layer, propertyTimelines: { gradientChannel2: { initialValue: { kind: 'number', value: 120 }, keys: [{ frame: 1, value: { kind: 'number', value: 55 } }] } } }) };
        const context: IHtmlAnimationContext = { ...initialContext, gradients: { gradientObject: [gradient] } };
        const result = host.editor.transactions.execute({ label: 'Replace fixture source', commands: [createCommand('Replace temporal fixture', () => next, () => before)], htmlContext: { stageId: host.stage.id, context }, effect: {
            prepare(direction) {
                const previousNodes = [...scene.childNodes]; const previousOwner = host.previewOwner;
                return { changed: true, apply() {
                    if (direction === 'undo') { scene.replaceChildren(...initialNodes); host.installPreviewOwner(initialOwner); }
                    else { const clone = template.cloneNode(true); scene.replaceChildren(...clone.childNodes); host.installPreviewOwner(new DomPreviewOwner(scene)); }
                }, rollback() { scene.replaceChildren(...previousNodes); host.installPreviewOwner(previousOwner); } };
            },
        } });
        expect(result.status).toBe('changed'); expect(element.isConnected).toBe(false); expect(host.previewOwner).not.toBe(initialOwner); expect(host.adapter.preview).toBe(host.previewOwner);
        const current = scene.querySelector<HTMLElement>('#gradient-box'); if (!current) throw new Error('Missing live replacement');
        expect(current.style.backgroundImage).toContain('55deg'); expect(host.previewOwner.withSource(() => current.style.backgroundImage)).toContain('120deg');
        designer.dispose(); const nextDesigner = mount(); expect(nextDesigner.beginGradientGesture().status).toBe('changed'); expect(nextDesigner.previewGradient([{ gradientId: 'main', component: 'angle', value: 75 }]).status).toBe('changed');
        expect(current.style.backgroundImage).toContain('75deg'); nextDesigner.cancelGradientGesture(); expect(current.style.backgroundImage).toContain('55deg');
        expect(host.stage.inspectProperty({ selector: '#gradient-box' }, 'gradientChannel2', { layerId: 'gradientObject', valueKind: 'number' }).initialValue).toEqual({ kind: 'number', value: 120 });
        nextDesigner.dispose(); expect(host.editor.undo()).toBe(true); expect(scene.querySelector('#gradient-box')).toBe(element); expect(host.previewOwner).toBe(initialOwner); expect(element.style.backgroundImage).toContain('35deg');
    });
});
