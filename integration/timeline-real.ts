// integration/timeline-real.ts
import { createEditor, createEditorHtmlStage } from '@kazo-ca/timeline-editor';
import type { IEditor } from '@kazo-ca/timeline-editor';
import { composeHtmlDeclarations, createManualClock } from '@kazo-ca/timeline-runtime';
import type { HtmlPropertyBinding, IHtmlResolvedBinding, IHtmlStage, IStage, ITargetInfo, ITargetPropertyInfo, ITimelineDocument, TimelinePropertyValue, TimelinePropertyValues } from '@kazo-ca/timeline-runtime';
import { applyGradientEdits, cloneGradientDefinitions, readGradientComponent } from '@kazo-ca/css-properties';
import type { GradientComponent, GradientDefinition, GradientEdit, GradientType, GradientValue } from '@kazo-ca/css-properties';
import { gradientFixtureDefinition } from '../fixtures/gradient-scene.js';
import type { GradientMutationResult, GradientRequest, GradientSnapshot, GradientTrack } from '../packages/designer/src/gradient-types.js';
import type { TimelineAdapter, TimelineReason, TimelineState } from '../packages/designer/src/timeline-adapter.js';
import artifactManifest from '../vendor/timeline/manifest.json';
export interface RealGradientHost {
    readonly editor: IEditor;
    readonly adapter: TimelineAdapter;
    readonly stage: RealGradientStageMetadata;
    navigate(frame: number): void;
    advance(milliseconds: number): void;
    dispose(): void;
}
/** Read-only stage access; source/context mutations require recreating this limited host. */
export interface RealGradientStageMetadata extends Pick<IHtmlStage, 'id' | 'mode' | 'effectiveMode' | 'properties' | 'animationContext' | 'diagnostics' | 'inspectProperty' | 'accepts' | 'resolve' | 'resolveElements'> {
    readonly targets: Pick<IHtmlStage['targets'], 'list' | 'describe'>;
}
export const REAL_TIMELINE_REFERENCE = artifactManifest.reference;
const layerId = 'gradientObject';
const selector = '#gradient-box';
const geometry: readonly GradientComponent[] = ['type', 'angle', 'centerX', 'centerY', 'radiusX', 'radiusY'];
const stopComponents: readonly GradientComponent[] = ['color', 'opacity', 'position', 'present'];
const structureReason = 'L’ajout structurel attend une transaction publique atomique pour le contexte HTML et les clés. Les points préenregistrés restent modifiables.';
function kind(component: GradientComponent): TimelinePropertyValue['kind'] { return component === 'type' ? 'text' : component === 'color' ? 'color' : component === 'present' ? 'boolean' : 'number'; }
function typed(value: GradientValue): TimelinePropertyValue {
    if (typeof value === 'number')
        return { kind: 'number', value };
    if (typeof value === 'string')
        return { kind: 'text', value };
    if (typeof value === 'boolean')
        return { kind: 'boolean', value };
    return { ...value };
}
function untyped(value: TimelinePropertyValue): GradientValue {
    if (value.kind === 'color') {
        if (value.a !== 1)
            throw new Error('La couleur du point doit être opaque ; utilisez sa piste d’opacité.');
        return { ...value, a: 1 };
    }
    if (value.kind === 'text') {
        if (value.value !== 'linear' && value.value !== 'radial' && value.value !== 'conic')
            throw new Error('Type de dégradé non pris en charge.');
        return value.value;
    }
    return value.value;
}
function immutableChange(change: GradientEdit): GradientEdit { return Object.freeze({ ...change, value: typeof change.value === 'object' ? Object.freeze({ ...change.value }) : change.value }); }
/** Every exposed metadata read, including deferred callbacks, preserves the owned preview. */
function metadataStage(stage: IHtmlStage, preserve: <T>(action: () => T) => T): RealGradientStageMetadata {
    const property = <T extends ITargetPropertyInfo>(info: T): T => ({ ...info, ...(info.sample ? { sample: (id: string, frame: number) => preserve(() => info.sample!(id, frame)) } : {}), ...(info.validate ? { validate: (...args: Parameters<NonNullable<ITargetPropertyInfo['validate']>>) => preserve(() => info.validate!(...args)) } : {}) });
    const target = (info: ITargetInfo): ITargetInfo => ({ ...info, ...(info.properties ? { properties: info.properties.map(item => typeof item === 'string' ? item : property(item)) } : {}) });
    return { id: stage.id,
        get mode() { return preserve(() => stage.mode); },
        get effectiveMode() { return preserve(() => stage.effectiveMode); },
        get animationContext() { return preserve(() => stage.animationContext); },
        get diagnostics() { return preserve(() => stage.diagnostics); },
        ...(stage.properties ? { properties: stage.properties } : {}),
        targets: { list: () => preserve(() => stage.targets.list()).map(target), ...(stage.targets.describe ? { describe: (value: Parameters<NonNullable<typeof stage.targets.describe>>[0]) => { const info = preserve(() => stage.targets.describe!(value)); return info ? target(info) : undefined; } } : {}) },
        accepts: target => preserve(() => stage.accepts(target)),
        resolve: target => preserve(() => stage.resolve(target)),
        resolveElements: target => preserve(() => stage.resolveElements(target)),
        inspectProperty: (...args) => property(preserve(() => stage.inspectProperty(...args))),
    };
}
/** Public lifecycle decorator, with the same protected metadata facade as the host. */
function inspectionStage(stage: IHtmlStage, metadata: RealGradientStageMetadata, preserve: <T>(action: () => T) => T): IStage<Element> {
    return { id: metadata.id, targets: metadata.targets, ...(metadata.properties ? { properties: metadata.properties } : {}),
        accepts: target => metadata.accepts(target), resolve: target => metadata.resolve(target),
        attach: context => preserve(() => stage.attach?.(context)), update: (document, layers) => preserve(() => stage.update?.(document, layers)),
        release: (id, element) => preserve(() => stage.release?.(id, element)), detach: () => preserve(() => stage.detach?.()),
        // No scheduled sync/render writer. Eager metadata draws are compensated separately.
        sync: () => { }, render: () => { },
    };
}
/** Private verification bridge for genuine packages; unsupported guarantees are refused. */
export function createRealGradientHost(editorContainer: HTMLElement, scene: HTMLElement, type: GradientType = 'linear'): RealGradientHost {
    const element = scene.querySelector<HTMLElement>(selector);
    if (!element)
        throw new Error('La cible du dégradé réel est introuvable.');
    const initial = gradientFixtureDefinition(type);
    const definitions = cloneGradientDefinitions([{ ...initial, stops: [initial.stops[0]!, { id: 'reserved', color: { kind: 'color', r: 0.8, g: 0.2, b: 0.3, a: 1 }, opacity: 1, position: 25, present: false }, ...initial.stops.slice(1)] }]);
    const channels: readonly Omit<GradientTrack, 'property'>[] = definitions.flatMap(gradient => [
        ...geometry.map(component => ({ gradientId: gradient.id, component, editable: true, interpolable: component !== 'type' })),
        ...gradient.stops.flatMap(stop => stopComponents.map(component => ({ gradientId: gradient.id, stopId: stop.id, component, editable: true, interpolable: component !== 'present' }))),
    ]);
    const bindings: Record<string, HtmlPropertyBinding> = {};
    const resolved: Record<string, IHtmlResolvedBinding> = {};
    const descriptors: readonly GradientTrack[] = channels.map((channel, index) => { const property = `gradientChannel${index + 1}`; const binding: HtmlPropertyBinding = { kind: 'gradient', gradientId: channel.gradientId, component: channel.component, ...(channel.stopId ? { stopId: channel.stopId } : {}) }; bindings[property] = binding; resolved[property] = { binding, valueKind: kind(channel.component) }; return { ...channel, property }; });
    const clock = createManualClock();
    const stage = createEditorHtmlStage(editorContainer, { root: scene, animationContext: { version: 1, gradients: { [layerId]: definitions }, bindings: { [layerId]: bindings } } });
    const data: ITimelineDocument = { version: '2.0.0', settings: { fps: 24, totalFrames: 100 }, layers: [{ id: layerId, type: 'layer', name: selector, target: { selector }, spans: [] }] };
    // HA6 metadata temporarily restores its bases. Preserve the current Designer-owned
    // inline preview around those public reads, including deferred sample/validate callbacks.
    const originalBackground = { value: element.style.getPropertyValue('background-image'), priority: element.style.getPropertyPriority('background-image') };
    const currentProjection = (): Readonly<Record<string, string>> => declarations(values());
    const projectedBackground = (): string | undefined => { try {
        const value = currentProjection()['background-image'];
        if (value === undefined)
            return undefined;
        const probe = element.ownerDocument.createElement('div');
        probe.style.setProperty('background-image', value);
        return probe.style.getPropertyValue('background-image');
    }
    catch {
        return undefined;
    } };
    const neighbors = (): string => JSON.stringify(Array.from({ length: element.style.length }, (_, index) => element.style.item(index)).filter(name => name !== 'background-image').sort().map(name => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]));
    const preserve = <T>(action: () => T): T => {
        const before = element.getAttribute('style');
        const adjacent = neighbors();
        const image = { value: element.style.getPropertyValue('background-image'), priority: element.style.getPropertyPriority('background-image') };
        // A metadata-only scene still captures inline originals during update. Supply
        // the captured source, so it can never retain a Designer preview as a new base.
        if (originalBackground.value)
            element.style.setProperty('background-image', originalBackground.value, originalBackground.priority);
        else
            element.style.removeProperty('background-image');
        try {
            return action();
        }
        finally {
            if (element.getAttribute('style') !== before) {
                const current = { value: element.style.getPropertyValue('background-image'), priority: element.style.getPropertyPriority('background-image') };
                // Only compensate the known metadata restoration. Preserve unrelated host writes,
                // including an explicitly changed driven property, rather than restoring a broad snapshot.
                const known = (current.value === originalBackground.value && current.priority === originalBackground.priority) || (current.value === image.value && current.priority === image.priority) || (current.priority === 'important' && current.value === projectedBackground());
                if (known) {
                    if (neighbors() === adjacent) {
                        if (before === null)
                            element.removeAttribute('style');
                        else
                            element.setAttribute('style', before);
                    }
                    else if (image.value)
                        element.style.setProperty('background-image', image.value, image.priority);
                    else
                        element.style.removeProperty('background-image');
                }
            }
        }
    };
    const metadata = metadataStage(stage, preserve);
    const editor = createEditor(editorContainer, { data, stage: inspectionStage(stage, metadata, preserve), clock });
    const selection = editor.getService('layers.selection');
    if (!selection) {
        editor.destroy();
        throw new Error('Le service de sélection Timeline n’est pas disponible.');
    }
    // Original values are captured before any Designer is constructed or writes its preview.
    const bases = new Map<string, TimelinePropertyValue>();
    for (const descriptor of descriptors) {
        const inspection = metadata.inspectProperty({ selector }, descriptor.property, { layerId, valueKind: kind(descriptor.component) });
        if (!inspection.editable || !inspection.initialValue) {
            editor.destroy();
            throw new Error(inspection.reason ?? 'Base de dégradé indisponible.');
        }
        bases.set(descriptor.property, inspection.initialValue);
    }
    let disposed = false;
    let muting = 0;
    let notifying = 0;
    let activeRevision: string | null = null;
    // HA7 emits backend events before the group commits. Its public cancel handle can
    // roll back extra writes that joined this keys-only group, but cannot lock other observers.
    let transactionObserved = false;
    let unexpectedWrite = false;
    let pendingWrite: { readonly before: ITimelineDocument; events: number; document?: ITimelineDocument } | null = null;
    let lastFrame = editor.playback.time.frame;
    const listeners = new Set<(reason: TimelineReason) => void>();
    const subscriptions: (() => void)[] = [];
    const emit = (reason: TimelineReason): void => { notifying++; try {
        for (const listener of [...listeners]) {
            try {
                listener(reason);
            }
            catch { /* A committed command remains committed if a consumer observer fails. */ }
        }
    }
    finally {
        notifying--;
    } };
    const refusal = (): string | null => disposed ? 'L’éditeur réel est fermé.' : notifying ? 'Une notification est en cours. Réessayez la commande après son retour.' : muting ? 'Une transaction est déjà en cours.' : null;
    const values = (): TimelinePropertyValues => editor.sample(editor.playback.time.frame).layer(layerId)?.propertyValues ?? {};
    const evaluation = (source: TimelinePropertyValues = values()): readonly GradientDefinition[] => applyGradientEdits(definitions, descriptors.flatMap(descriptor => { const value = source[descriptor.property]; return value ? [{ gradientId: descriptor.gradientId, ...(descriptor.stopId ? { stopId: descriptor.stopId } : {}), component: descriptor.component, value: untyped(value) }] : []; }));
    const declarations = (source: TimelinePropertyValues): Readonly<Record<string, string>> => {
        const result = composeHtmlDeclarations(element, source, resolved, definitions);
        if (result.diagnostics.length)
            throw new Error(result.diagnostics.map(diagnostic => diagnostic.reason).join(' '));
        return result.declarations;
    };
    const revision = (): string => activeRevision ?? JSON.stringify([editor.document, editor.playback.time.frame]);
    const read = (id: string): GradientSnapshot | null => {
        if (disposed || id !== layerId)
            return null;
        const layer = editor.document.layers[0];
        const tracks = layer?.type === 'layer' ? layer.propertyTimelines ?? {} : {};
        return { revision: revision(), objectId: layerId, selector, definitions: cloneGradientDefinitions(definitions), gradients: evaluation(), tracks: descriptors.filter(descriptor => tracks[descriptor.property] !== undefined).map(descriptor => ({ ...descriptor })), editable: true, ...{ canAddStop: false, structureReason } };
    };
    const validate = (request: GradientRequest): GradientSnapshot => { const snapshot = read(request.objectId); if (!snapshot || snapshot.revision !== request.revision || request.frame !== editor.playback.frame)
        throw new Error('Le contexte temporel a changé. Recommencez la modification.'); if (request.intent.kind !== 'edit')
        throw new Error(structureReason); return snapshot; };
    const proposedValues = (changes: readonly GradientEdit[]): TimelinePropertyValues => {
        const proposed = applyGradientEdits(evaluation(), changes);
        if (!artifactManifest.capabilities.crossedStopPositionOrder && proposed.some(gradient => { const positions = gradient.stops.filter(stop => stop.present).map(stop => stop.position); return positions.some((position, index) => index > 0 && position < (positions[index - 1] ?? position)); }))
            throw new Error('Cette archive ne garantit pas le tri des points croisés. La référence corrigée est attendue pour ce parcours réel.');
        const result: Record<string, TimelinePropertyValue> = { ...values() };
        for (const change of changes) {
            const descriptor = descriptors.find(candidate => candidate.gradientId === change.gradientId && candidate.stopId === change.stopId && candidate.component === change.component);
            if (!descriptor)
                throw new Error('Ce composant de dégradé n’est pas préenregistré.');
            result[descriptor.property] = typed(change.value);
        }
        return result;
    };
    const getState = (): TimelineState => ({ frame: editor.playback.frame, duration: editor.playback.totalFrames, objects: [{ id: layerId, selector }], values: { [layerId]: declarations(values()) }, selectedObjectId: selection.selected()[0] ?? null, canUndo: editor.canUndo, canRedo: editor.canRedo });
    let lastState = getState();
    const adapter: TimelineAdapter = {
        kind: 'real', contractRevision: 'HA-TL-001/r2',
        getState: () => disposed ? { ...lastState, canUndo: false, canRedo: false } : getState(),
        gradients: {
            read,
            compose(request) { try {
                validate(request);
                if (request.intent.kind !== 'edit')
                    throw new Error(structureReason);
                const source = proposedValues(request.intent.changes);
                return { status: 'composed', gradients: evaluation(source), declarations: declarations(source) };
            }
            catch (error) {
                return { status: 'rejected', message: error instanceof Error ? error.message : 'Composition réelle indisponible.' };
            } },
            execute(request, isCurrent): GradientMutationResult {
                const reason = refusal();
                if (reason)
                    return { status: 'rejected', message: reason };
                let transaction: ReturnType<IEditor['propertyTimelines']['beginTransaction']> | undefined;
                let entered = false;
                let outcome: GradientMutationResult;
                try {
                    const snapshot = validate(request);
                    if (request.intent.kind !== 'edit')
                        throw new Error(structureReason);
                    if (!isCurrent())
                        throw new Error('La confirmation n’est plus actuelle.');
                    proposedValues(request.intent.changes);
                    const changes = Object.freeze(request.intent.changes.filter(change => JSON.stringify(readGradientComponent(snapshot.gradients, change)) !== JSON.stringify(change.value)).map(immutableChange));
                    if (!changes.length)
                        return { status: 'unchanged' };
                    activeRevision = request.revision;
                    muting++;
                    entered = true;
                    unexpectedWrite = false;
                    transactionObserved = true;
                    const facade = editor.propertyTimelines.guarded(isCurrent);
                    transaction = facade.beginTransaction('Change existing gradient components');
                    let changed = false;
                    for (const change of changes) {
                        const descriptor = descriptors.find(candidate => candidate.gradientId === change.gradientId && candidate.stopId === change.stopId && candidate.component === change.component);
                        if (!descriptor)
                            throw new Error('Composant inconnu.');
                        const initialValue = bases.get(descriptor.property);
                        if (!initialValue)
                            throw new Error('Base originale indisponible.');
                        pendingWrite = { before: editor.document, events: 0 };
                        const result = facade.set(layerId, descriptor.property, typed(change.value), { frame: request.frame, initialValue });
                        const observed = pendingWrite;
                        pendingWrite = null;
                        if (unexpectedWrite || observed.events !== (result.status === 'changed' ? 1 : 0) || (observed.document && observed.document !== editor.document))
                            throw new Error('Une écriture externe est survenue pendant la transaction. Le groupe de clés a été annulé.');
                        if (result.status === 'refused')
                            throw new Error(result.reason);
                        changed ||= result.status === 'changed';
                        if (!isCurrent())
                            throw new Error('Le contexte a changé pendant la commande.');
                    }
                    const committed = transaction.commit();
                    outcome = committed && changed ? { status: 'changed', changes } : { status: 'unchanged' };
                }
                catch (error) {
                    pendingWrite = null;
                    transactionObserved = false;
                    if (transaction?.active)
                        transaction.cancel();
                    outcome = { status: 'rejected', message: error instanceof Error ? error.message : 'Commande réelle refusée.' };
                }
                finally {
                    pendingWrite = null;
                    transactionObserved = false;
                    activeRevision = null;
                    if (entered) {
                        try {
                            clock.advance(0);
                        }
                        finally {
                            muting--;
                        }
                    }
                }
                if (outcome.status === 'changed')
                    emit('execute');
                return outcome;
            },
        },
        execute(_label, writes, effect) { const reason = refusal(); if (reason)
            return { status: 'rejected', message: reason }; if (effect)
            return { status: 'rejected', message: 'Les effets HTML exigent une transaction hôte atomique encore indisponible.' }; return writes.length ? { status: 'rejected', message: 'Ce pont réel vérifie les composants de dégradé ; les déclarations CSS et ajustements spatiaux r3 nécessitent une correspondance explicite.' } : { status: 'unchanged' }; },
        undo() { const reason = refusal(); if (reason)
            return { status: 'rejected', message: reason }; muting++; let changed: boolean; try {
            changed = editor.undo();
            clock.advance(0);
        }
        finally {
            muting--;
        } if (changed)
            emit('undo'); return { status: changed ? 'changed' : 'unchanged' }; },
        redo() { const reason = refusal(); if (reason)
            return { status: 'rejected', message: reason }; muting++; let changed: boolean; try {
            changed = editor.redo();
            clock.advance(0);
        }
        finally {
            muting--;
        } if (changed)
            emit('redo'); return { status: changed ? 'changed' : 'unchanged' }; },
        selectObject(id) { if (disposed)
            return; if (id === null)
            selection.clear();
        else if (id === layerId)
            selection.select([id], 'replace'); },
        onChange(listener) { if (disposed)
            return () => { }; listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    subscriptions.push(editor.on('document:changed', event => {
        if (transactionObserved) {
            if (!pendingWrite)
                unexpectedWrite = true;
            else {
                pendingWrite.events++;
                if (pendingWrite.events !== 1 || event.cause !== 'execute' || event.previous !== pendingWrite.before)
                    unexpectedWrite = true;
                pendingWrite.document = event.document;
            }
        }
        if (!muting)
        emit(event.cause === 'undo' || event.cause === 'redo' ? event.cause : 'execute'); }), editor.on('layers:selectionChanged', () => emit('selection')), editor.onFrame(sample => { if (sample.time.frame === lastFrame)
        return; lastFrame = sample.time.frame; emit('frame'); }));
    return { editor, adapter, stage: metadata, navigate(frame) { if (disposed)
            return; editor.playback.seek(frame); clock.advance(0); }, advance(milliseconds) { if (!disposed)
            clock.advance(milliseconds); }, dispose() { if (disposed)
            return; lastState = getState(); disposed = true; for (const unsubscribe of subscriptions)
            unsubscribe(); listeners.clear(); editor.destroy(); } };
}
