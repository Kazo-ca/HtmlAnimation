// Genuine installed Timeline packages: typed atomic CSS writes with explicit aliases and source bases.
import { afterEach, describe, expect, it } from 'vitest';
import type { IHtmlAnimationContext, ILayer, ITimelineDocument, LayerNode } from '@kazo-ca/timeline-runtime';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import { namedColorNames } from '../packages/css-properties/src/index.js';
import { readColor } from '../packages/css-properties/src/editors/color.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); document.body.replaceChildren(); });

const settings = { fps: 24, totalFrames: 100 };
const empty: ITimelineDocument = { version: '2.0.0', settings, layers: [] };
function setup(data: ITimelineDocument = empty, context: IHtmlAnimationContext = { version: 1 }, prepare: (scene: HTMLElement) => void = () => {}) {
    const scene = createGradientScene(document);
    prepare(scene);
    const editorContainer = document.createElement('div');
    document.body.append(editorContainer, scene);
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context });
    cleanup.push(() => host.dispose());
    const element = (selector: string): HTMLElement => { const found = scene.querySelector<HTMLElement>(selector); if (!found) throw new Error(`Missing ${selector}`); return found; };
    return { host, scene, element };
}
function flat(nodes: readonly LayerNode[]): readonly ILayer[] { return nodes.flatMap(node => node.type === 'layer' ? [node] : flat(node.children)); }
function layerFor(host: ReturnType<typeof setup>['host'], selector: string): ILayer {
    const found = flat(host.editor.document.layers).find(layer => layer.target && 'selector' in layer.target && layer.target.selector === selector);
    if (!found) throw new Error(`Missing layer for ${selector}`);
    return found;
}
const write = (selector: string, property: string, value: string, objectId = `html:${selector}`, frame = 1) => ({ objectId, selector, property, value, frame });
const borderSource = (value: string) => (scene: HTMLElement) => { for (const member of scene.querySelectorAll<HTMLElement>('.gradient-subject')) member.style.setProperty('border-block-start-style', value); };

describe('atomic CSS through the genuine bridge', () => {
    it('keys a hexadecimal color with its typed source base and renders it', () => {
        const { host, element } = setup(empty, { version: 1 }, scene => { scene.querySelector<HTMLElement>('#gradient-peer')?.style.setProperty('color', 'rgb(0, 0, 255)'); });
        expect(host.adapter.execute('Color', [write('#gradient-peer', 'color', '#ff0000')]).status).toBe('changed');
        const track = layerFor(host, '#gradient-peer').propertyTimelines?.color;
        expect(track?.initialValue).toEqual({ kind: 'color', r: 0, g: 0, b: 1, a: 1 });
        expect(track?.keys).toEqual([{ frame: 1, value: { kind: 'color', r: 1, g: 0, b: 0, a: 1 } }]);
        expect(host.stage.animationContext.bindings?.[layerFor(host, '#gradient-peer').id]?.color).toEqual({ kind: 'style', cssName: 'color' });
        expect(element('#gradient-peer').style.color).toBe('rgb(255, 0, 0)');
    });
    it('accepts rgb() with alpha, short hexadecimal and transparent forms', () => {
        const { host } = setup();
        const cases: readonly [string, unknown][] = [
            ['rgba(51, 102, 153, 0.5)', { kind: 'color', r: 0.2, g: 0.4, b: 0.6, a: 0.5 }],
            ['rgb(100% 0% 0% / 25%)', { kind: 'color', r: 1, g: 0, b: 0, a: 0.25 }],
            ['#0f08', { kind: 'color', r: 0, g: 1, b: 0, a: 0x88 / 255 }],
            ['transparent', { kind: 'color', r: 0, g: 0, b: 0, a: 0 }],
        ];
        for (const [index, [value, expected]] of cases.entries()) {
            expect(host.adapter.execute('Color form', [write('#gradient-box', 'color', value, index ? layerFor(host, '#gradient-box').id : 'html:#gradient-box', index + 1)]).status).toBe('changed');
            expect(layerFor(host, '#gradient-box').propertyTimelines?.color?.keys.at(-1)?.value).toEqual(expected);
        }
    });
    it('creates a logical border-style alias with its explicit binding and source base on a class group', () => {
        const { host, scene } = setup(empty, { version: 1 }, borderSource('solid'));
        const before = host.editor.document; const context = structuredClone(host.stage.animationContext);
        expect(host.adapter.execute('Border', [write('.gradient-subject', 'border-block-start-style', 'dashed')]).status).toBe('changed');
        const layer = layerFor(host, '.gradient-subject');
        expect(host.stage.animationContext.bindings?.[layer.id]).toEqual({ borderBlockStartStyle: { kind: 'style', cssName: 'border-block-start-style' } });
        expect(layer.propertyTimelines?.borderBlockStartStyle).toMatchObject({ initialValue: { kind: 'text', value: 'solid' }, keys: [{ frame: 1, value: { kind: 'text', value: 'dashed' } }] });
        for (const member of scene.querySelectorAll<HTMLElement>('.gradient-subject')) expect(member.style.getPropertyValue('border-block-start-style')).toBe('dashed');
        expect(host.adapter.undo().status).toBe('changed');
        expect(host.editor.document).toEqual(before); expect(host.stage.animationContext).toEqual(context);
        for (const member of scene.querySelectorAll<HTMLElement>('.gradient-subject')) expect(member.style.getPropertyValue('border-block-start-style')).toBe('solid');
    });
    it('reuses an existing alias binding on later keys and keeps its original base', () => {
        const { host } = setup(empty, { version: 1 }, borderSource('solid'));
        expect(host.adapter.execute('First', [write('#gradient-box', 'border-block-start-style', 'dashed')]).status).toBe('changed');
        const id = layerFor(host, '#gradient-box').id; host.navigate(30);
        expect(host.adapter.execute('Second', [write('#gradient-box', 'border-block-start-style', 'double', id, 30)]).status).toBe('changed');
        const track = layerFor(host, '#gradient-box').propertyTimelines?.borderBlockStartStyle;
        expect(track?.initialValue).toEqual({ kind: 'text', value: 'solid' });
        expect(track?.keys.map(key => key.value)).toEqual([{ kind: 'text', value: 'dashed' }, { kind: 'text', value: 'double' }]);
    });
    it('commits opacity, color and logical border style for one target as one undoable command', () => {
        const { host, element } = setup(empty, { version: 1 }, borderSource('solid'));
        const writes = [write('#gradient-peer', 'opacity', '0.5'), write('#gradient-peer', 'color', '#00ff00'), write('#gradient-peer', 'border-block-start-style', 'dotted')];
        expect(host.adapter.execute('Compound', writes).status).toBe('changed');
        expect(Object.keys(layerFor(host, '#gradient-peer').propertyTimelines ?? {}).sort()).toEqual(['borderBlockStartStyle', 'color', 'opacity']);
        expect(element('#gradient-peer').style.getPropertyValue('border-block-start-style')).toBe('dotted');
        expect(host.adapter.undo().status).toBe('changed');
        expect(host.editor.document.layers).toEqual([]); expect(host.editor.canUndo).toBe(false);
    });
    it('refuses invalid values, CSS-wide keywords, divergent group bases and conflicting bindings before mutation', () => {
        const divergent = (scene: HTMLElement) => { borderSource('solid')(scene); scene.querySelector<HTMLElement>('#gradient-peer')?.style.setProperty('border-block-start-style', 'groove'); };
        const { host } = setup(empty, { version: 1 }, divergent);
        const before = host.editor.document;
        const refused: readonly [ReturnType<typeof write>, string][] = [
            [write('#gradient-box', 'color', 'notacolor'), 'couleur'],
            [write('#gradient-box', 'color', 'var(--accent)'), 'couleur'],
            [write('#gradient-box', 'color', 'rgb(300, 0, 0)'), 'couleur'],
            [write('#gradient-box', 'border-block-start-style', 'wavy'), 'style de bordure'],
            [write('#gradient-box', 'border-block-start-style', 'inherit'), 'style de bordure'],
            [write('.gradient-subject', 'border-block-start-style', 'dashed'), 'bases différentes'],
        ];
        for (const [entry, message] of refused) expect(host.adapter.execute('Refused', [entry])).toMatchObject({ status: 'rejected', message: expect.stringContaining(message) });
        expect(host.editor.document).toBe(before);
    });
    it('refuses non-CSS color and opacity syntax that a permissive parser would accept', () => {
        const { host } = setup();
        const before = host.editor.document;
        const refused: readonly [string, string, string][] = [
            ['color', 'rgb(255 0 0 0.5)', 'couleur'],
            ['color', 'rgb(1 2 / 3)', 'couleur'],
            ['color', 'rgb(100%, 0, 0)', 'tous des nombres'],
            ['color', 'rgb(50% 0 0)', 'tous des nombres'],
            ['color', 'rgb(5., 0, 0)', 'couleur'],
            ['color', 'rgba(0, 0, 0, 1.5)', 'hors intervalle'],
            ['color', 'rgb()', 'couleur'],
            ['color', 'reddish', 'couleur'],
            ['opacity', '0x1', 'opacité non valide'],
            ['opacity', '0b1', 'opacité non valide'],
            ['opacity', '1.5', 'hors intervalle'],
        ];
        for (const [property, value, message] of refused) expect(host.adapter.execute('Refused', [write('#gradient-box', property, value)])).toMatchObject({ status: 'rejected', message: expect.stringContaining(message) });
        expect(host.editor.document).toBe(before);
        expect(host.adapter.execute('Percent', [write('#gradient-box', 'opacity', '50%')]).status).toBe('changed');
        expect(layerFor(host, '#gradient-box').propertyTimelines?.opacity?.keys[0]?.value).toEqual({ kind: 'number', value: 0.5 });
    });
    it('accepts the CSS named colors, case-insensitively, as typed opaque colors', () => {
        expect(namedColorNames()).toHaveLength(148);
        const { host } = setup();
        expect(host.adapter.execute('Named', [write('#gradient-box', 'color', 'RebeccaPurple')]).status).toBe('changed');
        expect(layerFor(host, '#gradient-box').propertyTimelines?.color?.keys[0]?.value).toEqual({ kind: 'color', r: 0x66 / 255, g: 0x33 / 255, b: 0x99 / 255, a: 1 });
        expect(readColor('lightgoldenrodyellow')).toEqual({ red: 250, green: 250, blue: 210, alpha: 1 });
        expect(readColor('transparent')).toMatchObject({ alpha: 0 });
        expect(readColor('constructor')).toBeNull();
    });
    it('refuses writes to a layer locked directly or through its folder', () => {
        const locked: ITimelineDocument = { version: '2.0.0', settings, layers: [
            { id: 'direct', type: 'layer', name: 'Direct', target: { selector: '#gradient-box' }, spans: [], locked: true },
            { id: 'folder', type: 'folder', name: 'Verrou', locked: true, children: [{ id: 'nested', type: 'layer', name: 'Nested', target: { selector: '#gradient-peer' }, spans: [] }] },
        ] };
        const { host } = setup(locked);
        for (const [id, selector] of [['direct', '#gradient-box'], ['nested', '#gradient-peer']] as const) expect(host.adapter.execute('Locked', [write(selector, 'color', '#000000', id)])).toMatchObject({ status: 'rejected', message: expect.stringContaining('verrouillé') });
    });
    it('refuses a second alias for a declaration already animated on the object', () => {
        const data: ITimelineDocument = { version: '2.0.0', settings, layers: [{ id: 'box', type: 'layer', name: '#gradient-box', target: { selector: '#gradient-box' }, spans: [] }] };
        const { host } = setup(data, { version: 1, bindings: { box: { legacyBorder: { kind: 'style', cssName: 'border-block-start-style' } } } }, borderSource('solid'));
        expect(host.adapter.execute('Duplicate', [write('#gradient-box', 'border-block-start-style', 'dashed', 'box')])).toMatchObject({ status: 'rejected', message: expect.stringContaining('legacyBorder') });
    });
    it('never replaces a different existing binding for an alias', () => {
        const data: ITimelineDocument = { version: '2.0.0', settings, layers: [{ id: 'box', type: 'layer', name: '#gradient-box', target: { selector: '#gradient-box' }, spans: [] }] };
        const { host } = setup(data, { version: 1, bindings: { box: { borderBlockStartStyle: { kind: 'style', cssName: 'border-inline-start-style' } } } }, borderSource('solid'));
        expect(host.adapter.execute('Conflict', [write('#gradient-box', 'border-block-start-style', 'dashed', 'box')])).toMatchObject({ status: 'rejected', message: expect.stringContaining('déjà liée') });
    });
});
