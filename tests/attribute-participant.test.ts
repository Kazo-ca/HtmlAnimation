// tests/attribute-participant.test.ts
// Prepared host-effect simulation only; real HA8 conformity is tested separately.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import type { ReversibleEffect } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture } from './helpers.js';

type Direction = 'execute' | 'undo' | 'redo';
interface PreparedEffect { readonly changed: boolean; apply(): void; rollback(): void }
const designers: HtmlDesigner[] = [];

afterEach(() => {
  for (const designer of designers.splice(0)) designer.dispose();
  vi.restoreAllMocks(); document.body.replaceChildren();
});

function prepare(effect: ReversibleEffect | undefined, direction: Direction): PreparedEffect {
  expect(effect).toBeDefined();
  const prepare = effect && Reflect.get(effect, 'prepare');
  expect(typeof prepare, 'Attribute commands must provide a prepared participant').toBe('function');
  if (typeof prepare !== 'function') throw new Error('Missing prepared attribute participant');
  const result: unknown = Reflect.apply(prepare, effect, [direction]);
  expect(result).toMatchObject({ changed: expect.any(Boolean), apply: expect.any(Function), rollback: expect.any(Function) });
  return result as PreparedEffect;
}

function setup(initialize?: (fixture: ReturnType<typeof createSceneFixture>) => void) {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  initialize?.(fixture);
  const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designers.push(designer);
  if (fixture.buttons[0].id) designer.selectTarget(`#${fixture.buttons[0].id}`); else designer.selectElements([fixture.buttons[0]]);
  return { ...fixture, timeline, designer };
}

function preparedDriver(timeline: ReturnType<typeof createRecordedTimeline>) {
  const commit = timeline.execute; const directions: Direction[] = [];
  const execute = vi.spyOn(timeline, 'execute').mockImplementation((label, writes, effect) => {
    if (!effect) return commit(label, writes);
    let initial = true;
    return commit(label, writes, {
      redo: () => { const direction = initial ? 'execute' : 'redo'; directions.push(direction); prepare(effect, direction).apply(); initial = false; },
      undo: () => { directions.push('undo'); prepare(effect, 'undo').apply(); },
    });
  });
  return { commit, execute, directions };
}

const compensated = { status: 'rejected' as const, message: 'Simulation : candidat compensé avant validation.' };

describe('prepared attribute transaction participants with a simulation only', () => {
  it('prepares a pure attribute participant before the host chooses to apply it', () => {
    const { designer, timeline, buttons, propertiesContainer, treeContainer } = setup();
    const element = buttons[0]; const source = element.getAttribute('class');
    const journal = designer.getDocumentChanges(); const tree = treeContainer.textContent;
    const target = propertiesContainer.querySelector('.designer-selection')?.textContent;
    const original = vi.fn(); designer.on('documentchange', original);
    let received: ReversibleEffect | undefined;
    vi.spyOn(timeline, 'execute').mockImplementation((_label, _writes, effect) => {
      received = effect;
      const prepared = prepare(effect, 'execute'); expect(prepared.changed).toBe(true);
      expect(element.getAttribute('class')).toBe(source); expect(designer.getDocumentChanges()).toEqual(journal);
      expect(treeContainer.textContent).toBe(tree); expect(propertiesContainer.querySelector('.designer-selection')?.textContent).toBe(target);
      expect(original).not.toHaveBeenCalled();
      return { status: 'rejected', message: 'Simulation : refus avant application.' };
    });
    const result = designer.setAttribute(element, 'class', 'button prepared');
    expect(typeof (received && Reflect.get(received, 'prepare'))).toBe('function');
    expect(result.status).toBe('rejected');
    timeline.navigate(50); expect(original).not.toHaveBeenCalled();
  });

  for (const sample of [
    { attribute: 'id', before: null, after: 'NewTarget' },
    { attribute: 'id', before: 'button-1', after: 'NewTarget' },
    { attribute: 'class', before: null, after: 'button added' },
    { attribute: 'class', before: '', after: 'button added' },
  ] as const) it(`restores exact ${sample.attribute} ${JSON.stringify(sample.before)} after a DOM write throws`, () => {
    const { designer, timeline, buttons, treeContainer } = setup(({ buttons }) => {
      if (sample.before === null) buttons[0].removeAttribute(sample.attribute); else buttons[0].setAttribute(sample.attribute, sample.before);
    });
    const element = buttons[0]; const journal = designer.getDocumentChanges(); const tree = treeContainer.textContent;
    const original = vi.fn(); designer.on('documentchange', original);
    const write = element.setAttribute.bind(element); let shouldThrow = true;
    vi.spyOn(element, 'setAttribute').mockImplementation((name, value) => {
      write(name, value);
      if (name === sample.attribute && shouldThrow) { shouldThrow = false; throw new Error('DOM write interrupted after mutation'); }
    });
    vi.spyOn(timeline, 'execute').mockImplementation((_label, _writes, effect) => {
      const prepared = prepare(effect, 'execute');
      expect(() => prepared.apply()).toThrow('DOM write interrupted after mutation');
      expect(element.getAttribute(sample.attribute)).toBe(sample.after);
      prepared.rollback(); return compensated;
    });

    expect(designer.setAttribute(element, sample.attribute, sample.after)).toEqual(compensated);
    expect(element.getAttribute(sample.attribute)).toBe(sample.before); expect(element.hasAttribute(sample.attribute)).toBe(sample.before !== null);
    expect(designer.getDocumentChanges()).toEqual(journal); expect(treeContainer.textContent).toBe(tree); expect(designer.getFault()).toBeNull();
    timeline.navigate(50); expect(original).not.toHaveBeenCalled();
  });

  it('restores an existing root journal and its chosen target after provisional application is rejected', () => {
    const { designer, timeline, scene, propertiesContainer } = setup(); const driver = preparedDriver(timeline);
    expect(designer.setAttribute(scene, 'id', 'RootTarget').status).toBe('changed'); designer.selectTarget('#RootTarget');
    const before = designer.getDocumentChanges();
    expect(before).toEqual([{ fullXPath: '/html/body/section', attribute: 'id', oldValue: null, newValue: 'RootTarget' }]);
    const original = vi.fn(); designer.on('documentchange', original);
    driver.execute.mockImplementationOnce((_label, _writes, effect) => {
      const prepared = prepare(effect, 'execute'); prepared.apply();
      expect(scene.id).toBe('ProvisionalRoot');
      expect(designer.getDocumentChanges()).toEqual([{ ...before[0], newValue: 'ProvisionalRoot' }]);
      prepared.rollback(); return compensated;
    });
    expect(designer.setAttribute(scene, 'id', 'ProvisionalRoot')).toEqual(compensated);
    expect(scene.id).toBe('RootTarget'); expect(designer.getDocumentChanges()).toEqual(before);
    timeline.navigate(50); expect(original).not.toHaveBeenCalled();
    expect(propertiesContainer.querySelector('.designer-selection')?.textContent).toBe('#RootTarget');
    expect(designer.editProperty('opacity', '0.4').status).toBe('changed');
    expect(timeline.getKeys()).toEqual([expect.objectContaining({ selector: '#RootTarget', frame: 50 })]);
  });

  it('compensates a refresh exception after the attribute and journal have already changed', () => {
    const { designer, timeline, buttons, treeContainer } = setup(); const element = buttons[0];
    const tree = treeContainer.querySelector<HTMLUListElement>('[role="tree"]');
    if (!tree) throw new Error('Missing fixture tree');
    const before = tree.textContent; const journal = designer.getDocumentChanges();
    const replace = tree.replaceChildren.bind(tree); let shouldThrow = true;
    vi.spyOn(tree, 'replaceChildren').mockImplementation((...nodes) => {
      replace(...nodes);
      if (shouldThrow) { shouldThrow = false; throw new Error('Tree refresh interrupted after rendering'); }
    });
    const original = vi.fn(); designer.on('documentchange', original);
    vi.spyOn(timeline, 'execute').mockImplementation((_label, _writes, effect) => {
      const prepared = prepare(effect, 'execute');
      expect(() => prepared.apply()).toThrow('Tree refresh interrupted after rendering');
      expect(element.id).toBe('Renamed'); expect(designer.getDocumentChanges()).toHaveLength(1);
      prepared.rollback(); return compensated;
    });
    expect(designer.setAttribute(element, 'id', 'Renamed')).toEqual(compensated);
    expect(element.id).toBe('button-1'); expect(designer.getDocumentChanges()).toEqual(journal); expect(tree.textContent).toBe(before);
    timeline.navigate(50); expect(original).not.toHaveBeenCalled(); expect(designer.getFault()).toBeNull();
    // A restored ID without the original chosen target would still reject this edit.
    vi.mocked(timeline.execute).mockRestore();
    expect(designer.editProperty('opacity', '0.4').status).toBe('changed');
  });

  it('restores an earlier pending execute notification when a prepared undo is rolled back', () => {
    const { designer, timeline, buttons } = setup(); const commit = timeline.execute; const original = vi.fn(); designer.on('documentchange', original);
    vi.spyOn(timeline, 'execute').mockImplementation((label, writes, effect) => {
      const forward = prepare(effect, 'execute'); forward.apply();
      const journal = designer.getDocumentChanges(); const backward = prepare(effect, 'undo');
      expect(designer.getDocumentChanges()).toEqual(journal);
      backward.apply(); expect(buttons[0].className).toBe('button');
      backward.rollback(); expect(buttons[0].className).toBe('button selected'); expect(designer.getDocumentChanges()).toEqual(journal);
      expect(original).not.toHaveBeenCalled();
      // This host now accepts the already applied participant and emits once.
      return commit(label, writes, { redo: () => undefined, undo: () => undefined });
    });
    expect(designer.setAttribute(buttons[0], 'class', 'button selected').status).toBe('changed');
    expect(original).toHaveBeenCalledExactlyOnceWith({ direction: 'execute', changes: [{ fullXPath: '/html/body/section/div/button[1]', attribute: 'class', oldValue: 'button', newValue: 'button selected' }] });
    timeline.navigate(50); expect(original).toHaveBeenCalledOnce();
  });

  for (const presentValue of [null, '', 'host-owned value'] as const) it(`refuses stale undo preparation without overwriting external DOM ${JSON.stringify(presentValue)}`, () => {
    const { designer, timeline, buttons } = setup(); const commit = timeline.execute; const element = buttons[0];
    let participant: ReversibleEffect | undefined;
    vi.spyOn(timeline, 'execute').mockImplementation((label, writes, effect) => { participant = effect; return commit(label, writes, effect); });
    expect(designer.setAttribute(element, 'class', 'button selected').status).toBe('changed');
    const journal = designer.getDocumentChanges();
    // A source changed outside the command must be rejected before any effect.
    if (presentValue === null) element.removeAttribute('class'); else element.setAttribute('class', presentValue);
    const original = vi.fn(); designer.on('documentchange', original);
    vi.spyOn(timeline, 'undo').mockImplementation(() => {
      expect(() => prepare(participant, 'undo')).toThrow('L’attribut source a changé hors de cette commande.');
      return compensated;
    });

    expect(designer.undo()).toEqual(compensated);
    expect(element.getAttribute('class')).toBe(presentValue); expect(element.hasAttribute('class')).toBe(presentValue !== null);
    expect(designer.getDocumentChanges()).toEqual(journal); expect(timeline.getState().canUndo).toBe(true);
    timeline.navigate(50); expect(original).not.toHaveBeenCalled(); expect(designer.getFault()).toBeNull();
  });

  it('retries a compensated participant as execute and later reports genuine undo and redo', () => {
    const { designer, timeline, buttons } = setup(); const commit = timeline.execute; const original = vi.fn(); designer.on('documentchange', original);
    let retry: ReversibleEffect | undefined;
    const execute = vi.spyOn(timeline, 'execute').mockImplementationOnce((_label, _writes, effect) => {
      retry = effect; const prepared = prepare(effect, 'execute'); prepared.apply(); prepared.rollback(); return compensated;
    });
    expect(designer.setAttribute(buttons[0], 'class', 'button selected')).toEqual(compensated);
    timeline.navigate(50); expect(original).not.toHaveBeenCalled();
    execute.mockImplementationOnce((label, writes) => commit(label, writes, retry));
    expect(designer.setAttribute(buttons[0], 'class', 'button selected').status).toBe('changed');
    expect(original).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ direction: 'execute' }));
    expect(designer.undo().status).toBe('changed'); expect(original).toHaveBeenLastCalledWith(expect.objectContaining({ direction: 'undo' }));
    expect(designer.redo().status).toBe('changed'); expect(original).toHaveBeenLastCalledWith(expect.objectContaining({ direction: 'redo' }));
    expect(original.mock.calls.every(([event]) => event?.changes[0]?.fullXPath === '/html/body/section/div/button[1]')).toBe(true);
  });

  it('uses explicit prepared directions for accepted attribute history and the captured original XPath', () => {
    const { designer, timeline, buttons } = setup(); const driver = preparedDriver(timeline); const original = vi.fn(); designer.on('documentchange', original);
    expect(designer.setAttribute(buttons[0], 'id', 'Renamed').status).toBe('changed');
    expect(designer.undo().status).toBe('changed'); expect(buttons[0].id).toBe('button-1'); expect(designer.getDocumentChanges()).toEqual([]);
    expect(designer.redo().status).toBe('changed'); expect(buttons[0].id).toBe('Renamed');
    expect(driver.directions).toEqual(['execute', 'undo', 'redo']);
    expect(original.mock.calls.map(([event]) => event?.direction)).toEqual(['execute', 'undo', 'redo']);
    expect(original.mock.calls.every(([event]) => event?.changes[0]?.fullXPath === '/html/body/section/div/button[1]')).toBe(true);
  });

  it('preserves an existing redo branch when an attribute candidate is compensated and refused', () => {
    const { designer, timeline, buttons } = setup(); const driver = preparedDriver(timeline); const original = vi.fn();
    expect(designer.setAttribute(buttons[0], 'class', 'button selected').status).toBe('changed');
    expect(designer.undo().status).toBe('changed'); expect(timeline.getState().canRedo).toBe(true);
    designer.on('documentchange', original);
    driver.execute.mockImplementationOnce((_label, _writes, effect) => {
      const prepared = prepare(effect, 'execute'); prepared.apply(); prepared.rollback(); return compensated;
    });
    expect(designer.setAttribute(buttons[0], 'id', 'Rejected')).toEqual(compensated);
    expect(timeline.getState().canRedo).toBe(true); expect(designer.getDocumentChanges()).toEqual([]); expect(buttons[0].id).toBe('button-1');
    timeline.navigate(50); expect(original).not.toHaveBeenCalled();
    expect(designer.redo().status).toBe('changed'); expect(buttons[0].className).toBe('button selected');
    expect(original).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ direction: 'redo' }));
  });
});
