// packages/designer/src/conflict-types.ts
import type { MutationResult, PropertyWrite } from './timeline-adapter.js';

/** Local HA-ADAPTER-001/r3 proposal, not the published Timeline/HA4 schema. */
export interface ConflictChoice {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly winnerObjectId: string;
  readonly createsKeys: readonly PropertyWrite[];
}
export interface ConflictDiagnostic {
  readonly id: string;
  readonly signature: string;
  readonly code: string;
  readonly property: string;
  readonly message: string;
  readonly objectIds: readonly string[];
  readonly targets: readonly string[];
  readonly affectedTargets: readonly string[];
  readonly fromFrame: number;
  readonly toFrame: number;
  readonly toFrameExclusive: boolean;
  readonly blocking: boolean;
  readonly choices: readonly ConflictChoice[];
}
export interface ConflictResolution {
  readonly conflictId: string;
  readonly signature: string;
  readonly choiceId: string;
  readonly winnerObjectId: string;
}
export interface ConflictSnapshot {
  /** Opaque adapter revision covering the current diagnostic and project context. */
  readonly revision: string;
  readonly diagnostics: readonly ConflictDiagnostic[];
  readonly resolutions: readonly ConflictResolution[];
}
export interface ConflictRequest {
  readonly id: string;
  readonly signature: string;
  readonly choiceId: string;
  readonly revision: string;
}
export interface ConflictCapability {
  read(): ConflictSnapshot;
  /** Guard before and after host validation; commit through the shared history. */
  resolve(request: ConflictRequest, isCurrent: () => boolean): MutationResult;
}
