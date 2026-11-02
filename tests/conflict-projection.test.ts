// tests/conflict-projection.test.ts
import { expect, it } from 'vitest';
import { conflictWinner } from '../packages/designer/src/conflicts.js';
import type { ConflictDiagnostic, ConflictSnapshot } from '../packages/designer/src/conflict-types.js';

it('suspends the overlap when another authoritative blocking ticket has a stale decision', () => {
  const scene = document.createElement('div'); const element = document.createElement('div'); element.id = 'shared'; scene.append(element);
  const diagnostic: ConflictDiagnostic = { id: 'one', signature: 'current', code: 'equal-specificity', property: 'opacity', message: 'Resolve this overlap.', objectIds: ['a', 'b'], targets: ['.a', '.b'], affectedTargets: ['#shared'], fromFrame: 1, toFrame: 100, toFrameExclusive: false, blocking: true, choices: [{ id: 'a-wins', winnerObjectId: 'a', label: 'A', description: 'Use A.', createsKeys: [] }] };
  const snapshot: ConflictSnapshot = { revision: 'fixture', diagnostics: [diagnostic, { ...diagnostic, id: 'two', signature: 'changed' }], resolutions: [{ conflictId: 'one', signature: 'current', choiceId: 'a-wins', winnerObjectId: 'a' }, { conflictId: 'two', signature: 'obsolete', choiceId: 'a-wins', winnerObjectId: 'a' }] };
  const candidates = [{ objectId: 'a', selector: '.a', rank: 1, value: '0.5' }, { objectId: 'b', selector: '.b', rank: 1, value: '0.8' }];
  expect(conflictWinner(snapshot, scene, element, 'opacity', 20, candidates)).toBeUndefined();
});
