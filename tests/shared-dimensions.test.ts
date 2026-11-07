// Genuine HA11 bridge: width/height tracks and the dimensions handle through the shared preview.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ILayer, ITimelineDocument } from '@kazo-ca/timeline-runtime';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { manipulationClassPrefix } from '../packages/designer/src/manipulation-marker.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function setup(width = '100px') {
    const scene = createGradientScene(document);
    const box = scene.querySelector<HTMLElement>('#gradient-peer'); const parent = box?.parentElement;
    if (!box || !parent) throw new Error('Missing peer fixture');
    Object.assign(box.style, { position: 'relative', left: '0px', top: '0px', width, height: '50px', maxWidth: 'none', transformOrigin: '50% 50%' });
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, 100, 50));
    vi.spyOn(box, 'offsetWidth', 'get').mockReturnValue(100); vi.spyOn(box, 'offsetHeight', 'get').mockReturnValue(50);
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200));
    vi.spyOn(parent, 'clientWidth', 'get').mockReturnValue(400); vi.spyOn(parent, 'clientHeight', 'get').mockReturnValue(200);
    const editorContainer = document.createElement('div'); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const data: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [] };
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context: { version: 1 } });
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    cleanup.push(() => { designer.dispose(); host.dispose(); });
    designer.selectTarget('#gradient-peer');
    return { host, designer, scene, box };
}
const write = (property: string, value: string, objectId = 'html:#gradient-peer') => ({ objectId, selector: '#gradient-peer', property, value, frame: 1 });
function layer(host: ReturnType<typeof setup>['host']): ILayer | undefined { const found = host.editor.document.layers[0]; return found?.type === 'layer' ? found : undefined; }

describe('width and height through the genuine bridge', () => {
    it('keys a px width with its typed source base and renders it', () => {
        const { host, box } = setup();
        expect(host.adapter.execute('Width', [write('width', '150px')])).toEqual({ status: 'changed' });
        const track = layer(host)?.propertyTimelines?.width;
        expect(track).toMatchObject({ initialValue: { kind: 'number', value: 100 }, keys: [{ frame: 1, value: { kind: 'number', value: 150 } }] });
        expect(host.stage.animationContext.bindings?.[layer(host)?.id ?? '']?.width).toEqual({ kind: 'style', cssName: 'width', unit: 'px' });
        expect(box.style.width).toBe('150px');
        expect(host.adapter.undo().status).toBe('changed'); expect(box.style.width).toBe('100px');
    });
    it('keeps a percentage track in its authored unit and refuses a later silent unit change', () => {
        const { host } = setup('25%');
        expect(host.adapter.execute('Width', [write('width', '40%')]).status).toBe('changed');
        expect(layer(host)?.propertyTimelines?.width?.initialValue).toEqual({ kind: 'number', value: 25 });
        expect(host.adapter.execute('Width px', [write('width', '120px', layer(host)?.id)])).toMatchObject({ status: 'rejected', message: expect.stringContaining('unité') });
    });
    it('refuses a unit whose source base cannot be measured, and invalid dimensions', () => {
        const { host } = setup();
        expect(host.adapter.execute('Width em', [write('width', '10em')])).toMatchObject({ status: 'rejected', message: expect.stringContaining('base') });
        for (const value of ['-5px', 'auto', 'calc(10px + 2%)']) expect(host.adapter.execute('Bad', [write('height', value)]).status).toBe('rejected');
        expect(host.editor.document.layers).toEqual([]);
    });
});

describe('dimensions edge cases from review', () => {
    it('refuses a source length in another unit, even zero, without mutation (no implicit conversion)', () => {
        const { host } = setup('0');
        expect(host.adapter.execute('Width', [write('width', '40%')])).toMatchObject({ status: 'rejected', message: expect.stringContaining('« % »') });
        expect(host.editor.document.layers).toEqual([]);
    });
    it('refuses during the drag, not at release, when a stylesheet percentage base cannot be measured', () => {
        const style = document.createElement('style'); style.textContent = '#gradient-peer { width: 50%; }'; document.head.append(style); cleanup.push(() => style.remove());
        const { host, designer, box } = setup(''); box.style.removeProperty('width');
        expect(designer.beginGeometryGesture('dimensions').status).toBe('changed');
        expect(designer.updateGeometryGesture({ x: 20, y: 0 }, { bypassSnap: true })).toMatchObject({ status: 'rejected', message: expect.stringContaining('base') });
        expect(designer.commitGeometryGesture().status).toBe('unchanged'); expect(host.editor.document.layers).toEqual([]);
    });
});

describe('dimensions handle with the shared preview', () => {
    it('previews a resize live, keys width and height once, and removes its temporary class', () => {
        const { host, designer, scene, box } = setup();
        const classes = box.getAttribute('class'); const before = host.editor.document;
        expect(designer.beginGeometryGesture('dimensions')).toEqual({ status: 'changed' });
        expect(designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true }).status).toBe('changed');
        expect(box.style.width).toBe('120px'); expect(box.style.height).toBe('60px'); expect(host.editor.document).toBe(before);
        expect(designer.commitGeometryGesture().status).toBe('changed');
        expect(layer(host)?.propertyTimelines?.width?.keys).toEqual([{ frame: 1, value: { kind: 'number', value: 120 } }]);
        expect(layer(host)?.propertyTimelines?.height?.keys).toEqual([{ frame: 1, value: { kind: 'number', value: 60 } }]);
        expect(scene.querySelectorAll(`[class*="${manipulationClassPrefix}"]`)).toHaveLength(0); expect(box.getAttribute('class')).toBe(classes);
        expect(designer.undo().status).toBe('changed'); expect(host.editor.document).toEqual(before); expect(box.style.width).toBe('100px');
    });
    it('cancels a resize without keys or residual size', () => {
        const { host, designer, box } = setup();
        const style = box.getAttribute('style'); const before = host.editor.document;
        designer.beginGeometryGesture('dimensions'); designer.updateGeometryGesture({ x: 30, y: 0 }, { bypassSnap: true }); designer.cancelGeometryGesture();
        expect(host.editor.document).toBe(before); expect(box.getAttribute('style')).toBe(style);
    });
});
