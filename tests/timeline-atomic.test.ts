// Actual installed HA8 packages through the Designer adapter; no temporal simulation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandRefusedError, createCommand } from '@kazo-ca/timeline-editor';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });
function setup(withoutStyles = false) {
    const scene = createGradientScene(document);
    if (withoutStyles) for (const element of scene.querySelectorAll('[style]')) element.removeAttribute('style');
    const editorContainer = document.createElement('div');
    const propertiesContainer = document.createElement('div');
    const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const host = createRealGradientHost(editorContainer, scene);
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    cleanup.push(() => host.dispose(), () => designer.dispose());
    designer.selectTarget('#gradient-box');
    const peer = scene.querySelector<HTMLElement>('#gradient-peer');
    if (!peer) throw new Error('Missing peer');
    return { host, designer, peer };
}
describe('genuine HA8 atomic Designer bridge', () => {
    it('adds a genuinely new point with four keys and removes its entire context on undo', () => {
        const { host, designer } = setup();
        const before = host.editor.document;
        const context = structuredClone(host.stage.animationContext);
        const ids = designer.getGradientState()?.definitions[0]?.stops.map(stop => stop.id) ?? [];
        const observed = vi.fn(); const source = vi.fn();
        designer.on('gradientchange', observed); designer.on('documentchange', source);
        host.navigate(50);
        expect(designer.addGradientStop('main', { color: { kind: 'color', r: 0.4, g: 0.3, b: 0.8, a: 1 }, opacity: 0.6, position: 30 }).status).toBe('changed');
        const added = designer.getGradientState()?.definitions[0]?.stops.find(stop => !ids.includes(stop.id));
        expect(added).toMatchObject({ present: false, opacity: 0.6, position: 30 });
        const saved = structuredClone(host.stage.animationContext);
        const bindings = Object.entries(saved.bindings?.gradientObject ?? {}).filter(([, binding]) => binding.kind === 'gradient' && binding.stopId === added?.id);
        expect(bindings).toHaveLength(4);
        const layer = host.editor.document.layers[0];
        if (!layer || layer.type !== 'layer') throw new Error('Missing layer');
        expect(Object.keys(layer.propertyTimelines ?? {})).toHaveLength(4);
        for (const [property, binding] of bindings) {
            const track = layer.propertyTimelines?.[property];
            expect(track?.keys).toHaveLength(1); expect(track?.keys[0]?.frame).toBe(50);
            if (binding.kind === 'gradient' && binding.component === 'present') {
                expect(track?.initialValue).toEqual({ kind: 'boolean', value: false });
                expect(track?.keys[0]?.value).toEqual({ kind: 'boolean', value: true });
            }
        }
        host.navigate(20);
        expect(designer.getGradientState()?.gradients[0]?.stops.find(stop => stop.id === added?.id)?.present).toBe(false);
        host.navigate(75);
        expect(designer.getGradientState()?.gradients[0]?.stops.find(stop => stop.id === added?.id)?.present).toBe(true);
        designer.undo();
        expect(host.editor.document).toEqual(before); expect(host.stage.animationContext).toEqual(context);
        designer.redo();
        expect(host.stage.animationContext).toEqual(saved);
        expect(observed).toHaveBeenCalledTimes(3); expect(source).not.toHaveBeenCalled();
    });
    it('creates an opacity object, target, binding, source base and first key atomically', () => {
        const { host, designer, peer } = setup();
        const before = host.editor.document; const context = structuredClone(host.stage.animationContext); const source = peer.getAttribute('style');
        designer.selectTarget('#gradient-peer'); host.navigate(50);
        expect(designer.editProperty('opacity', '0.4').status).toBe('changed');
        const layer = host.editor.document.layers.find(layer => layer.type === 'layer' && layer.target && 'selector' in layer.target && layer.target.selector === '#gradient-peer');
        if (!layer || layer.type !== 'layer') throw new Error('Missing created layer');
        expect(layer.propertyTimelines?.opacity?.initialValue).toEqual({ kind: 'number', value: 1 });
        expect(layer.propertyTimelines?.opacity?.keys).toEqual([{ frame: 50, value: { kind: 'number', value: 0.4 } }]);
        expect(host.stage.animationContext.bindings?.[layer.id]?.opacity).toEqual({ kind: 'style', cssName: 'opacity' });
        expect(peer.style.opacity).toBe('0.4');
        host.navigate(20); expect(peer.style.opacity).toBe('1');
        host.navigate(75); expect(peer.style.opacity).toBe('0.4');
        designer.undo(); expect(host.editor.document).toEqual(before); expect(host.stage.animationContext).toEqual(context);
        expect(peer.getAttribute('style')).toBe(source);
        designer.redo(); expect(host.editor.document.layers.some(candidate => candidate.id === layer.id)).toBe(true);
        expect(peer.style.opacity).toBe('0.4');
    });
    it('records an effect-only original ID/class change and its Full XPath journal in the one history', () => {
        const { host, designer, peer } = setup();
        const before = host.editor.document; const context = structuredClone(host.stage.animationContext); const original = peer.getAttribute('class');
        const events = vi.fn(); designer.on('documentchange', events);
        expect(designer.setAttribute(peer, 'class', 'updated').status).toBe('changed');
        expect(peer.className).toBe('updated'); expect(host.editor.document).toBe(before); expect(host.stage.animationContext).toEqual(context);
        const journal = designer.getDocumentChanges(); expect(journal).toHaveLength(1); expect(journal[0]?.fullXPath).toContain('/');
        expect(events).toHaveBeenCalledOnce();
        designer.undo(); expect(peer.getAttribute('class')).toBe(original); expect(designer.getDocumentChanges()).toEqual([]);
        designer.redo(); expect(peer.className).toBe('updated'); expect(designer.getDocumentChanges()).toEqual(journal);
        expect(events.mock.calls.map(call => call[0].direction)).toEqual(['execute', 'undo', 'redo']);
        expect(designer.setAttribute(peer, 'id', 'renamed-peer').status).toBe('changed');
        designer.undo(); expect(peer.id).toBe('gradient-peer'); designer.redo(); expect(peer.id).toBe('renamed-peer');
    });
    it('compensates partial host writes and preserves the prior redo after a refused first-key transaction', () => {
        const { host, designer, peer } = setup();
        designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]); designer.undo();
        const before = host.editor.document; const context = structuredClone(host.stage.animationContext); const source = peer.className;
        const own = vi.fn(); const unsubscribe = host.adapter.onChange(own); const applied = vi.fn();
        const result = host.adapter.execute('Failing opacity effect', [{ objectId: 'html:#gradient-peer', selector: '#gradient-peer', property: 'opacity', value: '0.4', frame: 1 }], {
            redo: () => {}, undo: () => {},
            prepare: () => ({ changed: true, apply: () => { applied(); peer.className = 'partial'; throw new Error('Host apply interrupted'); }, rollback: () => { peer.className = source; } }),
        });
        expect(result.status).toBe('rejected'); expect(applied).toHaveBeenCalledOnce(); expect(peer.className).toBe(source); expect(host.editor.document).toBe(before); expect(host.stage.animationContext).toEqual(context);
        expect(own).not.toHaveBeenCalled(); expect(host.editor.canRedo).toBe(true);
        unsubscribe(); expect(designer.redo().status).toBe('changed');
    });
    it('rolls back a prepared host effect, new object and complete context when a temporal operation is refused', () => {
        const { host, peer } = setup();
        const before = host.editor.document; const context = structuredClone(host.stage.animationContext); const source = peer.className;
        const applied = vi.fn(); const rolledBack = vi.fn(); const observed = vi.fn();
        const unsubscribe = host.adapter.onChange(observed);
        const result = host.adapter.execute('Invalid first opacity frame', [{ objectId: 'html:#gradient-peer', selector: '#gradient-peer', property: 'opacity', value: '0.4', frame: 101 }], {
            redo: () => {}, undo: () => {},
            prepare: () => ({ changed: true, apply: () => { applied(); peer.className = 'provisional'; }, rollback: () => { rolledBack(); peer.className = source; } }),
        });
        expect(result.status).toBe('rejected'); expect(applied).toHaveBeenCalledOnce(); expect(rolledBack).toHaveBeenCalledOnce();
        expect(peer.className).toBe(source); expect(host.editor.document).toBe(before); expect(host.stage.animationContext).toEqual(context);
        expect(observed).not.toHaveBeenCalled(); expect(host.editor.canUndo).toBe(false); unsubscribe();
    });
    for (const first of ['designer', 'host'] as const) it(`preserves missing original style attributes through inspection and ${first}-first disposal`, () => {
        const { host, designer, peer } = setup(true);
        const subject = host.stage.resolve({ selector: '#gradient-box' });
        if (!(subject instanceof HTMLElement)) throw new Error('Missing subject');
        const angle = Object.entries(host.stage.animationContext.bindings?.gradientObject ?? {}).find(([, binding]) => binding.kind === 'gradient' && binding.component === 'angle')?.[0];
        if (!angle) throw new Error('Missing binding');
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
        const preview = subject.getAttribute('style');
        const inspection = host.stage.inspectProperty({ selector: '#gradient-box' }, angle, { layerId: 'gradientObject', valueKind: 'number' });
        inspection.sample?.('gradientObject', 1);
        expect(subject.getAttribute('style')).toBe(preview);
        designer.selectTarget('#gradient-peer'); expect(designer.editProperty('opacity', '0.4').status).toBe('changed');
        const peerPreview = peer.getAttribute('style');
        expect(host.stage.inspectProperty({ selector: '#gradient-peer' }, 'opacity', { layerId: 'peerObject', valueKind: 'number' }).initialValue).toEqual({ kind: 'number', value: 1 });
        expect(peer.getAttribute('style')).toBe(peerPreview);
        if (first === 'designer') { designer.dispose(); host.dispose(); } else { host.dispose(); designer.dispose(); }
        expect(subject.hasAttribute('style')).toBe(false); expect(peer.hasAttribute('style')).toBe(false);
    });
    it('maps an uncompensated host failure to faulted and blocks subsequent editing and history', () => {
        const { host, peer } = setup();
        const result = host.adapter.execute('Irrecoverable host effect', [], {
            redo: () => {}, undo: () => {},
            prepare: () => ({ changed: true, apply: () => { peer.className = 'partial'; throw new Error('Apply failed'); }, rollback: () => { throw new Error('Rollback failed'); } }),
        });
        expect(result.status).toBe('faulted'); expect(host.editor.transactions.fault).toBeDefined(); expect(host.adapter.getState().fault).toBeTruthy();
        expect(host.adapter.undo().status).toBe('faulted'); expect(host.adapter.redo().status).toBe('faulted'); expect(host.adapter.execute('Retry', []).status).toBe('faulted');
    });
    it('refuses commands after disposal without reading a destroyed public editor', () => {
        const { host } = setup(); host.dispose();
        expect(host.adapter.execute('Closed', []).status).toBe('rejected');
        expect(host.adapter.undo().status).toBe('rejected'); expect(host.adapter.redo().status).toBe('rejected');
        expect(host.adapter.getState()).toMatchObject({ canUndo: false, canRedo: false });
    });
    for (const direction of ['undo', 'redo'] as const) for (const message of ['History failed after mutation', '']) it(`latches an uncertain ${direction} exception with ${message ? 'a diagnostic' : 'an empty diagnostic'}`, () => {
        const { host, designer } = setup();
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
        if (direction === 'redo') expect(designer.undo().status).toBe('changed');
        const before = host.editor.document;
        const original = host.editor[direction].bind(host.editor);
        vi.spyOn(host.editor, direction).mockImplementation(() => { expect(original()).toBe(true); throw new Error(message); });
        const result = host.adapter[direction]();
        expect(host.editor.document).not.toBe(before);
        expect(host.editor.transactions.fault).toBeUndefined();
        expect(result).toMatchObject({ status: 'faulted', message: expect.stringMatching(/\S/) });
        expect(host.adapter.getState()).toMatchObject({ fault: expect.stringMatching(/\S/), canUndo: false, canRedo: false });
        expect(designer.getFault()).toBe(host.adapter.getState().fault);
        expect(host.adapter.gradients?.read('gradientObject')).toMatchObject({ editable: false, canAddStop: false, reason: expect.stringMatching(/\S/) });
        expect(host.adapter.execute('Retry', []).status).toBe('faulted');
        expect(host.adapter.undo().status).toBe('faulted'); expect(host.adapter.redo().status).toBe('faulted');
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 70 }]).status).toBe('faulted');
    });
    it('treats the presence of a retained backend fault as authoritative even with an empty message', () => {
        const { host } = setup();
        expect(host.adapter.execute('Fault', [], { redo: () => {}, undo: () => {}, prepare: () => ({ changed: true, apply: () => { throw new Error('Apply'); }, rollback: () => { throw new Error('Rollback'); } }) }).status).toBe('faulted');
        const fault = host.editor.transactions.fault;
        if (!fault) throw new Error('Missing retained genuine fault');
        // Fault accessor seam only: the temporal engine and its retained fault remain genuine.
        const transactions = host.editor.transactions;
        vi.spyOn(host.editor, 'transactions', 'get').mockReturnValue({ execute: request => transactions.execute(request), fault: { ...fault, message: '' } });
        expect(host.adapter.getState()).toMatchObject({ fault: expect.stringMatching(/\S/), canUndo: false, canRedo: false });
        const snapshot = host.adapter.gradients?.read('gradientObject');
        expect(snapshot).toMatchObject({ editable: false, canAddStop: false, reason: expect.stringMatching(/\S/) });
        expect(host.adapter.execute('Retry', [])).toMatchObject({ status: 'faulted', message: expect.stringMatching(/\S/) });
        expect(host.adapter.undo()).toMatchObject({ status: 'faulted', message: expect.stringMatching(/\S/) });
        expect(host.adapter.redo()).toMatchObject({ status: 'faulted', message: expect.stringMatching(/\S/) });
    });
    for (const direction of ['undo', 'redo'] as const) it(`reports a public backend ${direction} refusal instead of an empty-history no-op`, () => {
        const { host } = setup(); let allowed = true;
        const label = `Refuse ${direction}`; const message = `Permission ${direction} refusée`;
        const command = createCommand(label, document => {
            if (!allowed && direction === 'redo') throw new CommandRefusedError(label, message);
            return { ...document, settings: { ...document.settings, fps: 25 } };
        }, document => {
            if (!allowed && direction === 'undo') throw new CommandRefusedError(label, message);
            return { ...document, settings: { ...document.settings, fps: 24 } };
        });
        expect(host.editor.execute(command)).toBe(true);
        if (direction === 'redo') expect(host.editor.undo()).toBe(true);
        allowed = false; const before = host.editor.document;
        expect(direction === 'undo' ? host.editor.canUndo : host.editor.canRedo).toBe(true);
        expect(host.adapter[direction]()).toEqual({ status: 'rejected', message });
        expect(host.editor.document).toBe(before); expect(host.adapter.getState().fault).toBeUndefined();
    });
    it('refreshes a context-only HA2 preview and cancel without reporting a committed success', () => {
        const { host, designer } = setup();
        const before = structuredClone(host.stage.animationContext);
        const candidate = { ...before, gradients: { ...before.gradients, gradientObject: (before.gradients?.gradientObject ?? []).map(gradient => ({ ...gradient, angle: 35 })) } };
        const reasons: string[] = []; const success = vi.fn(); const property = vi.fn();
        const unsubscribe = host.adapter.onChange(reason => { reasons.push(reason); });
        designer.on('gradientchange', success); designer.on('propertychange', property);
        const group = host.editor.propertyTimelines.beginTransaction('Context preview');
        expect(host.editor.transactions.execute({ label: 'Context only', htmlContext: { stageId: host.stage.id, context: candidate } }).status).toBe('changed');
        expect(designer.getGradientState()?.gradients[0]?.angle).toBe(35);
        expect(host.adapter.getState().values.gradientObject?.['background-image']).toContain('35deg');
        expect(host.stage.resolve({ selector: '#gradient-box' })?.getAttribute('style')).toContain('35deg');
        expect(reasons).toEqual(['preview']); expect(success).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled();
        group.cancel();
        expect(host.stage.animationContext).toEqual(before); expect(designer.getGradientState()?.gradients[0]?.angle).toBe(90);
        expect(host.stage.resolve({ selector: '#gradient-box' })?.getAttribute('style')).toContain('90deg');
        expect(reasons).toEqual(['preview', 'cancel']); expect(success).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled();
        unsubscribe();
    });
    it('refreshes an effect-only HA2 preview and cancel without a success notification', () => {
        const { host, peer } = setup(); const original = peer.className;
        const states: string[] = []; const unsubscribe = host.adapter.onChange(reason => { states.push(`${reason}:${peer.className}`); });
        const group = host.editor.propertyTimelines.beginTransaction('Effect preview');
        expect(host.editor.transactions.execute({ label: 'Effect only', effect: { prepare: () => ({ changed: true, apply: () => { peer.className = 'provisional'; }, rollback: () => { peer.className = original; } }) } }).status).toBe('changed');
        expect(states).toEqual(['preview:provisional']);
        group.cancel(); expect(peer.className).toBe(original); expect(states).toEqual(['preview:provisional', `cancel:${original}`]); unsubscribe();
    });
    it('refuses an isolated Designer command before host effects while preserving an already open HA2 group', () => {
        const { host, designer, peer } = setup(); const source = peer.className;
        const group = host.editor.propertyTimelines.beginTransaction('External group');
        const before = host.editor.document;
        expect(designer.setAttribute(peer, 'class', 'isolated')).toMatchObject({ status: 'rejected', message: expect.stringMatching(/groupe/i) });
        expect(peer.className).toBe(source); expect(designer.getDocumentChanges()).toEqual([]); expect(host.editor.document).toBe(before); expect(group.active).toBe(true);
        group.cancel(); expect(host.editor.canUndo).toBe(false);
    });
    it('publishes a coherent terminal transaction and refuses backend and adapter mutations inside it', () => {
        const { host, designer } = setup(); const nested: unknown[] = []; const counts: number[] = [];
        const unsubscribe = host.adapter.onChange(reason => {
            if (reason !== 'execute') return;
            counts.push(designer.getGradientState()?.tracks.length ?? -1);
            nested.push(host.editor.transactions.execute({ label: 'Nested', properties: [] }), host.adapter.undo(), host.adapter.redo());
        });
        expect(designer.addGradientStop('main', { color: { kind: 'color', r: 0.4, g: 0.3, b: 0.8, a: 1 }, opacity: 0.6, position: 30 }).status).toBe('changed');
        expect(counts).toEqual([4]); expect(nested[0]).toMatchObject({ status: 'refused' }); expect(nested.slice(1)).toEqual([expect.objectContaining({ status: 'rejected' }), expect.objectContaining({ status: 'rejected' })]);
        unsubscribe(); expect(designer.undo().status).toBe('changed');
    });
    it('exposes the committed Designer preview, context and history to every backend observer', () => {
        const { host, designer } = setup();
        const element = host.stage.resolve({ selector: '#gradient-box' });
        if (!(element instanceof HTMLElement)) throw new Error('Missing gradient element');
        let phase = '';
        const observations: { phase: string; event: string; image: string; canUndo: boolean; tracks: number; bindings: number }[] = [];
        for (const event of ['document:changed', 'property:changed', 'transaction:changed'] as const) host.editor.on(event, () => {
            const layer = host.editor.document.layers[0];
            observations.push({ phase, event, image: element.style.backgroundImage, canUndo: host.editor.canUndo, tracks: layer?.type === 'layer' ? Object.keys(layer.propertyTimelines ?? {}).length : -1, bindings: Object.values(host.stage.animationContext.bindings?.gradientObject ?? {}).filter(binding => binding.kind === 'gradient').length });
        });
        phase = 'Designer execute';
        expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
        phase = 'Designer undo'; expect(designer.undo().status).toBe('changed');
        phase = 'Designer redo'; expect(designer.redo().status).toBe('changed');
        const angle = Object.entries(host.stage.animationContext.bindings?.gradientObject ?? {}).find(([, binding]) => binding.kind === 'gradient' && binding.component === 'angle')?.[0];
        if (!angle) throw new Error('Missing genuine angle binding');
        phase = 'Timeline execute'; expect(host.editor.propertyTimelines.set('gradientObject', angle, { kind: 'number', value: 55 }, { frame: 1, initialValue: { kind: 'number', value: 90 } }).status).toBe('changed');
        phase = 'Timeline undo'; expect(host.editor.undo()).toBe(true);
        phase = 'Timeline redo'; expect(host.editor.redo()).toBe(true);
        expect(observations.map(observation => observation.event)).toEqual(expect.arrayContaining(['document:changed', 'property:changed', 'transaction:changed']));
        for (const [name, angle, tracks, canUndo] of [['Designer execute', 35, 1, true], ['Designer undo', 90, 0, false], ['Designer redo', 35, 1, true], ['Timeline execute', 55, 1, true], ['Timeline undo', 35, 1, true], ['Timeline redo', 55, 1, true]] as const) {
            const observed = observations.filter(observation => observation.phase === name); expect(observed.length, name).toBeGreaterThan(0);
            for (const observation of observed) expect(observation, `${name}: ${observation.event}`).toMatchObject({ image: expect.stringContaining(`${angle}deg`), canUndo, tracks, bindings: 22 });
        }
    });
});
