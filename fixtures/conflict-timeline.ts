// fixtures/conflict-timeline.ts
// TEST/DEMO ONLY: explicit prerecorded samples, never a temporal evaluator.
import { createRecordedTimeline } from './recorded-timeline.js';
import type { RecordedTimeline } from './recorded-timeline.js';
import type { ConflictCapability, ConflictResolution, ConflictSnapshot, EvaluatedValues, MutationResult, PropertyWrite } from '../packages/designer/src/index.js';

export type ConflictVariant = 'priority' | 'start-key' | 'stale';
export interface ConflictTimeline extends RecordedTimeline {
  readonly conflicts: ConflictCapability;
  invalidateContribution(): MutationResult;
}
export function createConflictTimeline(variant: ConflictVariant = 'priority'): ConflictTimeline {
  const initialKeys: readonly PropertyWrite[] = [
    { objectId: 'tone', selector: '.tone', property: 'opacity', value: '0.35', frame: 1 },
    { objectId: 'tone', selector: '.tone', property: 'color', value: 'rgb(35, 85, 70)', frame: 1 },
    { objectId: 'accent', selector: '.accent', property: 'opacity', value: '0.75', frame: variant === 'start-key' ? 50 : 1 },
    { objectId: 'accent', selector: '.accent', property: 'background-color', value: 'rgb(230, 210, 180)', frame: 1 },
    { objectId: 'specific', selector: '#button-2', property: 'opacity', value: '0.9', frame: 1 },
  ];
  const recorded: EvaluatedValues = { tone: { opacity: '0.35', color: 'rgb(35, 85, 70)' }, accent: { opacity: '0.75', 'background-color': 'rgb(230, 210, 180)' }, specific: { opacity: '0.9' } };
  const beforeStart: EvaluatedValues = { ...recorded, accent: { 'background-color': 'rgb(230, 210, 180)' } };
  const samples = variant === 'start-key' ? { 1: beforeStart, 20: beforeStart, 49: beforeStart, 50: recorded, 75: recorded, 100: recorded } : Object.fromEntries([1, 20, 49, 50, 75, 100].map(frame => [frame, recorded]));
  // Separate authored outcomes for the advertised A decision, not evaluation of its key.
  const acceptedStartSamples: Readonly<Record<number, EvaluatedValues>> = { 1: recorded, 20: recorded, 49: recorded };
  const timeline = createRecordedTimeline({ initialKeys, samples });
  let resolutions: readonly ConflictResolution[] = [];
  let changedContribution = false;
  const read = (): ConflictSnapshot => {
    // Deliberately scripted signature: unrelated color edits do not invalidate opacity.
    // The announced starting key is part of the same advertised resolution ticket.
    const keys = timeline.getKeys().filter(key => key.property === 'opacity' && !(variant === 'start-key' && key.objectId === 'accent' && key.frame === 1 && key.value === '0.75'));
    const signature = JSON.stringify([variant, changedContribution, keys]);
    const opacity = changedContribution ? '65' : '75';
    return { revision: JSON.stringify([signature, resolutions]), resolutions: resolutions.map(resolution => ({ ...resolution })),
      diagnostics: [{ id: 'opacity-priority', signature, code: variant === 'start-key' ? 'scripted-start-and-priority' : 'equal-specificity', property: 'opacity',
        message: variant === 'start-key' ? 'Le choix doit fixer la priorité et annoncer toute clé de départ. Une clé seule ne départage pas les classes.' : 'Deux classes de même spécificité imposent des opacités différentes. L’ordre des lignes ne les départage pas.',
        objectIds: ['tone', 'accent'], targets: ['.tone', '.accent'], affectedTargets: ['#button-1'], fromFrame: 1, toFrame: 100, toFrameExclusive: false, blocking: true,
        choices: [
          { id: 'tone-wins', label: 'Priorité à .tone', description: 'Sur #button-1, utiliser la contribution évaluée de .tone (35 % dans les échantillons). Les autres propriétés et le bouton 2 restent inchangés.', winnerObjectId: 'tone', createsKeys: [] },
          { id: variant === 'start-key' ? 'accent-from-start' : 'accent-wins', label: variant === 'start-key' ? 'Priorité à .accent et valeur dès le début (A)' : 'Priorité à .accent', description: variant === 'start-key' ? 'Fixer explicitement la priorité de .accent sur #button-1 et créer sa clé d’opacité à l’image 1 : 0.75. Le choix et la clé s’annulent ensemble.' : `Sur #button-1, utiliser la contribution évaluée de .accent (${opacity} % dans les échantillons). Aucune clé n’est ajoutée.`, winnerObjectId: 'accent', createsKeys: variant === 'start-key' ? [{ objectId: 'accent', selector: '.accent', property: 'opacity', value: '0.75', frame: 1 }] : [] },
        ] }],
    };
  };
  const getState: RecordedTimeline['getState'] = () => {
    const state = timeline.getState();
    const hasExactKey = timeline.getKeys().some(key => key.objectId === 'accent' && key.property === 'opacity' && key.frame === state.frame);
    if (variant === 'start-key' && !hasExactKey) {
      const snapshot = read();
      const accepted = snapshot.resolutions.some(resolution => resolution.choiceId === 'accent-from-start' && resolution.signature === snapshot.diagnostics[0]?.signature);
      const sample = accepted ? acceptedStartSamples[state.frame]?.accent : undefined;
      if (sample?.opacity !== undefined) return { ...state, values: { ...state.values, accent: { ...state.values.accent, opacity: sample.opacity } } };
    }
    return changedContribution && !hasExactKey && state.values.accent?.opacity !== undefined ? { ...state, values: { ...state.values, accent: { ...state.values.accent, opacity: '0.65' } } } : state;
  };
  return {
    ...timeline, getState,
    get listenerCount(): number { return timeline.listenerCount; },
    conflicts: {
      read,
      resolve(request, isCurrent): MutationResult {
        const snapshot = read(); const diagnostic = snapshot.diagnostics.find(candidate => candidate.id === request.id);
        const choice = diagnostic?.choices.find(candidate => candidate.id === request.choiceId);
        if (!isCurrent() || snapshot.revision !== request.revision || diagnostic?.signature !== request.signature || !choice) return { status: 'rejected', message: 'Le diagnostic a changé. Ouvrez une nouvelle résolution.' };
        const next = { conflictId: request.id, signature: request.signature, choiceId: choice.id, winnerObjectId: choice.winnerObjectId };
        if (resolutions.some(resolution => JSON.stringify(resolution) === JSON.stringify(next))) return { status: 'unchanged' };
        const before = resolutions; const after = [...before.filter(resolution => resolution.conflictId !== request.id), next];
        if (!isCurrent() || read().revision !== snapshot.revision) return { status: 'rejected', message: 'Le contexte a changé pendant la confirmation.' };
        return timeline.execute('Resolve recorded HTML conflict', choice.createsKeys, { redo: () => { resolutions = after; }, undo: () => { resolutions = before; } });
      },
    },
    invalidateContribution(): MutationResult {
      if (changedContribution) return { status: 'unchanged' };
      const writes = initialKeys.filter(key => key.objectId === 'accent' && key.property === 'opacity').map(key => ({ ...key, value: '0.65' }));
      return timeline.execute('Change recorded contribution', writes, { redo: () => { changedContribution = true; }, undo: () => { changedContribution = false; } });
    },
  };
}
