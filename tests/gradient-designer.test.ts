// tests/gradient-designer.test.ts
// Designer orchestration against explicit simulations; no real Timeline conformity claim.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlDesigner } from '../packages/designer/src/index.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createSceneFixture } from './helpers.js';

const designers: HtmlDesigner[] = [];
afterEach(() => { for (const designer of designers.splice(0)) designer.dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function legacySetup(): { readonly designer: HtmlDesigner; readonly timeline: ReturnType<typeof createRecordedTimeline> } {
  const fixture = createSceneFixture(); const timeline = createRecordedTimeline();
  const designer = new HtmlDesigner({ ...fixture, timeline, adapter: instance => instance }); designers.push(designer);
  designer.selectTarget('#button-2'); return { designer, timeline };
}

describe('independent gradient tracks through an optional adapter capability', () => {
  it('keeps an older string-value adapter inspectable without inventing structured gradients', () => {
    const { designer, timeline } = legacySetup();
    expect(typeof designer.getGradientState).toBe('function');
    expect(designer.getGradientState()).toBeNull();
    expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
  });

  it('refuses a structured gradient command without the optional capability and leaves history intact', () => {
    const { designer, timeline } = legacySetup(); const execute = vi.spyOn(timeline, 'execute');
    expect(designer.editGradient([{ gradientId: 'main', component: 'angle', value: 45 }]).status).toBe('rejected');
    expect(execute).not.toHaveBeenCalled(); expect(timeline.getKeys()).toEqual([]); expect(timeline.getState().canUndo).toBe(false);
  });
});
