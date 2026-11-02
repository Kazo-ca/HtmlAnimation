// integration/conflict-bridge.ts
import type { EditorTransactionResult, IHtmlConflictTransactionRequest, PropertyTimelineOperation } from '@kazo-ca/timeline-editor';
import type { HtmlBeforeFirstPolicy, IHtmlResolutionDiagnostic, IHtmlStage, ILayer } from '@kazo-ca/timeline-runtime';
import type { ConflictCapability, ConflictChoice, ConflictDiagnostic, ConflictSnapshot } from '../packages/designer/src/conflict-types.js';
import type { MutationResult } from '../packages/designer/src/timeline-adapter.js';
import { formatCssText } from './css-mappings.js';

/** Bridge services the HA10 mapping needs; it never reads private Timeline state. */
export interface ConflictBridgeHost {
    readonly stage: Pick<IHtmlStage, 'id' | 'diagnostics' | 'animationContext'>;
    findLayer(id: string): ILayer | undefined;
    revision(): string;
    /** Shared refusal, fault latch, flush and notification path of the bridge. */
    run(execute: () => EditorTransactionResult): MutationResult;
    resolveHtmlConflict(request: IHtmlConflictTransactionRequest): EditorTransactionResult;
}
/** Adapter-owned choice plus the exact native request it confirms. */
interface PlannedChoice {
    readonly choice: ConflictChoice;
    readonly winnerLayerId: string;
    readonly beforeFirst?: HtmlBeforeFirstPolicy;
    readonly properties: readonly Extract<PropertyTimelineOperation, { kind: 'set' }>[];
}
const policyLabels: Readonly<Record<HtmlBeforeFirstPolicy, string>> = {
    initial: 'avant sa première clé, valeur source',
    'first-key': 'avant sa première clé, valeur de cette clé',
    underlying: 'avant sa première clé, contribution sous-jacente',
};

function selectorOf(layer: ILayer | undefined): string | undefined {
    return layer?.target && 'selector' in layer.target ? layer.target.selector : undefined;
}

export function createConflictCapability(host: ConflictBridgeHost): ConflictCapability {
    let confirming: string | undefined;
    /** CSS destination of the contributions, so the Designer matches its own property names. */
    const cssProperty = (diagnostic: IHtmlResolutionDiagnostic): string => {
        const names = new Set((diagnostic.contributions ?? []).map(contribution => {
            const binding = host.stage.animationContext.bindings?.[contribution.layerId]?.[contribution.property];
            return binding?.kind === 'style' ? binding.cssName : contribution.property;
        }));
        const [name] = names;
        return names.size === 1 && name !== undefined ? name : diagnostic.property;
    };
    /** Choice A: the winner's own first key, announced at the conflict start, never an invented value. */
    const startingKey = (diagnostic: IHtmlResolutionDiagnostic, winner: string, target: string): PlannedChoice | undefined => {
        // A single winner contribution only: one announced key must cover the whole winning side.
        const owned = (diagnostic.contributions ?? []).filter(candidate => candidate.layerId === winner);
        const contribution = owned.length === 1 ? owned[0] : undefined;
        const binding = contribution && host.stage.animationContext.bindings?.[winner]?.[contribution.property];
        const track = contribution && host.findLayer(winner)?.propertyTimelines?.[contribution.property];
        const first = track?.keys[0];
        if (!contribution || binding?.kind !== 'style' || !track || !first || first.frame <= diagnostic.fromFrame) return undefined;
        const value = formatCssText(first.value);
        return {
            choice: { id: JSON.stringify(['start-key', winner]), label: `Priorité à « ${target} » et valeur dès l’image ${diagnostic.fromFrame} (A)`, description: `Fixer explicitement la priorité de ${target} et créer sa clé ${binding.cssName} à l’image ${diagnostic.fromFrame} : ${value}, la valeur de sa première clé. Le choix et la clé s’annulent ensemble.`, winnerObjectId: winner, createsKeys: [{ objectId: winner, selector: target, property: binding.cssName, value, frame: diagnostic.fromFrame }] },
            winnerLayerId: winner,
            properties: [{ kind: 'set', layerId: winner, property: contribution.property, frame: diagnostic.fromFrame, value: first.value, initialValue: track.initialValue }],
        };
    };
    const plan = (diagnostic: IHtmlResolutionDiagnostic): readonly PlannedChoice[] => diagnostic.contributions?.length ? diagnostic.choices.flatMap(winner => {
        const target = selectorOf(host.findLayer(winner)) ?? winner;
        const policies: readonly (HtmlBeforeFirstPolicy | undefined)[] = diagnostic.policies?.length ? diagnostic.policies : [undefined];
        const priorities = policies.map((policy): PlannedChoice => ({
            choice: { id: JSON.stringify(['priority', winner, policy ?? null]), label: `Priorité à « ${target} »${policy ? `, ${policyLabels[policy]}` : ''}`, description: `Utiliser la contribution de ${target} sur l’intervalle en conflit, images ${diagnostic.fromFrame} à ${diagnostic.toFrame}. Aucune clé n’est ajoutée.`, winnerObjectId: winner, createsKeys: [] },
            winnerLayerId: winner,
            ...(policy ? { beforeFirst: policy } : {}),
            properties: [],
        }));
        const extra = diagnostic.policies?.length ? undefined : startingKey(diagnostic, winner, target);
        return extra ? [...priorities, extra] : priorities;
    }) : [];
    const blocking = (): readonly IHtmlResolutionDiagnostic[] => host.stage.diagnostics.filter(diagnostic => diagnostic.blocking);
    const read = (): ConflictSnapshot => {
        const diagnostics = blocking().map((diagnostic): ConflictDiagnostic => ({
            id: diagnostic.id, signature: diagnostic.signature, code: diagnostic.code, property: cssProperty(diagnostic), message: diagnostic.message,
            objectIds: [...diagnostic.layerIds], targets: [...diagnostic.targets], affectedTargets: [...diagnostic.targets],
            fromFrame: diagnostic.fromFrame, toFrame: diagnostic.toFrame, toFrameExclusive: diagnostic.toFrameExclusive ?? false, blocking: true,
            choices: plan(diagnostic).map(planned => planned.choice),
        }));
        // Timeline saves winner and policy only; a decision maps back to its priority choice id.
        const resolutions = (host.stage.animationContext.resolutions ?? []).map(resolution => ({
            conflictId: resolution.conflictId, signature: resolution.signature, winnerObjectId: resolution.winnerLayerId,
            choiceId: JSON.stringify(['priority', resolution.winnerLayerId, resolution.beforeFirst ?? null]),
        }));
        return { revision: confirming ?? host.revision(), diagnostics, resolutions };
    };
    return {
        read,
        resolve(request, isCurrent) {
            if (request.revision !== host.revision()) return { status: 'rejected', message: 'Le contexte a changé depuis l’ouverture de ce conflit. Ouvrez une nouvelle résolution.' };
            const diagnostic = blocking().find(candidate => candidate.id === request.id);
            if (!diagnostic || diagnostic.signature !== request.signature) return { status: 'rejected', message: 'Ce conflit n’est plus actuel. Ouvrez une nouvelle résolution.' };
            const planned = plan(diagnostic).find(candidate => candidate.choice.id === request.choiceId);
            if (!planned) return { status: 'rejected', message: 'Ce choix n’est pas proposé pour ce conflit.' };
            if (!isCurrent()) return { status: 'rejected', message: 'La confirmation n’est plus actuelle.' };
            // Timeline revalidates the guard against its own final candidate. Only inside that guard
            // call does the snapshot report the confirmed revision; notifications see the live one.
            const confirmed = (): boolean => {
                confirming = request.revision;
                try { return isCurrent(); } finally { confirming = undefined; }
            };
            return host.run(() => host.resolveHtmlConflict({
                label: planned.properties.length ? 'Resolve HTML conflict with starting key' : 'Resolve HTML conflict',
                stageId: host.stage.id, confirmation: { id: diagnostic.id, signature: diagnostic.signature }, winnerLayerId: planned.winnerLayerId,
                ...(planned.beforeFirst ? { beforeFirst: planned.beforeFirst } : {}),
                ...(planned.properties.length ? { properties: planned.properties } : {}),
                isCurrent: confirmed,
            }));
        },
    };
}
