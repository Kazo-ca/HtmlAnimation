// fixtures/gradient-timeline.ts
// TEST/DEMO ONLY. Exact samples and exact-frame writes; never hold/interpolation.
import { applyGradientEdits, cloneGradientDefinitions, gradientCss, readGradientComponent } from '@kazo-ca/css-properties';
import type { GradientComponent, GradientDefinition, GradientEdit, GradientType, GradientValue } from '@kazo-ca/css-properties';
import { createRecordedTimeline } from './recorded-timeline.js';
import type { RecordedTimeline } from './recorded-timeline.js';
import { gradientFixtureDefinition } from './gradient-scene.js';
import type { GradientCapability, GradientRequest, GradientSnapshot, GradientTrack, PropertyWrite } from '../packages/designer/src/index.js';

const objectId = 'gradient-object'; const selector = '#gradient-box';
const geometry: readonly GradientComponent[] = ['type', 'angle', 'centerX', 'centerY', 'radiusX', 'radiusY'];
const components: readonly GradientComponent[] = ['color', 'opacity', 'position', 'present'];
function property(edit: Pick<GradientEdit, 'gradientId' | 'stopId' | 'component'>): string { return `g${edit.gradientId}${edit.stopId ?? 'Geometry'}${edit.component}`; }
export interface GradientTimeline extends RecordedTimeline { readonly gradients: GradientCapability }
export function createGradientTimeline(type: GradientType = 'linear'): GradientTimeline {
  let definitions: readonly GradientDefinition[] = [gradientFixtureDefinition(type)]; let nextId = 1;
  const timeline = createRecordedTimeline({ initialKeys: [{ objectId, selector, property: 'gmainmiddleposition', frame: 50, value: '60' }] });
  const bindings = (): readonly GradientTrack[] => definitions.flatMap(gradient => [
    ...geometry.map(component => ({ property: property({ gradientId: gradient.id, component }), gradientId: gradient.id, component, editable: true, interpolable: component !== 'type' })),
    ...gradient.stops.flatMap(stop => components.map(component => ({ property: property({ gradientId: gradient.id, stopId: stop.id, component }), gradientId: gradient.id, stopId: stop.id, component, editable: true, interpolable: component !== 'present' }))),
  ]);
  // The future runtime supplies evaluated values; these authored samples are deliberately limited.
  const samples: Readonly<Record<number, readonly GradientEdit[]>> = {
    1: [], 20: [], 49: [],
    50: [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 60 }],
    75: [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 60 }],
    100: [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 60 }],
  };
  const evaluated = (): readonly GradientDefinition[] => {
    const state = timeline.getState(); const keys = timeline.getKeys(); const known = bindings();
    const writes: GradientEdit[] = [];
    for (const key of keys.filter(key => key.objectId === objectId && key.frame === state.frame)) {
      const binding = known.find(candidate => candidate.property === key.property); if (!binding) continue;
      const value: unknown = JSON.parse(key.value);
      // Values originate solely in the validated commands of this fixture.
      writes.push({ gradientId: binding.gradientId, ...(binding.stopId ? { stopId: binding.stopId } : {}), component: binding.component, value: value as GradientValue });
    }
    return applyGradientEdits(applyGradientEdits(definitions, samples[state.frame] ?? []), writes);
  };
  const read = (id: string): GradientSnapshot | null => {
    if (id !== objectId) return null;
    const state = timeline.getState(); const keys = timeline.getKeys();
    return { revision: JSON.stringify([definitions, keys, state.frame]), objectId, selector, definitions: cloneGradientDefinitions(definitions), gradients: evaluated(), editable: true,
      tracks: bindings().filter(binding => keys.some(key => key.objectId === objectId && key.property === binding.property)) };
  };
  const validateRequest = (request: GradientRequest): GradientSnapshot => {
    const snapshot = read(request.objectId);
    if (!snapshot || request.revision !== snapshot.revision || request.frame !== timeline.getState().frame) throw new Error('Le contexte du dégradé a changé. Recommencez la modification.');
    return snapshot;
  };
  const declarations = (gradients: readonly GradientDefinition[]): Readonly<Record<string, string>> => ({ 'background-image': gradients.map(gradientCss).join(', ') });
  const gradients: GradientCapability = {
    read,
    compose(request) {
      try {
        const snapshot = validateRequest(request);
        if (request.intent.kind !== 'edit') return { status: 'rejected', message: 'Validez les valeurs du nouveau point pour l’ajouter.' };
        const result = applyGradientEdits(snapshot.gradients, request.intent.changes);
        return { status: 'composed', gradients: result, declarations: declarations(result) };
      } catch (error) { return { status: 'rejected', message: error instanceof Error ? error.message : 'Dégradé non valide.' }; }
    },
    execute(request, isCurrent) {
      try {
        const snapshot = validateRequest(request); if (!isCurrent()) throw new Error('La sélection ou l’image a changé.');
        let afterDefinitions = definitions; let changes: readonly GradientEdit[];
        if (request.intent.kind === 'add-stop') {
          const intent = request.intent; const gradient = snapshot.gradients.find(candidate => candidate.id === intent.gradientId);
          if (!gradient) throw new Error('Dégradé introuvable.');
          const id = `added${nextId}`;
          const stop = { id, color: { ...intent.color }, opacity: intent.opacity, position: intent.position, present: false };
          const base = definitions.find(candidate => candidate.id === gradient.id); if (!base) throw new Error('Structure initiale introuvable.');
          const index = base.stops.findIndex(candidate => candidate.position > stop.position);
          const stops = [...base.stops]; stops.splice(index < 0 ? stops.length : index, 0, stop);
          afterDefinitions = definitions.map(candidate => candidate.id === base.id ? { ...candidate, stops } : candidate);
          changes = [
            { gradientId: base.id, stopId: id, component: 'color', value: stop.color }, { gradientId: base.id, stopId: id, component: 'opacity', value: stop.opacity },
            { gradientId: base.id, stopId: id, component: 'position', value: stop.position }, { gradientId: base.id, stopId: id, component: 'present', value: true },
          ];
          // Validate structure and the current sample together, before mutating either.
          const combined = afterDefinitions.map(candidate => candidate.id === base.id ? { ...candidate, stops: candidate.stops.map(point => gradient.stops.find(existing => existing.id === point.id) ?? point) } : candidate);
          declarations(applyGradientEdits(combined, changes));
        } else {
          changes = request.intent.changes.filter(change => JSON.stringify(readGradientComponent(snapshot.gradients, change)) !== JSON.stringify(change.value));
          declarations(applyGradientEdits(snapshot.gradients, changes));
        }
        if (!changes.length) return { status: 'unchanged' };
        if (!isCurrent() || read(objectId)?.revision !== snapshot.revision) throw new Error('Le contexte a changé pendant la validation.');
        const writes: readonly PropertyWrite[] = changes.map(change => ({ objectId, selector, property: property(change), value: JSON.stringify(change.value), frame: request.frame }));
        const receipt = changes.map(change => ({ ...change, ...(typeof change.value === 'object' ? { value: { ...change.value } } : {}) }));
        const before = definitions; const after = cloneGradientDefinitions(afterDefinitions);
        const result = timeline.execute('Change structured gradient', writes, { redo: () => { definitions = after; }, undo: () => { definitions = before; } });
        if (result.status === 'changed' && request.intent.kind === 'add-stop') nextId++;
        return result.status === 'changed' ? { status: 'changed', changes: receipt } : result.status === 'rejected' ? result : { status: 'unchanged' };
      } catch (error) { return { status: 'rejected', message: error instanceof Error ? error.message : 'Modification du dégradé refusée.' }; }
    },
  };
  return {
    ...timeline, gradients,
    get listenerCount(): number { return timeline.listenerCount; },
    getState() {
      const state = timeline.getState(); const names = new Set(bindings().map(binding => binding.property));
      const values = Object.fromEntries(Object.entries(state.values[objectId] ?? {}).filter(([name]) => !names.has(name)));
      return { ...state, values: { ...state.values, [objectId]: { ...values, ...declarations(evaluated()) } } };
    },
  };
}
