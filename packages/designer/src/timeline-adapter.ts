// packages/designer/src/timeline-adapter.ts
/** Local consumer boundary HA-ADAPTER-001/r1; not a published Timeline API. */
export type MutationResult = { readonly status: 'changed' | 'unchanged' } | { readonly status: 'rejected'; readonly message: string };
export interface TimelineObject { readonly id: string; readonly selector: string }
export type EvaluatedValues = Readonly<Record<string, Readonly<Record<string, string>>>>;
export interface TimelineState {
  readonly frame: number;
  readonly duration: number;
  readonly objects: readonly TimelineObject[];
  readonly values: EvaluatedValues;
  readonly selectedObjectId: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
export interface PropertyWrite {
  readonly objectId: string;
  readonly selector: string;
  readonly property: string;
  readonly value: string;
  readonly frame: number;
}
export interface ReversibleEffect { redo(): void; undo(): void }
export type TimelineReason = 'frame' | 'selection' | 'execute' | 'undo' | 'redo';
export interface TimelineAdapter {
  readonly kind: 'simulation' | 'real';
  readonly contractRevision: 'HA-TL-001/r1';
  getState(): TimelineState;
  execute(label: string, writes: readonly PropertyWrite[], effect?: ReversibleEffect): MutationResult;
  undo(): MutationResult;
  redo(): MutationResult;
  selectObject(objectId: string | null): void;
  onChange(listener: (reason: TimelineReason) => void): () => void;
}
