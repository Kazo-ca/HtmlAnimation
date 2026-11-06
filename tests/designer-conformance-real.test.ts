// Designer-side conformance on the genuine installed Timeline packages (HA11 2b920f1 = v2/base b796743).
// Each test is named after the HA-TL-001 case it exercises through the Designer and the real bridge.
import { afterEach, describe, expect, it } from 'vitest';
import type { IPropertyTimeline, ITimelineDocument, PropertyEasing, TimelinePropertyValue } from '@kazo-ca/timeline-runtime';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); document.body.replaceChildren(); });

const id = 'peerObject';
const number = (value: number): TimelinePropertyValue => ({ kind: 'number', value });
function opacityDocument(timeline?: IPropertyTimeline): ITimelineDocument {
    return { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [{ id, type: 'layer', name: '#gradient-peer', target: { selector: '#gradient-peer' }, spans: [], ...(timeline ? { propertyTimelines: { opacity: timeline } } : {}) }] };
}
function tween(easing?: PropertyEasing): IPropertyTimeline {
    return { initialValue: number(1), keys: [{ frame: 1, value: number(1) }, { frame: 100, value: number(0.2) }], transitions: [{ id: 'fade', fromFrame: 1, toFrame: 100, ...(easing ? { easing } : {}) }] };
}
function setup(data: ITimelineDocument) {
    const scene = createGradientScene(document);
    const editorContainer = document.createElement('div'); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context: { version: 1, bindings: data.layers.length ? { [id]: { opacity: { kind: 'style', cssName: 'opacity' } } } : {} } });
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    cleanup.push(() => { designer.dispose(); host.dispose(); });
    const peer = scene.querySelector<HTMLElement>('#gradient-peer'); if (!peer) throw new Error('Missing peer');
    const track = (property = 'opacity'): IPropertyTimeline | undefined => { const layer = host.editor.document.layers.find(candidate => candidate.id === id); return layer?.type === 'layer' ? layer.propertyTimelines?.[property] : undefined; };
    const sample = (frame: number): number => { const value = host.editor.sample(frame).layer(id)?.propertyValues?.opacity; if (value?.kind !== 'number') throw new Error(`No opacity at ${frame}`); return value.value; };
    const field = (property: string): HTMLInputElement => { const input = propertiesContainer.querySelector<HTMLInputElement>(`input[data-property="${property}"]`); if (!input) throw new Error(`Missing ${property}`); return input; };
    designer.selectTarget('#gradient-peer');
    return { host, designer, scene, peer, track, sample, field };
}

describe('Designer conformance through the genuine bridge', () => {
    it('TL-C02 — a geometry edit at 50 leaves the opacity tween and its values untouched', () => {
        const { host, designer, track, sample } = setup(opacityDocument(tween()));
        const before = track(); const values = [25, 50, 50.5, 75].map(sample);
        host.navigate(50);
        expect(designer.editProperty('rotation', '15deg').status).toBe('changed');
        expect(track()).toEqual(before); expect([25, 50, 50.5, 75].map(sample)).toEqual(values);
    });
    it('TL-C03 — an unchanged value keyed through the Designer captures the evaluated value, without a reset', () => {
        const { host, designer, track, sample } = setup(opacityDocument(tween()));
        host.navigate(40); const evaluated = sample(40); const neighbours = [39, 41].map(sample);
        expect(designer.editProperties([{ property: 'opacity', newValue: String(evaluated), capture: true }]).status).toBe('changed');
        const key = track()?.keys.find(candidate => candidate.frame === 40);
        expect(key?.value.kind === 'number' ? key.value.value : Number.NaN).toBeCloseTo(evaluated, 9);
        expect(sample(40)).toBeCloseTo(evaluated, 9); expect([39, 41].map(sample).map(value => value.toFixed(9))).toEqual(neighbours.map(value => value.toFixed(9)));
    });
    it('TL-C04 — without a tween, a value holds until the next key and after the last one', () => {
        const held: IPropertyTimeline = { initialValue: number(1), keys: [{ frame: 10, value: number(0.3) }, { frame: 60, value: number(0.7) }] };
        const { host, peer, field } = setup(opacityDocument(held));
        for (const [frame, expected] of [[30, '0.3'], [59, '0.3'], [60, '0.7'], [100, '0.7']] as const) {
            host.navigate(frame); expect(peer.style.opacity).toBe(expected); expect(field('opacity').value).toBe(expected);
        }
    });
    it('TL-C05 — a first key at 50 (80 %) keeps the 100 % origin before it and adds no key at 1', () => {
        const { host, designer, peer, track } = setup({ version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [] });
        host.navigate(50);
        expect(designer.editProperty('opacity', '0.8').status).toBe('changed');
        const layer = host.editor.document.layers[0];
        const keys = layer?.type === 'layer' ? layer.propertyTimelines?.opacity?.keys : undefined;
        expect(keys).toEqual([{ frame: 50, value: number(0.8) }]); expect(track()).toBeUndefined();
        for (const [frame, expected] of [[1, '1'], [49, '1'], [50, '0.8'], [100, '0.8']] as const) { host.navigate(frame); expect(peer.style.opacity).toBe(expected); }
    });
    for (const [name, easing] of [
        ['elastic', { kind: 'effect', family: 'elastic', mode: 'out' }],
        ['bounce', { kind: 'effect', family: 'bounce', mode: 'out' }],
        ['overshooting Bézier', { kind: 'bezier', x1: 0.3, y1: -0.6, x2: 0.7, y2: 1.6 }],
    ] as const) it(`TL-C07/TL-C18 — a key inserted through the Designer inside a ${name} tween splits it and preserves the whole motion`, () => {
        const { host, designer, track, sample } = setup(opacityDocument(tween(easing)));
        const frames = [5, 10.5, 25.25, 37.125, 49, 50, 50.5, 62.875, 99];
        const motion = frames.map(sample);
        host.navigate(50);
        expect(designer.editProperties([{ property: 'opacity', newValue: String(sample(50)), capture: true }]).status).toBe('changed');
        expect(track()?.transitions).toHaveLength(2);
        frames.forEach((frame, index) => expect(sample(frame)).toBeCloseTo(motion[index] ?? Number.NaN, 9));
        expect(designer.undo().status).toBe('changed'); expect(track()).toEqual(tween(easing));
    });
    it('TL-C11 — navigation and selection refresh the panel without a key, edit or history entry', () => {
        const { host, designer, track, field } = setup(opacityDocument(tween()));
        const before = track(); const values: string[] = [];
        for (const frame of [1, 50, 100]) { host.navigate(frame); values.push(field('opacity').value); }
        designer.selectTarget('#gradient-box'); designer.selectTarget('#gradient-peer'); host.adapter.selectObject(id); host.adapter.selectObject(null);
        expect(new Set(values).size).toBe(3); expect(track()).toEqual(before);
        expect(host.editor.canUndo).toBe(false); expect(designer.getDocumentChanges()).toEqual([]);
    });
    it('TL-C13 — direct seeking, linear playback and the JSON export give the same state, whatever the selection', () => {
        const { host, designer, peer } = setup(opacityDocument(tween({ kind: 'effect', family: 'cubic', mode: 'in-out' })));
        const exported = host.exportPlayback('json');
        if (exported.status !== 'exported') throw new Error(exported.message);
        const frames = (JSON.parse(exported.text) as { frames: Record<string, Record<string, Record<string, string>>> }).frames;
        const jsonOpacity = (frame: number): string | undefined => Object.values(frames[String(frame)] ?? {}).map(group => group.opacity).find(value => value !== undefined);
        for (const selection of ['#gradient-peer', '#gradient-box'] as const) {
            designer.selectTarget(selection);
            for (const frame of [20, 37, 75]) { host.navigate(frame); expect(peer.style.opacity).toBe(jsonOpacity(frame)); }
        }
        host.navigate(1); host.editor.playback.play(); host.advance((37 - 1) * 1000 / 24); host.editor.playback.pause();
        expect(host.editor.playback.frame).toBe(37); expect(peer.style.opacity).toBe(jsonOpacity(37));
    });
});
