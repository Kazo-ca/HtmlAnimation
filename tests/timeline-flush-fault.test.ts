// tests/timeline-flush-fault.test.ts
// Genuine HA8 packages; only their public manual clock receives a one-shot fault.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import type * as TimelineRuntime from '@kazo-ca/timeline-runtime';

const clockFault = vi.hoisted(() => ({ armed: false, failures: 0, message: 'Injected public clock failure after real advance(0)' }));

vi.mock('@kazo-ca/timeline-runtime', async importOriginal => {
  const runtime = await importOriginal<typeof TimelineRuntime>();
  return {
    ...runtime,
    createManualClock: (...args: Parameters<typeof runtime.createManualClock>) => {
      const clock = runtime.createManualClock(...args);
      const advance = clock.advance.bind(clock);
      vi.spyOn(clock, 'advance').mockImplementation((...parameters) => {
        advance(...parameters);
        if (clockFault.armed && parameters[0] === 0) {
          clockFault.armed = false; clockFault.failures++;
          throw new Error(clockFault.message);
        }
      });
      return clock;
    },
  };
});

const cleanup: (() => void)[] = [];
afterEach(() => {
  clockFault.armed = false;
  for (const dispose of cleanup.splice(0).reverse()) dispose();
  vi.restoreAllMocks(); document.body.replaceChildren(); clockFault.failures = 0;
});

function setup() {
  const scene = createGradientScene(document);
  const editorContainer = document.createElement('div'); const propertiesContainer = document.createElement('div'); const treeContainer = document.createElement('div');
  document.body.append(editorContainer, scene, propertiesContainer, treeContainer);
  const host = createRealGradientHost(editorContainer, scene);
  cleanup.push(() => host.dispose());
  const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline: host.editor, adapter: () => host.adapter });
  cleanup.push(() => designer.dispose()); designer.selectTarget('#gradient-box'); host.navigate(50);
  expect(host.adapter.kind).toBe('real'); expect(clockFault.failures).toBe(0);
  return { host, designer, propertiesContainer };
}

function observe(designer: HtmlDesigner) {
  const fault = vi.fn(); const property = vi.fn(); const original = vi.fn(); const structure = vi.fn();
  designer.on('fault', fault); designer.on('propertychange', property); designer.on('documentchange', original); designer.on('gradientchange', structure);
  return { fault, property, original, structure };
}

function expectLatched(fixture: ReturnType<typeof setup>, events: ReturnType<typeof observe>): void {
  const { host, designer, propertiesContainer } = fixture; const message = designer.getFault();
  expect(message).toBeTruthy(); expect(host.adapter.getState().fault).toBeTruthy();
  expect(events.fault).toHaveBeenCalledExactlyOnceWith({ message });
  expect(events.property).not.toHaveBeenCalled(); expect(events.original).not.toHaveBeenCalled(); expect(events.structure).not.toHaveBeenCalled();
  expect(propertiesContainer.querySelector('.designer-status')?.textContent).toContain(message);
  expect(host.adapter.getState()).toMatchObject({ canUndo: false, canRedo: false });

  const gradient = host.adapter.gradients;
  if (!gradient) throw new Error('Missing genuine gradient capability');
  const execute = vi.spyOn(host.adapter, 'execute'); const gradientExecute = vi.spyOn(gradient, 'execute');
  const undo = vi.spyOn(host.adapter, 'undo'); const redo = vi.spyOn(host.adapter, 'redo');
  const committed = host.editor.document;
  expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 77 }]).status).toBe('faulted');
  expect(designer.editProperty('opacity', '0.7').status).toBe('faulted');
  expect(designer.beginGradientGesture().status).toBe('faulted'); expect(designer.beginGeometryGesture('move').status).toBe('faulted');
  expect(designer.undo().status).toBe('faulted'); expect(designer.redo().status).toBe('faulted');
  expect(execute).not.toHaveBeenCalled(); expect(gradientExecute).not.toHaveBeenCalled(); expect(undo).not.toHaveBeenCalled(); expect(redo).not.toHaveBeenCalled();

  // The real adapter must retain its own lock even when called without Designer.
  const snapshot = gradient.read('gradientObject');
  if (!snapshot) throw new Error('Missing genuine gradient snapshot');
  expect(gradient.execute({ objectId: snapshot.objectId, revision: snapshot.revision, frame: host.editor.playback.frame, intent: { kind: 'edit', changes: [{ gradientId: 'main', component: 'angle', value: 77 }] } }, () => true).status).toBe('faulted');
  expect(host.adapter.execute('After uncertain flush', []).status).toBe('faulted');
  expect(host.adapter.undo().status).toBe('faulted'); expect(host.adapter.redo().status).toBe('faulted');
  expect(host.editor.document).toBe(committed);

  host.navigate(20); designer.selectTarget('#gradient-box');
  expect(host.adapter.getState().frame).toBe(20); expect(designer.getFault()).toBe(message);
  const angle = propertiesContainer.querySelector<HTMLInputElement>('input[aria-label="Angle du dégradé"]');
  expect(angle).not.toBeNull(); expect(angle?.disabled).toBe(true);
  expect(events.fault).toHaveBeenCalledOnce(); expect(propertiesContainer.querySelector('.designer-status')?.textContent).toContain(message);
  expect(events.property).not.toHaveBeenCalled(); expect(events.original).not.toHaveBeenCalled(); expect(events.structure).not.toHaveBeenCalled();
}

describe('post-commit clock faults through genuine HA8 packages', () => {
  it('latches a gradient commit flush failure instead of claiming a mutation-free rejection', () => {
    const fixture = setup(); const { host, designer } = fixture; const before = host.editor.document; const events = observe(designer);
    clockFault.armed = true;
    const result = designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
    expect(clockFault.failures).toBe(1); expect(host.editor.document).not.toEqual(before); expect(host.editor.canUndo).toBe(true);
    expect(result).toMatchObject({ status: 'faulted', message: expect.any(String) });
    expectLatched(fixture, events);
  });

  it('latches a real opacity commit flush failure instead of claiming a mutation-free rejection', () => {
    const fixture = setup(); const { host, designer } = fixture; designer.selectTarget('#gradient-peer'); const before = host.editor.document; const events = observe(designer);
    clockFault.armed = true;
    const result = designer.editProperty('opacity', '0.4');
    expect(clockFault.failures).toBe(1); expect(host.editor.document).not.toEqual(before); expect(host.editor.canUndo).toBe(true);
    expect(result).toMatchObject({ status: 'faulted', message: expect.any(String) });
    expectLatched(fixture, events);
  });

  for (const direction of ['undo', 'redo'] as const) it(`latches a flush failure after a genuine ${direction} has changed the document`, () => {
    const fixture = setup(); const { host, designer } = fixture;
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
    if (direction === 'redo') expect(designer.undo().status).toBe('changed');
    const before = host.editor.document; const events = observe(designer);
    clockFault.armed = true;

    expect(designer[direction]()).toMatchObject({ status: 'faulted', message: expect.any(String) });
    expect(clockFault.failures).toBe(1); expect(host.editor.document).not.toEqual(before);
    expectLatched(fixture, events);
  });
});
