// tests/project-source.test.ts
// Read-only project/source checks; not real Timeline or HA9 conformity.
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProjectSourceJournal, validateProjectSource } from '../packages/designer/src/index.js';
import type { DocumentChange, EditableProject } from '../packages/designer/src/index.js';
import { createProjectCodecData } from '../fixtures/project-codec-data.js';

const actualSource = { id: 'scene-reference', revision: 'source-r7' };
const firstPath = '/html/body/main/section/button[1]'; const secondPath = '/html/body/main/section/button[2]';
afterEach(() => document.body.replaceChildren());

function setup() {
  const scene = document.createElement('main'); scene.id = 'SceneRoot'; const group = document.createElement('section');
  const first = document.createElement('button'); first.id = 'A'; first.setAttribute('class', 'alpha');
  const second = document.createElement('button'); second.id = 'B';
  const outside = document.createElement('aside'); outside.id = 'ExternalId';
  group.append(first, second); scene.append(group); document.body.append(scene, outside);
  return { scene, first, second, outside };
}

function project(documentChanges: readonly DocumentChange[]): EditableProject { return { ...createProjectCodecData(), source: { ...actualSource }, documentChanges }; }
function change(fullXPath = firstPath, oldValue: string | null = 'A', newValue: string | null = 'NextId'): DocumentChange { return { fullXPath, attribute: 'id', oldValue, newValue }; }

function rejected(scene: HTMLElement, input: EditableProject, code?: string): void {
  const issues = validateProjectSource(scene, actualSource, input);
  expect(issues.some(issue => issue.severity === 'error' && (!code || issue.code === code))).toBe(true);
  const resolved = resolveProjectSourceJournal(scene, actualSource, input);
  expect(resolved.status).toBe('invalid');
  if (resolved.status !== 'invalid') throw new Error('Expected an unresolved source journal');
  expect(resolved.issues).toEqual(issues);
}

describe('read-only editable project source validation', () => {
  it('exports source validation and original-XPath resolution from the Designer package', async () => {
    const designer = await import('../packages/designer/src/index.js');
    for (const name of ['validateProjectSource', 'resolveProjectSourceJournal']) expect(typeof Reflect.get(designer, name), name).toBe('function');
  });

  it('resolves original element identities without writing attributes, journal or DOM structure', () => {
    const { scene, first } = setup(); const input = project([change()]); const before = document.body.innerHTML;
    const observer = new MutationObserver(() => undefined); observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    expect(validateProjectSource(scene, actualSource, input)).toEqual([]);
    const resolved = resolveProjectSourceJournal(scene, actualSource, input);
    expect(resolved.status).toBe('valid');
    if (resolved.status !== 'valid') throw new Error('Expected the original element');
    expect(resolved.entries).toHaveLength(1); expect(resolved.entries[0]?.element).toBe(first); expect(resolved.entries[0]?.change).toEqual(input.documentChanges[0]);
    expect(document.body.innerHTML).toBe(before); expect(observer.takeRecords()).toEqual([]); observer.disconnect();
    expect(first.id).toBe('A'); expect(input.documentChanges[0]?.newValue).toBe('NextId');
  });

  for (const field of ['id', 'revision'] as const) it(`refuses a different source ${field} even when the XPath and attributes match`, () => {
    const { scene } = setup(); const input = { ...project([change()]), source: { ...actualSource, [field]: 'different' } };
    rejected(scene, input, 'source-reference');
  });

  it('accepts an empty journal and the original scene root itself', () => {
    const { scene } = setup(); expect(resolveProjectSourceJournal(scene, actualSource, project([]))).toEqual({ status: 'valid', entries: [] });
    const resolved = resolveProjectSourceJournal(scene, actualSource, project([change('/html/body/main', 'SceneRoot', 'RenamedRoot')]));
    expect(resolved.status).toBe('valid');
    if (resolved.status !== 'valid') throw new Error('Expected scene root resolution');
    expect(resolved.entries[0]?.element).toBe(scene); expect(scene.id).toBe('SceneRoot');
  });

  for (const fullXPath of [
    '/html/body/main/section/button[9]', '/html/body/aside', '/html/body', '//button',
    'main/section/button[1]', './button', '/html/body/main/section/*[1]', '/html/body/main/section/button[@id="A"]',
    '/html/body/main/section/button[0]', '/html/body/main/section/button[-1]', '/html/body/main/section/button[1]/..',
  ]) it(`refuses nonoriginal, missing or out-of-scene path ${fullXPath}`, () => {
    const { scene } = setup(); rejected(scene, project([change(fullXPath)]));
  });

  it('does not choose the first match of an ambiguous unindexed sibling path', () => {
    const { scene } = setup(); rejected(scene, project([change('/html/body/main/section/button')]), 'source-path-ambiguous');
  });

  it('does not reattach a missing original XPath using an old ID or the proposed new ID', () => {
    const { scene, outside } = setup(); outside.id = 'NextId';
    rejected(scene, project([change('/html/body/main/section/button[7]')]), 'source-path-missing');
  });

  it('does not relocate an operation by ID when moving the original node changes its XPath', () => {
    const { scene, first, outside } = setup(); outside.append(first);
    // The first original path now reaches B; A still exists elsewhere in the document.
    rejected(scene, project([change()]), 'source-value-mismatch'); expect(first.id).toBe('A');
  });

  for (const [present, expected] of [[null, null], ['', '']] as const) it(`accepts exact class source value ${JSON.stringify(expected)}`, () => {
    const { scene, second } = setup(); if (present === null) second.removeAttribute('class'); else second.setAttribute('class', present);
    const input = project([{ fullXPath: secondPath, attribute: 'class', oldValue: expected, newValue: 'new-class' }]);
    expect(validateProjectSource(scene, actualSource, input)).toEqual([]);
  });

  for (const [present, expected] of [[null, ''], ['', null]] as const) it(`distinguishes raw class ${JSON.stringify(present)} from expected ${JSON.stringify(expected)}`, () => {
    const { scene, second } = setup(); if (present !== null) second.setAttribute('class', present);
    rejected(scene, project([{ fullXPath: secondPath, attribute: 'class', oldValue: expected, newValue: 'new-class' }]), 'source-value-mismatch');
  });

  it('checks old values without trimming, case conversion or fingerprints', () => {
    const { scene, first } = setup(); first.setAttribute('class', ' Alpha  beta ');
    expect(validateProjectSource(scene, actualSource, project([{ fullXPath: firstPath, attribute: 'class', oldValue: ' Alpha  beta ', newValue: null }]))).toEqual([]);
    rejected(scene, project([{ fullXPath: firstPath, attribute: 'class', oldValue: 'Alpha beta', newValue: null }]), 'source-value-mismatch');
  });

  it('accepts final ID exchanges and removals without evaluating collisions against intermediate states', () => {
    const { scene, first, second } = setup(); const before = document.body.innerHTML;
    const swaps = project([change(firstPath, 'A', 'B'), change(secondPath, 'B', 'A')]);
    expect(validateProjectSource(scene, actualSource, swaps)).toEqual([]);
    const resolved = resolveProjectSourceJournal(scene, actualSource, swaps);
    expect(resolved.status).toBe('valid');
    if (resolved.status !== 'valid') throw new Error('Expected a final-state ID exchange');
    expect(resolved.entries.map(entry => entry.element)).toEqual([first, second]);
    for (const removed of [null, '']) expect(validateProjectSource(scene, actualSource, project([change(firstPath, 'A', removed), change(secondPath, 'B', 'A')]))).toEqual([]);
    expect(document.body.innerHTML).toBe(before);
  });

  it('rejects final ID collisions against unchanged elements inside or outside the scene', () => {
    const { scene } = setup();
    rejected(scene, project([change(firstPath, 'A', 'B')]), 'source-id-collision');
    rejected(scene, project([change(firstPath, 'A', 'ExternalId')]), 'source-id-collision');
    rejected(scene, project([change(firstPath, 'A', 'Shared'), change(secondPath, 'B', 'Shared')]), 'source-id-collision');
  });

  it('keeps SVG descendants as actual Elements rather than resolving by their ID', () => {
    const { scene } = setup(); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.id = 'Vector'; svg.append(rect); scene.append(svg);
    const resolved = resolveProjectSourceJournal(scene, actualSource, project([change('/html/body/main/svg/rect', 'Vector', 'VectorNext')]));
    expect(resolved.status).toBe('valid');
    if (resolved.status !== 'valid') throw new Error('Expected the original SVG element');
    expect(resolved.entries[0]?.element).toBe(rect); expect(rect.id).toBe('Vector');
  });

  it('rejects unsupported attributes and duplicate net entries even when given a runtime cast', () => {
    const { scene } = setup(); const unsupported = project([change()]);
    Reflect.set(unsupported.documentChanges[0] ?? {}, 'attribute', 'style'); rejected(scene, unsupported, 'document-change');
    rejected(scene, project([change(), change()]), 'document-change');
  });
});
