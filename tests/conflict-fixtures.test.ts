// tests/conflict-fixtures.test.ts
// Exact sample simulation regression; no temporal evaluation is claimed.
import { expect, it } from 'vitest';
import { createConflictTimeline } from '../fixtures/conflict-timeline.js';

it('records the non-overlapping base before the later key until the explicit starting-key choice', () => {
  const timeline = createConflictTimeline('start-key'); const original = timeline.getKeys();
  for (const frame of [1, 20, 49]) { timeline.navigate(frame); expect(timeline.getState().values.accent?.opacity).toBeUndefined(); }
  timeline.navigate(50); expect(timeline.getState().values.accent?.opacity).toBe('0.75');
  const snapshot = timeline.conflicts.read(); const diagnostic = snapshot.diagnostics[0]; if (!diagnostic) throw new Error('Missing diagnostic');
  timeline.conflicts.resolve({ id: diagnostic.id, signature: diagnostic.signature, choiceId: 'accent-from-start', revision: snapshot.revision }, () => true);
  for (const frame of [1, 20, 49]) { timeline.navigate(frame); expect(timeline.getState().values.accent?.opacity).toBe('0.75'); }
  timeline.navigate(20); timeline.execute('Unrelated exact sample', [{ objectId: 'accent', selector: '.accent', property: 'background-color', value: 'red', frame: 20 }]);
  expect(timeline.getState().values.accent?.['background-color']).toBe('red');
  timeline.undo(); expect(timeline.getState().values.accent?.['background-color']).toBe('rgb(230, 210, 180)');
  timeline.undo(); expect(timeline.getKeys()).toEqual(original); expect(timeline.getState().values.accent?.opacity).toBeUndefined();
});

it('keeps later exact-frame edits visible after the scripted contribution change, with shared undo', () => {
  const timeline = createConflictTimeline('stale'); const before = timeline.getKeys();
  timeline.invalidateContribution(); expect(timeline.getState().values.accent?.opacity).toBe('0.65');
  const changed = timeline.getKeys();
  expect(timeline.execute('Edit exact sample', [{ objectId: 'accent', selector: '.accent', property: 'opacity', value: '0.2', frame: 1 }]).status).toBe('changed');
  expect(timeline.getState().values.accent?.opacity).toBe('0.2');
  timeline.undo(); expect(timeline.getKeys()).toEqual(changed); expect(timeline.getState().values.accent?.opacity).toBe('0.65');
  timeline.undo(); expect(timeline.getKeys()).toEqual(before); expect(timeline.getState().values.accent?.opacity).toBe('0.75');
  timeline.redo(); timeline.redo(); expect(timeline.getState().values.accent?.opacity).toBe('0.2');
  timeline.navigate(20); expect(timeline.getState().values.accent?.opacity).toBe('0.65');
  timeline.execute('Edit another exact sample', [{ objectId: 'accent', selector: '.accent', property: 'opacity', value: '0.75', frame: 20 }]);
  expect(timeline.getState().values.accent?.opacity).toBe('0.75');
  timeline.undo(); expect(timeline.getState().values.accent?.opacity).toBe('0.65');
});
