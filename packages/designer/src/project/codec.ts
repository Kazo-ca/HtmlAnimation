// packages/designer/src/project/codec.ts
import { checkProjectTextSize, stringifyProjectJson } from './json-data.js';
import { ProjectValidationError } from './types.js';
import type { EditableProject, JsonValue, ProjectCodecLimits, ProjectValidationPorts } from './types.js';
import { validateEditableProject } from './validation.js';

export function encodeEditableProject(input: unknown, ports: ProjectValidationPorts, limits?: ProjectCodecLimits): string {
  const result = validateEditableProject(input, ports, limits);
  if (result.status === 'invalid') throw new ProjectValidationError(result.issues);
  // Validation produced frozen data-only fields; the writer cannot call user code.
  return stringifyProjectJson(result.project as unknown as JsonValue);
}
export function decodeEditableProject(text: string, ports: ProjectValidationPorts, limits?: ProjectCodecLimits): EditableProject {
  if (typeof text !== 'string') throw new ProjectValidationError([{ code: 'project-text', path: '$', message: 'Le fichier projet doit contenir du texte JSON.', severity: 'error' }]);
  checkProjectTextSize(text, limits);
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { throw new ProjectValidationError([{ code: 'project-json', path: '$', message: 'Le fichier ne contient pas un JSON valide.', severity: 'error' }]); }
  const result = validateEditableProject(input, ports, limits);
  if (result.status === 'invalid') throw new ProjectValidationError(result.issues);
  return result.project;
}
