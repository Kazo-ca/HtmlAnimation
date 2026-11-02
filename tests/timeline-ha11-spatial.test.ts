// Genuine installed HA11 packages: source-relative spatial writes through the bridge.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ILayer, ITimelineDocument, LayerNode } from '@kazo-ca/timeline-runtime';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import { captureSpatialDefinition } from '../integration/spatial-bridge.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

const empty: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [] };
function setup(prepare: (scene: HTMLElement) => void = () => {}) {
    const scene = createGradientScene(document);
    prepare(scene);
    const editorContainer = document.createElement('div');
    document.body.append(editorContainer, scene);
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: empty, context: { version: 1 } });
    cleanup.push(() => host.dispose());
    const box = scene.querySelector<HTMLElement>('#gradient-box');
    if (!box) throw new Error('Missing box');
    return { host, scene, box };
}
function flat(nodes: readonly LayerNode[]): readonly ILayer[] { return nodes.flatMap(node => node.type === 'layer' ? [node] : flat(node.children)); }
function layerFor(host: ReturnType<typeof setup>['host'], selector: string): ILayer {
    const found = flat(host.editor.document.layers).find(layer => layer.target && 'selector' in layer.target && layer.target.selector === selector);
    if (!found) throw new Error(`Missing layer for ${selector}`);
    return found;
}
const write = (property: string, value: string, selector = '#gradient-box', objectId = `html:${selector}`, frame = 1) => ({ objectId, selector, property, value, frame });
const authored = (scene: HTMLElement) => { const box = scene.querySelector<HTMLElement>('#gradient-box'); box?.style.setProperty('transform', 'translateX(100px)'); box?.style.setProperty('transform-origin', '10% 20%'); };

describe('HA11 spatial projection through the genuine bridge', () => {
    it('captures an untransformed source and keys a translation adjustment with one undo', () => {
        const { host, box } = setup();
        const before = host.editor.document;
        expect(host.adapter.execute('Move', [write('translateX', '40px')])).toEqual({ status: 'changed' });
        const layer = layerFor(host, '#gradient-box');
        const context = host.stage.animationContext;
        expect(context.bindings?.[layer.id]).toEqual({ spatialTranslateX: { kind: 'spatial', projectionId: 'geometry', component: 'translateX', unit: 'px' } });
        expect(context.spatial?.[layer.id]).toEqual([expect.objectContaining({ id: 'geometry', version: 1, composition: 'prepend-trs', sourceTransform: 'none' })]);
        expect(layer.propertyTimelines?.spatialTranslateX).toMatchObject({ initialValue: { kind: 'number', value: 0 }, keys: [{ frame: 1, value: { kind: 'number', value: 40 } }] });
        expect(box.style.transform).toContain('40px');
        expect(host.adapter.undo().status).toBe('changed');
        expect(host.editor.document).toEqual(before); expect(host.stage.animationContext).toEqual({ version: 1 });
        expect(box.style.transform).toBe('');
    });
    it('keeps an authored source as the suffix of the composed adjustments', () => {
        const { host, box } = setup(authored);
        expect(host.adapter.execute('Rotate', [write('rotation', '90deg')]).status).toBe('changed');
        const definition = host.stage.animationContext.spatial?.[layerFor(host, '#gradient-box').id]?.[0];
        expect(definition).toMatchObject({ sourceTransform: 'translateX(100px)', provenance: { transform: { kind: 'authored', authoredValue: 'translateX(100px)' } } });
        expect(box.style.transform).toMatch(/rotate\(90deg\).*translateX\(100px\)/);
    });
    it('reads the pivot base from the captured source origin', () => {
        const { host } = setup(authored);
        expect(host.adapter.execute('Pivot', [write('pivotX', '30%')]).status).toBe('changed');
        expect(layerFor(host, '#gradient-box').propertyTimelines?.spatialPivotX?.initialValue).toEqual({ kind: 'number', value: 10 });
    });
    it('commits several components on one projection as one command', () => {
        const { host } = setup();
        expect(host.adapter.execute('Gesture', [write('translateX', '10px'), write('translateY', '20px'), write('rotation', '15deg'), write('scaleX', '1.5')]).status).toBe('changed');
        const id = layerFor(host, '#gradient-box').id;
        expect(host.stage.animationContext.spatial?.[id]).toHaveLength(1);
        expect(Object.keys(layerFor(host, '#gradient-box').propertyTimelines ?? {}).sort()).toEqual(['spatialRotation', 'spatialScaleX', 'spatialTranslateX', 'spatialTranslateY']);
        expect(host.adapter.undo().status).toBe('changed'); expect(host.editor.document.layers).toEqual([]);
    });
    it('reuses the projection on later keys and refuses a silent unit change', () => {
        const { host } = setup();
        expect(host.adapter.execute('First', [write('translateX', '10px')]).status).toBe('changed');
        const id = layerFor(host, '#gradient-box').id; host.navigate(20);
        expect(host.adapter.execute('Second', [write('translateX', '30px', '#gradient-box', id, 20)]).status).toBe('changed');
        expect(host.stage.animationContext.spatial?.[id]).toHaveLength(1);
        expect(host.adapter.execute('Unit', [write('translateX', '2em', '#gradient-box', id, 20)])).toMatchObject({ status: 'rejected', message: expect.stringContaining('unité') });
    });
    it('refuses malformed spatial values before mutation', () => {
        const { host } = setup();
        const before = host.editor.document;
        for (const [property, value] of [['translateX', '10'], ['translateX', 'abc'], ['rotation', '5px'], ['scaleX', '1px'], ['pivotY', '1deg'], ['translateY', '1e999px']] as const) {
            expect(host.adapter.execute('Refused', [write(property, value)]).status).toBe('rejected');
        }
        expect(host.editor.document).toBe(before);
    });
    for (const [origin, expected] of [
        ['top', { x: { css: 'center' }, y: { css: 'top' }, z: { value: 0, unit: 'px' } }],
        ['bottom left', { x: { css: 'left' }, y: { css: 'bottom' }, z: { value: 0, unit: 'px' } }],
        ['left 10px', { x: { css: 'left' }, y: { value: 10, unit: 'px' }, z: { value: 0, unit: 'px' } }],
        ['calc(50% + 10px) 0px 3px', { x: { css: 'calc(50% + 10px)' }, y: { value: 0, unit: 'px' }, z: { value: 3, unit: 'px' } }],
    ] as const) it(`parses the authored origin "${origin}" with CSS keyword semantics`, () => {
        const { host } = setup(scene => { scene.querySelector<HTMLElement>('#gradient-box')?.style.setProperty('transform-origin', origin); });
        expect(host.adapter.execute('Rotate', [write('rotation', '5deg')]).status).toBe('changed');
        expect(host.stage.animationContext.spatial?.[layerFor(host, '#gradient-box').id]?.[0]?.origin).toEqual(expected);
    });
    it('refuses a percentage depth instead of casting it', () => {
        const element = document.createElement('div'); document.body.append(element);
        const read = element.style.getPropertyValue.bind(element.style);
        vi.spyOn(element.style, 'getPropertyValue').mockImplementation(name => name === 'transform-origin' ? '50% 50% 10%' : read(name));
        expect(() => captureSpatialDefinition([element], action => action())).toThrow('pourcentage');
    });
    it('accepts unitless zero in the track unit', () => {
        const { host } = setup();
        expect(host.adapter.execute('Zero', [write('translateX', '0'), write('rotation', '0')]).status).toBe('changed');
        const id = layerFor(host, '#gradient-box').id;
        expect(host.stage.animationContext.bindings?.[id]).toMatchObject({ spatialTranslateX: { unit: 'px' }, spatialRotation: { unit: 'deg' } });
    });
    it('relies on Timeline to refuse a group whose stylesheet source cannot be proven', () => {
        const style = document.createElement('style'); style.textContent = '.gradient-subject{transform:translateX(var(--x))}';
        document.head.append(style); cleanup.push(() => style.remove());
        const { host } = setup();
        expect(host.adapter.execute('Group', [write('rotation', '10deg', '.gradient-subject')])).toMatchObject({ status: 'rejected', message: expect.stringContaining('prouvée identique') });
        expect(host.editor.document.layers).toEqual([]); expect(host.stage.animationContext).toEqual({ version: 1 });
    });
    it('refuses a class group whose members do not share one source', () => {
        const { host } = setup(scene => { scene.querySelector<HTMLElement>('#gradient-box')?.style.setProperty('transform', 'translateX(5px)'); });
        expect(host.adapter.execute('Group', [write('rotation', '10deg', '.gradient-subject')])).toMatchObject({ status: 'rejected', message: expect.stringContaining('source') });
        expect(host.editor.document.layers).toEqual([]);
    });
});
