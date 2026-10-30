// tests/geometry-review.test.ts
import { afterEach, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture } from './helpers.js';
import { DomOrigin } from '../packages/designer/src/dom-origin.js';
import { geometryBoxMetrics, geometryContext, projectGeometry } from '../packages/designer/src/geometry-dom.js';
let designer: HtmlDesigner | undefined;
afterEach(() => { designer?.dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });
it('places a pivot preset correctly when the authored origin uses em units', () => {
  const fixture = createSceneFixture(); const element = fixture.buttons[1];
  Object.assign(element.style, { width: '100px', height: '50px', transformOrigin: '1em 2em', fontSize: '20px' });
  vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100); vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(50);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 50));
  const timeline = createRecordedTimeline(); designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designer.selectTarget('#button-2'); expect(designer.setGeometryPivot(50, 50).status).toBe('changed');
  expect(Object.fromEntries(timeline.getKeys().map(key => [key.property, key.value]))).toMatchObject({ pivotX: '2.5em', pivotY: '1.25em' });
  designer.undo(); expect(element.style.transformOrigin).toBe('1em 2em');
});
function geometryFixture(): ReturnType<typeof createSceneFixture> {
  const fixture = createSceneFixture(); const element = fixture.buttons[1];
  Object.assign(element.style, { width: '100px', height: '50px', position: 'relative', transformOrigin: '50% 50%' });
  vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100); vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(50);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 50));
  return fixture;
}
it('invalidates an explicitly selected target after an unanimated ID is renamed', () => {
  const fixture = geometryFixture(); const timeline = createRecordedTimeline();
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designer.selectTarget('#button-2');
  designer.setAttribute(fixture.buttons[1], 'id', 'renamed');
  expect(designer.editProperty('opacity', '0.5').status).toBe('rejected'); expect(timeline.getKeys()).toEqual([]);
  designer.selectTarget('#renamed'); designer.beginGeometryGesture('move'); designer.updateGeometryGesture({ x: 10, y: 0 }); designer.commitGeometryGesture();
  expect(timeline.getKeys()[0]?.selector).toBe('#renamed'); designer.undo(); designer.undo(); expect(fixture.buttons[1].id).toBe('button-2');
});
it('uses a current evaluated CSS origin when a pivot preset creates its first channels', () => {
  const fixture = geometryFixture(); const timeline = createRecordedTimeline();
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designer.selectTarget('#button-2');
  designer.editProperty('transform-origin', 'left top');
  expect(designer.getGeometryState()).toMatchObject({ pivotX: '0%', pivotY: '0%' });
  expect(designer.setGeometryPivot(50, 50).status).toBe('changed');
  expect(Object.fromEntries(timeline.getKeys().map(key => [key.property, key.value]))).toMatchObject({ pivotX: '50%', pivotY: '50%' });
  designer.undo(); expect(fixture.buttons[1].style.transformOrigin).toBe('left top');
});
it('uses the positioned containing block instead of an absolute element’s static parent', () => {
  const fixture = geometryFixture(); const element = fixture.buttons[1]; const containing = document.createElement('div');
  Object.assign(containing.style, { position: 'relative', width: '800px', height: '400px' });
  element.style.position = 'absolute'; element.style.width = '50%';
  vi.spyOn(element, 'offsetParent', 'get').mockReturnValue(containing); document.body.append(containing);
  const context = geometryContext(element, 'none'); expect(context.status).toBe('ready');
  if (context.status === 'ready') expect(context.metrics.parentWidth).toBe(800);
});
it('retains fractional border-box dimensions despite rounded layout getters', () => {
  const fixture = geometryFixture(); const element = fixture.buttons[1];
  Object.assign(element.style, { width: '160.4px', height: '96.4px', boxSizing: 'border-box' });
  expect(geometryBoxMetrics(element)).toMatchObject({ width: 160.4, height: 96.4 });
});
it('preserves a uniquely recoverable stylesheet transformation expression', () => {
  const style = document.createElement('style'); style.textContent = '#source-expression { transform: translateX(10%); }'; document.head.append(style);
  const element = document.createElement('div'); element.id = 'source-expression'; document.body.append(element);
  const origin = new DomOrigin(element); expect(origin.authoredValue(element, 'transform')).toBe('translateX(10%)');
  projectGeometry(origin, element, { translateX: '14px' }); expect(element.style.transform).toContain('translateX(10%)');
  origin.restore(); expect(element.getAttribute('style')).toBeNull(); style.remove();
});
it('requires explicit consent to freeze an ambiguous stylesheet transform and records the decision atomically', () => {
  const fixture = geometryFixture(); const element = fixture.buttons[1]; const timeline = createRecordedTimeline();
  const style = document.createElement('style'); style.textContent = '.button {transform:matrix(1,0,0,1,10,0)} #button-2{transform:matrix(1,0,0,1,20,0)}'; document.head.append(style);
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designer.selectTarget('#button-2'); designer.beginGeometryGesture('move');
  expect(designer.updateGeometryGesture({ x: 5, y: 0 })).toMatchObject({ status: 'confirmation-required', properties: ['transform'] });
  expect(timeline.getKeys()).toEqual([]); expect(element.style.transform).toBe('');
  designer.updateGeometryGesture({ x: 5, y: 0 }, { allowUnitReplacement: true }); designer.commitGeometryGesture();
  expect(timeline.getKeys().map(key => key.property)).toEqual(['translateX', 'transform']);
  designer.undo(); expect(element.style.transform).toBe(''); expect(timeline.getKeys()).toEqual([]); style.remove();
});
it('announces every replacement before consenting to an ambiguous transform and calc width together', () => {
  const fixture = geometryFixture(); const element = fixture.buttons[1]; const timeline = createRecordedTimeline();
  element.style.width = 'calc(50% - 10px)';
  const style = document.createElement('style'); style.textContent = '.button {transform:matrix(1,0,0,1,10,0)} #button-2{transform:matrix(1,0,0,1,20,0)}'; document.head.append(style);
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designer.selectTarget('#button-2'); designer.beginGeometryGesture('dimensions');
  expect(designer.updateGeometryGesture({ x: 10, y: 0 })).toMatchObject({ status: 'confirmation-required', properties: ['transform', 'width'] });
  expect(timeline.getKeys()).toEqual([]); expect(element.style.width).toBe('calc(50% - 10px)');
  designer.updateGeometryGesture({ x: 10, y: 0 }, { allowUnitReplacement: true }); designer.commitGeometryGesture();
  expect(timeline.getKeys().map(key => key.property)).toEqual(['width', 'transform']);
  designer.undo(); expect(element.style.width).toBe('calc(50% - 10px)'); style.remove();
});
it('requires a pixel conversion for a percentage height with an indefinite normal-flow parent', () => {
  const fixture = geometryFixture(); fixture.buttons[1].style.height = '50%';
  const timeline = createRecordedTimeline(); designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designer.selectTarget('#button-2'); designer.beginGeometryGesture('dimensions');
  expect(designer.updateGeometryGesture({ x: 0, y: 10 })).toMatchObject({ status: 'confirmation-required', properties: ['height'] });
  expect(timeline.getKeys()).toEqual([]);
});
