// Native schema validation only; no player sampling, load or source reattachment.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cloneHtmlAnimationContext, validateDocument } from '@kazo-ca/timeline-runtime';
import { decodeEditableProject, encodeEditableProject, ProjectValidationError, validateEditableProject } from '../packages/designer/src/index.js';
import { createTimelineProjectValidationPorts } from '../integration/project-codecs.js';

const fixtureText = readFileSync(resolve('fixtures/native-editable-project.json'), 'utf8');
function fixture(): unknown { return JSON.parse(fixtureText); }
describe('editable project with genuine installed native validators', () => {
  it('round-trips native keys, retained split curves, context identities and the original journal without evaluation', () => {
    const ports = createTimelineProjectValidationPorts();
    const encoded = encodeEditableProject(fixture(), ports);
    const decoded = decodeEditableProject(encoded, ports);
    expect(decoded).toEqual(fixture()); expect(validateDocument(decoded.timeline, { allowLiveTargets: false })).toEqual([]);
    expect(cloneHtmlAnimationContext(decoded.htmlContext)).toEqual(decoded.htmlContext);
    expect(decoded.documentChanges.map(change => change.oldValue)).toEqual([null, '']);
    expect(Object.hasOwn(decoded.metadata ?? {}, '__proto__')).toBe(true);
    expect(decoded.metadata?.constructor).toBe('ordinary JSON data');
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    const validation = validateEditableProject(decoded, ports);
    expect(validation.status).toBe('valid');
    if (validation.status === 'valid') expect(validation.warnings.some(issue => issue.code === 'resolution-needs-source')).toBe(true);
  });
  it('rejects a native transition that no longer connects consecutive keys', () => {
    const candidate: unknown = JSON.parse(fixtureText.replace('"fromFrame": 1, "toFrame": 51', '"fromFrame": 2, "toFrame": 51'));
    expect(() => encodeEditableProject(candidate, createTimelineProjectValidationPorts())).toThrow(ProjectValidationError);
  });
  it('rejects malformed native gradient identities without rewriting the supplied context', () => {
    const candidate: unknown = JSON.parse(fixtureText.replace('"id": "latent", "color"', '"id": "middle", "color"'));
    const before = JSON.stringify(candidate);
    expect(() => encodeEditableProject(candidate, createTimelineProjectValidationPorts())).toThrow(ProjectValidationError);
    expect(JSON.stringify(candidate)).toBe(before);
  });
});
