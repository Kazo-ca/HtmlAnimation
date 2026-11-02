// tests/dom-preview.test.ts
// Local preview ownership only; no HA9 API or Timeline rendering claim.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomPreviewOwner } from '../packages/designer/src/index.js';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function setup() {
  const scene = document.createElement('section'); const frame = document.createElement('div');
  const first = document.createElement('button'); const absent = document.createElement('button'); const empty = document.createElement('button'); const neighbor = document.createElement('aside');
  first.id = 'source-first'; first.className = 'source-class'; first.setAttribute('style', 'color: red !important; opacity: 0.8; --tone: 4;');
  empty.setAttribute('style', ''); neighbor.setAttribute('style', 'border: 1px solid blue !important;');
  frame.append(first, absent, empty, neighbor); scene.append(frame); document.body.append(scene);
  const owner = new DomPreviewOwner(scene);
  return { scene, frame, first, absent, empty, neighbor, owner };
}

function styles(elements: readonly HTMLElement[]): readonly (string | null)[] { return elements.map(element => element.getAttribute('style')); }

describe('transactional DOM preview owner', () => {
  it('exports the preview owner from the existing Designer package', async () => {
    const designer = await import('../packages/designer/src/index.js');
    expect(typeof Reflect.get(designer, 'DomPreviewOwner')).toBe('function');
  });

  it('captures source autonomously before the first preview and keeps preparation pure', () => {
    const { owner, first, absent, empty, neighbor } = setup(); const elements = [first, absent, empty, neighbor]; const source = styles(elements);
    const prepared = owner.prepare([{ element: first, declarations: { opacity: '0.2', color: 'green' } }]);
    expect(prepared.changed).toBe(true); expect(styles(elements)).toEqual(source);
    expect(owner.getProjection()).toEqual([]); expect(owner.getCommittedProjection()).toEqual([]);
    prepared.apply(); expect(first.style.opacity).toBe('0.2'); expect(first.style.getPropertyPriority('color')).toBe('important');
    expect(owner.withSource(() => styles(elements))).toEqual(source);
    expect(first.style.opacity).toBe('0.2'); expect(first.id).toBe('source-first'); expect(first.className).toBe('source-class');
    prepared.rollback(); expect(styles(elements)).toEqual(source); expect(owner.getProjection()).toEqual([]);
  });

  it('restores exact absent, empty and important source styles without touching neighboring elements', () => {
    const { owner, first, absent, empty, neighbor } = setup(); const elements = [first, absent, empty, neighbor]; const source = styles(elements);
    owner.prepare([first, absent, empty].map(element => ({ element, declarations: { opacity: '0.2', color: 'green' } }))).apply();
    const restore = owner.prepareRestore(); const preview = styles(elements);
    expect(styles(elements)).toEqual(preview); restore.apply(); expect(styles(elements)).toEqual(source);
    expect(absent.hasAttribute('style')).toBe(false); expect(empty.getAttribute('style')).toBe('');
    expect(first.style.getPropertyPriority('color')).toBe('important'); expect(owner.getCommittedProjection()).toEqual([]);
    restore.rollback(); expect(styles(elements)).toEqual(preview); expect(owner.getCommittedProjection()).toHaveLength(3);
  });

  it('restores both draft and committed projections when a later commit is compensated', () => {
    const { owner, first } = setup(); const committed = [{ element: first, declarations: { opacity: '0.4' } }]; const draft = [{ element: first, declarations: { opacity: '0.6' } }];
    owner.prepare(committed).apply(); owner.prepareDraft(draft).apply();
    expect(owner.getProjection()).toEqual(draft); expect(owner.getCommittedProjection()).toEqual(committed);
    const candidate = owner.prepare([{ element: first, declarations: { opacity: '0.9' } }]);
    expect(first.style.opacity).toBe('0.6'); candidate.apply(); expect(first.style.opacity).toBe('0.9');
    candidate.rollback(); expect(first.style.opacity).toBe('0.6'); expect(owner.getProjection()).toEqual(draft); expect(owner.getCommittedProjection()).toEqual(committed);
    const cancel = owner.prepareDraft(null); cancel.apply(); expect(first.style.opacity).toBe('0.4');
    cancel.rollback(); expect(first.style.opacity).toBe('0.6'); expect(owner.getProjection()).toEqual(draft);
    const restore = owner.prepareRestore(); restore.apply(); restore.rollback();
    expect(owner.getProjection()).toEqual(draft); expect(owner.getCommittedProjection()).toEqual(committed);
  });

  it('compensates all touched elements even when a style write mutates and then throws', () => {
    const { owner, first, absent } = setup(); const committed = [{ element: first, declarations: { opacity: '0.4' } }];
    const draft = [{ element: first, declarations: { opacity: '0.6' } }]; owner.prepare(committed).apply(); owner.prepareDraft(draft).apply();
    const before = styles([first, absent]); const set = absent.style.setProperty.bind(absent.style); let fail = true;
    vi.spyOn(absent.style, 'setProperty').mockImplementation((name, value, priority) => {
      set(name, value, priority); if (name === 'color' && fail) { fail = false; throw new Error('Style write interrupted after mutation'); }
    });
    const candidate = owner.prepare([{ element: first, declarations: { opacity: '0.9' } }, { element: absent, declarations: { color: 'blue' } }]);
    expect(() => candidate.apply()).toThrow('Style write interrupted after mutation');
    expect(absent.style.color).toBe('blue'); candidate.rollback();
    expect(styles([first, absent])).toEqual(before); expect(owner.getProjection()).toEqual(draft); expect(owner.getCommittedProjection()).toEqual(committed);
    expect(absent.hasAttribute('style')).toBe(false);
  });

  it('keeps source reads repeatable and restores the active draft after a reader throws', () => {
    const { owner, first } = setup(); const source = first.getAttribute('style');
    owner.prepare([{ element: first, declarations: { opacity: '0.3' } }]).apply();
    owner.prepare([{ element: first, declarations: { opacity: '0.5' } }]).apply();
    owner.prepareDraft([{ element: first, declarations: { opacity: '0.7' } }]).apply();
    for (let index = 0; index < 3; index++) expect(owner.withSource(() => first.getAttribute('style'))).toBe(source);
    expect(() => owner.withSource(() => { expect(first.getAttribute('style')).toBe(source); throw new Error('Reader failed'); })).toThrow('Reader failed');
    expect(first.style.opacity).toBe('0.7'); expect(owner.getCommittedProjection()[0]?.declarations.opacity).toBe('0.5');
    owner.prepareRestore().apply(); expect(first.getAttribute('style')).toBe(source);
  });

  it('returns detached projection containers and preserves unrelated external styles', () => {
    const { owner, first, neighbor } = setup();
    const declarations = { opacity: '0.3' }; const candidate = [{ element: first, declarations }]; owner.prepare(candidate).apply();
    declarations.opacity = '0.9';
    const snapshot = owner.getProjection(); Reflect.set(snapshot[0]?.declarations ?? {}, 'opacity', '0.1');
    expect(owner.getProjection()[0]?.declarations.opacity).toBe('0.3'); expect(owner.getProjection()[0]?.element).toBe(first);
    first.style.setProperty('padding-left', '11px'); neighbor.style.setProperty('width', '120px');
    owner.prepare([{ element: first, declarations: { opacity: '0.5' } }]).apply();
    expect(first.style.paddingLeft).toBe('11px'); owner.prepareRestore().apply();
    expect(first.style.opacity).toBe('0.8'); expect(first.style.paddingLeft).toBe('11px'); expect(neighbor.style.width).toBe('120px');
  });

  it('preserves scroll positions when preview application, source reads and restoration disturb layout', () => {
    const { owner, scene, frame, first } = setup(); scene.scrollTop = 27; frame.scrollTop = 73; frame.scrollLeft = 19;
    const set = first.style.setProperty.bind(first.style);
    vi.spyOn(first.style, 'setProperty').mockImplementation((name, value, priority) => { set(name, value, priority); scene.scrollTop = 0; frame.scrollTop = 0; frame.scrollLeft = 0; });
    const effect = owner.prepare([{ element: first, declarations: { opacity: '0.2' } }]); effect.apply();
    expect([scene.scrollTop, frame.scrollTop, frame.scrollLeft]).toEqual([27, 73, 19]);
    owner.withSource(() => { scene.scrollTop = 0; frame.scrollTop = 0; frame.scrollLeft = 0; });
    expect([scene.scrollTop, frame.scrollTop, frame.scrollLeft]).toEqual([27, 73, 19]);
    owner.prepareRestore().apply(); expect([scene.scrollTop, frame.scrollTop, frame.scrollLeft]).toEqual([27, 73, 19]);
  });
});
