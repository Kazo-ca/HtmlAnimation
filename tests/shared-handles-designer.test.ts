// Genuine HA11 bridge: canvas handle gestures through the shared preview owner.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ILayer, ITimelineDocument } from '@kazo-ca/timeline-runtime';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { manipulationClassPrefix } from '../packages/designer/src/manipulation-marker.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function setup(prepare: (scene: HTMLElement) => void = () => {}) {
    const scene = createGradientScene(document);
    prepare(scene);
    // jsdom has no layout: give the peer the measured box the geometry tests use.
    const box = scene.querySelector<HTMLElement>('#gradient-peer'); const parent = box?.parentElement;
    if (!box || !parent) throw new Error('Missing peer fixture');
    Object.assign(box.style, { position: 'relative', left: '0px', top: '0px', width: '100px', height: '50px', transformOrigin: '50% 50%' });
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, 100, 50));
    vi.spyOn(box, 'offsetWidth', 'get').mockReturnValue(100); vi.spyOn(box, 'offsetHeight', 'get').mockReturnValue(50);
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200));
    vi.spyOn(parent, 'clientWidth', 'get').mockReturnValue(400); vi.spyOn(parent, 'clientHeight', 'get').mockReturnValue(200);
    const editorContainer = document.createElement('div');
    const propertiesContainer = document.createElement('div');
    const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const data: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [] };
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context: { version: 1 } });
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    let disposed = false;
    const dispose = (): void => { if (disposed) return; disposed = true; designer.dispose(); host.dispose(); };
    cleanup.push(dispose);
    const peer = scene.querySelector<HTMLElement>('#gradient-peer');
    if (!peer) throw new Error('Missing peer');
    designer.selectTarget('#gradient-peer');
    return { host, designer, scene, peer, dispose };
}
const markers = (scene: HTMLElement): readonly string[] => [...scene.querySelectorAll('*')].flatMap(element => [...element.classList].filter(name => name.startsWith(manipulationClassPrefix)));
function layer(host: ReturnType<typeof setup>['host']): ILayer | undefined { const found = host.editor.document.layers[0]; return found?.type === 'layer' ? found : undefined; }

describe('canvas handles with the shared HA11 preview', () => {
    it('previews a move through the bridge, marks the element, and records one key on commit', () => {
        const { host, designer, scene, peer } = setup();
        const classes = peer.getAttribute('class'); const before = host.editor.document;
        expect(designer.beginGeometryGesture('move')).toEqual({ status: 'changed' });
        expect(markers(scene)).toHaveLength(1); expect(peer.className).toContain(manipulationClassPrefix);
        expect(designer.updateGeometryGesture({ x: 30, y: 0 }, { bypassSnap: true }).status).toBe('changed');
        expect(peer.style.transform).toContain('30px');
        expect(host.editor.document).toBe(before);
        expect(designer.commitGeometryGesture()).toEqual({ status: 'changed' });
        expect(layer(host)?.propertyTimelines?.spatialTranslateX?.keys).toEqual([{ frame: 1, value: { kind: 'number', value: 30 } }]);
        expect(markers(scene)).toEqual([]); expect(peer.getAttribute('class')).toBe(classes);
        expect(peer.style.transform).toContain('30px');
        expect(designer.undo().status).toBe('changed'); expect(host.editor.document).toEqual(before);
    });
    it('cancels without keys, restoring the preview and the exact class attribute', () => {
        const { host, designer, scene, peer } = setup();
        const style = peer.getAttribute('style'); const classes = peer.getAttribute('class'); const before = host.editor.document;
        designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 12, y: 8 }, { bypassSnap: true });
        designer.cancelGeometryGesture();
        expect(host.editor.document).toBe(before); expect(peer.getAttribute('style')).toBe(style);
        expect(peer.getAttribute('class')).toBe(classes); expect(markers(scene)).toEqual([]);
    });
    it('removes the class attribute again when the element had none', () => {
        const { designer, peer } = setup(scene => { scene.querySelector('#gradient-peer')?.removeAttribute('class'); });
        designer.beginGeometryGesture('move');
        expect(peer.hasAttribute('class')).toBe(true);
        designer.updateGeometryGesture({ x: 5, y: 0 }, { bypassSnap: true }); designer.commitGeometryGesture();
        expect(peer.hasAttribute('class')).toBe(false);
    });
    it('records a rotation gesture as one spatial key', () => {
        const { host, designer } = setup();
        designer.beginGeometryGesture('rotate'); expect(designer.updateGeometryGesture({ x: 20, y: 40 }, { bypassSnap: true }).status).toBe('changed');
        expect(designer.commitGeometryGesture().status).toBe('changed');
        expect(Object.keys(layer(host)?.propertyTimelines ?? {})).toEqual(['spatialRotation']);
    });
    it('offers the dimensions handle too, and leaves no marker once cancelled', () => {
        const { designer, scene } = setup();
        expect(designer.beginGeometryGesture('dimensions')).toEqual({ status: 'changed' });
        designer.cancelGeometryGesture(); expect(markers(scene)).toEqual([]);
    });
    it('removes every marker and draft when the Designer is disposed mid-gesture', () => {
        const { designer, scene, peer, dispose } = setup();
        const style = peer.getAttribute('style'); const classes = peer.getAttribute('class');
        designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 9, y: 0 }, { bypassSnap: true });
        dispose();
        expect(markers(scene)).toEqual([]); expect(peer.getAttribute('class')).toBe(classes); expect(peer.getAttribute('style')).toBe(style);
    });
    it('never commits a proposal the adapter refused to compose', () => {
        const scene = createGradientScene(document);
        const editorContainer = document.createElement('div'); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
        document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
        const box = scene.querySelector<HTMLElement>('#gradient-peer'); const parent = box?.parentElement; if (!box || !parent) throw new Error('Missing peer');
        Object.assign(box.style, { position: 'relative', left: '0px', top: '0px', width: '100px', height: '50px' });
        vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, 100, 50));
        vi.spyOn(box, 'offsetWidth', 'get').mockReturnValue(100); vi.spyOn(box, 'offsetHeight', 'get').mockReturnValue(50);
        vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200));
        vi.spyOn(parent, 'clientWidth', 'get').mockReturnValue(400); vi.spyOn(parent, 'clientHeight', 'get').mockReturnValue(200);
        const host = createRealGradientHost(editorContainer, scene, 'linear', { document: { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [] }, context: { version: 1 } });
        const refusing = { ...host.adapter, getState: () => host.adapter.getState(), onChange: host.adapter.onChange, composeGeometry: () => ({ status: 'rejected' as const, message: 'Refus simulé de composition.' }) };
        const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => refusing });
        cleanup.push(() => { designer.dispose(); host.dispose(); });
        designer.selectTarget('#gradient-peer');
        expect(designer.beginGeometryGesture('move').status).toBe('changed');
        expect(designer.updateGeometryGesture({ x: 30, y: 0 }, { bypassSnap: true })).toMatchObject({ status: 'rejected', message: 'Refus simulé de composition.' });
        expect(designer.commitGeometryGesture().status).toBe('unchanged');
        expect(host.editor.document.layers).toEqual([]); expect(markers(scene)).toEqual([]);
    });
    it('cancels the gesture and its marker when the frame changes', () => {
        const { host, designer, scene } = setup();
        designer.beginGeometryGesture('move'); host.navigate(20);
        expect(designer.updateGeometryGesture({ x: 9, y: 0 }, { bypassSnap: true }).status).toBe('rejected');
        expect(designer.isGeometryGestureActive()).toBe(false); expect(markers(scene)).toEqual([]);
    });
});
