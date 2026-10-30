// fixtures/recorded-timeline.ts
// TEST/DEMO ONLY. Recorded samples, no interpolation or general key evaluation.
import type { EvaluatedValues, MutationResult, PropertyWrite, ReversibleEffect, TimelineAdapter, TimelineObject, TimelineReason, TimelineState } from '../packages/designer/src/timeline-adapter.js';

interface Snapshot { readonly objects: readonly TimelineObject[]; readonly keys: readonly PropertyWrite[] }
interface Entry { readonly before: Snapshot; readonly after: Snapshot; readonly effect: ReversibleEffect | undefined }
export interface RecordedTimeline extends TimelineAdapter {
  navigate(frame: number): void;
  getKeys(): readonly PropertyWrite[];
  readonly listenerCount: number;
}
export interface RecordedOptions { readonly reference?: boolean }

export function createRecordedTimeline(options: RecordedOptions = {}): RecordedTimeline {
  let frame = 1;
  let selectedObjectId: string | null = null;
  let snapshot: Snapshot = options.reference ? {
    objects: [{ id: 'group', selector: '.button' }, { id: 'specific', selector: '#button-2' }],
    keys: [
      { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
      { objectId: 'specific', selector: '#button-2', property: 'opacity', value: '0.8', frame: 50 },
    ],
  } : { objects: [], keys: [] };
  const undoStack: Entry[] = [];
  const redoStack: Entry[] = [];
  const listeners = new Set<(reason: TimelineReason) => void>();
  const emit = (reason: TimelineReason): void => { for (const listener of listeners) listener(reason); };
  const recordedFrames = new Set([1, 20, 49, 50, 75, 100]);
  const getValues = (): EvaluatedValues => {
    const values: Record<string, Record<string, string>> = options.reference && recordedFrames.has(frame)
      ? { group: { opacity: '0.5' }, specific: { opacity: '0.8' } } : {};
    // Edits affect ONLY the exact edited frame in this deliberately limited fake.
    for (const key of snapshot.keys.filter(key => key.frame === frame)) {
      values[key.objectId] = { ...values[key.objectId], [key.property]: key.value };
    }
    return values;
  };
  return {
    kind: 'simulation', contractRevision: 'HA-TL-001/r1',
    get listenerCount(): number { return listeners.size; },
    getState(): TimelineState { return { frame, duration: 100, ...snapshot, values: getValues(), selectedObjectId, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }; },
    getKeys(): readonly PropertyWrite[] { return snapshot.keys.map(key => ({ ...key })); },
    execute(_label, writes, effect): MutationResult {
      if (!writes.length && !effect) return { status: 'unchanged' };
      const objects = [...snapshot.objects];
      let keys = [...snapshot.keys];
      for (const write of writes) {
        if (!objects.some(object => object.id === write.objectId)) objects.push({ id: write.objectId, selector: write.selector });
        keys = [...keys.filter(key => !(key.objectId === write.objectId && key.property === write.property && key.frame === write.frame)), { ...write }];
      }
      const entry: Entry = { before: snapshot, after: { objects, keys }, effect };
      effect?.redo();
      snapshot = entry.after; undoStack.push(entry); redoStack.length = 0;
      emit('execute'); return { status: 'changed' };
    },
    undo(): MutationResult {
      const entry = undoStack.pop(); if (!entry) return { status: 'unchanged' };
      entry.effect?.undo(); snapshot = entry.before; redoStack.push(entry); emit('undo'); return { status: 'changed' };
    },
    redo(): MutationResult {
      const entry = redoStack.pop(); if (!entry) return { status: 'unchanged' };
      entry.effect?.redo(); snapshot = entry.after; undoStack.push(entry); emit('redo'); return { status: 'changed' };
    },
    selectObject(objectId): void { selectedObjectId = objectId; emit('selection'); },
    navigate(nextFrame): void {
      if (!Number.isInteger(nextFrame) || nextFrame < 1 || nextFrame > 100) throw new Error('Image hors scénario.');
      frame = nextFrame; emit('frame');
    },
    onChange(listener): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
