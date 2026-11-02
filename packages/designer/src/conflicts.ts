// packages/designer/src/conflicts.ts
import type { ConflictSnapshot } from './conflict-types.js';
import { resolveTarget } from './targets.js';

export interface ProjectionCandidate {
  readonly objectId: string;
  readonly value: string;
  readonly rank: number;
  readonly selector: string;
}
export function copyConflictSnapshot(snapshot: ConflictSnapshot): ConflictSnapshot {
  return {
    revision: snapshot.revision,
    diagnostics: snapshot.diagnostics.map(diagnostic => ({
      ...diagnostic, objectIds: [...diagnostic.objectIds], targets: [...diagnostic.targets], affectedTargets: [...diagnostic.affectedTargets],
      choices: diagnostic.choices.map(choice => ({ ...choice, createsKeys: choice.createsKeys.map(write => ({ ...write })) })),
    })),
    resolutions: snapshot.resolutions.map(resolution => ({ ...resolution })),
  };
}
export function guardConflictTargets(scene: HTMLElement, snapshot: ConflictSnapshot): () => boolean {
  const targets = [...new Set(snapshot.diagnostics.flatMap(diagnostic => [...diagnostic.targets, ...diagnostic.affectedTargets]))].map(selector => ({
    selector, elements: resolveTarget(scene, selector).map(element => ({ element, id: element.getAttribute('id'), classes: element.getAttribute('class'), style: element.getAttribute('style') })),
  }));
  return () => targets.every(target => {
    const current = resolveTarget(scene, target.selector);
    return current.length === target.elements.length && target.elements.every((entry, index) => current[index] === entry.element && entry.element.getAttribute('id') === entry.id && entry.element.getAttribute('class') === entry.classes && entry.element.getAttribute('style') === entry.style);
  });
}
/** Chooses among already evaluated values only; never evaluates a key/transition. */
export function conflictWinner(snapshot: ConflictSnapshot | null, scene: HTMLElement, element: HTMLElement, property: string, frame: number, candidates: readonly ProjectionCandidate[]): ProjectionCandidate | undefined {
  if (!snapshot) return undefined;
  const applicable = snapshot.diagnostics.filter(diagnostic => diagnostic.property === property && frame >= diagnostic.fromFrame && (diagnostic.toFrameExclusive ? frame < diagnostic.toFrame : frame <= diagnostic.toFrame) && candidates.every(candidate => diagnostic.objectIds.includes(candidate.objectId)) && diagnostic.affectedTargets.some(selector => resolveTarget(scene, selector).includes(element)));
  const decisions = applicable.map(diagnostic => {
    const decision = snapshot.resolutions.find(resolution => resolution.conflictId === diagnostic.id && resolution.signature === diagnostic.signature);
    if (!decision || !diagnostic.choices.some(choice => choice.id === decision.choiceId && choice.winnerObjectId === decision.winnerObjectId)) return undefined;
    return candidates.find(candidate => candidate.objectId === decision.winnerObjectId);
  });
  return decisions.length && decisions.every(decision => decision !== undefined) && new Set(decisions.map(decision => decision.objectId)).size === 1 ? decisions[0] : undefined;
}
