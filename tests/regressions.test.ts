// tests/regressions.test.ts
import { afterEach, expect, it } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture, propertyInput } from './helpers.js';
let designer: HtmlDesigner | undefined;
afterEach(() => { designer?.dispose(); document.body.replaceChildren(); });
it('edits the selected group value even when its first element has a more specific preview', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  timeline.execute('Seed distinct objects', [
    { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
    { objectId: 'specific', selector: '#button-1', property: 'opacity', value: '0.8', frame: 1 },
  ]);
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designer.selectTarget('.button');
  expect(propertyInput(fixture.propertiesContainer, 'opacity').value).toBe('0.5');
  expect(designer.editProperty('opacity', '0.8').status).toBe('changed');
  expect(fixture.buttons[2].style.opacity).toBe('0.8');
  designer.undo(); expect(fixture.buttons[2].style.opacity).toBe('0.5');
});
it('restores the accepted panel value after an invalid CSS intent', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designer.selectTarget('#button-2'); designer.editProperty('opacity', '0.4');
  const input = propertyInput(fixture.propertiesContainer, 'opacity'); input.value = 'invalid'; input.dispatchEvent(new Event('change'));
  expect(propertyInput(fixture.propertiesContainer, 'opacity').value).toBe('0.4');
  expect(fixture.buttons[1].style.opacity).toBe('0.4');
  expect(timeline.getKeys()).toHaveLength(1);
});
it('preserves unanimated host styles through selection and disposal', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline({ reference: true });
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  fixture.buttons[2].style.color = 'purple';
  designer.selectTarget('#button-2');
  expect(fixture.buttons[2].style.color).toBe('purple');
  designer.dispose(); expect(fixture.buttons[2].style.color).toBe('purple');
});
it('keeps an attribute command undoable when a host document observer throws', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designer.on('documentchange', () => { throw new Error('Host failure'); });
  expect(() => designer?.setAttribute(fixture.buttons[1], 'id', 'ChangedId')).not.toThrow();
  expect(timeline.getState().canUndo).toBe(true);
  designer.undo(); expect(fixture.buttons[1].id).toBe('button-2');
});
it('rejects identifier forms that cannot be targeted without escaping', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  expect(designer.setAttribute(fixture.buttons[1], 'id', '-1').status).toBe('rejected');
  expect(fixture.buttons[1].id).toBe('button-2');
});
it('validates attribute names for untyped JavaScript callers', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  const result: unknown = Reflect.apply(designer.setAttribute, designer, [fixture.buttons[1], 'onclick', 'alert(1)']);
  expect(result).toMatchObject({ status: 'rejected' }); expect(fixture.buttons[1].hasAttribute('onclick')).toBe(false);
});
it('restores the accepted field after an adapter rejects a valid CSS edit', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline({ reference: true });
  const adapter = { ...timeline, execute: () => ({ status: 'rejected' as const, message: 'Transition incompatible.' }) };
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: () => adapter });
  designer.selectTarget('.button');
  const input = propertyInput(fixture.propertiesContainer, 'opacity'); input.value = '0.3'; input.dispatchEvent(new Event('change'));
  expect(propertyInput(fixture.propertiesContainer, 'opacity').value).toBe('0.5');
  expect(timeline.getKeys()).toHaveLength(2);
});
it('can create a group property when the first member already has an ID override', () => {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  timeline.execute('Seed only specific opacity', [{ objectId: 'specific', selector: '#button-1', property: 'opacity', value: '0.8', frame: 1 }]);
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designer.selectTarget('.button');
  expect(propertyInput(fixture.propertiesContainer, 'opacity').value).toBe('');
  expect(designer.editProperty('opacity', '0.8').status).toBe('changed');
  expect(fixture.buttons[2].style.opacity).toBe('0.8');
  designer.undo(); expect(fixture.buttons[2].style.opacity).toBe('1');
});
it('does not reject lower equal-specificity values when an ID resolves their entire overlap', () => {
  const fixture = createSceneFixture(); fixture.buttons[0].classList.add('primary');
  const timeline = createRecordedTimeline();
  timeline.execute('Seed resolved overlap', [
    { objectId: 'group', selector: '.button', property: 'opacity', value: '0.5', frame: 1 },
    { objectId: 'other', selector: '.primary', property: 'opacity', value: '0.4', frame: 1 },
    { objectId: 'specific', selector: '#button-1', property: 'opacity', value: '0.6', frame: 1 },
  ]);
  designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance });
  designer.selectTarget('.button');
  expect(designer.editProperty('opacity', '0.8').status).toBe('changed');
  expect(fixture.buttons[0].style.opacity).toBe('0.6'); expect(fixture.buttons[2].style.opacity).toBe('0.8');
  designer.undo(); expect(fixture.buttons[2].style.opacity).toBe('0.5');
});
