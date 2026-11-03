// packages/designer/src/timeline-adapter.ts
import type { ConflictCapability } from './conflict-types.js';
import type { GradientCapability } from './gradient-types.js';
import type { DomPreviewOwner } from './dom-preview.js';
/** Local consumer boundary HA-ADAPTER-001/r6; not a published Timeline API. */
export type MutationResult = { readonly status: 'changed' | 'unchanged' } | { readonly status: 'rejected' | 'faulted'; readonly message: string };
export interface TimelineObject { readonly id: string; readonly selector: string }
export type EvaluatedValues = Readonly<Record<string, Readonly<Record<string, string>>>>;
export interface TimelineState {
  /** Uncertain compensation: this Designer instance must not resume mutations. */
  readonly fault?: string;
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
export type HistoryDirection = 'execute' | 'undo' | 'redo';
export interface PreparedEffect {
  readonly changed: boolean;
  apply(): void;
  /** Restore the exact capture, including a partially applied effect. */
  rollback(): void;
}
export interface ReversibleEffect {
  redo(): void;
  undo(): void;
  /** Pure capture for an atomic host participant; old adapters may omit support. */
  prepare?(direction: HistoryDirection): PreparedEffect;
}
/** Resolved declarations of a proposed geometry state; never keys, history or a document change. */
export type GeometryComposition = { readonly status: 'composed'; readonly declarations: Readonly<Record<string, string>> } | { readonly status: 'rejected'; readonly message: string };
export type TimelineReason = 'frame' | 'selection' | 'execute' | 'undo' | 'redo' | 'preview' | 'cancel';
export interface TimelineAdapter {
  readonly kind: 'simulation' | 'real';
  readonly contractRevision: 'HA-TL-001/r1' | 'HA-TL-001/r2';
  readonly conflicts?: ConflictCapability;
  readonly gradients?: GradientCapability;
  /**
   * HA11: geometry field writes are source-relative adjustments the adapter maps and renders
   * through its shared preview owner. Canvas handles still need a live gesture preview.
   */
  readonly spatialGeometry?: boolean;
  /** HA11 live handle preview for one target, composed exactly as a committed key would render. */
  composeGeometry?(objectId: string, selector: string, values: Readonly<Record<string, string>>): GeometryComposition;
  /** Shared writer created before Editor; committed rendering precedes every host observation. */
  readonly preview?: DomPreviewOwner;
  getState(): TimelineState;
  execute(label: string, writes: readonly PropertyWrite[], effect?: ReversibleEffect): MutationResult;
  undo(): MutationResult;
  redo(): MutationResult;
  selectObject(objectId: string | null): void;
  onChange(listener: (reason: TimelineReason) => void): () => void;
}
