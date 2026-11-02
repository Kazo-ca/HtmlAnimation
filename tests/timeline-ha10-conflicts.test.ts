// Genuine installed HA10 packages: final-candidate conflicts mapped through the Designer adapter.
import { afterEach, describe, expect, it } from 'vitest';
import type { IHtmlAnimationContext, IPropertyTimeline, ITimelineDocument, TimelinePropertyValue } from '@kazo-ca/timeline-runtime';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { guardConflictTargets } from '../packages/designer/src/conflicts.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); document.body.replaceChildren(); });

const settings = { fps: 24, totalFrames: 100 };
const number = (value: number): TimelinePropertyValue => ({ kind: 'number', value });
const track = (frame: number, value: TimelinePropertyValue, initialValue: TimelinePropertyValue = number(1)): IPropertyTimeline => ({ initialValue, keys: [{ frame, value }] });
const opacity = { kind: 'style', cssName: 'opacity' } as const;
/** Two equal-specificity class layers on #gradient-box: .gradient-subject keys at 1, .tone at 50. */
const priorityDocument: ITimelineDocument = { version: '2.0.0', settings, layers: [
    { id: 'subjects', type: 'layer', name: 'Sujets', target: { selector: '.gradient-subject' }, spans: [], propertyTimelines: { opacity: track(1, number(0.5)) } },
    { id: 'tone', type: 'layer', name: 'Ton', target: { selector: '.tone' }, spans: [], propertyTimelines: { opacity: track(50, number(0.8)) } },
] };
const priorityContext: IHtmlAnimationContext = { version: 1, bindings: { subjects: { opacity }, tone: { opacity } } };
function setup(data: ITimelineDocument = priorityDocument, context: IHtmlAnimationContext = priorityContext) {
    const scene = createGradientScene(document);
    scene.querySelector('#gradient-box')?.classList.add('tone');
    const editorContainer = document.createElement('div');
    const propertiesContainer = document.createElement('div');
    const treeContainer = document.createElement('div');
    document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
    const host = createRealGradientHost(editorContainer, scene, 'linear', { document: data, context });
    const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
    cleanup.push(() => host.dispose(), () => designer.dispose());
    const box = scene.querySelector<HTMLElement>('#gradient-box');
    if (!box || !host.adapter.conflicts) throw new Error('Missing conflict fixture');
    return { host, designer, box, conflicts: host.adapter.conflicts };
}
function only<T>(values: readonly T[]): T { expect(values).toHaveLength(1); const [value] = values; if (value === undefined) throw new Error('Missing value'); return value; }

describe('genuine HA10 conflict mapping', () => {
    it('exposes the native blocking diagnostic with explicit winners and an announced starting key', () => {
        const { conflicts } = setup();
        const diagnostic = only(conflicts.read().diagnostics);
        expect(diagnostic).toMatchObject({ code: 'priority-conflict', property: 'opacity', objectIds: ['subjects', 'tone'], targets: ['.gradient-subject', '.tone'], fromFrame: 1, toFrame: 100, blocking: true });
        expect(diagnostic.choices.map(choice => [choice.winnerObjectId, choice.createsKeys])).toEqual([
            ['subjects', []],
            ['tone', []],
            ['tone', [{ objectId: 'tone', selector: '.tone', property: 'opacity', value: '0.8', frame: 1 }]],
        ]);
        expect(new Set(diagnostic.choices.map(choice => choice.id)).size).toBe(3);
        for (const choice of diagnostic.choices) expect(choice.label).toMatch(/Priorité à « \.(gradient-subject|tone) »/);
        expect(conflicts.read().resolutions).toEqual([]);
    });
    it('saves a priority decision in one native transaction and undoes it', () => {
        const { host, box, conflicts } = setup();
        const snapshot = conflicts.read(); const diagnostic = only(snapshot.diagnostics);
        const choice = diagnostic.choices.find(candidate => candidate.winnerObjectId === 'tone' && !candidate.createsKeys.length);
        if (!choice) throw new Error('Missing choice');
        const before = host.editor.document;
        expect(conflicts.resolve({ id: diagnostic.id, signature: diagnostic.signature, choiceId: choice.id, revision: snapshot.revision }, () => true)).toEqual({ status: 'changed' });
        expect(conflicts.read().diagnostics).toEqual([]);
        expect(conflicts.read().resolutions).toEqual([{ conflictId: diagnostic.id, signature: diagnostic.signature, choiceId: choice.id, winnerObjectId: 'tone' }]);
        expect(host.editor.document).toBe(before);
        host.navigate(60); expect(box.style.opacity).toBe('0.8');
        host.navigate(10); expect(box.style.opacity).toBe('1');
        expect(host.adapter.undo().status).toBe('changed');
        expect(conflicts.read().resolutions).toEqual([]); expect(only(conflicts.read().diagnostics).id).toBe(diagnostic.id);
        expect(host.adapter.redo().status).toBe('changed');
        expect(conflicts.read().resolutions).toHaveLength(1);
    });
    it('commits choice A, its announced key and the decision as one undo', () => {
        const { host, box, conflicts } = setup();
        const snapshot = conflicts.read(); const diagnostic = only(snapshot.diagnostics);
        const choice = diagnostic.choices.find(candidate => candidate.createsKeys.length);
        if (!choice) throw new Error('Missing choice A');
        const before = host.editor.document;
        expect(conflicts.resolve({ id: diagnostic.id, signature: diagnostic.signature, choiceId: choice.id, revision: snapshot.revision }, () => true)).toEqual({ status: 'changed' });
        const tone = host.editor.document.layers.find(layer => layer.id === 'tone');
        expect(tone?.type === 'layer' ? tone.propertyTimelines?.opacity?.keys : undefined).toEqual([{ frame: 1, value: number(0.8) }, { frame: 50, value: number(0.8) }]);
        host.navigate(10); expect(box.style.opacity).toBe('0.8');
        expect(host.adapter.undo().status).toBe('changed');
        expect(host.editor.document).toEqual(before); expect(conflicts.read().resolutions).toEqual([]);
    });
    it('refuses stale revisions, signatures, unknown choices and failed guards without losing redo', () => {
        const { host, conflicts } = setup();
        const first = conflicts.read(); const diagnostic = only(first.diagnostics); const [choice] = diagnostic.choices;
        if (!choice) throw new Error('Missing choice');
        expect(conflicts.resolve({ id: diagnostic.id, signature: diagnostic.signature, choiceId: choice.id, revision: first.revision }, () => true).status).toBe('changed');
        expect(host.adapter.undo().status).toBe('changed');
        const snapshot = conflicts.read(); const before = { document: host.editor.document, context: structuredClone(host.stage.animationContext) };
        const refused = [
            [{ id: diagnostic.id, signature: diagnostic.signature, choiceId: choice.id, revision: 'stale' }, () => true],
            [{ id: diagnostic.id, signature: 'altered', choiceId: choice.id, revision: snapshot.revision }, () => true],
            [{ id: diagnostic.id, signature: diagnostic.signature, choiceId: 'invented', revision: snapshot.revision }, () => true],
            [{ id: 'unknown', signature: diagnostic.signature, choiceId: choice.id, revision: snapshot.revision }, () => true],
            [{ id: diagnostic.id, signature: diagnostic.signature, choiceId: choice.id, revision: snapshot.revision }, () => false],
        ] as const;
        for (const [request, isCurrent] of refused) expect(conflicts.resolve(request, isCurrent).status).toBe('rejected');
        expect(host.editor.document).toBe(before.document); expect(host.stage.animationContext).toEqual(before.context); expect(host.editor.canRedo).toBe(true);
    });
    it('keeps the canonical ID-over-class case automatic, with no dialogue or extra key', () => {
        const data: ITimelineDocument = { version: '2.0.0', settings, layers: [
            { id: 'group', type: 'layer', name: 'Groupe', target: { selector: '.gradient-subject' }, spans: [], propertyTimelines: { opacity: track(1, number(0.5)) } },
            { id: 'single', type: 'layer', name: 'Seul', target: { selector: '#gradient-peer' }, spans: [], propertyTimelines: { opacity: track(50, number(0.8)) } },
        ] };
        const { host, conflicts } = setup(data, { version: 1, bindings: { group: { opacity }, single: { opacity } } });
        const before = host.editor.document;
        expect(conflicts.read().diagnostics).toEqual([]);
        expect(host.editor.document).toBe(before);
    });
    it('reports an aliased declaration under its CSS name', () => {
        const border = { kind: 'style', cssName: 'border-block-start-style' } as const;
        const text = (value: string): TimelinePropertyValue => ({ kind: 'text', value });
        const data: ITimelineDocument = { version: '2.0.0', settings, layers: [
            { id: 'subjects', type: 'layer', name: 'Sujets', target: { selector: '.gradient-subject' }, spans: [], propertyTimelines: { borderBlockStartStyle: track(1, text('dashed'), text('solid')) } },
            { id: 'tone', type: 'layer', name: 'Ton', target: { selector: '.tone' }, spans: [], propertyTimelines: { borderBlockStartStyle: track(1, text('dotted'), text('solid')) } },
        ] };
        const { conflicts } = setup(data, { version: 1, bindings: { subjects: { borderBlockStartStyle: border }, tone: { borderBlockStartStyle: border } } });
        const diagnostic = only(conflicts.read().diagnostics);
        expect(diagnostic.property).toBe('border-block-start-style');
        expect(diagnostic.choices.every(choice => !choice.createsKeys.length)).toBe(true);
    });
    it('reports the live revision to observers of a committed decision', () => {
        const { host, conflicts } = setup();
        const snapshot = conflicts.read(); const diagnostic = only(snapshot.diagnostics); const [choice] = diagnostic.choices;
        if (!choice) throw new Error('Missing choice');
        const observed: string[] = [];
        const unsubscribe = host.adapter.onChange(() => { observed.push(conflicts.read().revision); });
        expect(conflicts.resolve({ id: diagnostic.id, signature: diagnostic.signature, choiceId: choice.id, revision: snapshot.revision }, () => true).status).toBe('changed');
        unsubscribe();
        expect(observed.length).toBeGreaterThan(0);
        for (const revision of observed) expect(revision).toBe(conflicts.read().revision);
        expect(conflicts.read().revision).not.toBe(snapshot.revision);
    });
    it('answers false instead of throwing when a guarded target can no longer be resolved', () => {
        const scene = createGradientScene(document);
        let available = true;
        const source = { withSource<T>(read: () => T): T { if (!available) throw new Error('Source unavailable'); return read(); } };
        const guard = guardConflictTargets(scene, { revision: 'r', resolutions: [], diagnostics: [{ id: 'c', signature: 's', code: 'priority-conflict', property: 'opacity', message: '', objectIds: [], targets: ['#gradient-box'], affectedTargets: [], fromFrame: 1, toFrame: 2, toFrameExclusive: false, blocking: true, choices: [] }] }, source);
        expect(guard()).toBe(true);
        available = false;
        expect(guard()).toBe(false);
    });
    it('resolves through the Designer with its own guard and shared undo', () => {
        const { designer, conflicts } = setup();
        const diagnostic = only(conflicts.read().diagnostics);
        const choice = diagnostic.choices.find(candidate => candidate.winnerObjectId === 'subjects');
        if (!choice) throw new Error('Missing choice');
        expect(designer.resolveConflict(diagnostic.id, choice.id)).toEqual({ status: 'changed' });
        expect(designer.getConflictState()?.resolutions).toHaveLength(1);
        expect(designer.undo().status).toBe('changed');
        expect(designer.getConflictState()?.resolutions).toEqual([]);
    });
});
