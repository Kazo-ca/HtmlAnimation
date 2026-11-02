// packages/designer/src/project/types.ts
import type { DocumentChange } from '../events.js';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject { readonly [name: string]: JsonValue }

/** The host resolves this identity against its original HTML/CSS before opening. */
export interface ProjectSourceReference { readonly id: string; readonly revision: string }
export interface ProjectProvenance {
  readonly kind: 'real' | 'simulation';
  readonly adapterRevision: string;
  readonly timelineReference: string;
}
/** Authoring data, distinct from per-frame playback dictionaries and DOM previews. */
export interface EditableProject {
  readonly format: 'html-animation-project';
  readonly version: 1;
  readonly source: ProjectSourceReference;
  readonly timeline: JsonObject;
  readonly htmlContext: JsonObject;
  readonly documentChanges: readonly DocumentChange[];
  readonly provenance: ProjectProvenance;
  readonly metadata?: JsonObject;
}
export interface ProjectIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}
/** Native validation belongs to the host; no Timeline dependency is required here. */
export interface ProjectValidationPorts {
  validateTimeline(document: JsonObject): readonly ProjectIssue[];
  validateHtmlContext(context: JsonObject, document: JsonObject): readonly ProjectIssue[];
}
export interface ProjectCodecLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
}
export type ProjectValidationResult =
  | { readonly status: 'valid'; readonly project: EditableProject; readonly warnings: readonly ProjectIssue[] }
  | { readonly status: 'invalid'; readonly issues: readonly ProjectIssue[] };

export class ProjectValidationError extends Error {
  public readonly issues: readonly ProjectIssue[];
  public constructor(issues: readonly ProjectIssue[]) {
    super(issues[0]?.message ?? 'Le projet éditable n’est pas valide.');
    this.name = 'ProjectValidationError';
    this.issues = Object.freeze(issues.map(issue => Object.freeze({ ...issue })));
  }
}
