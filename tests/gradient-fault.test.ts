// tests/gradient-fault.test.ts
// Fault injection through the local adapter simulation; not real HA8 conformity.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import type { PropertyWrite, ReversibleEffect } from '../packages/designer/src/index.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createGradientTimeline } from '../fixtures/gradient-timeline.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture } from './helpers.js';

const designers: HtmlDesigner[] = [];
const faultMessage = 'La compensation a échoué. L’état du projet doit être rechargé.';

afterEach(() => {
  for (const designer of designers.splice(0)) designer.dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function setup(configure?: (timeline: ReturnType<typeof createGradientTimeline>) => void) {
  const scene = createGradientScene(document);
  const propertiesContainer = document.createElement('div');
  const treeContainer = document.createElement('div');
  document.body.append(scene, propertiesContainer, treeContainer);
  const element = scene.querySelector<HTMLElement>('#gradient-box');
  if (!element) throw new Error('Missing gradient fault target');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 300, 180));
  const timeline = createGradientTimeline();
  configure?.(timeline);
  const designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: instance => instance });
  designers.push(designer);
  designer.selectTarget('#gradient-box');
  return { designer, timeline, scene, element, propertiesContainer };
}

function failGradient(timeline: ReturnType<typeof createGradientTimeline>): void {
  Reflect.set(timeline.gradients, 'execute', () => ({ status: 'faulted', message: faultMessage }));
}

function field(container: HTMLElement, label: string): HTMLInputElement {
  const input = [...container.querySelectorAll<HTMLInputElement>('input')].find(candidate => candidate.getAttribute('aria-label') === label);
  if (!input) throw new Error(`Missing field ${label}`);
  return input;
}

function click(container: HTMLElement, text: string): void {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(candidate => candidate.textContent === text);
  if (!button) throw new Error(`Missing button ${text}`);
  button.click();
}

describe('persistent Designer faults with the local simulation only', () => {
  it('keeps a fault with an empty backend message locked and visibly explained', () => {
    const { designer, timeline, propertiesContainer } = setup();
    const execute = vi.spyOn(timeline.gradients, 'execute').mockReturnValue({ status: 'faulted', message: '' });
    const fault = vi.fn(); designer.on('fault', fault);
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('faulted');
    expect(designer.getFault()?.trim()).toBeTruthy();
    expect(propertiesContainer.querySelector('.designer-status')?.textContent?.trim()).toBeTruthy();
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 40 }]).status).toBe('faulted');
    const undo = vi.spyOn(timeline, 'undo'); expect(designer.undo().status).toBe('faulted');
    expect(execute).toHaveBeenCalledOnce(); expect(undo).not.toHaveBeenCalled(); expect(fault).toHaveBeenCalledOnce();
  });
  it('recognizes an empty host-reported fault at construction', () => {
    const { designer, timeline } = setup(timeline => {
      const getState = timeline.getState;
      vi.spyOn(timeline, 'getState').mockImplementation(() => ({ ...getState(), fault: '' }));
    });
    const execute = vi.spyOn(timeline, 'execute');
    expect(designer.getFault()?.trim()).toBeTruthy();
    expect(designer.editProperty('opacity', '0.4').status).toBe('faulted'); expect(execute).not.toHaveBeenCalled();
  });
  it('preserves an explicit compensation failure instead of reporting success or rejection', () => {
    const { designer, timeline } = setup();
    failGradient(timeline);
    const property = vi.fn(); const original = vi.fn(); const structure = vi.fn();
    designer.on('propertychange', property); designer.on('documentchange', original); designer.on('gradientchange', structure);

    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }])).toEqual({ status: 'faulted', message: faultMessage });
    expect(property).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled(); expect(structure).not.toHaveBeenCalled();
  });

  it('treats an execution exception with uncertain partial state as a persistent fault', () => {
    const { designer, timeline } = setup();
    const execute = timeline.gradients.execute;
    vi.spyOn(timeline.gradients, 'execute').mockImplementation((request, isCurrent) => {
      execute(request, isCurrent);
      throw new Error('Compensation failed after a partial write');
    });
    const property = vi.fn(); const original = vi.fn();
    designer.on('propertychange', property); designer.on('documentchange', original);

    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }])).toMatchObject({ status: 'faulted', message: expect.any(String) });
    expect(property).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled();
    expect(designer.getFault()).toBeTruthy();
    expect(designer.undo().status).toBe('faulted');
  });

  it('discards a structural success notification when the real panel callback throws after the host write', () => {
    const { designer, timeline, propertiesContainer } = setup();
    const execute = timeline.gradients.execute;
    const attempted = vi.spyOn(timeline.gradients, 'execute').mockImplementation((request, isCurrent) => {
      execute(request, isCurrent);
      throw new Error('Uncertain compensation after adding the point');
    });
    const structure = vi.fn(); const property = vi.fn(); const original = vi.fn(); const fault = vi.fn();
    designer.on('gradientchange', structure); designer.on('propertychange', property);
    designer.on('documentchange', original); designer.on('fault', fault);
    click(propertiesContainer, 'Ajouter un point');
    field(propertiesContainer, 'Position du nouveau point').value = '35';
    click(propertiesContainer, 'Ajouter ce point');

    expect(attempted).toHaveBeenCalledOnce(); expect(designer.getFault()).toBeTruthy(); expect(fault).toHaveBeenCalledOnce();
    expect(structure).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled();
    timeline.navigate(50); timeline.navigate(1);
    expect(structure).not.toHaveBeenCalled(); expect(field(propertiesContainer, 'Angle du dégradé').disabled).toBe(true);
  });

  it('does not emit accepted component events after a host callback has already reported a fault', () => {
    let hostFault: string | null = null;
    const { designer, timeline } = setup(timeline => {
      const getState = timeline.getState;
      vi.spyOn(timeline, 'getState').mockImplementation(() => ({ ...getState(), ...(hostFault ? { fault: hostFault } : {}) }));
    });
    const execute = timeline.gradients.execute;
    vi.spyOn(timeline.gradients, 'execute').mockImplementation((request, isCurrent) => {
      const result = execute(request, isCurrent);
      hostFault = faultMessage;
      timeline.navigate(50);
      return result;
    });
    const property = vi.fn(); const fault = vi.fn(); designer.on('propertychange', property); designer.on('fault', fault);

    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }])).toEqual({ status: 'faulted', message: faultMessage });
    expect(designer.getFault()).toBe(faultMessage); expect(fault).toHaveBeenCalledExactlyOnceWith({ message: faultMessage });
    expect(property).not.toHaveBeenCalled();
  });

  it('cancels a panel range preview on fault and aborts retained input handlers', () => {
    const { designer, timeline, propertiesContainer } = setup();
    designer.selectGradient('main', 'middle');
    const retained = field(propertiesContainer, 'Déplacer le point dans la barre');
    retained.value = '70'; retained.dispatchEvent(new Event('input', { bubbles: true }));
    expect(designer.getGradientState()?.gradients[0]?.stops.find(stop => stop.id === 'middle')?.position).toBe(70);
    Reflect.set(timeline, 'execute', () => ({ status: 'faulted', message: faultMessage }));
    expect(designer.editProperty('opacity', '0.4').status).toBe('faulted');
    expect(designer.getGradientState()?.gradients[0]?.stops.find(stop => stop.id === 'middle')?.position).toBe(50);
    const execute = vi.spyOn(timeline, 'execute'); const gradientExecute = vi.spyOn(timeline.gradients, 'execute');
    const compose = vi.spyOn(timeline.gradients, 'compose'); const property = vi.fn(); designer.on('propertychange', property);
    retained.value = '80'; retained.dispatchEvent(new Event('input', { bubbles: true })); retained.dispatchEvent(new Event('change', { bubbles: true }));
    expect(designer.getFault()).toBe(faultMessage); expect(field(propertiesContainer, 'Position du point').disabled).toBe(true);
    expect(execute).not.toHaveBeenCalled(); expect(gradientExecute).not.toHaveBeenCalled(); expect(compose).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled();
  });

  it('has already locked mutations when a fault observer immediately attempts another edit', () => {
    const { designer, timeline } = setup(); failGradient(timeline);
    const execute = vi.spyOn(timeline, 'execute'); const gradientExecute = vi.spyOn(timeline.gradients, 'execute');
    const attempted: unknown[] = [];
    designer.on('fault', () => {
      attempted.push(designer.editProperty('opacity', '0.4'), designer.editGradient([{ gradientId: 'main', component: 'angle', value: 50 }]), designer.undo());
    });
    designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
    expect(attempted).toEqual(Array.from({ length: 3 }, () => ({ status: 'faulted', message: faultMessage })));
    expect(execute).not.toHaveBeenCalled(); expect(gradientExecute).toHaveBeenCalledOnce();
  });

  it('keeps a known rejection recoverable without latching a fault', () => {
    const { designer, timeline } = setup();
    vi.spyOn(timeline.gradients, 'execute').mockReturnValueOnce({ status: 'rejected', message: 'La valeur a été refusée avant écriture.' });
    const fault = vi.fn(); const property = vi.fn(); designer.on('fault', fault); designer.on('propertychange', property);
    const keys = timeline.getKeys();

    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('rejected');
    expect(designer.getFault()).toBeNull(); expect(timeline.getKeys()).toEqual(keys);
    expect(fault).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled();
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 45 }]).status).toBe('changed');
    expect(designer.undo().status).toBe('changed'); expect(timeline.getKeys()).toEqual(keys);
  });

  it('does not classify a pure preview composition exception as an uncertain mutation', () => {
    const { designer, timeline } = setup(); const keys = timeline.getKeys();
    vi.spyOn(timeline.gradients, 'compose').mockImplementationOnce(() => { throw new Error('Pure preview composition is unavailable'); });
    const fault = vi.fn(); designer.on('fault', fault);
    expect(designer.beginGradientGesture().status).toBe('changed');
    expect(designer.previewGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('rejected');
    expect(designer.getFault()).toBeNull(); expect(timeline.getKeys()).toEqual(keys); expect(fault).not.toHaveBeenCalled();
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 45 }]).status).toBe('changed');
    expect(designer.undo().status).toBe('changed'); expect(timeline.getKeys()).toEqual(keys);
  });

  it('latches one visible fault and blocks every mutation and history entry point before the adapter', () => {
    const { designer, timeline, scene, element, propertiesContainer } = setup();
    failGradient(timeline);
    const fault = vi.fn(); const diagnostic = vi.fn(); const property = vi.fn(); const original = vi.fn();
    designer.on('fault', fault); designer.on('diagnostic', diagnostic);
    designer.on('propertychange', property); designer.on('documentchange', original);
    designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
    expect(designer.getFault()).toBe(faultMessage);
    expect(fault).toHaveBeenCalledExactlyOnceWith({ message: faultMessage });
    expect(diagnostic).toHaveBeenCalledWith({ message: faultMessage });
    expect(propertiesContainer.querySelector('.designer-status')?.textContent).toContain(faultMessage);
    expect(field(propertiesContainer, 'Angle du dégradé').disabled).toBe(true);
    expect(field(propertiesContainer, 'Nouvel identifiant').disabled).toBe(true);
    expect(field(propertiesContainer, 'Classes du document').disabled).toBe(true);

    const execute = vi.spyOn(timeline, 'execute'); const gradientExecute = vi.spyOn(timeline.gradients, 'execute');
    const compose = vi.spyOn(timeline.gradients, 'compose'); const undo = vi.spyOn(timeline, 'undo'); const redo = vi.spyOn(timeline, 'redo');
    const peer = scene.querySelector<HTMLElement>('#gradient-peer');
    if (!peer) throw new Error('Missing unbound source element');
    const sourceId = peer.id; const keys = timeline.getKeys(); const style = element.getAttribute('style');
    const commands: readonly (readonly [string, () => { readonly status: string }])[] = [
      ['editGradient', () => designer.editGradient([{ gradientId: 'main', component: 'angle', value: 40 }])],
      ['addGradientStop', () => designer.addGradientStop('main', { color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 0.5, position: 30 })],
      ['removeGradientStop', () => designer.removeGradientStop('main', 'middle')],
      ['editProperty', () => designer.editProperty('opacity', '0.4')],
      ['editProperties', () => designer.editProperties([{ property: 'width', newValue: '250px' }])],
      ['setAttribute', () => designer.setAttribute(peer, 'id', 'renamed-peer')],
      ['beginGeometryGesture', () => designer.beginGeometryGesture('move')],
      ['updateGeometryGesture', () => designer.updateGeometryGesture({ x: 10, y: 20 })],
      ['commitGeometryGesture', () => designer.commitGeometryGesture()],
      ['setGeometryPivot', () => designer.setGeometryPivot(20, 30)],
      ['beginGradientGesture', () => designer.beginGradientGesture()],
      ['previewGradient', () => designer.previewGradient([{ gradientId: 'main', component: 'angle', value: 40 }])],
      ['commitGradientGesture', () => designer.commitGradientGesture()],
      ['resolveConflict', () => designer.resolveConflict('unavailable', 'unavailable')],
      ['undo', () => designer.undo()],
      ['redo', () => designer.redo()],
    ];
    for (const [name, command] of commands) expect(command(), name).toEqual({ status: 'faulted', message: faultMessage });

    expect(execute).not.toHaveBeenCalled(); expect(gradientExecute).not.toHaveBeenCalled(); expect(compose).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled(); expect(redo).not.toHaveBeenCalled();
    expect(peer.id).toBe(sourceId); expect(timeline.getKeys()).toEqual(keys); expect(element.getAttribute('style')).toBe(style);
    expect(property).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled(); expect(fault).toHaveBeenCalledOnce();
  });

  it('permits selection and frame inspection without silently clearing the fault or reenabling editors', () => {
    const { designer, timeline, propertiesContainer } = setup(); failGradient(timeline);
    const fault = vi.fn(); designer.on('fault', fault);
    designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
    const execute = vi.spyOn(timeline, 'execute'); const gradientExecute = vi.spyOn(timeline.gradients, 'execute');
    designer.selectElements([]); timeline.navigate(50); designer.selectTarget('#gradient-box'); designer.selectGradient('main', 'middle');
    expect(designer.getGradientState()?.gradients[0]?.stops.find(stop => stop.id === 'middle')?.position).toBe(60);
    expect(designer.getFault()).toBe(faultMessage);
    expect(field(propertiesContainer, 'Position du point').disabled).toBe(true);
    designer.setMode('test'); designer.setMode('select'); timeline.navigate(1);
    expect(designer.getFault()).toBe(faultMessage);
    expect(field(propertiesContainer, 'Position du point').disabled).toBe(true);
    expect(propertiesContainer.querySelector('.designer-status')?.textContent).toContain(faultMessage);
    expect(fault).toHaveBeenCalledOnce(); expect(execute).not.toHaveBeenCalled(); expect(gradientExecute).not.toHaveBeenCalled();
  });

  for (const outcome of ['faulted', 'throw'] as const) {
    it(`latches a core property execution ${outcome} without a property success event`, () => {
      const { designer, timeline } = setup();
      Reflect.set(timeline, 'execute', () => {
        if (outcome === 'throw') throw new Error('Unknown partial property write');
        return { status: 'faulted', message: faultMessage };
      });
      const fault = vi.fn(); const property = vi.fn(); designer.on('fault', fault); designer.on('propertychange', property);
      const result = designer.editProperty('opacity', '0.4');
      expect(result).toMatchObject({ status: 'faulted', message: expect.any(String) });
      expect(designer.getFault()).toBeTruthy(); expect(fault).toHaveBeenCalledOnce(); expect(property).not.toHaveBeenCalled();
      expect(designer.undo().status).toBe('faulted');
    });

    for (const attribute of ['id', 'class'] as const) {
      it(`does not leak a deferred document success after an uncertain ${attribute} ${outcome}`, () => {
        const { designer, timeline, scene } = setup();
        const peer = scene.querySelector<HTMLElement>('#gradient-peer');
        if (!peer) throw new Error('Missing unbound source element');
        const apply = timeline.execute;
        const execute = vi.fn((label: string, writes: readonly PropertyWrite[], effect?: ReversibleEffect) => {
          // Model a host effect already applied before compensation becomes uncertain.
          // Its pre-fault DOM state is deliberately not asserted to be recoverable.
          apply(label, writes, effect);
          if (outcome === 'throw') throw new Error('Host compensation failed after an attribute write');
          return { status: 'faulted', message: faultMessage };
        });
        Reflect.set(timeline, 'execute', execute);
        const original = vi.fn(); const property = vi.fn(); const fault = vi.fn();
        designer.on('documentchange', original); designer.on('propertychange', property); designer.on('fault', fault);
        const value = attribute === 'id' ? 'changed-peer' : 'gradient-subject changed';

        expect(designer.setAttribute(peer, attribute, value)).toMatchObject({ status: 'faulted', message: expect.any(String) });
        expect(designer.getFault()).toBeTruthy(); expect(fault).toHaveBeenCalledOnce();
        timeline.navigate(50); timeline.navigate(1); designer.selectElements([peer]);
        expect(original).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled();
        const uncertainValue = peer.getAttribute(attribute);
        expect(designer.setAttribute(peer, attribute, 'another-value').status).toBe('faulted');
        expect(peer.getAttribute(attribute)).toBe(uncertainValue); expect(execute).toHaveBeenCalledOnce();
      });
    }

    for (const direction of ['undo', 'redo'] as const) {
      it(`latches a ${direction} compensation ${outcome} before accepting another command`, () => {
        const { designer, timeline } = setup();
        Reflect.set(timeline, direction, () => {
          if (outcome === 'throw') throw new Error('Unknown partial history operation');
          return { status: 'faulted', message: faultMessage };
        });
        const fault = vi.fn(); const property = vi.fn(); const original = vi.fn();
        designer.on('fault', fault); designer.on('propertychange', property); designer.on('documentchange', original);
        expect(designer[direction]()).toMatchObject({ status: 'faulted', message: expect.any(String) });
        expect(designer.getFault()).toBeTruthy(); expect(fault).toHaveBeenCalledOnce();
        const execute = vi.spyOn(timeline, 'execute');
        expect(designer.editProperty('opacity', '0.4').status).toBe('faulted');
        expect(execute).not.toHaveBeenCalled(); expect(property).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled();
      });
    }
  }

  it('observes a host-reported fault on frame changes and retains it when the host later omits it', () => {
    let hostFault: string | null = null;
    const { designer, timeline, propertiesContainer } = setup(timeline => {
      const getState = timeline.getState;
      vi.spyOn(timeline, 'getState').mockImplementation(() => ({ ...getState(), ...(hostFault ? { fault: hostFault } : {}) }));
    });
    const fault = vi.fn(); designer.on('fault', fault);
    expect(designer.getFault()).toBeNull(); hostFault = faultMessage; timeline.navigate(50);
    expect(designer.getFault()).toBe(faultMessage); expect(fault).toHaveBeenCalledExactlyOnceWith({ message: faultMessage });
    hostFault = null; timeline.navigate(1);
    expect(designer.getFault()).toBe(faultMessage); expect(field(propertiesContainer, 'Angle du dégradé').disabled).toBe(true);
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('faulted');
  });

  it('starts disabled when the supplied host already reports an uncertain state', () => {
    const { designer, timeline, propertiesContainer } = setup(timeline => {
      const getState = timeline.getState;
      vi.spyOn(timeline, 'getState').mockImplementation(() => ({ ...getState(), fault: faultMessage }));
    });
    const execute = vi.spyOn(timeline, 'execute'); const gradientExecute = vi.spyOn(timeline.gradients, 'execute');
    expect(designer.getFault()).toBe(faultMessage);
    expect(field(propertiesContainer, 'Angle du dégradé').disabled).toBe(true);
    expect(designer.editProperty('opacity', '0.4').status).toBe('faulted');
    expect(designer.undo().status).toBe('faulted'); expect(designer.redo().status).toBe('faulted');
    expect(execute).not.toHaveBeenCalled(); expect(gradientExecute).not.toHaveBeenCalled();
  });

  it('allows a freshly recreated Designer with a coherent host to edit and undo again', () => {
    const failed = setup(); failGradient(failed.timeline);
    failed.designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]);
    expect(failed.designer.getFault()).toBe(faultMessage);
    failed.designer.dispose();

    const coherent = setup(); const before = coherent.timeline.getKeys();
    expect(coherent.designer.getFault()).toBeNull();
    expect(coherent.designer.editGradient([{ gradientId: 'main', component: 'angle', value: 35 }]).status).toBe('changed');
    expect(coherent.designer.undo().status).toBe('changed'); expect(coherent.timeline.getKeys()).toEqual(before);
    expect(coherent.designer.getFault()).toBeNull();
  });

  it('keeps older adapters without a fault field editable and undoable', () => {
    const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
    const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer); designer.selectTarget('#button-2');
    expect(designer.getFault()).toBeNull();
    expect(designer.editProperty('opacity', '0.4').status).toBe('changed');
    expect(designer.undo().status).toBe('changed'); expect(designer.redo().status).toBe('changed');
    expect(designer.getFault()).toBeNull();
  });
});
