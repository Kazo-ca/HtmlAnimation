// packages/designer/src/project/rehydration.ts
import type { DomPreviewOwner } from '../dom-preview.js';
import type { DocumentChange } from '../events.js';
import type { HistoryDirection } from '../timeline-adapter.js';
import { cloneProjectJson } from './json-data.js';
import type { EditableProject, JsonObject, ProjectSourceReference, ProjectValidationPorts } from './types.js';

/** Source identity is verified by the host before this state is installed. */
export interface ProjectProfile {
  readonly source: ProjectSourceReference;
  readonly metadata?: JsonObject;
}
export interface ProjectState extends ProjectProfile {
  readonly documentChanges: readonly DocumentChange[];
}
/** The host has mounted its pristine source, checked paths and applied the journal. */
export interface ProjectRehydrationState {
  readonly project: EditableProject;
  readonly preview: DomPreviewOwner;
  readonly validation: ProjectValidationPorts;
}
export interface ProjectChange extends ProjectState {
  readonly direction: HistoryDirection;
}

/** Built only from validated project data; callers never receive internal references. */
export function copyProjectState(state: ProjectState): ProjectState {
  return cloneProjectJson(state) as unknown as ProjectState;
}
export function projectProfile(project: EditableProject): ProjectProfile {
  return { source: project.source, ...(project.metadata === undefined ? {} : { metadata: project.metadata }) };
}
