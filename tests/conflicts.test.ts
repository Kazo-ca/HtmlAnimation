// tests/conflicts.test.ts
// Scripted adapter samples only: these tests do not validate a real Timeline engine.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import type { MutationResult, PropertyWrite, TimelineAdapter } from '../packages/designer/src/timeline-adapter.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture, propertyInput } from './helpers.js';

interface Choice {
  readonly id: string; readonly label: string; readonly description: string;
  readonly winnerObjectId: string; readonly createsKeys: readonly PropertyWrite[];
}
interface Diagnostic {
  readonly id: string; readonly signature: string; readonly code: string; readonly property: string;
  readonly message: string; readonly objectIds: readonly string[]; readonly targets: readonly string[];
  readonly affectedTargets: readonly string[]; readonly fromFrame: number; readonly toFrame: number;
  readonly toFrameExclusive: boolean; readonly blocking: boolean; readonly choices: readonly Choice[];
}
interface Resolution {
  readonly conflictId: string; readonly signature: string; readonly choiceId: string; readonly winnerObjectId: string;
}
interface Snapshot { readonly revision: string; readonly diagnostics: readonly Diagnostic[]; readonly resolutions: readonly Resolution[] }
interface Request { readonly id: string; readonly signature: string; readonly choiceId: string; readonly revision: string }
interface ScriptOptions { readonly fromFrame?: number; readonly toFrame?: number; readonly exclusive?: boolean; readonly startKey?: boolean }

const designers: HtmlDesigner[] = [];
afterEach(() => { for (const designer of designers.splice(0)) designer.dispose(); document.body.replaceChildren(); });

function setup(options: ScriptOptions = {}): ReturnType<typeof createSceneFixture> & {
  readonly designer: HtmlDesigner;
  readonly timeline: ReturnType<typeof createRecordedTimeline>;
  readonly adapter: TimelineAdapter & { readonly conflicts: { read(): Snapshot; resolve(request: Request, isCurrent: () => boolean): MutationResult } };
  readonly invalidate: () => void;
  readonly beforeConfirm: (action: () => void) => void;
} {
  const fixture = createSceneFixture();
  fixture.buttons[0].classList.add('primary'); fixture.buttons[1].classList.add('primary');
  const timeline = createRecordedTimeline();
  timeline.execute('Seed recorded conflict samples', [
    { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
    { objectId: 'group', selector: '.button', property: 'color', value: 'red', frame: 1 },
    { objectId: 'other', selector: '.primary', property: 'opacity', value: '0.8', frame: options.startKey ? 50 : 1 },
    { objectId: 'specific', selector: '#button-2', property: 'opacity', value: '0.6', frame: 1 },
  ]);
  let resolutions: readonly Resolution[] = [];
  let signature = 'scripted-priority-v1';
  let confirmation: (() => void) | undefined;
  const read = (): Snapshot => ({
    revision: JSON.stringify([signature, resolutions]),
    diagnostics: [{
      id: 'opacity-priority', signature, code: 'equal-specificity', property: 'opacity',
      message: 'Deux classes imposent des opacités différentes.', objectIds: ['group', 'other'],
      targets: ['.button', '.primary'], affectedTargets: ['#button-1'], fromFrame: options.fromFrame ?? 1,
      toFrame: options.toFrame ?? 100, toFrameExclusive: options.exclusive ?? false, blocking: true,
      choices: [
        { id: 'group-wins', label: 'Priorité à .button', description: 'Le groupe impose 50 % sur le recouvrement.', winnerObjectId: 'group', createsKeys: [] },
        { id: 'other-wins', label: 'Priorité à .primary', description: options.startKey ? 'Créer une clé d’opacité à l’image 1 pour .primary.' : 'La classe impose 80 % sur le recouvrement.', winnerObjectId: 'other', createsKeys: options.startKey ? [{ objectId: 'other', selector: '.primary', property: 'opacity', value: '0.8', frame: 1 }] : [] },
      ],
    }],
    resolutions,
  });
  const adapter = {
    ...timeline,
    conflicts: {
      read,
      resolve(request: Request, isCurrent: () => boolean): MutationResult {
        const snapshot = read(); const diagnostic = snapshot.diagnostics.find(candidate => candidate.id === request.id);
        const choice = diagnostic?.choices.find(candidate => candidate.id === request.choiceId);
        if (!isCurrent() || request.revision !== snapshot.revision || request.signature !== diagnostic?.signature || !choice) return { status: 'rejected', message: 'La résolution n’est plus disponible.' };
        confirmation?.();
        if (!isCurrent() || read().revision !== snapshot.revision) return { status: 'rejected', message: 'Le contexte a changé pendant la confirmation.' };
        const before = resolutions;
        const next: Resolution = { conflictId: request.id, signature: request.signature, choiceId: choice.id, winnerObjectId: choice.winnerObjectId };
        if (before.some(item => JSON.stringify(item) === JSON.stringify(next))) return { status: 'unchanged' };
        const after = [...before.filter(item => item.conflictId !== request.id), next];
        return timeline.execute('Resolve scripted conflict', choice.createsKeys, { redo: () => { resolutions = after; }, undo: () => { resolutions = before; } });
      },
    },
  };
  const designer = new HtmlDesigner({ ...fixture, timeline, adapter: () => adapter }); designers.push(designer);
  return { ...fixture, designer, timeline, adapter, invalidate: () => { signature = 'scripted-priority-v2'; }, beforeConfirm: action => { confirmation = action; } };
}

function action(container: ParentNode, text: string): HTMLButtonElement {
  const result = [...container.querySelectorAll('button')].find(button => button.textContent === text);
  if (!result) throw new Error(`Missing action ${text}`); return result;
}

describe('explicit conflicts through scripted adapter capability', () => {
  it('exposes authoritative targets and period without changing keys or choosing a winner', () => {
    const { designer, timeline, buttons } = setup({ fromFrame: 20, toFrame: 50, exclusive: true });
    const keys = timeline.getKeys(); const snapshot = designer.getConflictState();
    expect(snapshot?.diagnostics[0]).toMatchObject({ id: 'opacity-priority', property: 'opacity', targets: ['.button', '.primary'], affectedTargets: ['#button-1'], fromFrame: 20, toFrame: 50, toFrameExclusive: true });
    expect(snapshot?.resolutions).toEqual([]); expect(timeline.getKeys()).toEqual(keys);
    expect(buttons[0].style.opacity).toBe('1'); expect(buttons[1].style.opacity).toBe('0.6');
  });

  it('opens and cancels a diagnostic without a mutation or resolution event', () => {
    const { designer, timeline, propertiesContainer } = setup(); const keys = timeline.getKeys();
    const event = vi.fn(); designer.on('resolutionchange', event);
    action(propertiesContainer, 'Résoudre le conflit').click();
    const dialog = propertiesContainer.querySelector('[role="dialog"]'); expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('opacity'); expect(dialog?.textContent).toContain('.primary');
    action(dialog ?? propertiesContainer, 'Annuler').click();
    expect(propertiesContainer.querySelector('[role="dialog"]')).toBeNull();
    expect(timeline.getKeys()).toEqual(keys); expect(event).not.toHaveBeenCalled();
  });

  it('commits one decision, affects only its overlap and property, then undoes and redoes atomically', () => {
    const { designer, timeline, buttons } = setup(); const keys = timeline.getKeys();
    const events = vi.fn(); const properties = vi.fn(); const documents = vi.fn();
    designer.on('resolutionchange', events); designer.on('propertychange', properties); designer.on('documentchange', documents);
    expect(designer.resolveConflict('opacity-priority', 'other-wins')).toEqual({ status: 'changed' });
    expect(buttons.map(button => button.style.opacity)).toEqual(['0.8', '0.6', '0.5', '0.5']);
    expect(buttons.map(button => button.style.color)).toEqual(['red', 'red', 'red', 'red']);
    expect(timeline.getKeys()).toEqual(keys); expect(events).toHaveBeenCalledOnce();
    expect(events).toHaveBeenLastCalledWith({ resolutions: [expect.objectContaining({ conflictId: 'opacity-priority', winnerObjectId: 'other' })], direction: 'execute' });
    expect(properties).not.toHaveBeenCalled(); expect(documents).not.toHaveBeenCalled();
    designer.undo(); expect(buttons[0].style.opacity).toBe('1'); expect(events).toHaveBeenLastCalledWith({ resolutions: [], direction: 'undo' });
    designer.redo(); expect(buttons[0].style.opacity).toBe('0.8'); expect(events).toHaveBeenLastCalledWith({ resolutions: [expect.objectContaining({ winnerObjectId: 'other' })], direction: 'redo' });
    expect(timeline.getKeys()).toEqual(keys);
  });

  it('keeps the recorded group/ID reference automatic with no conflict capability or initial key', () => {
    const fixture = createSceneFixture(); const timeline = createRecordedTimeline({ reference: true });
    const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer);
    const keys = timeline.getKeys(); expect(designer.getConflictState()).toBeNull();
    for (const frame of [1, 20, 49, 50, 75, 100]) { timeline.navigate(frame); expect(fixture.buttons[1].style.opacity).toBe('0.8'); }
    expect(timeline.getKeys()).toEqual(keys); expect(fixture.propertiesContainer.querySelector('[role="dialog"]')).toBeNull();
  });
});
