// packages/designer/src/project/validation.ts
import { cloneProjectJson, isJsonObject } from './json-data.js';
import { ProjectValidationError } from './types.js';
import type { EditableProject, JsonObject, JsonValue, ProjectCodecLimits, ProjectIssue, ProjectValidationPorts, ProjectValidationResult } from './types.js';

function issue(code: string, path: string, message: string): ProjectIssue { return { code, path, message, severity: 'error' }; }
function nonempty(value: JsonValue | undefined): value is string { return typeof value === 'string' && value.trim().length > 0; }
function knownFields(object: JsonObject, fields: readonly string[], path: string, issues: ProjectIssue[]): void {
  for (const key of Object.keys(object)) if (!fields.includes(key)) issues.push(issue('project-field', `${path}.${key}`, 'Ce champ n’est pas défini dans cette version du projet.'));
}
function reference(value: JsonValue | undefined, path: string, fields: readonly string[], issues: ProjectIssue[]): void {
  if (!isJsonObject(value)) { issues.push(issue('project-field', path, 'Une référence de projet structurée est requise.')); return; }
  knownFields(value, fields, path, issues);
  for (const name of fields) if (!nonempty(value[name])) issues.push(issue('project-field', `${path}.${name}`, 'Une référence de projet non vide est requise.'));
}
function journal(value: JsonValue | undefined, issues: ProjectIssue[]): void {
  if (!Array.isArray(value)) { issues.push(issue('document-changes', '$.documentChanges', 'Le journal Full XPath du projet est requis.')); return; }
  const seen = new Set<string>();
  const xpath = /^\/[\p{L}_:][\p{L}\p{N}_.:-]*(?:\[[1-9]\d*\])?(?:\/[\p{L}_:][\p{L}\p{N}_.:-]*(?:\[[1-9]\d*\])?)*$/u;
  for (const [index, entry] of value.entries()) {
    const path = `$.documentChanges[${index}]`;
    if (!isJsonObject(entry)) { issues.push(issue('document-change', path, 'Chaque modification du document doit être structurée.')); continue; }
    knownFields(entry, ['fullXPath', 'attribute', 'oldValue', 'newValue'], path, issues);
    if (typeof entry.fullXPath !== 'string' || !xpath.test(entry.fullXPath)) issues.push(issue('document-change', `${path}.fullXPath`, 'Le chemin Full XPath d’origine n’est pas valide.'));
    if (entry.attribute !== 'id' && entry.attribute !== 'class') issues.push(issue('document-change', `${path}.attribute`, 'Le journal du projet accepte uniquement ID et classe.'));
    for (const field of ['oldValue', 'newValue']) if (entry[field] !== null && typeof entry[field] !== 'string') issues.push(issue('document-change', `${path}.${field}`, 'La valeur doit conserver une chaîne ou l’absence de l’attribut.'));
    if (entry.oldValue === entry.newValue) issues.push(issue('document-change', path, 'Le journal net ne doit pas contenir de modification sans effet.'));
    const address = JSON.stringify([entry.fullXPath, entry.attribute]);
    if (seen.has(address)) issues.push(issue('document-change', path, 'Le journal net contient plusieurs entrées pour le même attribut et Full XPath.'));
    seen.add(address);
  }
}
function envelope(value: JsonValue, issues: ProjectIssue[]): value is JsonObject {
  if (!isJsonObject(value)) { issues.push(issue('project-format', '$', 'Un projet éditable structuré est requis.')); return false; }
  knownFields(value, ['format', 'version', 'source', 'timeline', 'htmlContext', 'documentChanges', 'provenance', 'metadata'], '$', issues);
  if (value.format !== 'html-animation-project') issues.push(issue('project-format', '$.format', 'Ce fichier n’est pas un projet éditable HtmlAnimation.'));
  if (value.version !== 1) issues.push(issue('project-version', '$.version', 'Cette version de projet n’est pas prise en charge.'));
  reference(value.source, '$.source', ['id', 'revision'], issues);
  if (!isJsonObject(value.timeline)) issues.push(issue('project-timeline', '$.timeline', 'Le document temporel natif du projet est requis.'));
  if (!isJsonObject(value.htmlContext)) issues.push(issue('project-context', '$.htmlContext', 'Le contexte HTML natif du projet est requis.'));
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) issues.push(issue('project-metadata', '$.metadata', 'Les métadonnées du projet doivent être un objet JSON.'));
  journal(value.documentChanges, issues);
  if (!isJsonObject(value.provenance)) issues.push(issue('project-provenance', '$.provenance', 'La provenance du projet est requise.'));
  else {
    knownFields(value.provenance, ['kind', 'adapterRevision', 'timelineReference'], '$.provenance', issues);
    if (value.provenance.kind !== 'real' && value.provenance.kind !== 'simulation') issues.push(issue('project-provenance', '$.provenance.kind', 'La provenance doit distinguer une simulation des packages réels.'));
    for (const field of ['adapterRevision', 'timelineReference']) if (!nonempty(value.provenance[field])) issues.push(issue('project-provenance', `$.provenance.${field}`, 'Une révision de provenance non vide est requise.'));
  }
  return true;
}
function portIssues(values: readonly ProjectIssue[]): readonly ProjectIssue[] {
  if (!Array.isArray(values)) throw new Error('Invalid validation result');
  return values.map(value => {
    if (!value || typeof value.code !== 'string' || typeof value.path !== 'string' || typeof value.message !== 'string' || (value.severity !== 'error' && value.severity !== 'warning')) throw new Error('Invalid validation issue');
    return Object.freeze({ code: value.code, path: value.path, message: value.message, severity: value.severity });
  });
}
export function validateEditableProject(input: unknown, ports: ProjectValidationPorts, limits?: ProjectCodecLimits): ProjectValidationResult {
  const issues: ProjectIssue[] = []; let value: JsonValue;
  try { value = cloneProjectJson(input, limits); }
  catch (error) { return { status: 'invalid', issues: error instanceof ProjectValidationError ? error.issues : [issue('project-data', '$', 'Le projet ne peut pas être validé.')] }; }
  if (!envelope(value, issues) || issues.length) return { status: 'invalid', issues: Object.freeze(issues) };
  const project = value as unknown as EditableProject;
  try {
    issues.push(...portIssues(ports.validateTimeline(project.timeline)), ...portIssues(ports.validateHtmlContext(project.htmlContext, project.timeline)));
  } catch { issues.push(issue('project-validation', '$', 'La validation native du projet n’a pas pu être exécutée.')); }
  if (issues.some(entry => entry.severity === 'error')) return { status: 'invalid', issues: Object.freeze(issues) };
  return { status: 'valid', project, warnings: Object.freeze(issues) };
}
