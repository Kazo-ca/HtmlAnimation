// tests/css-origin.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture, propertyInput } from './helpers.js';

const designers: HtmlDesigner[] = [];
afterEach(() => { for (const designer of designers.splice(0)) designer.dispose(); document.body.replaceChildren(); });

describe('original shorthand compatibility with a recorded Timeline simulation', () => {
  it('compares border longhands and refuses a group write when one source side differs', () => {
    const fixture = createSceneFixture(); for (const button of fixture.buttons) button.style.border = '1px solid red';
    fixture.buttons[3].style.borderLeftColor = 'blue'; const before = fixture.buttons.map(button => button.getAttribute('style'));
    const timeline = createRecordedTimeline(); const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer);
    designer.selectTarget('.button');
    expect(propertyInput(fixture.propertiesContainer, 'border').disabled).toBe(true);
    expect(designer.editProperty('border', '2px dashed green').status).toBe('rejected');
    expect(timeline.getKeys()).toHaveLength(0); expect(timeline.getState().canUndo).toBe(false);
    expect(fixture.buttons.map(button => button.getAttribute('style'))).toEqual(before);
  });

  it('exposes a shorthand editor for equal origins and restores its accepted group change with one undo', () => {
    const fixture = createSceneFixture(); for (const button of fixture.buttons) button.style.border = '1px solid red';
    const before = fixture.buttons.map(button => button.getAttribute('style')); const timeline = createRecordedTimeline();
    const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer); designer.selectTarget('.button');
    expect(propertyInput(fixture.propertiesContainer, 'border').disabled).toBe(false);
    expect(designer.editProperty('border', '2px dashed green').status).toBe('changed');
    expect(timeline.getKeys()).toHaveLength(1); expect(fixture.buttons.every(button => button.style.border === '2px dashed green')).toBe(true);
    designer.undo(); expect(timeline.getKeys()).toHaveLength(0); expect(fixture.buttons.map(button => button.getAttribute('style'))).toEqual(before);
  });
});
