// integration/timeline-real.ts
import { CommandRefusedError, createCommand, createEditor } from '@kazo-ca/timeline-editor';
import type { EditorPlugin, EditorTransactionResult, IEditor, IEditorTransactionRequest, IHostRenderCandidate, ICommand, PropertyTimelineOperation } from '@kazo-ca/timeline-editor';
import { composeHtmlDeclarations, createHtmlInspectionStage, createManualClock, createPropertyRegistry, prepareHtmlResolution } from '@kazo-ca/timeline-runtime';
import type { HtmlPropertyBinding, IHtmlAnimationContext, IHtmlGradientDefinition, IHtmlResolvedBinding, IHtmlResolvedLayer, IHtmlResolvedProperty, IHtmlStage, ILayer, ITimelineDocument, LayerNode, PropertyRegistry, TimelinePropertyValue, TimelinePropertyValues } from '@kazo-ca/timeline-runtime';
import { applyGradientEdits, cloneGradientDefinitions, readGradientComponent } from '@kazo-ca/css-properties';
import type { GradientComponent, GradientDefinition, GradientEdit, GradientType, GradientValue } from '@kazo-ca/css-properties';
import { gradientFixtureDefinition } from '../fixtures/gradient-scene.js';
import type { GradientMutationResult, GradientRequest, GradientSnapshot, GradientTrack } from '../packages/designer/src/gradient-types.js';
import type { MutationResult, PropertyWrite, TimelineAdapter, TimelineReason, TimelineState } from '../packages/designer/src/timeline-adapter.js';
import { DomPreviewOwner } from '../packages/designer/src/dom-preview.js';
import type { ElementProjection } from '../packages/designer/src/dom-preview.js';
import artifactManifest from '../vendor/timeline/manifest.json';

export interface ProjectRenderPolicy {
    readonly active: (() => void) | null;
    /** Rechecked through the prepared renderer, then consumed by its successful apply. */
    readonly transition?: () => void;
}
export interface RealGradientHost {
    readonly editor: IEditor;
    readonly adapter: TimelineAdapter;
    readonly stage: RealGradientStageMetadata;
    readonly previewOwner: DomPreviewOwner;
    /** Trusted prepared host effects only: switch ownership after installing source DOM. */
    installPreviewOwner(owner: DomPreviewOwner): void;
    readonly projectRenderPolicy: ProjectRenderPolicy;
    /** Trusted host participant; compensation restores the preceding guard pointer. */
    installProjectRenderPolicy(policy: ProjectRenderPolicy): void;
    executeTransaction(request: IEditorTransactionRequest): MutationResult;
    navigate(frame: number): void;
    advance(milliseconds: number): void;
    canCaptureProject(): boolean;
    dispose(): void;
}
/** Context changes participate in transactions; callers only receive metadata access. */
export interface RealGradientStageMetadata extends Pick<IHtmlStage, 'id' | 'mode' | 'effectiveMode' | 'properties' | 'animationContext' | 'diagnostics' | 'inspectProperty' | 'accepts' | 'resolve' | 'resolveElements'> {
    readonly targets: Pick<IHtmlStage['targets'], 'list' | 'describe'>;
}
export const REAL_TIMELINE_REFERENCE = artifactManifest.reference;
/** Private genuine-package fixtures; models and context remain validated by Timeline. */
export interface RealGradientHostOptions {
    readonly document?: ITimelineDocument;
    readonly context?: IHtmlAnimationContext;
}
const layerId = 'gradientObject';
const selector = '#gradient-box';
const peerSelector = '#gradient-peer';
const peerId = 'peerObject';
const geometry: readonly GradientComponent[] = ['type', 'angle', 'centerX', 'centerY', 'radiusX', 'radiusY'];
const stopComponents = ['color', 'opacity', 'position', 'present'] as const satisfies readonly GradientComponent[];
const uncertainState = 'L’état du projet est incertain. Restaurez l’état hôte et recréez une instance cohérente avant de reprendre.';

function diagnostic(message: string | undefined, fallback = uncertainState): string {
    return message?.trim() ? message : fallback;
}

function kind(component: GradientComponent): TimelinePropertyValue['kind'] {
    return component === 'type' ? 'text' : component === 'color' ? 'color' : component === 'present' ? 'boolean' : 'number';
}
function typed(value: GradientValue): TimelinePropertyValue {
    if (typeof value === 'number') return { kind: 'number', value };
    if (typeof value === 'string') return { kind: 'text', value };
    if (typeof value === 'boolean') return { kind: 'boolean', value };
    return { ...value };
}
function untyped(value: TimelinePropertyValue): GradientValue {
    if (value.kind === 'color') {
        if (value.a !== 1) throw new Error('La couleur du point doit être opaque ; utilisez sa piste d’opacité.');
        return { ...value, a: 1 };
    }
    if (value.kind === 'text') {
        if (value.value !== 'linear' && value.value !== 'radial' && value.value !== 'conic') throw new Error('Type de dégradé non pris en charge.');
        return value.value;
    }
    return value.value;
}
function immutableChange(change: GradientEdit): GradientEdit {
    return Object.freeze({ ...change, value: typeof change.value === 'object' ? Object.freeze({ ...change.value }) : change.value });
}
function descriptors(context: IHtmlAnimationContext): readonly GradientTrack[] {
    return Object.entries(context.bindings?.[layerId] ?? {}).flatMap(([property, binding]) => binding.kind === 'gradient' ? [{ property, gradientId: binding.gradientId, ...(binding.stopId ? { stopId: binding.stopId } : {}), component: binding.component, editable: true, interpolable: binding.component !== 'type' && binding.component !== 'present' }] : []);
}
function binding(change: Omit<GradientEdit, 'value'>): HtmlPropertyBinding {
    return { kind: 'gradient', gradientId: change.gradientId, component: change.component, ...(change.stopId ? { stopId: change.stopId } : {}) };
}
function initialContext(type: GradientType): IHtmlAnimationContext {
    const initial = gradientFixtureDefinition(type);
    const definitions = cloneGradientDefinitions([{ ...initial, stops: [initial.stops[0]!, { id: 'reserved', color: { kind: 'color', r: 0.8, g: 0.2, b: 0.3, a: 1 }, opacity: 1, position: 25, present: false }, ...initial.stops.slice(1)] }]);
    const channels = definitions.flatMap(gradient => [...geometry.map(component => ({ gradientId: gradient.id, component })), ...gradient.stops.flatMap(stop => stopComponents.map(component => ({ gradientId: gradient.id, stopId: stop.id, component })))]);
    return { version: 1, gradients: { [layerId]: definitions }, bindings: { [layerId]: Object.fromEntries(channels.map((channel, index) => [`gradientChannel${index + 1}`, binding(channel)])) } };
}
function layers(nodes: readonly LayerNode[]): readonly ILayer[] {
    return nodes.flatMap(node => node.type === 'layer' ? [node] : layers(node.children));
}
/** Runtime resolution, never row order or locally recomputed selector specificity. */
function candidateProjection(candidate: IHostRenderCandidate, stage: IHtmlStage, registry: PropertyRegistry): readonly ElementProjection[] {
    const context = candidate.htmlContexts.find(entry => entry.stageId === stage.id)?.context;
    if (!context) throw new Error('Le candidat de rendu ne fournit pas son contexte HTML.');
    const resolvedLayers: readonly IHtmlResolvedLayer[] = layers(candidate.document.layers).flatMap(layer => {
        const sample = candidate.sample.layer(layer.id);
        if (!sample?.target || !sample.editorVisible || !stage.accepts(sample.target)) return [];
        return [{ layerId: layer.id, layer: { ...layer, visible: sample.editorVisible }, target: sample.target, elements: stage.resolveElements(sample.target) }];
    });
    const plan = prepareHtmlResolution(candidate.document, resolvedLayers, context, registry);
    const states = new Map<Element, IHtmlResolvedProperty[]>(plan.evaluate(candidate.time.frame).map(state => [state.element, [...state.properties]]));
    // A definition without a recorded component is a structural base only. It never
    // replaces a resolved background or revives a destination omitted by a diagnostic.
    const bases = new Map<Element, IHtmlGradientDefinition>();
    for (const entry of resolvedLayers) {
        const bindings = Object.entries(context.bindings?.[entry.layerId] ?? {});
        const sampled = candidate.sample.layer(entry.layerId)?.propertyValues ?? {};
        for (const gradient of context.gradients?.[entry.layerId] ?? []) {
            if (bindings.some(([property, binding]) => binding.kind === 'gradient' && binding.gradientId === gradient.id && (property in sampled || entry.layer.propertyTimelines?.[property] !== undefined))) continue;
            if (plan.diagnostics.some(diagnostic => diagnostic.blocking && diagnostic.layerIds.includes(entry.layerId) && candidate.time.frame >= diagnostic.fromFrame && candidate.time.frame <= diagnostic.toFrame)) continue;
            for (const element of entry.elements) {
                const properties = states.get(element) ?? [];
                if (properties.some(property => property.binding.binding.kind === 'gradient' || property.binding.binding.kind === 'style' && ['background', 'background-image'].includes(property.binding.binding.cssName))) continue;
                if (bases.has(element)) throw new Error('Plusieurs bases structurelles de fond demandent une résolution explicite.');
                bases.set(element, gradient);
                states.set(element, properties);
            }
        }
    }
    return [...states].map(([element, properties]) => {
        if (!(element instanceof HTMLElement)) throw new Error('Ce propriétaire d’aperçu exige une cible HTML.');
        const values: Record<string, TimelinePropertyValue> = {};
        const bindings: Record<string, IHtmlResolvedBinding> = {};
        const gradients = new Map<string, IHtmlGradientDefinition>();
        const addGradient = (gradient: IHtmlGradientDefinition): void => {
            const previous = gradients.get(gradient.id);
            if (previous && JSON.stringify(previous) !== JSON.stringify(gradient)) throw new Error('La composition résolue utilise des définitions de dégradé incompatibles.');
            gradients.set(gradient.id, gradient);
        };
        for (const [index, property] of properties.entries()) {
            const name = `renderChannel${index + 1}`;
            bindings[name] = property.binding; values[name] = property.value;
            const binding = property.binding.binding;
            if (binding.kind !== 'gradient') continue;
            const gradient = context.gradients?.[property.layerId]?.find(gradient => gradient.id === binding.gradientId);
            if (!gradient) throw new Error('Définition du dégradé résolu indisponible.');
            addGradient(gradient);
        }
        const base = bases.get(element);
        if (base) {
            addGradient(base);
            bindings.structuralBase = { binding: { kind: 'gradient', gradientId: base.id, component: 'type' }, valueKind: 'text' };
            values.structuralBase = { kind: 'text', value: base.type };
        }
        const result = composeHtmlDeclarations(element, values, bindings, [...gradients.values()]);
        if (result.diagnostics.length) throw new Error(result.diagnostics.map(diagnostic => diagnostic.reason).join(' '));
        return { element, declarations: result.declarations };
    });
}
/** No lifecycle decorator: createEditor receives the exact public inspection participant. */
function metadata(stage: IHtmlStage): RealGradientStageMetadata {
    return { id: stage.id, get mode() { return stage.mode; }, get effectiveMode() { return stage.effectiveMode; }, get animationContext() { return stage.animationContext; }, get diagnostics() { return stage.diagnostics; }, ...(stage.properties ? { properties: stage.properties } : {}), targets: stage.targets, accepts: target => stage.accepts(target), resolve: target => stage.resolve(target), resolveElements: target => stage.resolveElements(target), inspectProperty: (...args) => stage.inspectProperty(...args) };
}
function mappedResult(result: EditorTransactionResult): MutationResult {
    switch (result.status) {
        case 'changed': return { status: 'changed' };
        case 'noop': return { status: 'unchanged' };
        case 'refused': return { status: 'rejected', message: diagnostic(result.reason, 'La transaction réelle a été refusée.') };
        case 'faulted': return { status: 'faulted', message: diagnostic(result.fault.message) };
    }
}
function peerCommand(): ICommand {
    const label = 'Create opacity target';
    return createCommand(label, document => {
        if (document.layers.some(layer => layer.id === peerId)) throw new CommandRefusedError(label, 'La cible de première édition existe déjà.');
        return { ...document, layers: [...document.layers, { id: peerId, type: 'layer', name: peerSelector, target: { selector: peerSelector }, spans: [] }] };
    }, document => ({ ...document, layers: document.layers.filter(layer => layer.id !== peerId) }));
}

/** Private genuine HA9 bridge; unsupported CSS and r3 geometry remain explicit refusals. */
export function createRealGradientHost(editorContainer: HTMLElement, scene: HTMLElement, type: GradientType = 'linear', options: RealGradientHostOptions = {}): RealGradientHost {
    const element = scene.querySelector<HTMLElement>(selector);
    if (!element) throw new Error('La cible du dégradé réel est introuvable.');
    let owner = new DomPreviewOwner(scene);
    const clock = createManualClock();
    const stage = createHtmlInspectionStage({ root: scene, exclude: editorContainer, animationContext: options.context ?? initialContext(type), preserveSource: read => owner.withSource(read) });
    const data: ITimelineDocument = options.document ?? { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [{ id: layerId, type: 'layer', name: selector, target: { selector }, spans: [] }] };
    const registry = createPropertyRegistry();
    const renderRegistry = registry.clone();
    for (const descriptor of stage.properties ?? []) renderRegistry.register(descriptor);
    let isGrouping = (): boolean => false;
    // The public plugin command facade exposes group state; IEditor itself does not.
    const groupMonitor: EditorPlugin = { id: 'designer.groupMonitor', dependencies: [], init: context => { isGrouping = () => context.commands.isGrouping; }, destroy: () => { isGrouping = () => false; } };
    let projectRenderPolicy: ProjectRenderPolicy = { active: null };
    const editor = createEditor(editorContainer, { data, stage, clock, registry, plugins: [groupMonitor], hostRenderer: {
        prepare(candidate) {
            if (candidate.cause === 'destroy') return owner.prepareRestore();
            const policy = projectRenderPolicy;
            const guard = (): void => { policy.active?.(); policy.transition?.(); };
            guard();
            const projection = owner.withSource(() => candidateProjection(candidate, stage, renderRegistry));
            guard();
            const prepared = owner.prepare(projection); guard();
            return { changed: prepared.changed || policy.transition !== undefined, apply() {
                guard(); prepared.apply(); guard();
                if (policy.transition) projectRenderPolicy = { active: policy.active };
            }, rollback() { try { prepared.rollback(); } finally { projectRenderPolicy = policy; } } };
        },
    } });
    try {
    const selection = editor.getService('layers.selection');
    if (!selection) { editor.destroy(); throw new Error('Le service de sélection Timeline n’est pas disponible.'); }
    let disposed = false;
    let running = 0;
    let notifying = 0;
    let adapterFault: string | undefined;
    let receivedTransaction = false;
    let lastFrame = editor.playback.frame;
    let pointSequence = 0;
    let propertySequence = Object.keys(stage.animationContext.bindings?.[layerId] ?? {}).length;
    const listeners = new Set<(reason: TimelineReason) => void>();
    const subscriptions: (() => void)[] = [];
    const definitions = (context = stage.animationContext): readonly GradientDefinition[] => cloneGradientDefinitions((context.gradients?.[layerId] ?? []).map(gradient => ({ ...gradient, stops: gradient.stops.map(stop => {
        if (stop.color.a !== 1) throw new Error('La couleur du point doit être opaque ; utilisez sa piste d’opacité.');
        return { ...stop, color: { ...stop.color, a: 1 } };
    }) })));
    const values = (id = layerId): TimelinePropertyValues => editor.sample(editor.playback.time.frame).layer(id)?.propertyValues ?? {};
    const evaluation = (source = values(), context = stage.animationContext): readonly GradientDefinition[] => applyGradientEdits(definitions(context), descriptors(context).flatMap(descriptor => {
        const value = source[descriptor.property];
        return value ? [{ gradientId: descriptor.gradientId, ...(descriptor.stopId ? { stopId: descriptor.stopId } : {}), component: descriptor.component, value: untyped(value) }] : [];
    }));
    const declarations = (target: Element, source: TimelinePropertyValues, id: string, context = stage.animationContext): Readonly<Record<string, string>> => {
        const resolved: Record<string, IHtmlResolvedBinding> = {};
        const composed: Record<string, TimelinePropertyValue> = { ...source };
        const bindings = Object.entries(context.bindings?.[id] ?? {});
        const represented = new Set(bindings.flatMap(([property, candidate]) => candidate.kind === 'gradient' && property in source ? [candidate.gradientId] : []));
        let structural: readonly GradientDefinition[] | undefined;
        for (const [property, candidate] of bindings) {
            resolved[property] = { binding: candidate, valueKind: candidate.kind === 'gradient' ? kind(candidate.component) : source[property]?.kind ?? 'number' };
            // One static component activates public composition for an unrecorded gradient.
            // The runtime receives its full definition and every genuine sampled channel.
            if (candidate.kind !== 'gradient' || represented.has(candidate.gradientId)) continue;
            structural ??= definitions(context);
            const base = readGradientComponent(structural, candidate);
            if (base === undefined) throw new Error('Base structurelle du dégradé indisponible.');
            composed[property] = typed(base);
            represented.add(candidate.gradientId);
        }
        const result = composeHtmlDeclarations(target, composed, resolved, context.gradients?.[id] ?? []);
        if (result.diagnostics.length) throw new Error(result.diagnostics.map(diagnostic => diagnostic.reason).join(' '));
        return result.declarations;
    };
    const emit = (reason: TimelineReason): void => {
        notifying++;
        try { for (const listener of [...listeners]) { try { listener(reason); } catch { /* Observers cannot reverse a committed transaction. */ } } }
        finally { notifying--; }
    };
    const faultMessage = (): string | undefined => {
        const fault = editor.transactions.fault;
        return fault !== undefined ? diagnostic(fault.message) : adapterFault;
    };
    const latchFault = (error: unknown): Extract<MutationResult, { status: 'rejected' | 'faulted' }> => {
        const previouslyLatched = adapterFault !== undefined;
        adapterFault = faultMessage() ?? diagnostic(error instanceof Error ? error.message : undefined);
        // A direct adapter caller also needs to lock the Designer immediately.
        // This is a view refresh, never a successful document notification.
        if (!previouslyLatched) emit('frame');
        return { status: 'faulted', message: adapterFault };
    };
    const refusal = (): Extract<MutationResult, { status: 'rejected' | 'faulted' }> | null => {
        if (disposed) return { status: 'rejected', message: 'L’éditeur réel est fermé.' };
        const fault = faultMessage();
        if (fault) return { status: 'faulted', message: fault };
        const message = notifying ? 'Une notification est en cours. Réessayez la commande après son retour.' : running ? 'Une transaction est déjà en cours.' : isGrouping() ? 'Un groupe Timeline est déjà ouvert. Terminez ou annulez ce groupe avant une commande Designer indépendante.' : null;
        return message ? { status: 'rejected', message } : null;
    };
    const revision = (): string => JSON.stringify([editor.document, stage.animationContext, editor.playback.frame]);
    const read = (id: string): GradientSnapshot | null => {
        if (disposed || id !== layerId) return null;
        const layer = editor.document.layers.find(layer => layer.id === id);
        if (!layer || layer.type !== 'layer') return null;
        const tracks = layer.propertyTimelines ?? {};
        const fault = faultMessage();
        return { revision: revision(), objectId: layerId, selector, definitions: definitions(), gradients: evaluation(), tracks: descriptors(stage.animationContext).filter(descriptor => tracks[descriptor.property] !== undefined), editable: !fault, ...(fault ? { reason: fault } : {}), canAddStop: !fault };
    };
    const validate = (request: GradientRequest): GradientSnapshot => {
        const snapshot = read(request.objectId);
        if (!snapshot || snapshot.revision !== request.revision || request.frame !== editor.playback.frame) throw new Error('Le contexte temporel a changé. Recommencez la modification.');
        if (!snapshot.editable) throw new Error(snapshot.reason ?? uncertainState);
        return snapshot;
    };
    const proposedValues = (changes: readonly GradientEdit[], context = stage.animationContext): TimelinePropertyValues => {
        applyGradientEdits(evaluation(values(), context), changes);
        const result: Record<string, TimelinePropertyValue> = { ...values() };
        for (const change of changes) {
            const descriptor = descriptors(context).find(candidate => candidate.gradientId === change.gradientId && candidate.stopId === change.stopId && candidate.component === change.component);
            if (!descriptor) throw new Error('Ce composant de dégradé n’est pas enregistré.');
            result[descriptor.property] = typed(change.value);
        }
        return result;
    };
    const getState = (): TimelineState => {
        const layers = editor.document.layers.filter((layer): layer is ILayer => layer.type === 'layer');
        const projected: Record<string, Readonly<Record<string, string>>> = {};
        for (const layer of layers) {
            if (!layer.target || !('selector' in layer.target)) continue;
            const target = scene.querySelector(layer.target.selector);
            if (target) projected[layer.id] = declarations(target, values(layer.id), layer.id);
        }
        const fault = faultMessage();
        return { frame: editor.playback.frame, duration: editor.playback.totalFrames, objects: layers.flatMap(layer => layer.target && 'selector' in layer.target ? [{ id: layer.id, selector: layer.target.selector }] : []), values: projected, selectedObjectId: selection.selected()[0] ?? null, canUndo: !fault && editor.canUndo, canRedo: !fault && editor.canRedo, ...(fault ? { fault } : {}) };
    };
    let lastState = getState();
    const flush = (outcome: MutationResult): MutationResult => {
        try { clock.advance(0); return outcome; }
        catch (error) { return latchFault(error); }
    };
    const transact = (request: IEditorTransactionRequest): MutationResult => {
        const reason = refusal(); if (reason) return reason;
        running++; receivedTransaction = false;
        try {
            let outcome: MutationResult;
            try {
                outcome = mappedResult(editor.transactions.execute(request));
                if (outcome.status === 'faulted') outcome = latchFault(new Error(outcome.message));
            } catch (error) { outcome = latchFault(error); }
            return flush(outcome);
        } finally { running--; }
    };
    const history = (direction: 'undo' | 'redo'): MutationResult => {
        const reason = refusal(); if (reason) return reason;
        running++; receivedTransaction = false;
        try {
            let outcome: MutationResult;
            let rejected: string | undefined;
            const unavailable = direction === 'undo' ? 'L’annulation a été refusée par Timeline.' : 'Le rétablissement a été refusé par Timeline.';
            const unsubscribe = editor.on('command:refused', event => { rejected = diagnostic(event.reason, unavailable); });
            try {
                const available = direction === 'undo' ? editor.canUndo : editor.canRedo;
                const changed = editor[direction]();
                if (changed && !receivedTransaction) emit(direction);
                outcome = changed ? { status: 'changed' } : available || rejected ? { status: 'rejected', message: rejected ?? unavailable } : { status: 'unchanged' };
            } catch (error) { outcome = latchFault(error); }
            finally { unsubscribe(); }
            return flush(outcome);
        } finally { running--; }
    };
    const gradientPlan = (request: GradientRequest, snapshot: GradientSnapshot): { context: IHtmlAnimationContext; changes: readonly GradientEdit[]; properties: readonly PropertyTimelineOperation[] } => {
        let context = stage.animationContext;
        let changes: readonly GradientEdit[];
        if (request.intent.kind === 'add-stop') {
            const intent = request.intent;
            const original = snapshot.definitions.find(gradient => gradient.id === intent.gradientId);
            if (!original) throw new Error('Dégradé introuvable.');
            let id: string;
            do { id = `point${++pointSequence}`; } while (original.stops.some(stop => stop.id === id));
            const stop = { id, color: { ...intent.color }, opacity: intent.opacity, position: intent.position, present: false };
            const candidate = cloneGradientDefinitions(snapshot.definitions.map(gradient => gradient.id === original.id ? { ...gradient, stops: [...gradient.stops, stop] } : gradient));
            const bindings = { ...context.bindings?.[layerId] };
            changes = stopComponents.map(component => ({ gradientId: original.id, stopId: id, component, value: component === 'present' ? true : stop[component] }));
            for (const change of changes) {
                let property: string;
                do { property = `gradientChannel${++propertySequence}`; } while (property in bindings);
                bindings[property] = binding(change);
            }
            context = { ...context, gradients: { ...context.gradients, [layerId]: candidate }, bindings: { ...context.bindings, [layerId]: bindings } };
        } else {
            changes = request.intent.changes.filter(change => JSON.stringify(readGradientComponent(snapshot.gradients, change)) !== JSON.stringify(change.value));
        }
        proposedValues(changes, context);
        const properties: PropertyTimelineOperation[] = changes.map(change => {
            const descriptor = descriptors(context).find(candidate => candidate.gradientId === change.gradientId && candidate.stopId === change.stopId && candidate.component === change.component);
            if (!descriptor) throw new Error('Composant inconnu.');
            const existing = stage.animationContext.bindings?.[layerId]?.[descriptor.property];
            const inspection = existing ? stage.inspectProperty({ selector }, descriptor.property, { layerId, valueKind: kind(change.component) }) : null;
            const initialValue = existing ? inspection?.initialValue : typed(readGradientComponent(definitions(context), change)!);
            if (!initialValue || inspection && !inspection.editable) throw new Error(inspection?.reason ?? 'Base originale indisponible.');
            return { kind: 'set', layerId, property: descriptor.property, frame: request.frame, value: typed(change.value), initialValue };
        });
        return { context, changes: Object.freeze(changes.map(immutableChange)), properties };
    };
    const opacityPlan = (writes: readonly PropertyWrite[]): Pick<IEditorTransactionRequest, 'commands' | 'properties' | 'htmlContext'> => {
        if (!writes.length) return {};
        if (writes.length !== 1 || writes[0]?.selector !== peerSelector || writes[0].property !== 'opacity') throw new Error('Ce pont réel ne mappe que l’opacité du témoin. Les autres déclarations CSS et ajustements spatiaux r3 exigent une correspondance explicite.');
        const write = writes[0]; const value = Number(write.value);
        if (write.objectId !== peerId && write.objectId !== `html:${peerSelector}`) throw new Error('L’objet demandé ne correspond pas au témoin d’opacité.');
        if (!write.value.trim() || !Number.isFinite(value) || value < 0 || value > 1 || !scene.querySelector(peerSelector)) throw new Error('Valeur ou cible d’opacité non valide.');
        const existing = editor.document.layers.find(layer => layer.id === peerId);
        if (existing && (existing.type !== 'layer' || !existing.target || !('selector' in existing.target) || existing.target.selector !== peerSelector)) throw new Error('Le calque du témoin ne correspond plus à sa cible.');
        const inspection = stage.inspectProperty({ selector: peerSelector }, 'opacity', { ...(existing ? { layerId: peerId } : {}), valueKind: 'number' });
        if (!inspection.editable || !inspection.initialValue) throw new Error(inspection.reason ?? 'Base originale d’opacité indisponible.');
        const context = { ...stage.animationContext, bindings: { ...stage.animationContext.bindings, [peerId]: { ...stage.animationContext.bindings?.[peerId], opacity: { kind: 'style' as const, cssName: 'opacity' } } } };
        return { ...(existing ? {} : { commands: [peerCommand()] }), htmlContext: { stageId: stage.id, context }, properties: [{ kind: 'set', layerId: peerId, property: 'opacity', frame: write.frame, value: { kind: 'number', value }, initialValue: inspection.initialValue }] };
    };
    const adapter: TimelineAdapter = {
        kind: 'real', contractRevision: 'HA-TL-001/r2', get preview() { return owner; },
        getState: () => disposed ? { ...lastState, canUndo: false, canRedo: false } : getState(),
        gradients: {
            read,
            compose(request) {
                try {
                    validate(request);
                    if (request.intent.kind !== 'edit') throw new Error('L’aperçu structurel attend la validation de la commande.');
                    const source = proposedValues(request.intent.changes);
                    const target = scene.querySelector<HTMLElement>(selector);
                    if (!target) throw new Error('La cible actuelle du dégradé est introuvable.');
                    return { status: 'composed', gradients: evaluation(source), declarations: declarations(target, source, layerId) };
                } catch (error) { return { status: 'rejected', message: error instanceof Error ? error.message : 'Composition réelle indisponible.' }; }
            },
            execute(request, isCurrent): GradientMutationResult {
                const reason = refusal(); if (reason) return reason;
                try {
                    const snapshot = validate(request);
                    if (!isCurrent()) throw new Error('La confirmation n’est plus actuelle.');
                    const plan = gradientPlan(request, snapshot);
                    if (!plan.changes.length) return { status: 'unchanged' };
                    const result = transact({ label: request.intent.kind === 'add-stop' ? 'Add gradient stop' : 'Change gradient components', properties: plan.properties, htmlContext: { stageId: stage.id, context: plan.context }, isCurrent });
                    if (result.status === 'changed') return { status: 'changed', changes: plan.changes };
                    if (result.status === 'rejected' || result.status === 'faulted') return { status: result.status, message: result.message };
                    return { status: 'unchanged' };
                } catch (error) { return { status: 'rejected', message: error instanceof Error ? error.message : 'Commande réelle refusée.' }; }
            },
        },
        execute(label, writes, effect) {
            const reason = refusal(); if (reason) return reason;
            if (effect && !effect.prepare) return { status: 'rejected', message: 'L’effet hôte doit fournir une préparation pure et une compensation exacte pour HA8.' };
            try {
                const plan = opacityPlan(writes);
                return transact({ label, ...plan, ...(effect?.prepare ? { effect: { prepare: direction => effect.prepare!(direction) } } : {}) });
            } catch (error) { return { status: 'rejected', message: error instanceof Error ? error.message : 'Commande réelle refusée.' }; }
        },
        undo: () => history('undo'), redo: () => history('redo'),
        selectObject(id) { if (disposed) return; if (id === null) selection.clear(); else if (editor.document.layers.some(layer => layer.id === id)) selection.select([id], 'replace'); },
        onChange(listener) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    subscriptions.push(
        editor.on('transaction:changed', event => { receivedTransaction = true; emit(event.phase === 'preview' ? 'preview' : event.phase === 'cancel' ? 'cancel' : event.cause === 'undo' || event.cause === 'redo' ? event.cause : 'execute'); }),
        editor.on('document:changed', event => { if (!running) emit(event.cause === 'group-cancel' ? 'cancel' : isGrouping() ? 'preview' : event.cause === 'undo' || event.cause === 'redo' ? event.cause : 'execute'); }),
        editor.on('document:loaded', () => emit('execute')),
        editor.on('layers:selectionChanged', () => emit('selection')),
        editor.onFrame(sample => { if (sample.time.frame !== lastFrame) { lastFrame = sample.time.frame; emit('frame'); } }),
    );
    return { editor, adapter, stage: metadata(stage), get previewOwner() { return owner; },
        installPreviewOwner(next) { owner = next; },
        get projectRenderPolicy() { return projectRenderPolicy; },
        installProjectRenderPolicy(policy) { projectRenderPolicy = policy; },
        executeTransaction: transact,
        navigate(frame) { if (!disposed) { editor.playback.seek(frame); clock.advance(0); } },
        advance(milliseconds) { if (!disposed) clock.advance(milliseconds); },
        // Read-only snapshots are allowed during terminal observations, but never
        // while a group is provisional or compensation has become uncertain.
        canCaptureProject() { return !disposed && !editor.isDestroyed && faultMessage() === undefined && !isGrouping(); },
        dispose() { if (disposed) return; const snapshot = getState(); editor.destroy(); lastState = snapshot; disposed = true; for (const unsubscribe of subscriptions) unsubscribe(); listeners.clear(); },
    };
    } catch (error) {
        try { editor.destroy(); }
        catch (cleanup) { throw new AggregateError([error, cleanup], 'L’initialisation et la restauration de l’éditeur ont échoué.', { cause: cleanup }); }
        throw error;
    }
}
