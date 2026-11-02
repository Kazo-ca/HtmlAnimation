// packages/designer/src/project/source.ts
import { fullXPath } from '../dom-origin.js';
import type { DocumentChange } from '../events.js';
import { cloneProjectJson, isJsonObject } from './json-data.js';
import type { EditableProject, JsonValue, ProjectIssue, ProjectSourceReference } from './types.js';

export interface ResolvedProjectSourceChange {
  readonly element: Element;
  readonly change: DocumentChange;
}
export type ProjectSourceJournalResult =
  | { readonly status: 'valid'; readonly entries: readonly ResolvedProjectSourceChange[] }
  | { readonly status: 'invalid'; readonly issues: readonly ProjectIssue[] };

function issue(code: string, path: string, message: string): ProjectIssue {
  return Object.freeze({ code, path, message, severity: 'error' });
}
function ownData(input: unknown, name: string): unknown {
  if (input === null || typeof input !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, name);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function referenceIssues(actual: ProjectSourceReference, project: EditableProject): readonly ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const expected = ownData(project, 'source');
  for (const field of ['id', 'revision'] as const) {
    const supplied = ownData(actual, field); const saved = ownData(expected, field);
    if (typeof supplied !== 'string' || !supplied.trim() || typeof saved !== 'string' || !saved.trim() || supplied !== saved) {
      issues.push(issue('source-reference', `$.source.${field}`, `La référence ${field === 'id' ? 'de source' : 'de révision'} vérifiée par l’hôte ne correspond pas au projet.`));
    }
  }
  return issues;
}
function journal(project: EditableProject, issues: ProjectIssue[]): readonly DocumentChange[] {
  let value: JsonValue;
  try { value = cloneProjectJson(ownData(project, 'documentChanges')); }
  catch { issues.push(issue('document-change', '$.documentChanges', 'Le journal doit contenir uniquement des données JSON valides.')); return []; }
  if (!Array.isArray(value)) { issues.push(issue('document-change', '$.documentChanges', 'Le journal Full XPath du projet est requis.')); return []; }
  const changes: DocumentChange[] = []; const addresses = new Set<string>();
  const xpath = /^\/[\p{L}_:][\p{L}\p{N}_.:-]*(?:\[[1-9]\d*\])?(?:\/[\p{L}_:][\p{L}\p{N}_.:-]*(?:\[[1-9]\d*\])?)*$/u;
  for (const [index, entry] of value.entries()) {
    const path = `$.documentChanges[${index}]`; const before = issues.length;
    if (!isJsonObject(entry)) { issues.push(issue('document-change', path, 'Chaque modification du document doit être structurée.')); continue; }
    if (Object.keys(entry).some(key => !['fullXPath', 'attribute', 'oldValue', 'newValue'].includes(key))) issues.push(issue('document-change', path, 'La modification comporte un champ inconnu.'));
    const fullXPath = entry.fullXPath; const attribute = entry.attribute; const oldValue = entry.oldValue; const newValue = entry.newValue;
    if (typeof fullXPath !== 'string' || !xpath.test(fullXPath)) issues.push(issue('document-change', `${path}.fullXPath`, 'Le chemin Full XPath d’origine n’est pas valide.'));
    if (attribute !== 'id' && attribute !== 'class') issues.push(issue('document-change', `${path}.attribute`, 'Le journal du projet accepte uniquement ID et classe.'));
    if (oldValue !== null && typeof oldValue !== 'string') issues.push(issue('document-change', `${path}.oldValue`, 'La valeur doit conserver une chaîne ou l’absence de l’attribut.'));
    if (newValue !== null && typeof newValue !== 'string') issues.push(issue('document-change', `${path}.newValue`, 'La valeur doit conserver une chaîne ou l’absence de l’attribut.'));
    if (oldValue === newValue) issues.push(issue('document-change', path, 'Le journal net ne doit pas contenir de modification sans effet.'));
    const address = JSON.stringify([fullXPath, attribute]);
    if (addresses.has(address)) issues.push(issue('document-change', path, 'Le journal net contient plusieurs entrées pour le même attribut et Full XPath.'));
    addresses.add(address);
    if (issues.length === before && typeof fullXPath === 'string' && (attribute === 'id' || attribute === 'class') && (oldValue === null || typeof oldValue === 'string') && (newValue === null || typeof newValue === 'string')) {
      changes.push(Object.freeze({ fullXPath, attribute, oldValue, newValue }));
    }
  }
  return changes;
}
function sourceElements(scene: HTMLElement): readonly Element[] {
  return [scene, ...scene.querySelectorAll('*')];
}
interface PathStep { readonly name: string; readonly index: string | undefined }
function pathSteps(path: string): readonly PathStep[] {
  return path.slice(1).split('/').map(step => {
    const bracket = step.indexOf('[');
    return bracket < 0 ? { name: step, index: undefined } : { name: step.slice(0, bracket), index: step.slice(bracket + 1, -1) };
  });
}
function resolveJournal(scene: HTMLElement, changes: readonly DocumentChange[], issues: ProjectIssue[]): readonly ResolvedProjectSourceChange[] {
  const paths = sourceElements(scene).map(element => ({ element, steps: pathSteps(fullXPath(element)) }));
  const entries: ResolvedProjectSourceChange[] = [];
  for (const [index, change] of changes.entries()) {
    const path = `$.documentChanges[${index}]`; const query = pathSteps(change.fullXPath);
    // Full XPath omits [1] when a tag has no same-name sibling. Compare its
    // element steps explicitly, preserving positional XPath semantics without
    // executing an author-supplied expression with document.evaluate.
    const candidates = paths.filter(candidate => candidate.steps.length === query.length && query.every((step, stepIndex) => {
      const original = candidate.steps[stepIndex];
      return original?.name === step.name && (step.index === undefined || step.index === (original.index ?? '1'));
    }));
    if (!candidates.length) { issues.push(issue('source-path-missing', `${path}.fullXPath`, 'Le Full XPath d’origine ne désigne aucun élément dans la scène fournie.')); continue; }
    if (candidates.length !== 1) { issues.push(issue('source-path-ambiguous', `${path}.fullXPath`, 'Le Full XPath d’origine désigne plusieurs éléments de la scène.')); continue; }
    const element = candidates[0]?.element;
    if (!element) continue;
    if (element.getAttribute(change.attribute) !== change.oldValue) issues.push(issue('source-value-mismatch', `${path}.oldValue`, 'La valeur brute de l’attribut source ne correspond pas au journal d’origine.'));
    entries.push(Object.freeze({ element, change }));
  }
  return entries;
}
function finalIdIssues(scene: HTMLElement, entries: readonly ResolvedProjectSourceChange[], changes: readonly DocumentChange[]): readonly ProjectIssue[] {
  const replacements = new Map<Element, string | null>();
  for (const { element, change } of entries) if (change.attribute === 'id') replacements.set(element, change.newValue);
  if (!replacements.size) return [];
  const elements = new Set<Element>([...scene.ownerDocument.querySelectorAll('[id]'), ...sourceElements(scene)]);
  const finalIds = new Map<string, Element[]>();
  for (const element of elements) {
    const id = replacements.has(element) ? replacements.get(element) : element.getAttribute('id');
    // An empty raw ID remains distinct from absence but identifies no DOM target.
    if (!id) continue;
    const matches = finalIds.get(id) ?? []; matches.push(element); finalIds.set(id, matches);
  }
  const issues: ProjectIssue[] = [];
  const indices = new Map(changes.map((change, index) => [change, index]));
  for (const { change } of entries) {
    if (change.attribute === 'id' && change.newValue && (finalIds.get(change.newValue)?.length ?? 0) > 1) {
      issues.push(issue('source-id-collision', `$.documentChanges[${indices.get(change)}].newValue`, 'Cet identifiant serait partagé par plusieurs éléments après application du journal.'));
    }
  }
  return issues;
}

/**
 * Read-only preflight against the original scene supplied again by its host.
 * Matching opaque references are the host's guarantee, not a content hash or a
 * proof of HTML/CSS equivalence. No ID lookup, rebinding, or DOM write occurs.
 * Only IDs assigned by this journal are checked for final global collisions;
 * unrelated pre-existing duplicate IDs do not prevent a class-only journal.
 */
export function resolveProjectSourceJournal(scene: HTMLElement, actualSource: ProjectSourceReference, project: EditableProject): ProjectSourceJournalResult {
  const issues = [...referenceIssues(actualSource, project)];
  const changes = journal(project, issues);
  if (issues.length) return Object.freeze({ status: 'invalid', issues: Object.freeze(issues) });
  const entries = resolveJournal(scene, changes, issues);
  if (!issues.length) issues.push(...finalIdIssues(scene, entries, changes));
  if (issues.length) return Object.freeze({ status: 'invalid', issues: Object.freeze(issues) });
  return Object.freeze({ status: 'valid', entries: Object.freeze(entries) });
}

/** Checks host source identity, raw originals, original paths, and final IDs only. */
export function validateProjectSource(scene: HTMLElement, actualSource: ProjectSourceReference, project: EditableProject): readonly ProjectIssue[] {
  const result = resolveProjectSourceJournal(scene, actualSource, project);
  return result.status === 'invalid' ? result.issues : Object.freeze([]);
}
