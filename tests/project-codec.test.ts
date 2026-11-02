// tests/project-codec.test.ts
// Pure project-model tests; not evidence of real Timeline or DOM compatibility.
import { describe, expect, it, vi } from 'vitest';
import { decodeEditableProject, encodeEditableProject, ProjectValidationError, validateEditableProject } from '../packages/designer/src/index.js';
import type { JsonObject, ProjectIssue } from '../packages/designer/src/index.js';
import { createProjectCodecData } from '../fixtures/project-codec-data.js';

function ports() {
  return {
    validateTimeline: vi.fn<(document: JsonObject) => readonly ProjectIssue[]>(() => []),
    validateHtmlContext: vi.fn<(context: JsonObject, document: JsonObject) => readonly ProjectIssue[]>(() => []),
  } satisfies Parameters<typeof validateEditableProject>[1];
}

function invalid(input: unknown, validationPorts = ports(), limits?: Parameters<typeof validateEditableProject>[2]): readonly ProjectIssue[] {
  const result = validateEditableProject(input, validationPorts, limits);
  expect(result.status).toBe('invalid');
  if (result.status !== 'invalid') throw new Error('Expected an invalid project');
  expect(result.issues.some(issue => issue.severity === 'error')).toBe(true);
  return result.issues;
}

function validationError(action: () => unknown): ProjectValidationError {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ProjectValidationError);
  if (!(caught instanceof ProjectValidationError)) throw new Error('Expected project validation details');
  expect(caught.issues.some(issue => issue.severity === 'error')).toBe(true);
  return caught;
}

describe('editable project JSON codec', () => {
  it('exports the project validation and codec boundary from the existing Designer package', async () => {
    const designer = await import('../packages/designer/src/index.js');
    for (const name of ['validateEditableProject', 'encodeEditableProject', 'decodeEditableProject', 'ProjectValidationError']) {
      expect(typeof Reflect.get(designer, name), `${name} must be available from the real package entry point`).toBe('function');
    }
  });

  it('round-trips complete authoring JSON without flattening sources, keys or absent point identities', () => {
    const project = createProjectCodecData(); const validators = ports();
    const text = encodeEditableProject(project, validators);
    expect(typeof text).toBe('string'); expect(JSON.parse(text)).toEqual(project);
    const decoded = decodeEditableProject(text, validators);
    expect(decoded).toEqual(project); expect(decoded).not.toBe(project);
    expect(decoded.timeline).not.toBe(project.timeline); expect(decoded.htmlContext).not.toBe(project.htmlContext);
    expect(decoded.documentChanges).toEqual([
      { fullXPath: '/html/body/main/button[1]', attribute: 'id', oldValue: null, newValue: 'AddedId' },
      { fullXPath: '/html/body/main/button[2]', attribute: 'class', oldValue: '', newValue: null },
    ]);
    expect(validators.validateTimeline).toHaveBeenCalledWith(project.timeline);
    expect(validators.validateHtmlContext).toHaveBeenCalledWith(project.htmlContext, project.timeline);
  });

  it('keeps stale-resolution warnings saveable and preserves the stale decision unchanged', () => {
    const project = createProjectCodecData(); const validators = ports();
    const warning: ProjectIssue = { code: 'stale-resolution', path: '/htmlContext/resolutions/0', message: 'Décision périmée conservée.', severity: 'warning' };
    validators.validateHtmlContext.mockReturnValue([warning]);
    const result = validateEditableProject(project, validators);
    expect(result).toMatchObject({ status: 'valid', warnings: [warning], project });
    expect(decodeEditableProject(encodeEditableProject(project, validators), validators)).toEqual(project);
  });

  for (const port of ['validateTimeline', 'validateHtmlContext'] as const) it(`prevents saving when ${port} reports a native error`, () => {
    const validators = ports(); const issue: ProjectIssue = { code: 'native-invalid', path: '/layers/0', message: 'Validation du modèle refusée.', severity: 'error' };
    validators[port].mockReturnValue([issue]); const project = createProjectCodecData();
    expect(invalid(project, validators)).toContainEqual(issue);
    expect(validationError(() => encodeEditableProject(project, validators)).issues).toContainEqual(issue);
    expect(validationError(() => decodeEditableProject(JSON.stringify(project), validators)).issues).toContainEqual(issue);
  });

  it('validates detached read-only JSON copies and never lets a validator mutate the supplied project', () => {
    const project = createProjectCodecData(); const original = JSON.parse(JSON.stringify(project)); const validators = ports();
    validators.validateTimeline.mockImplementation(document => {
      expect(document).not.toBe(project.timeline); expect(Object.isFrozen(document)).toBe(true);
      expect(Reflect.set(document, 'injected', true)).toBe(false); return [];
    });
    validators.validateHtmlContext.mockImplementation((context, document) => {
      expect(context).not.toBe(project.htmlContext); expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(document)).toBe(true); return [];
    });
    const result = validateEditableProject(project, validators);
    expect(result.status).toBe('valid'); expect(project).toEqual(original);
    Reflect.set(project.timeline, 'externalChange', true); Reflect.set(project.source, 'revision', 'newer-host-revision');
    if (result.status !== 'valid') throw new Error('Expected a valid detached project');
    expect(result.project).toEqual(original);
  });

  it('keeps encoded text and independent decodes detached from later caller mutations', () => {
    const project = createProjectCodecData(); const baseline = JSON.parse(JSON.stringify(project)); const validators = ports();
    const text = encodeEditableProject(project, validators);
    Reflect.set(project.timeline, 'changedAfterEncoding', true); Reflect.set(project.documentChanges[0] ?? {}, 'newValue', 'Mutated');
    const first = decodeEditableProject(text, validators); const second = decodeEditableProject(text, validators);
    expect(first).toEqual(baseline); expect(second).toEqual(baseline);
    expect(first.timeline).not.toBe(second.timeline); expect(first.documentChanges).not.toBe(second.documentChanges);
    Reflect.set(first.timeline, 'attemptedMutation', true);
    expect(second).toEqual(baseline); expect(decodeEditableProject(text, validators)).toEqual(baseline);
  });

  for (const kind of ['real', 'simulation'] as const) it(`preserves explicit ${kind} provenance`, () => {
    const project = createProjectCodecData();
    const candidate = { ...project, provenance: { ...project.provenance, kind } };
    expect(decodeEditableProject(encodeEditableProject(candidate, ports()), ports()).provenance).toEqual(candidate.provenance);
  });

  for (const candidate of [null, false, 42, 'project', [], { frames: [{ frame: 1, values: { opacity: 0.5 } }] }]) it(`refuses non-project or sampled input ${JSON.stringify(candidate)}`, () => {
    const validators = ports(); invalid(candidate, validators);
    expect(validators.validateTimeline).not.toHaveBeenCalled(); expect(validators.validateHtmlContext).not.toHaveBeenCalled();
  });

  for (const override of [
    { format: 'timeline-samples' }, { version: 2 }, { version: '1' }, { source: { id: '', revision: 'r1' } },
    { source: { id: 'source', revision: '' } }, { timeline: [] }, { htmlContext: null }, { metadata: [] },
    { provenance: { kind: 'unknown', adapterRevision: 'r1', timelineReference: 'ref' } },
    { provenance: { kind: 'real', adapterRevision: '', timelineReference: 'ref' } },
    { provenance: { kind: 'real', adapterRevision: 'r1', timelineReference: '' } },
  ]) it(`refuses incompatible required fields ${JSON.stringify(override)}`, () => {
    invalid({ ...createProjectCodecData(), ...override });
  });

  it('accepts an absent metadata object and rejects duplicate net journal addresses', () => {
    const project = createProjectCodecData(); Reflect.deleteProperty(project, 'metadata');
    expect(validateEditableProject(project, ports()).status).toBe('valid');
    invalid({ ...project, documentChanges: [...project.documentChanges, project.documentChanges[0]] });
    invalid({ ...project, documentChanges: [{ fullXPath: '/html/body/main', attribute: 'style', oldValue: null, newValue: '' }] });
  });

  for (const placement of ['root', 'metadata', 'array'] as const) it(`rejects a ${placement} getter without executing it`, () => {
    const project = createProjectCodecData(); const getter = vi.fn(() => 'must not be read');
    const metadata: Record<string, unknown> = {}; const values: unknown[] = [];
    if (placement === 'root') Object.defineProperty(project, 'source', { enumerable: true, get: getter });
    if (placement === 'metadata') Object.defineProperty(metadata, 'secret', { enumerable: true, get: getter });
    if (placement === 'array') Object.defineProperty(values, '0', { enumerable: true, get: getter });
    const candidate = placement === 'root' ? project : { ...project, metadata: placement === 'array' ? { values } : metadata };
    const validators = ports(); invalid(candidate, validators); validationError(() => encodeEditableProject(candidate, validators));
    expect(getter).not.toHaveBeenCalled(); expect(validators.validateTimeline).not.toHaveBeenCalled();
  });

  for (const accessor of [false, true]) it(`does not invoke ${accessor ? 'accessor' : 'function'} toJSON hooks`, () => {
    const hook = vi.fn(() => ({ hidden: 'replacement' })); const metadata = {};
    Object.defineProperty(metadata, 'toJSON', accessor ? { enumerable: true, get: hook } : { enumerable: true, value: hook });
    const project = { ...createProjectCodecData(), metadata };
    invalid(project); validationError(() => encodeEditableProject(project, ports())); expect(hook).not.toHaveBeenCalled();
  });

  for (const [label, make] of [
    ['NaN', () => Number.NaN], ['Infinity', () => Infinity], ['negative Infinity', () => -Infinity],
    ['undefined', () => undefined], ['function', () => () => 1], ['bigint', () => 1n], ['symbol', () => Symbol('value')],
    ['date', () => new Date(0)], ['map', () => new Map([['key', 1]])], ['typed array', () => new Uint8Array([1])],
    ['custom prototype', () => Object.create({ inherited: true })], ['DOM node', () => document.createElement('button')],
  ] as const) it(`refuses a non-JSON ${label} value without native validation`, () => {
    const candidate = { ...createProjectCodecData(), metadata: { value: make() } }; const validators = ports();
    invalid(candidate, validators); validationError(() => encodeEditableProject(candidate, validators));
    expect(validators.validateTimeline).not.toHaveBeenCalled(); expect(validators.validateHtmlContext).not.toHaveBeenCalled();
  });

  it('rejects cycles without recursion failure or invoking native validators', () => {
    const metadata: Record<string, unknown> = {}; metadata.self = metadata; const validators = ports();
    invalid({ ...createProjectCodecData(), metadata }, validators);
    expect(validators.validateTimeline).not.toHaveBeenCalled();
  });

  it('copies special JSON property names without prototype pollution or silent data loss', () => {
    const project = createProjectCodecData();
    const extra: unknown = JSON.parse('{"__proto__":{"codecPollutionSentinel":"kept"},"constructor":{"prototype":{"nested":true}},"prototype":"preserved"}');
    Reflect.set(project, 'metadata', extra);
    Object.defineProperty(project.timeline, '__proto__', { value: { nativeAccepted: true }, enumerable: true });
    const decoded = decodeEditableProject(encodeEditableProject(project, ports()), ports());
    expect(decoded).toEqual(project); expect(Object.hasOwn(decoded.timeline, '__proto__')).toBe(true);
    expect(Reflect.get(decoded.timeline, '__proto__')).toEqual({ nativeAccepted: true });
    expect(decoded.metadata).toEqual(extra); expect(Object.hasOwn(decoded.metadata ?? {}, '__proto__')).toBe(true);
    expect(Reflect.get(Object.prototype, 'codecPollutionSentinel')).toBeUndefined();
  });

  for (const text of ['', '{', '{"format":', 'null', '[1,2]', '{"version":1e999}']) it(`throws detailed validation errors for invalid JSON or project text ${JSON.stringify(text)}`, () => {
    validationError(() => decodeEditableProject(text, ports()));
  });

  for (const limits of [{ maxDepth: 1 }, { maxNodes: 1 }, { maxBytes: 1 }]) it(`enforces configured resource limits ${JSON.stringify(limits)}`, () => {
    const project = createProjectCodecData(); const validators = ports();
    invalid(project, validators, limits);
    validationError(() => encodeEditableProject(project, validators, limits));
    validationError(() => decodeEditableProject(JSON.stringify(project), validators, limits));
    expect(validators.validateTimeline).not.toHaveBeenCalled();
  });

  it('counts UTF-8 bytes and accepts the exact byte limit without rounding it to characters', () => {
    const project = createProjectCodecData(); const validators = ports(); const text = encodeEditableProject(project, validators);
    const bytes = new TextEncoder().encode(text).length; expect(bytes).toBeGreaterThan(text.length);
    expect(decodeEditableProject(text, validators, { maxBytes: bytes })).toEqual(project);
    validationError(() => decodeEditableProject(text, validators, { maxBytes: bytes - 1 }));
  });

  it('permits a configured depth increase while rejecting the same document under the default limit', () => {
    let nested: JsonObject = { end: true };
    for (let index = 0; index < 80; index++) nested = { child: nested };
    const project = { ...createProjectCodecData(), metadata: nested };
    invalid(project);
    expect(validateEditableProject(project, ports(), { maxDepth: 128 }).status).toBe('valid');
  });
});
