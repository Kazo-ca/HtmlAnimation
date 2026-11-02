// tests/geometry-designer.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture } from './helpers.js';

const designers: HtmlDesigner[] = [];

afterEach(() => {
  for (const designer of designers.splice(0)) designer.dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function setup(sourceWidth = '100px', initialTransform = ''): ReturnType<typeof createSceneFixture> & {
  readonly designer: HtmlDesigner;
  readonly timeline: ReturnType<typeof createRecordedTimeline>;
  readonly element: HTMLButtonElement;
  readonly originalStyle: string | null;
} {
  const fixture = createSceneFixture();
  const element = fixture.buttons[1];
  const parent = element.parentElement;
  if (!parent) throw new Error('Missing geometry fixture parent');
  element.style.position = 'relative'; element.style.left = '0px'; element.style.top = '0px';
  element.style.width = sourceWidth; element.style.height = '50px';
  if (initialTransform) element.style.transform = initialTransform;
  element.style.transformOrigin = '50% 50%';
  const width = sourceWidth === '50%' ? 200 : sourceWidth.startsWith('calc(') ? 190 : 100;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, width, 50));
  vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(width);
  vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(50);
  vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200));
  vi.spyOn(parent, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(parent, 'clientHeight', 'get').mockReturnValue(200);
  const originalStyle = element.getAttribute('style');
  const timeline = createRecordedTimeline();
  const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designers.push(designer); designer.selectTarget('#button-2');
  return { ...fixture, designer, timeline, element, originalStyle };
}

describe('Designer geometry and atomic commands with the recorded simulation only', () => {
  it('commits two properties as one adapter command and restores both with one undo', () => {
    const { designer, timeline, element, originalStyle } = setup();
    timeline.navigate(50);
    const execute = vi.spyOn(timeline, 'execute'); const propertyChange = vi.fn();
    designer.on('propertychange', propertyChange);
    expect(designer.editProperties([{ property: 'left', newValue: '12px' }, { property: 'top', newValue: '7px' }], 'Move')).toEqual({ status: 'changed' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(timeline.getKeys().map(key => ({ property: key.property, value: key.value, frame: key.frame }))).toEqual([
      { property: 'left', value: '12px', frame: 50 }, { property: 'top', value: '7px', frame: 50 },
    ]);
    expect(propertyChange.mock.calls.map(call => call[0])).toEqual([
      { property: 'left', oldValue: '0px', newValue: '12px', frame: 50 },
      { property: 'top', oldValue: '0px', newValue: '7px', frame: 50 },
    ]);
    expect(element.style.left).toBe('12px'); expect(element.style.top).toBe('7px');
    expect(designer.undo()).toEqual({ status: 'changed' });
    expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().objects).toEqual([]);
    expect(element.getAttribute('style')).toBe(originalStyle);
    expect(designer.undo()).toEqual({ status: 'unchanged' });
    expect(designer.redo()).toEqual({ status: 'changed' }); expect(element.style.top).toBe('7px');
  });

  it('rejects an entire compound command when one value is invalid', () => {
    const { designer, timeline, element, originalStyle } = setup();
    const execute = vi.spyOn(timeline, 'execute'); const propertyChange = vi.fn(); designer.on('propertychange', propertyChange);
    expect(designer.editProperties([{ property: 'width', newValue: '120px' }, { property: 'opacity', newValue: 'invalid' }]).status).toBe('rejected');
    expect(execute).not.toHaveBeenCalled(); expect(propertyChange).not.toHaveBeenCalled();
    expect(timeline.getState().canUndo).toBe(false); expect(timeline.getKeys()).toEqual([]);
    expect(element.getAttribute('style')).toBe(originalStyle);
  });

  it('omits unchanged properties and treats an empty command as unchanged', () => {
    const { designer, timeline } = setup(); const changed = vi.fn(); designer.on('propertychange', changed);
    expect(designer.editProperties([])).toEqual({ status: 'unchanged' });
    expect(designer.editProperties([{ property: 'width', newValue: '120px' }, { property: 'height', newValue: '50px' }]).status).toBe('changed');
    expect(timeline.getKeys().map(key => key.property)).toEqual(['width']); expect(changed).toHaveBeenCalledTimes(1);
    designer.undo(); expect(timeline.getKeys()).toEqual([]);
  });

  it('previews repeated move updates without recording keys or emitting edits', () => {
    const { designer, timeline, element, originalStyle } = setup();
    const execute = vi.spyOn(timeline, 'execute'); const changed = vi.fn(); const documentChange = vi.fn();
    designer.on('propertychange', changed); designer.on('documentchange', documentChange);
    expect(designer.beginGeometryGesture('move')).toEqual({ status: 'changed' });
    expect(designer.isGeometryGestureActive()).toBe(true);
    expect(designer.updateGeometryGesture({ x: 12, y: 7 }, { bypassSnap: true }).status).toBe('changed');
    expect(element.getAttribute('style')).not.toBe(originalStyle);
    expect(designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true }).status).toBe('changed');
    expect(execute).not.toHaveBeenCalled(); expect(timeline.getKeys()).toEqual([]);
    expect(changed).not.toHaveBeenCalled(); expect(documentChange).not.toHaveBeenCalled();
    designer.cancelGeometryGesture(); expect(designer.isGeometryGestureActive()).toBe(false);
    expect(element.getAttribute('style')).toBe(originalStyle); expect(timeline.getState().canUndo).toBe(false);
  });

  it('commits the final move delta as independent keys and one undoable gesture', () => {
    const { designer, timeline, element, originalStyle } = setup(); timeline.navigate(50);
    const execute = vi.spyOn(timeline, 'execute'); const changed = vi.fn(); designer.on('propertychange', changed);
    designer.beginGeometryGesture('move');
    designer.updateGeometryGesture({ x: 10, y: 5 }, { bypassSnap: true });
    designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true });
    expect(designer.commitGeometryGesture()).toEqual({ status: 'changed' });
    expect(designer.isGeometryGestureActive()).toBe(false); expect(execute).toHaveBeenCalledTimes(1);
    expect(timeline.getKeys().map(key => ({ property: key.property, value: key.value, frame: key.frame }))).toEqual([
      { property: 'translateX', value: '20px', frame: 50 }, { property: 'translateY', value: '10px', frame: 50 },
    ]);
    expect(changed).toHaveBeenCalledTimes(2); expect(element.style.transform).not.toBe('');
    designer.undo(); expect(timeline.getKeys()).toEqual([]); expect(element.getAttribute('style')).toBe(originalStyle);
    designer.redo(); expect(timeline.getKeys()).toHaveLength(2); expect(element.style.transform).not.toBe('');
  });

  it('does not create a command for a zero-distance gesture', () => {
    const { designer, timeline } = setup(); const execute = vi.spyOn(timeline, 'execute');
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 0, y: 0 }, { bypassSnap: true });
    expect(designer.commitGeometryGesture()).toEqual({ status: 'unchanged' });
    expect(execute).not.toHaveBeenCalled(); expect(timeline.getKeys()).toEqual([]);
  });

  it('preserves an existing redo entry when a preview is canceled', () => {
    const { designer, timeline, element } = setup();
    designer.editProperty('width', '120px'); designer.undo(); expect(timeline.getState().canRedo).toBe(true);
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true });
    designer.cancelGeometryGesture(); expect(timeline.getState().canRedo).toBe(true);
    designer.redo(); expect(element.style.width).toBe('120px');
  });

  it.each(['escape', 'scene-selection', 'target-selection', 'timeline-selection', 'frame', 'test-mode', 'undo', 'redo', 'tool'] as const)('cancels the gesture on %s without recording its preview', action => {
    const { designer, timeline, element, buttons, originalStyle } = setup();
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true });
    switch (action) {
      case 'escape': document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); break;
      case 'scene-selection': designer.selectElements([buttons[0]]); break;
      case 'target-selection': designer.selectTarget('#button-1'); break;
      case 'timeline-selection': timeline.selectObject(null); break;
      case 'frame': timeline.navigate(20); break;
      case 'test-mode': designer.setMode('test'); break;
      case 'undo': designer.undo(); break;
      case 'redo': designer.redo(); break;
      case 'tool': designer.setGeometryTool('dimensions'); break;
    }
    expect(designer.isGeometryGestureActive()).toBe(false);
    expect(element.getAttribute('style')).toBe(originalStyle); expect(timeline.getKeys()).toEqual([]);
    expect(timeline.getState().canUndo).toBe(false);
    expect(designer.commitGeometryGesture()).toEqual({ status: 'unchanged' });
  });

  it('disposes an in-progress preview without retaining styles or creating keys', () => {
    const { designer, timeline, element, originalStyle } = setup();
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true });
    designer.dispose(); expect(element.getAttribute('style')).toBe(originalStyle);
    expect(designer.isGeometryGestureActive()).toBe(false); expect(timeline.getKeys()).toEqual([]);
  });

  it('requires a single selected target and rejects overlapping gesture starts', () => {
    const { designer, timeline } = setup(); designer.selectElements([]);
    expect(designer.beginGeometryGesture('move').status).toBe('rejected');
    designer.selectTarget('.button'); expect(designer.beginGeometryGesture('move').status).toBe('rejected');
    designer.selectTarget('#button-2'); expect(designer.beginGeometryGesture('move').status).toBe('changed');
    expect(designer.beginGeometryGesture('dimensions').status).toBe('rejected');
    designer.cancelGeometryGesture(); expect(timeline.getKeys()).toEqual([]);
  });

  it('rejects nonfinite geometry input without applying or recording it', () => {
    const { designer, timeline, element, originalStyle } = setup(); designer.beginGeometryGesture('move');
    expect(designer.updateGeometryGesture({ x: Number.NaN, y: 2 }).status).toBe('rejected');
    expect(designer.updateGeometryGesture({ x: 2, y: Number.POSITIVE_INFINITY }).status).toBe('rejected');
    expect(element.getAttribute('style')).toBe(originalStyle); expect(timeline.getKeys()).toEqual([]);
  });

  it('preserves percentage dimensions while keeping width/height distinct from scale', () => {
    const { designer, timeline, element, originalStyle } = setup('50%');
    designer.beginGeometryGesture('dimensions');
    expect(designer.updateGeometryGesture({ x: 40, y: 10 }, { bypassSnap: true }).status).toBe('changed');
    expect(element.style.width).toBe('60%'); expect(element.style.height).toBe('60px');
    designer.commitGeometryGesture();
    expect(timeline.getKeys().map(key => ({ property: key.property, value: key.value }))).toEqual([
      { property: 'width', value: '60%' }, { property: 'height', value: '60px' },
    ]);
    expect(timeline.getKeys().some(key => key.property.startsWith('scale'))).toBe(false);
    designer.undo(); expect(element.getAttribute('style')).toBe(originalStyle);
  });

  it.each(['calc(50% - 10px)', 'var(--design-width)'])('requires explicit consent before replacing %s with pixels', source => {
    const { designer, timeline, element, originalStyle } = setup(source);
    designer.beginGeometryGesture('dimensions');
    const result = designer.updateGeometryGesture({ x: 10, y: 5 }, { bypassSnap: true });
    expect(result).toMatchObject({ status: 'confirmation-required', properties: ['width'] });
    expect(element.getAttribute('style')).toBe(originalStyle); expect(timeline.getKeys()).toEqual([]);
    expect(designer.updateGeometryGesture({ x: 10, y: 5 }, { bypassSnap: true, allowUnitReplacement: true }).status).toBe('changed');
    designer.commitGeometryGesture(); expect(timeline.getKeys().find(key => key.property === 'width')?.value).toMatch(/px$/);
    designer.undo(); expect(element.getAttribute('style')).toBe(originalStyle);
  });

  it('records rotation independently and reverses it without dimension keys', () => {
    const { designer, timeline, element, originalStyle } = setup();
    designer.beginGeometryGesture('rotate');
    expect(designer.updateGeometryGesture({ x: 30, y: 400 }, { bypassSnap: true }).status).toBe('changed');
    designer.commitGeometryGesture();
    expect(timeline.getKeys().map(key => ({ property: key.property, value: key.value }))).toEqual([{ property: 'rotation', value: '30deg' }]);
    expect(element.style.width).toBe('100px'); expect(element.style.height).toBe('50px');
    designer.undo(); expect(element.getAttribute('style')).toBe(originalStyle);
  });

  it('keeps the native CSS rotate property distinct from the spatial rotation channel', () => {
    const { designer, timeline, element, originalStyle } = setup();
    expect(designer.editProperty('rotate', 'x 45deg').status).toBe('changed');
    expect(element.style.rotate).toBe('x 45deg'); expect(element.style.transform).toBe('');
    expect(timeline.getKeys().map(key => ({ property: key.property, value: key.value }))).toEqual([{ property: 'rotate', value: 'x 45deg' }]);
    expect(designer.beginGeometryGesture('move').status).toBe('rejected');
    designer.undo(); expect(element.getAttribute('style')).toBe(originalStyle); expect(timeline.getKeys()).toEqual([]);
  });

  it('records scale factors independently from width and height', () => {
    const { designer, timeline, element, originalStyle } = setup();
    designer.beginGeometryGesture('scale');
    designer.updateGeometryGesture({ x: 50, y: 25 }, { bypassSnap: true }); designer.commitGeometryGesture();
    expect(timeline.getKeys().map(key => ({ property: key.property, value: key.value }))).toEqual([
      { property: 'scaleX', value: '1.5' }, { property: 'scaleY', value: '1.5' },
    ]);
    expect(element.style.width).toBe('100px'); expect(element.style.height).toBe('50px');
    designer.undo(); expect(element.getAttribute('style')).toBe(originalStyle);
  });

  it('compensates a pivot-only move on a rotated element in one reversible command', () => {
    const { designer, timeline, element, originalStyle } = setup('100px', 'rotate(90deg)');
    const execute = vi.spyOn(timeline, 'execute');
    designer.beginGeometryGesture('pivot');
    designer.updateGeometryGesture({ x: 10, y: 5 }, { bypassSnap: true }); designer.commitGeometryGesture();
    const values = Object.fromEntries(timeline.getKeys().map(key => [key.property, key.value]));
    expect(values).toMatchObject({ pivotX: '60%', pivotY: '60%', translateX: '-15px', translateY: '5px' });
    expect(values).not.toHaveProperty('rotation'); expect(values).not.toHaveProperty('scaleX');
    expect(execute).toHaveBeenCalledTimes(1);
    designer.undo(); expect(element.getAttribute('style')).toBe(originalStyle);
    expect(timeline.getKeys()).toEqual([]);
  });

  it('restores the preview if the adapter refuses the final gesture command', () => {
    const { designer, timeline, element, originalStyle } = setup();
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true });
    vi.spyOn(timeline, 'execute').mockReturnValueOnce({ status: 'rejected', message: 'La transition est incompatible.' });
    expect(designer.commitGeometryGesture()).toMatchObject({ status: 'rejected' });
    expect(designer.isGeometryGestureActive()).toBe(false);
    expect(element.getAttribute('style')).toBe(originalStyle); expect(timeline.getKeys()).toEqual([]);
    expect(timeline.getState().canUndo).toBe(false);
  });

  it('requires explicit first-gesture targeting and choosing it creates no key', () => {
    const { designer, timeline, element, propertiesContainer } = setup(); designer.selectElements([element]);
    expect(designer.beginGeometryGesture('move').status).toBe('rejected');
    const choices = propertiesContainer.querySelector<HTMLSelectElement>('select[aria-label="Cibles existantes"]');
    if (!choices) throw new Error('Missing first-gesture target choices');
    choices.value = '#button-2'; choices.dispatchEvent(new Event('change'));
    const save = [...propertiesContainer.querySelectorAll('button')].find(button => button.textContent === 'Enregistrer');
    if (!save) throw new Error('Missing target save action'); save.click();
    expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
    expect(designer.beginGeometryGesture('move').status).toBe('changed'); designer.cancelGeometryGesture();
  });

  it('cancels first-gesture targeting without creating an animation object', () => {
    const { designer, timeline, element, propertiesContainer } = setup(); designer.selectElements([element]);
    designer.beginGeometryGesture('move');
    const cancel = [...propertiesContainer.querySelectorAll('button')].find(button => button.textContent === 'Annuler le choix');
    if (!cancel) throw new Error('Missing target cancellation'); cancel.click();
    expect(designer.isGeometryGestureActive()).toBe(false); expect(timeline.getState().objects).toEqual([]);
    expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
  });

  it('rejects concurrent property edits and duplicate properties without corrupting a preview', () => {
    const { designer, timeline } = setup();
    expect(designer.editProperties([{ property: 'width', newValue: '120px' }, { property: 'width', newValue: '140px' }]).status).toBe('rejected');
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 12, y: 7 }, { bypassSnap: true });
    expect(designer.editProperties([{ property: 'width', newValue: '120px' }]).status).toBe('rejected');
    expect(designer.getGeometryState()).toMatchObject({ translateX: '12px', translateY: '7px', width: '100px' });
    designer.cancelGeometryGesture(); expect(timeline.getKeys()).toEqual([]);
  });

  it.each([
    ['scaleX', '0'], ['scaleY', '-1'], ['rotation', '20'], ['translateX', 'calc(10px + 2%)'], ['pivotY', 'NaNpx'],
  ])('rejects unsupported geometric value %s=%s before creating a command', (property, newValue) => {
    const { designer, timeline } = setup();
    expect(designer.editProperties([{ property, newValue }]).status).toBe('rejected'); expect(timeline.getKeys()).toEqual([]);
  });

  it('does not partially apply a compound edit when group base compatibility fails', () => {
    const { designer, timeline } = setup(); designer.selectTarget('.button');
    expect(designer.editProperties([{ property: 'opacity', newValue: '0.5' }, { property: 'margin-top', newValue: '15px' }]).status).toBe('rejected');
    expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
  });

  it('refuses a compound edit with unresolved same-specificity targeting conflict', () => {
    const { designer, timeline, buttons } = setup(); buttons[0].classList.add('primary');
    timeline.execute('Seed competing target', [{ objectId: 'other', selector: '.primary', property: 'opacity', value: '0.4', frame: 1 }]);
    designer.selectTarget('.button');
    expect(designer.editProperties([{ property: 'opacity', newValue: '0.5' }, { property: 'color', newValue: 'red' }]).status).toBe('rejected');
    expect(timeline.getKeys()).toHaveLength(1); expect(timeline.getState().objects).toHaveLength(1);
  });

  it('sets a corner pivot with one undo while leaving angle and scale unchanged', () => {
    const { designer, timeline, element, originalStyle } = setup();
    expect(designer.setGeometryPivot(0, 100).status).toBe('changed');
    expect(designer.getGeometryState()).toMatchObject({ pivotX: '0%', pivotY: '100%', rotate: '0deg', scaleX: '1', scaleY: '1' });
    expect(timeline.getKeys().map(key => key.property)).toEqual(['pivotX', 'pivotY']);
    designer.undo(); expect(element.getAttribute('style')).toBe(originalStyle); expect(timeline.getKeys()).toEqual([]);
  });

  it.each([[Number.NaN, 50], [-1, 50], [50, 101]])('rejects invalid pivot preset %s/%s', (x, y) => {
    const { designer, timeline } = setup(); expect(designer.setGeometryPivot(x, y).status).toBe('rejected');
    expect(timeline.getKeys()).toEqual([]); expect(designer.isGeometryGestureActive()).toBe(false);
  });

  it('refuses geometry in Test mode or after disposal and exposes no state for a group', () => {
    const { designer, timeline } = setup(); designer.setMode('test');
    expect(designer.beginGeometryGesture('move').status).toBe('rejected');
    designer.setMode('select'); designer.selectTarget('.button'); expect(designer.getGeometryState()).toBeNull();
    designer.dispose(); expect(designer.getGeometryState()).toBeNull();
    expect(designer.beginGeometryGesture('move').status).toBe('rejected'); expect(timeline.getKeys()).toEqual([]);
  });

  it('uses grid snapping and permits a temporary exact-delta bypass without recording aids', () => {
    const { designer, timeline } = setup(); designer.setGeometryOptions({ grid: true, gridSize: 10, snap: true });
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 4, y: 3 });
    expect(designer.getGeometryState()).toMatchObject({ translateX: '0px', translateY: '0px' });
    designer.updateGeometryGesture({ x: 4, y: 3 }, { bypassSnap: true });
    expect(designer.getGeometryState()).toMatchObject({ translateX: '4px', translateY: '3px' });
    expect(timeline.getKeys()).toEqual([]); designer.commitGeometryGesture();
    expect(timeline.getKeys().map(key => key.property)).toEqual(['translateX', 'translateY']); designer.undo(); expect(timeline.getKeys()).toEqual([]);
  });

  it('rejects an invalid grid size and invalid untyped tool without changing stored data', () => {
    const { designer, timeline } = setup(); const diagnostic = vi.fn(); designer.on('diagnostic', diagnostic);
    designer.setGeometryOptions({ grid: true, gridSize: 20 }); designer.setGeometryOptions({ gridSize: 0 });
    expect(document.querySelector<HTMLElement>('.HtmlDesignerGeometryGrid')?.style.backgroundSize).toBe('20px 20px');
    Reflect.apply(designer.setGeometryTool, designer, ['unknown-tool']);
    expect(diagnostic).toHaveBeenCalledTimes(2); expect(timeline.getKeys()).toEqual([]);
  });

  it('rejects unsupported ancestor and individual CSS transformations', () => {
    const { designer, timeline, element } = setup(); const parent = element.parentElement;
    if (!parent) throw new Error('Missing parent'); parent.style.transform = 'rotate(15deg)';
    expect(designer.beginGeometryGesture('move').status).toBe('rejected'); parent.style.transform = '';
    element.style.rotate = '15deg'; expect(designer.beginGeometryGesture('move').status).toBe('rejected');
    expect(timeline.getKeys()).toEqual([]); expect(designer.isGeometryGestureActive()).toBe(false);
  });

  it.each(['matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)', 'matrix(0,0,0,1,0,0)'])('rejects a non-manipulable original transform %s', transform => {
    const { designer, timeline } = setup('100px', transform);
    expect(designer.beginGeometryGesture('move').status).toBe('rejected'); expect(timeline.getKeys()).toEqual([]);
  });

  it('cancels a preview when its target is detached before another update', () => {
    const { designer, timeline, element, originalStyle } = setup();
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 12, y: 7 }, { bypassSnap: true }); element.remove();
    expect(designer.updateGeometryGesture({ x: 20, y: 10 }, { bypassSnap: true }).status).toBe('rejected');
    expect(designer.isGeometryGestureActive()).toBe(false); expect(timeline.getKeys()).toEqual([]); expect(element.getAttribute('style')).toBe(originalStyle);
  });

  it('refuses to commit a detached target without a final update', () => {
    const { designer, timeline, element, originalStyle } = setup();
    designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 12, y: 7 }, { bypassSnap: true }); element.remove();
    expect(designer.commitGeometryGesture().status).toBe('rejected');
    expect(timeline.getKeys()).toEqual([]); expect(element.getAttribute('style')).toBe(originalStyle);
  });

  it('refuses a commit before requested unit conversion is confirmed', () => {
    const { designer, timeline, element, originalStyle } = setup('calc(50% - 10px)');
    designer.beginGeometryGesture('dimensions'); designer.updateGeometryGesture({ x: 10, y: 5 }, { bypassSnap: true });
    expect(designer.commitGeometryGesture().status).toBe('rejected'); expect(designer.isGeometryGestureActive()).toBe(false);
    expect(timeline.getKeys()).toEqual([]); expect(element.getAttribute('style')).toBe(originalStyle);
  });
});
