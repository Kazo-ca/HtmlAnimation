// Genuine HA11 bridge: Designer geometry fields through the shared preview owner.
import { afterEach, describe, expect, it } from 'vitest';
import type { ILayer, ITimelineDocument } from '@kazo-ca/timeline-runtime';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import { spatialFieldValues } from '../integration/spatial-bridge.js';
import { validGeometryValue } from '../packages/designer/src/geometry-dom.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); document.body.replaceChildren(); });

function setup() {
    const scene = createGradientScene(document);
    const editorContainer = document.createElement('div');
    const propertiesContainer = document.createElement('div');
    const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const data: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [] };
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context: { version: 1 } });
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    cleanup.push(() => host.dispose(), () => designer.dispose());
    const peer = scene.querySelector<HTMLElement>('#gradient-peer');
    if (!peer) throw new Error('Missing peer');
    const input = (property: string): HTMLInputElement => {
        const found = propertiesContainer.querySelector<HTMLInputElement>(`input[data-property="${property}"]`);
        if (!found) throw new Error(`Missing ${property} field`);
        return found;
    };
    return { host, designer, peer, input, propertiesContainer };
}
function layer(host: ReturnType<typeof setup>['host']): ILayer | undefined {
    const found = host.editor.document.layers[0];
    return found?.type === 'layer' ? found : undefined;
}

describe('Designer geometry fields with the shared HA11 preview', () => {
    it('declares spatial geometry support on the genuine bridge', () => {
        expect(setup().host.adapter.spatialGeometry).toBe(true);
    });
    it('enables geometry fields and records a field edit as one source-relative key', () => {
        const { host, designer, peer, input } = setup();
        designer.selectTarget('#gradient-peer'); host.navigate(30);
        expect(input('rotation').disabled).toBe(false);
        expect(input('rotation').value).toBe('0deg');
        expect(designer.editProperty('rotation', '15deg')).toEqual({ status: 'changed' });
        expect(layer(host)?.propertyTimelines?.spatialRotation?.keys).toEqual([{ frame: 30, value: { kind: 'number', value: 15 } }]);
        expect(peer.style.transform).toContain('rotate(15deg)');
        expect(input('rotation').value).toBe('15deg');
        expect(host.adapter.getState().values[layer(host)?.id ?? '']).toMatchObject({ rotation: '15deg' });
        expect(designer.undo().status).toBe('changed');
        expect(host.editor.document.layers).toEqual([]); expect(input('rotation').value).toBe('0deg');
    });
    it('records a compound field command for several components with one undo', () => {
        const { host, designer } = setup();
        designer.selectTarget('#gradient-peer');
        expect(designer.editProperties([{ property: 'translateX', newValue: '12px' }, { property: 'scaleY', newValue: '1.5' }]).status).toBe('changed');
        expect(Object.keys(layer(host)?.propertyTimelines ?? {}).sort()).toEqual(['spatialScaleY', 'spatialTranslateX']);
        expect(designer.undo().status).toBe('changed'); expect(host.editor.document.layers).toEqual([]);
    });
    it('reports the bridge refusal of an implicit unit change', () => {
        const { designer } = setup();
        designer.selectTarget('#gradient-peer');
        expect(designer.editProperty('translateX', '12px').status).toBe('changed');
        expect(designer.editProperty('translateX', '2em')).toMatchObject({ status: 'rejected', message: expect.stringContaining('unité') });
    });
    it('formats evaluated field text so the Designer accepts it back', () => {
        const bindings = {
            a: { kind: 'spatial', projectionId: 'p', component: 'translateX', unit: 'px' },
            b: { kind: 'spatial', projectionId: 'p', component: 'rotation', unit: 'turn' },
            c: { kind: 'spatial', projectionId: 'p', component: 'scaleY' },
            d: { kind: 'spatial', projectionId: 'p', component: 'pivotX', unit: '%' },
            e: { kind: 'style', cssName: 'opacity' },
        } as const;
        const number = (value: number) => ({ kind: 'number', value } as const);
        expect(spatialFieldValues(bindings, { a: number(100 / 3), b: number(1e-7), c: number(-0), d: number(12.5), e: number(0.4) })).toEqual({ translateX: '33.333333px', rotation: '0turn', scaleY: '0', pivotX: '12.5%' });
        for (const text of ['33.333333px', '12.5%']) expect(validGeometryValue('translateX', text)).toBe(true);
    });
    it('offers canvas handles with the shared preview', () => {
        const { host, designer, propertiesContainer } = setup();
        designer.selectTarget('#gradient-peer');
        expect(typeof host.adapter.composeGeometry).toBe('function');
        expect(designer.isGeometryGestureActive()).toBe(false);
        expect(propertiesContainer.textContent).not.toContain('Les poignées géométriques ne sont pas encore disponibles avec l’aperçu partagé.');
    });
});
