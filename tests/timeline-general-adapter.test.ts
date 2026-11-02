// Genuine installed Timeline packages: recursive inventory, arbitrary targets and gradient identities.
import { afterEach, describe, expect, it } from 'vitest';
import type { IHtmlAnimationContext, ILayer, ITimelineDocument, LayerNode } from '@kazo-ca/timeline-runtime';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createGradientScene, gradientFixtureDefinition } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); document.body.replaceChildren(); });

const settings = { fps: 24, totalFrames: 100 };
function layer(id: string, selector: string): ILayer { return { id, type: 'layer', name: selector, target: { selector }, spans: [] }; }
function gradientContext(...ids: readonly string[]): IHtmlAnimationContext {
    const definition = gradientFixtureDefinition('linear');
    return { version: 1, gradients: Object.fromEntries(ids.map(id => [id, [definition]])), bindings: Object.fromEntries(ids.map(id => [id, { [`${id}Angle`]: { kind: 'gradient', gradientId: definition.id, component: 'angle' } }])) };
}
/** Nested tree: a folder holds the class group and a sub-folder with the gradient subject. */
const nestedDocument: ITimelineDocument = { version: '2.0.0', settings, layers: [
    { id: 'scene', type: 'folder', name: 'Scène', children: [
        layer('subjects', '.gradient-subject'),
        { id: 'inner', type: 'folder', name: 'Intérieur', children: [layer('nestedGradient', '#gradient-box'), layer('object1', '#gradient-peer')] },
    ] },
] };
function setup(data: ITimelineDocument = nestedDocument, context: IHtmlAnimationContext = gradientContext('nestedGradient')) {
    const scene = createGradientScene(document);
    const editorContainer = document.createElement('div');
    const propertiesContainer = document.createElement('div');
    const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context });
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    cleanup.push(() => host.dispose(), () => designer.dispose());
    const element = (selector: string): HTMLElement => { const found = scene.querySelector<HTMLElement>(selector); if (!found) throw new Error(`Missing ${selector}`); return found; };
    return { host, designer, scene, element };
}
function flat(nodes: readonly LayerNode[]): readonly ILayer[] { return nodes.flatMap(node => node.type === 'layer' ? [node] : flat(node.children)); }
function track(host: ReturnType<typeof setup>['host'], id: string, property: string) { return flat(host.editor.document.layers).find(candidate => candidate.id === id)?.propertyTimelines?.[property]; }

describe('general genuine Timeline adapter', () => {
    it('lists every layer of the recursive tree with its selector and selects nested layers', () => {
        const { host } = setup();
        expect(host.adapter.getState().objects).toEqual([{ id: 'subjects', selector: '.gradient-subject' }, { id: 'nestedGradient', selector: '#gradient-box' }, { id: 'object1', selector: '#gradient-peer' }]);
        host.adapter.selectObject('nestedGradient');
        expect(host.adapter.getState().selectedObjectId).toBe('nestedGradient');
        host.adapter.selectObject('scene');
        expect(host.adapter.getState().selectedObjectId).toBe('nestedGradient');
    });
    it('reads and edits a gradient identity owned by a nested layer, with one shared undo', () => {
        const { host } = setup();
        host.navigate(40);
        const snapshot = host.adapter.gradients?.read('nestedGradient');
        if (!snapshot) throw new Error('Missing nested gradient');
        expect(snapshot).toMatchObject({ objectId: 'nestedGradient', selector: '#gradient-box', editable: true });
        expect(host.adapter.gradients?.read('object1')).toBeNull();
        const before = host.editor.document;
        const result = host.adapter.gradients?.execute({ objectId: 'nestedGradient', revision: snapshot.revision, frame: 40, intent: { kind: 'edit', changes: [{ gradientId: 'main', component: 'angle', value: 35 }] } }, () => true);
        expect(result?.status).toBe('changed');
        expect(track(host, 'nestedGradient', 'nestedGradientAngle')?.keys).toEqual([{ frame: 40, value: { kind: 'number', value: 35 } }]);
        expect(host.adapter.gradients?.read('nestedGradient')?.gradients[0]?.angle).toBe(35);
        expect(host.adapter.undo().status).toBe('changed');
        expect(host.editor.document).toEqual(before);
    });
    it('adds a stop to a nested layer and binds it to that layer, never to the stop identity', () => {
        const { host } = setup();
        const snapshot = host.adapter.gradients?.read('nestedGradient');
        if (!snapshot) throw new Error('Missing nested gradient');
        const result = host.adapter.gradients?.execute({ objectId: 'nestedGradient', revision: snapshot.revision, frame: 1, intent: { kind: 'add-stop', gradientId: 'main', color: { kind: 'color', r: 0.2, g: 0.4, b: 0.6, a: 1 }, opacity: 1, position: 40 } }, () => true);
        expect(result?.status).toBe('changed');
        const context = host.stage.animationContext;
        expect(Object.keys(context.gradients ?? {})).toEqual(['nestedGradient']);
        expect(Object.keys(context.bindings ?? {})).toEqual(['nestedGradient']);
        expect(Object.values(context.bindings?.nestedGradient ?? {}).filter(binding => binding.kind === 'gradient' && binding.stopId?.startsWith('point'))).toHaveLength(4);
    });
    it('survives a stored invalid selector and refuses inherited property names', () => {
        const data: ITimelineDocument = { version: '2.0.0', settings, layers: [layer('broken', '#['), layer('object1', '#gradient-peer')] };
        const { host } = setup(data, { version: 1 });
        expect(host.adapter.getState().objects.map(object => object.id)).toEqual(['broken', 'object1']);
        for (const property of ['constructor', 'toString', '__proto__']) expect(host.adapter.execute('Inherited', [{ objectId: 'object1', selector: '#gradient-peer', property, value: '1', frame: 1 }])).toMatchObject({ status: 'rejected', message: expect.stringContaining('correspondance Timeline explicite') });
        expect(host.adapter.execute('Invalid selector', [{ objectId: 'html:#[', selector: '#[', property: 'opacity', value: '1', frame: 1 }])).toMatchObject({ status: 'rejected', message: expect.stringContaining('n’est pas valide') });
    });
    it('keeps two gradient-bearing layers independent', () => {
        const data: ITimelineDocument = { version: '2.0.0', settings, layers: [layer('first', '#gradient-box'), { id: 'group', type: 'folder', name: 'Groupe', children: [layer('second', '#gradient-peer')] }] };
        const { host } = setup(data, gradientContext('first', 'second'));
        const second = host.adapter.gradients?.read('second');
        if (!second) throw new Error('Missing second gradient');
        expect(second.selector).toBe('#gradient-peer');
        expect(host.adapter.gradients?.execute({ objectId: 'second', revision: second.revision, frame: 1, intent: { kind: 'edit', changes: [{ gradientId: 'main', component: 'angle', value: 200 }] } }, () => true).status).toBe('changed');
        expect(host.adapter.gradients?.read('second')?.gradients[0]?.angle).toBe(200);
        expect(host.adapter.gradients?.read('first')?.gradients[0]?.angle).not.toBe(200);
        expect(track(host, 'first', 'firstAngle')).toBeUndefined();
    });
    it('animates an existing nested layer without creating a new object', () => {
        const { host, element } = setup();
        const result = host.adapter.execute('Nested opacity', [{ objectId: 'object1', selector: '#gradient-peer', property: 'opacity', value: '0.3', frame: 1 }]);
        expect(result.status).toBe('changed');
        expect(flat(host.editor.document.layers)).toHaveLength(3);
        expect(track(host, 'object1', 'opacity')?.keys).toEqual([{ frame: 1, value: { kind: 'number', value: 0.3 } }]);
        expect(host.stage.animationContext.bindings?.object1?.opacity).toEqual({ kind: 'style', cssName: 'opacity' });
        expect(element('#gradient-peer').style.opacity).toBe('0.3');
    });
    it('creates a class-group target with a collision-free generated identity', () => {
        const data: ITimelineDocument = { version: '2.0.0', settings, layers: [{ id: 'holder', type: 'folder', name: 'Dossier', children: [layer('object1', '#gradient-box')] }] };
        const { host, scene } = setup(data, { version: 1 });
        const before = host.editor.document;
        expect(host.adapter.execute('Group opacity', [{ objectId: 'html:.gradient-subject', selector: '.gradient-subject', property: 'opacity', value: '0.5', frame: 1 }]).status).toBe('changed');
        const created = host.editor.document.layers.find(node => node.type === 'layer' && node.target && 'selector' in node.target && node.target.selector === '.gradient-subject');
        expect(created?.id).toBe('object2');
        for (const member of scene.querySelectorAll<HTMLElement>('.gradient-subject')) expect(member.style.opacity).toBe('0.5');
        expect(host.adapter.undo().status).toBe('changed');
        expect(host.editor.document).toEqual(before);
        expect(host.adapter.redo().status).toBe('changed');
        expect(host.editor.document.layers.some(node => node.id === 'object2')).toBe(true);
    });
    it('commits writes for several new targets as one undoable transaction', () => {
        const { host } = setup({ version: '2.0.0', settings, layers: [] }, { version: 1 });
        const writes = [
            { objectId: 'html:#gradient-box', selector: '#gradient-box', property: 'opacity', value: '0.2', frame: 1 },
            { objectId: 'html:#gradient-peer', selector: '#gradient-peer', property: 'opacity', value: '0.6', frame: 1 },
        ];
        expect(host.adapter.execute('Two targets', writes).status).toBe('changed');
        expect(host.adapter.getState().objects.map(object => object.selector)).toEqual(['#gradient-box', '#gradient-peer']);
        expect(new Set(host.adapter.getState().objects.map(object => object.id)).size).toBe(2);
        expect(host.adapter.undo().status).toBe('changed');
        expect(host.adapter.getState().objects).toEqual([]);
        expect(host.editor.canUndo).toBe(false);
    });
    it('refuses mismatched objects, absent targets and unmapped properties before any mutation', () => {
        const { host } = setup();
        const before = host.editor.document;
        const cases = [
            { objectId: 'object1', selector: '#gradient-box', property: 'opacity', value: '0.5', frame: 1 },
            { objectId: 'scene', selector: '#gradient-box', property: 'opacity', value: '0.5', frame: 1 },
            { objectId: 'html:#missing', selector: '#missing', property: 'opacity', value: '0.5', frame: 1 },
            { objectId: 'html:#gradient-box', selector: '#gradient-peer', property: 'opacity', value: '0.5', frame: 1 },
            { objectId: 'object1', selector: '#gradient-peer', property: 'opacity', value: '2', frame: 1 },
        ];
        for (const write of cases) expect(host.adapter.execute('Refused', [write]).status).toBe('rejected');
        expect(host.editor.document).toBe(before);
    });
});
