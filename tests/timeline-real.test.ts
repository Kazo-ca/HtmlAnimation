// tests/timeline-real.test.ts
// Genuine installed Timeline packages, not the recorded simulation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import type { RealGradientHost } from '../integration/timeline-real.js';
import type { GradientType } from '../packages/css-properties/src/gradient-types.js';
import artifactManifest from '../vendor/timeline/manifest.json';
const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse())
    dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });
function setup(type: GradientType = 'linear'): {
    host: RealGradientHost;
    designer: HtmlDesigner;
    scene: HTMLElement;
    element: HTMLElement;
    source: string | null;
} {
    const scene = createGradientScene(document, type);
    const editorContainer = document.createElement('div');
    const propertiesContainer = document.createElement('div');
    const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const element = scene.querySelector<HTMLElement>('#gradient-box');
    if (!element)
        throw new Error('Missing target');
    const source = element.getAttribute('style');
    const host = createRealGradientHost(editorContainer, scene, type);
    cleanup.push(() => host.dispose());
    expect(element.getAttribute('style')).toBe(source);
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    cleanup.push(() => designer.dispose());
    designer.selectTarget('#gradient-box');
    return { host, designer, scene, element, source };
}
function tracks(host: RealGradientHost) { const layer = host.editor.document.layers[0]; if (!layer || layer.type !== 'layer')
    throw new Error('Missing real layer'); return layer.propertyTimelines ?? {}; }
function current(designer: HtmlDesigner) { const value = designer.getGradientState()?.gradients[0]; if (!value)
    throw new Error('Missing gradient'); return value; }
describe('Designer with genuine installed Timeline packages', () => {
    it('writes a single component at50 and uses the real runtime before and after its key', () => {
        const { host, designer } = setup();
        const source = vi.fn();
        const property = vi.fn();
        designer.on('documentchange', source);
        designer.on('propertychange', property);
        host.navigate(50);
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
        expect(Object.values(tracks(host))).toHaveLength(1);
        expect(Object.values(tracks(host))[0]?.keys).toEqual([{ frame: 50, value: { kind: 'number', value: 35 } }]);
        host.navigate(20);
        expect(current(designer).angle).toBe(90);
        host.navigate(75);
        expect(current(designer).angle).toBe(35);
        expect(property).toHaveBeenCalledOnce();
        expect(source).not.toHaveBeenCalled();
        designer.undo();
        expect(Object.keys(tracks(host))).toEqual([]);
        designer.redo();
        expect(current(designer).angle).toBe(35);
    });
    it('groups two center components into one real undo and coalesces adapter observations', () => {
        const { host, designer } = setup('radial');
        host.navigate(50);
        const own = vi.fn();
        const backend = vi.fn();
        const unsubscribe = host.adapter.onChange(own);
        host.editor.on('property:changed', backend);
        expect(designer.editGradient([{ gradientId: 'main', component: 'centerX', value: 35 }, { gradientId: 'main', component: 'centerY', value: 65 }]).status).toBe('changed');
        expect(Object.keys(tracks(host))).toHaveLength(2);
        expect(own.mock.calls.filter(call => call[0] === 'execute')).toHaveLength(1);
        expect(backend).toHaveBeenCalledTimes(2);
        designer.undo();
        expect(Object.keys(tracks(host))).toHaveLength(0);
        designer.redo();
        expect(current(designer).centerX).toBe(35);
        expect(current(designer).centerY).toBe(65);
        unsubscribe();
    });
    it('changes presence of a PRE-REGISTERED point without claiming structural addition', () => {
        const { host, designer } = setup();
        const originalIds = current(designer).stops.map(stop => stop.id);
        expect(current(designer).stops.find(stop => stop.id === 'reserved')?.present).toBe(false);
        host.navigate(50);
        expect(designer.editGradient([{ gradientId: 'main', stopId: 'reserved', component: 'present', value: true }]).status).toBe('changed');
        const track = Object.values(tracks(host))[0];
        expect(track?.initialValue).toEqual({ kind: 'boolean', value: false });
        expect(track?.keys).toEqual([{ frame: 50, value: { kind: 'boolean', value: true } }]);
        host.navigate(20);
        expect(current(designer).stops.find(stop => stop.id === 'reserved')?.present).toBe(false);
        host.navigate(75);
        expect(current(designer).stops.find(stop => stop.id === 'reserved')?.present).toBe(true);
        designer.undo();
        expect(current(designer).stops.map(stop => stop.id)).toEqual(originalIds);
        expect(current(designer).stops.find(stop => stop.id === 'reserved')?.present).toBe(false);
        const before = host.editor.document;
        expect(designer.addGradientStop('main', { color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 1, position: 30 }).status).toBe('rejected');
        expect(host.editor.document).toBe(before);
    });
    it('cancels draft composition without keys and keeps color alpha independent', () => {
        const { host, designer, element } = setup();
        const original = element.style.backgroundImage;
        const source = current(designer).stops.find(stop => stop.id === 'middle')?.color;
        designer.beginGradientGesture();
        designer.previewGradient([{ gradientId: 'main', component: 'angle', value: 30 }]);
        expect(Object.keys(tracks(host))).toHaveLength(0);
        expect(element.style.backgroundImage).not.toBe(original);
        designer.cancelGradientGesture();
        expect(element.style.backgroundImage).toBe(original);
        expect(designer.editGradient([{ gradientId: 'main', stopId: 'middle', component: 'opacity', value: 0.4 }]).status).toBe('changed');
        expect(current(designer).stops.find(stop => stop.id === 'middle')?.color).toEqual(source);
        designer.undo();
        expect(Object.keys(tracks(host))).toHaveLength(0);
    });
    it('rolls back a real multi-write transaction when a backend observer changes its frame', () => {
        const { host, designer } = setup('radial');
        host.navigate(50);
        const before = host.editor.document;
        const accepted = vi.fn();
        designer.on('propertychange', accepted);
        const unsubscribe = host.editor.on('property:changed', event => { if (event.cause === 'execute')
            host.navigate(20); });
        expect(designer.editGradient([{ gradientId: 'main', component: 'centerX', value: 35 }, { gradientId: 'main', component: 'centerY', value: 65 }]).status).toBe('rejected');
        expect(host.editor.document).toBe(before);
        expect(accepted).not.toHaveBeenCalled();
        expect(host.editor.canUndo).toBe(false);
        unsubscribe();
    });
    it('cancels the entire keys-only group when a backend property observer adds an unexpected track', () => {
        const { host, designer } = setup('radial');
        const angle = Object.entries(host.stage.animationContext.bindings?.gradientObject ?? {}).find(([, binding]) => binding.kind === 'gradient' && binding.component === 'angle')?.[0];
        if (!angle)
            throw new Error('Missing angle binding');
        const before = host.editor.document;
        const accepted = vi.fn();
        const originalChange = vi.fn();
        const own = vi.fn();
        designer.on('propertychange', accepted);
        designer.on('documentchange', originalChange);
        const stopObserving = host.adapter.onChange(own);
        let nested: unknown;
        let first = true;
        const unsubscribe = host.editor.on('property:changed', event => {
            if (event.cause !== 'execute' || !first)
                return;
            first = false;
            nested = host.editor.propertyTimelines.set('gradientObject', angle, { kind: 'number', value: 77 }, { frame: 1, initialValue: { kind: 'number', value: 90 } });
        });
        const result = designer.editGradient([{ gradientId: 'main', component: 'centerX', value: 35 }, { gradientId: 'main', component: 'centerY', value: 65 }]);
        // HA7 permits this backend callback; the bridge must detect and cancel its group.
        expect(nested).toMatchObject({ status: 'changed' });
        expect(result).toMatchObject({ status: 'rejected', message: expect.stringContaining('écriture externe') });
        expect(host.editor.document).toBe(before);
        expect(Object.keys(tracks(host))).toHaveLength(0);
        expect(host.editor.canUndo).toBe(false);
        expect(host.editor.canRedo).toBe(false);
        expect(current(designer).angle).toBe(90);
        expect(current(designer).centerX).toBe(50);
        expect(current(designer).centerY).toBe(50);
        expect(accepted).not.toHaveBeenCalled();
        expect(originalChange).not.toHaveBeenCalled();
        expect(own.mock.calls.filter(call => call[0] === 'execute')).toHaveLength(0);
        unsubscribe();
        stopObserving();
        expect(designer.editGradient([{ gradientId: 'main', component: 'centerX', value: 35 }, { gradientId: 'main', component: 'centerY', value: 65 }]).status).toBe('changed');
        designer.undo();
        expect(host.editor.document).toEqual(before);
    });
    it('uses the actual Timeline selection service and refuses unproved host/spatial effects', () => {
        const { host, designer, element } = setup();
        const selection = host.editor.getService('layers.selection');
        expect(selection).toBeDefined();
        host.adapter.selectObject(null);
        expect(selection?.selected()).toEqual([]);
        host.adapter.selectObject('gradientObject');
        expect(selection?.selected()).toEqual(['gradientObject']);
        const before = host.editor.document;
        expect(designer.setAttribute(element, 'class', 'changed').status).toBe('rejected');
        expect(designer.editProperty('rotation', '45deg').status).toBe('rejected');
        expect(host.editor.document).toBe(before);
    });
    it('refuses nested mutation requests synchronously while notifying, then accepts a later retry', () => {
        const { host, designer } = setup();
        const nested: unknown[] = [];
        const unsubscribe = host.adapter.onChange(reason => {
            if (reason !== 'execute')
                return;
            nested.push(host.adapter.undo(), host.adapter.redo(), host.adapter.execute('Nested', []));
            const snapshot = host.adapter.gradients?.read('gradientObject');
            if (!snapshot)
                throw new Error('Missing snapshot');
            nested.push(host.adapter.gradients?.execute({ objectId: snapshot.objectId, revision: snapshot.revision, frame: host.editor.playback.frame, intent: { kind: 'edit', changes: [{ gradientId: 'main', component: 'angle', value: 70 }] } }, () => true));
        });
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
        expect(nested).toHaveLength(4);
        for (const result of nested)
            expect(result).toMatchObject({ status: 'rejected' });
        expect(current(designer).angle).toBe(35);
        unsubscribe();
        expect(host.adapter.undo().status).toBe('changed');
        expect(Object.keys(tracks(host))).toHaveLength(0);
    });
    it('returns a committed receipt even when a read-only observer seeks to another frame', () => {
        const { host, designer } = setup();
        host.navigate(50);
        const property = vi.fn();
        designer.on('propertychange', property);
        const unsubscribe = host.adapter.onChange(reason => { if (reason === 'execute')
            host.navigate(20); });
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
        expect(host.editor.playback.frame).toBe(20);
        expect(current(designer).angle).toBe(90);
        expect(property).toHaveBeenCalledWith(expect.objectContaining({ newValue: '35', frame: 50 }));
        unsubscribe();
    });
    it('checks crossed-point rendering against the genuine archive capability without replacing its renderer', () => {
        const { host, designer, element } = setup();
        const before = host.editor.document;
        const ids = current(designer).stops.map(stop => stop.id);
        const result = designer.editGradient([{ gradientId: 'main', stopId: 'first', component: 'position', value: 75 }]);
        if (artifactManifest.capabilities.crossedStopPositionOrder) {
            expect(result.status).toBe('changed');
            expect([...element.style.backgroundImage.matchAll(/(-?\d+(?:\.\d+)?)%/g)].map(match => Number(match[1]))).toEqual([50, 75, 100]);
            expect(current(designer).stops.map(stop => stop.id)).toEqual(ids);
        }
        else {
            expect(result).toMatchObject({ status: 'rejected', message: expect.stringContaining('tri des points croisés') });
            expect(host.editor.document).toBe(before);
        }
    });
    it('does not let an observer exception turn a committed real command into a refusal', () => {
        const { host, designer } = setup();
        const unsubscribe = host.adapter.onChange(() => { throw new Error('Faulty consumer'); });
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
        unsubscribe();
        designer.undo();
        expect(Object.keys(tracks(host))).toHaveLength(0);
    });
    it('observes public Timeline edits and history without capturing their preview as a source base', () => {
        const { host, designer, element, source } = setup();
        const angle = Object.entries(host.stage.animationContext.bindings?.gradientObject ?? {}).find(([, binding]) => binding.kind === 'gradient' && binding.component === 'angle')?.[0];
        if (!angle)
            throw new Error('Missing angle binding');
        expect(host.editor.propertyTimelines.set('gradientObject', angle, { kind: 'number', value: 35 }, { frame: 1, initialValue: { kind: 'number', value: 90 } }).status).toBe('changed');
        expect(current(designer).angle).toBe(35);
        expect(host.editor.undo()).toBe(true);
        expect(current(designer).angle).toBe(90);
        expect(host.editor.redo()).toBe(true);
        expect(current(designer).angle).toBe(35);
        designer.dispose();
        host.dispose();
        expect(element.getAttribute('style')).toBe(source);
    });
    for (const first of ['host', 'designer'] as const)
        it(`restores the original source when ${first} is disposed first`, () => {
            const { host, designer, element, source } = setup();
            expect('setAnimationContext' in host.stage).toBe(false);
            expect('withSourceStyles' in host.stage).toBe(false);
            designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
            if (first === 'host') {
                host.dispose();
                designer.dispose();
            }
            else {
                designer.dispose();
                host.dispose();
            }
            expect(element.getAttribute('style')).toBe(source);
        });
    for (const first of ['host', 'designer'] as const)
        it(`preserves preview and source after direct public stage metadata reads with ${first} disposed first`, () => {
            const { host, designer, element, source } = setup();
            const angle = Object.entries(host.stage.animationContext.bindings?.gradientObject ?? {}).find(([, binding]) => binding.kind === 'gradient' && binding.component === 'angle')?.[0];
            if (!angle)
                throw new Error('Missing angle binding');
            expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
            const preview = element.getAttribute('style');
            const inspection = host.stage.inspectProperty({ selector: '#gradient-box' }, angle, { layerId: 'gradientObject', valueKind: 'number' });
            expect(inspection.initialValue).toEqual({ kind: 'number', value: 90 });
            expect.soft(element.getAttribute('style')).toBe(preview);
            inspection.sample?.('gradientObject', 1);
            inspection.validate?.('gradientObject', tracks(host)[angle]);
            host.stage.targets.list();
            const info = host.stage.targets.describe?.({ selector: '#gradient-box' });
            for (const property of info?.properties ?? []) {
                if (typeof property === 'string')
                    continue;
                property.sample?.('gradientObject', 1);
                property.validate?.('gradientObject', tracks(host)[property.name]);
            }
            expect(host.stage.resolve({ selector: '#gradient-box' })).toBe(element);
            expect(host.stage.resolveElements({ selector: '#gradient-box' })).toContain(element);
            expect.soft(element.getAttribute('style')).toBe(preview);
            if (first === 'host') {
                host.dispose();
                designer.dispose();
            }
            else {
                designer.dispose();
                host.dispose();
            }
            expect(element.getAttribute('style')).toBe(source);
        });
    for (const first of ['host', 'designer'] as const)
        it(`preserves unrelated live inline writes when ${first} is disposed first`, () => {
            const { host, designer, element } = setup();
            const original = element.style.backgroundImage;
            const describe = host.stage.targets.describe?.bind(host.stage.targets);
            if (!describe)
                throw new Error('Missing metadata');
            vi.spyOn(host.stage.targets, 'describe').mockImplementation(target => { const info = describe(target); element.style.color = 'purple'; return info; });
            expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
            expect(element.style.color).toBe('purple');
            if (first === 'host') {
                host.dispose();
                designer.dispose();
            }
            else {
                designer.dispose();
                host.dispose();
            }
            expect(element.style.color).toBe('purple');
            expect(element.style.backgroundImage).toBe(original);
        });
});
