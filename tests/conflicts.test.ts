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
  it('reopens using the current diagnostic announcements after an unnotified stale refusal', () => {
    const { adapter, propertiesContainer, invalidate } = setup();
    action(propertiesContainer, 'Résoudre le conflit').click();
    const select = propertiesContainer.querySelector<HTMLSelectElement>('dialog select');
    if (!select) throw new Error('Missing choice'); select.value = 'other-wins'; select.dispatchEvent(new Event('change'));
    invalidate(); action(propertiesContainer.querySelector('dialog') ?? propertiesContainer, 'Appliquer la résolution').click();
    const current = adapter.conflicts.read();
    vi.spyOn(adapter.conflicts, 'read').mockReturnValue({ ...current, diagnostics: current.diagnostics.map(diagnostic => ({ ...diagnostic, choices: diagnostic.choices.map(choice => ({ ...choice, description: 'NOUVEAU : création d’une clé initiale explicitement annoncée.', createsKeys: [{ objectId: 'other', selector: '.primary', property: 'opacity', value: '0.65', frame: 1 }] })) })) });
    action(propertiesContainer, 'Résoudre le conflit').click();
    const reopened = propertiesContainer.querySelector('dialog');
    if (!reopened) throw new Error('Missing reopened dialog');
    const choice = reopened.querySelector('select'); if (!choice) throw new Error('Missing reopened choices');
    choice.value = 'other-wins'; choice.dispatchEvent(new Event('change'));
    expect(reopened.textContent).toContain('NOUVEAU : création d’une clé initiale');
    expect(reopened.textContent).toContain('opacity = 0.65');
  });
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
    const dialog = propertiesContainer.querySelector('dialog[open], [role="dialog"][open]'); expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('opacity'); expect(dialog?.textContent).toContain('.primary');
    action(dialog ?? propertiesContainer, 'Annuler').click();
    expect(propertiesContainer.querySelector('dialog[open], [role="dialog"][open]')).toBeNull();
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
    expect(timeline.getKeys()).toEqual(keys); expect(fixture.propertiesContainer.querySelector('dialog[open], [role="dialog"][open]')).toBeNull();
  });

  it('keeps a stored choice independent of the scene and tree selection', () => {
    const { designer, buttons, timeline } = setup();
    designer.resolveConflict('opacity-priority', 'other-wins'); const keys = timeline.getKeys();
    designer.selectElements([buttons[2]]); expect(buttons[0].style.opacity).toBe('0.8');
    designer.selectTarget('.button'); expect(buttons[0].style.opacity).toBe('0.8');
    timeline.selectObject('other'); expect(buttons[0].style.opacity).toBe('0.8');
    expect(timeline.getKeys()).toEqual(keys); expect(designer.getConflictState()?.resolutions[0]?.winnerObjectId).toBe('other');
  });

  it('routes only inside the authoritative half-open period without computing temporal values', () => {
    const { designer, timeline, buttons } = setup({ fromFrame: 20, toFrame: 50, exclusive: true });
    const samples = timeline.getKeys();
    for (const frame of [19, 20, 49, 50]) timeline.execute('Supply exact recorded sample', samples.map(key => ({ ...key, frame })));
    designer.resolveConflict('opacity-priority', 'other-wins');
    for (const [frame, opacity] of [[19, '1'], [20, '0.8'], [49, '0.8'], [50, '1']] as const) {
      timeline.navigate(frame); expect(buttons[0].style.opacity).toBe(opacity); expect(buttons[1].style.opacity).toBe('0.6');
    }
  });

  it('shares property edit history and does not repeat resolution events for unrelated undo', () => {
    const { designer, propertiesContainer, buttons } = setup(); const event = vi.fn();
    designer.on('resolutionchange', event); designer.resolveConflict('opacity-priority', 'other-wins');
    designer.selectTarget('.button'); expect(designer.editProperty('color', 'blue').status).toBe('changed');
    expect(propertyInput(propertiesContainer, 'color').value).toBe('blue'); expect(event).toHaveBeenCalledOnce();
    designer.undo(); expect(buttons[0].style.color).toBe('red'); expect(buttons[0].style.opacity).toBe('0.8'); expect(event).toHaveBeenCalledOnce();
    designer.undo(); expect(buttons[0].style.opacity).toBe('1'); expect(event).toHaveBeenCalledTimes(2);
    designer.redo(); expect(buttons[0].style.opacity).toBe('0.8'); designer.redo(); expect(buttons[0].style.color).toBe('blue'); expect(event).toHaveBeenCalledTimes(3);
  });

  it('announces and creates a start key only in the accepted atomic adapter command, with undo', () => {
    const { designer, timeline } = setup({ startKey: true }); const keys = timeline.getKeys();
    expect(designer.getConflictState()?.diagnostics[0]?.choices[1]?.createsKeys).toEqual([{ objectId: 'other', selector: '.primary', property: 'opacity', value: '0.8', frame: 1 }]);
    expect(timeline.getKeys()).toEqual(keys);
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('changed');
    expect(timeline.getKeys()).toHaveLength(keys.length + 1);
    expect(timeline.getKeys()).toContainEqual({ objectId: 'other', selector: '.primary', property: 'opacity', value: '0.8', frame: 1 });
    designer.undo(); expect(timeline.getKeys()).toEqual(keys); expect(designer.getConflictState()?.resolutions).toEqual([]);
    designer.redo(); expect(timeline.getKeys()).toHaveLength(keys.length + 1); expect(designer.getConflictState()?.resolutions).toHaveLength(1);
  });

  it('rejects unknown choices and treats an identical accepted decision as unchanged', () => {
    const { designer, timeline } = setup(); const keys = timeline.getKeys(); const event = vi.fn(); designer.on('resolutionchange', event);
    expect(designer.resolveConflict('missing', 'other-wins').status).toBe('rejected');
    expect(designer.resolveConflict('opacity-priority', 'missing').status).toBe('rejected');
    expect(event).not.toHaveBeenCalled(); expect(timeline.getKeys()).toEqual(keys);
    designer.resolveConflict('opacity-priority', 'other-wins');
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('unchanged'); expect(event).toHaveBeenCalledOnce();
  });

  it('rejects a reentrant frame change before the adapter commits any resolution', () => {
    const { designer, timeline, beforeConfirm } = setup(); const keys = timeline.getKeys(); const event = vi.fn(); designer.on('resolutionchange', event);
    beforeConfirm(() => timeline.navigate(20));
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys); expect(designer.getConflictState()?.resolutions).toEqual([]); expect(event).not.toHaveBeenCalled();
  });

  it('rejects a reentrant selection change before the adapter commits any resolution', () => {
    const { designer, timeline, buttons, beforeConfirm } = setup(); const keys = timeline.getKeys();
    beforeConfirm(() => designer.selectElements([buttons[2]]));
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys); expect(designer.getConflictState()?.resolutions).toEqual([]);
  });

  it('stops applying a stale recorded signature and exposes detached snapshots', () => {
    const { designer, adapter, buttons, invalidate } = setup(); designer.resolveConflict('opacity-priority', 'other-wins');
    const snapshot = designer.getConflictState(); const resolution = snapshot?.resolutions[0];
    if (!resolution) throw new Error('Missing stored resolution');
    Reflect.set(resolution, 'winnerObjectId', 'group');
    expect(adapter.conflicts.read().resolutions[0]?.winnerObjectId).toBe('other');
    invalidate(); designer.selectElements([buttons[0]]);
    expect(buttons[0].style.opacity).toBe('1');
    expect(designer.getConflictState()?.diagnostics[0]?.signature).toBe('scripted-priority-v2');
  });

  it('invalidates an open confirmation when selection changes, without creating a choice', () => {
    const { designer, timeline, buttons, propertiesContainer } = setup(); const keys = timeline.getKeys();
    action(propertiesContainer, 'Résoudre le conflit').click(); expect(propertiesContainer.querySelector('dialog[open], [role="dialog"][open]')).not.toBeNull();
    designer.selectElements([buttons[2]]); expect(propertiesContainer.querySelector('dialog[open], [role="dialog"][open]')).toBeNull();
    expect(timeline.getKeys()).toEqual(keys); expect(designer.getConflictState()?.resolutions).toEqual([]);
  });

  it('refuses an old confirmation ticket when its signature changes without a notification', () => {
    const { designer, timeline, propertiesContainer, invalidate } = setup(); const keys = timeline.getKeys();
    const event = vi.fn(); designer.on('resolutionchange', event);
    action(propertiesContainer, 'Résoudre le conflit').click();
    const dialog = propertiesContainer.querySelector('dialog[open]'); const select = dialog?.querySelector('select');
    if (!dialog || !select) throw new Error('Missing open confirmation');
    select.value = 'other-wins'; select.dispatchEvent(new Event('change'));
    invalidate(); action(dialog, 'Appliquer la résolution').click();
    expect(timeline.getKeys()).toEqual(keys); expect(designer.getConflictState()?.resolutions).toEqual([]);
    expect(event).not.toHaveBeenCalled(); expect(propertiesContainer.textContent).toContain('contexte a changé');
  });

  it.each(['class', 'style'] as const)('refuses a reentrant source %s change without adding partial keys or a decision', attribute => {
    const { designer, timeline, buttons, beforeConfirm } = setup({ startKey: true }); const keys = timeline.getKeys();
    const event = vi.fn(); designer.on('resolutionchange', event);
    beforeConfirm(() => {
      if (attribute === 'class') buttons[0].classList.add('changed-source');
      else buttons[0].style.borderTopWidth = '3px';
    });
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys); expect(designer.getConflictState()?.resolutions).toEqual([]); expect(event).not.toHaveBeenCalled();
  });

  it('refuses a resolution when a host validation callback disposes the Designer', () => {
    const { designer, timeline, adapter, beforeConfirm } = setup({ startKey: true }); const keys = timeline.getKeys();
    beforeConfirm(() => designer.dispose());
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('rejected');
    expect(timeline.getKeys()).toEqual(keys); expect(adapter.conflicts.read().resolutions).toEqual([]);
    expect(timeline.listenerCount).toBe(0);
  });

  it('keeps shared undo and redo usable when a resolution observer throws', () => {
    const { designer, buttons, timeline } = setup(); const keys = timeline.getKeys(); const diagnostic = vi.fn();
    designer.on('diagnostic', diagnostic); designer.on('resolutionchange', () => { throw new Error('Host observer failure'); });
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('changed');
    expect(buttons[0].style.opacity).toBe('0.8'); expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('observateur') }));
    expect(designer.undo().status).toBe('changed'); expect(buttons[0].style.opacity).toBe('1');
    expect(designer.redo().status).toBe('changed'); expect(buttons[0].style.opacity).toBe('0.8'); expect(timeline.getKeys()).toEqual(keys);
  });

  it('detaches nested diagnostics, target arrays and announced writes from the adapter snapshot', () => {
    const { designer, adapter } = setup({ startKey: true }); const shared = adapter.conflicts.read();
    const read = vi.spyOn(adapter.conflicts, 'read').mockReturnValue(shared);
    const snapshot = designer.getConflictState(); const diagnostic = snapshot?.diagnostics[0]; const choice = diagnostic?.choices[1]; const key = choice?.createsKeys[0];
    if (!diagnostic || !choice || !key) throw new Error('Missing nested announcement');
    Reflect.set(diagnostic, 'message', 'Changed client text'); Reflect.set(diagnostic.targets, 0, '#different');
    Reflect.set(diagnostic.affectedTargets, 0, '#different'); Reflect.set(diagnostic.objectIds, 0, 'different');
    Reflect.set(choice, 'label', 'Changed label'); Reflect.set(key, 'value', '0.1');
    expect(shared.diagnostics[0]).toMatchObject({ message: 'Deux classes imposent des opacités différentes.', targets: ['.button', '.primary'], affectedTargets: ['#button-1'], objectIds: ['group', 'other'] });
    expect(shared.diagnostics[0]?.choices[1]).toMatchObject({ label: 'Priorité à .primary', createsKeys: [{ value: '0.8' }] }); read.mockRestore();
  });

  it('rejects conflict resolution on an existing adapter without the optional capability', () => {
    const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
    const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer);
    const diagnostic = vi.fn(); designer.on('diagnostic', diagnostic);
    expect(designer.resolveConflict('opacity-priority', 'other-wins').status).toBe('rejected');
    expect(diagnostic).toHaveBeenCalledOnce(); expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
  });

  it.each(['Appliquer la résolution', 'Annuler'])('restores focus to a connected conflict action after %s', confirmation => {
    const { propertiesContainer } = setup(); const trigger = action(propertiesContainer, 'Résoudre le conflit');
    trigger.focus(); expect(document.activeElement).toBe(trigger); trigger.click();
    const dialog = propertiesContainer.querySelector('dialog[open]'); const select = dialog?.querySelector('select');
    if (!dialog || !select) throw new Error('Missing open confirmation');
    select.value = 'other-wins'; select.dispatchEvent(new Event('change'));
    action(dialog, confirmation).click();
    const focused = document.activeElement;
    expect(focused?.isConnected).toBe(true); expect(focused).toBeInstanceOf(HTMLButtonElement);
    expect(focused?.textContent).toBe('Résoudre le conflit');
    expect(propertiesContainer.contains(focused)).toBe(true);
  });
});
