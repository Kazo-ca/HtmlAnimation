// packages/designer/src/gradient-types.ts
import type { GradientComponent, GradientDefinition, GradientEdit, GradientIntent } from '@kazo-ca/css-properties';

/** HA-ADAPTER-001/r4 local proposal, distinct from HA4's published type names. */
export interface GradientTrack {
  readonly property: string;
  readonly gradientId: string;
  readonly stopId?: string;
  readonly component: GradientComponent;
  readonly editable: boolean;
  readonly interpolable: boolean;
  readonly reason?: string;
}
export interface GradientSnapshot {
  readonly revision: string;
  readonly objectId: string;
  readonly selector: string;
  /** Original structural definitions for project persistence, never evaluated keys. */
  readonly definitions: readonly GradientDefinition[];
  readonly gradients: readonly GradientDefinition[];
  /** Only explicitly recorded component tracks, grouped under Dégradé by the host. */
  readonly tracks: readonly GradientTrack[];
  readonly editable: boolean;
  readonly reason?: string;
  readonly canAddStop?: boolean;
  readonly structureReason?: string;
}
export interface GradientRequest {
  readonly objectId: string;
  readonly revision: string;
  readonly frame: number;
  readonly intent: GradientIntent;
}
export type GradientComposition = { readonly status: 'composed'; readonly gradients: readonly GradientDefinition[]; readonly declarations: Readonly<Record<string, string>> } | { readonly status: 'rejected'; readonly message: string };
export type GradientMutationResult = { readonly status: 'changed'; readonly changes: readonly GradientEdit[] } | { readonly status: 'rejected' | 'faulted'; readonly message: string } | { readonly status: 'unchanged' };
export interface GradientCapability {
  read(objectId: string): GradientSnapshot | null;
  /** Pure current-value composition, without keys, interpolation or history. */
  compose(request: GradientRequest): GradientComposition;
  /** Context/bindings and component keys must commit or roll back together. */
  execute(request: GradientRequest, isCurrent: () => boolean): GradientMutationResult;
}
