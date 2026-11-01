// Genuine native document/context capture; source loading is a separate operation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommand, createEditor } from '@kazo-ca/timeline-editor';
import type { ITimelineDocument } from '@kazo-ca/timeline-runtime';
import { cloneHtmlAnimationContext, createHtmlInspectionStage } from '@kazo-ca/timeline-runtime';
import { decodeEditableProject, ProjectValidationError } from '../packages/designer/src/index.js';
import { createTimelineProjectValidationPorts } from '../integration/project-codecs.js';
import { encodeCurrentRealProject } from '../integration/project-capture.js';
import provenance from '../vendor/timeline/manifest.json';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); vi.restoreAllMocks(); document.body.replaceChildren(); });
function setup() {
  const original = decodeEditableProject(readFileSync(resolve('fixtures/native-editable-project.json'), 'utf8'), createTimelineProjectValidationPorts());
  const container = document.createElement('div'); const scene = document.createElement('section'); scene.innerHTML = '<div id="native-box" class="animated"></div>'; document.body.append(container, scene);
  const stage = createHtmlInspectionStage({ root: scene, animationContext: cloneHtmlAnimationContext(original.htmlContext) });
  // The genuine codec's public native validation has established this complete shape.
  const editor = createEditor(container, { data: original.timeline as unknown as ITimelineDocument, stage, defaultPlugins: false });
  cleanup.push(() => editor.destroy());
  const designer = { getDocumentChanges: () => original.documentChanges, getFault: () => null };
  const host = { editor, stage, canCaptureProject: () => true };
  return { original, host, designer, scene };
}
describe('real editable project authoring capture', () => {
  it('saves native curves/context/journal without evaluating frames, changing history or capturing inline preview', () => {
    const { original, host, designer, scene } = setup(); const document = host.editor.document;
    scene.firstElementChild?.setAttribute('style', 'opacity: 0.42 !important; background: magenta');
    const sample = vi.spyOn(host.editor, 'sample').mockImplementation(() => { throw new Error('Capture must not sample'); });
    const load = vi.spyOn(host.editor, 'load'); const before = scene.innerHTML;
    const text = encodeCurrentRealProject({ host, designer, source: original.source, ...(original.metadata ? { metadata: original.metadata } : {}) });
    const saved = decodeEditableProject(text, createTimelineProjectValidationPorts());
    expect(saved).toEqual({ ...original, provenance: { ...original.provenance, adapterRevision: 'HA-ADAPTER-001/r6', timelineReference: provenance.reference } }); expect(saved.timeline).not.toBe(document);
    expect(host.editor.document).toBe(document); expect(host.editor.canUndo).toBe(false); expect(host.editor.canRedo).toBe(false);
    expect(sample).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled(); expect(scene.innerHTML).toBe(before);
    expect(text).not.toContain('magenta'); expect(text).not.toContain('0.42');
  });
  it('refuses a provisional or faulted snapshot without invoking serialization', () => {
    const { original, host, designer } = setup(); const read = vi.spyOn(host.editor, 'toJSON');
    expect(() => encodeCurrentRealProject({ host: { ...host, canCaptureProject: () => false }, designer, source: original.source })).toThrow(ProjectValidationError);
    expect(read).not.toHaveBeenCalled();
    expect(() => encodeCurrentRealProject({ host, designer: { ...designer, getFault: () => 'État incertain' }, source: original.source })).toThrow(ProjectValidationError);
    expect(read).not.toHaveBeenCalled();
  });
  it('refuses a snapshot when a host callback changes the native document during capture', () => {
    const { original, host, designer } = setup();
    vi.spyOn(designer, 'getDocumentChanges').mockImplementation(() => {
      host.editor.execute(createCommand('Concurrent host change', document => ({ ...document, settings: { ...document.settings, fps: 30 } }), document => ({ ...document, settings: { ...document.settings, fps: 24 } })));
      return original.documentChanges;
    });
    expect(() => encodeCurrentRealProject({ host, designer, source: original.source })).toThrow(ProjectValidationError);
    // A read-only capture does not undo an independent host command.
    expect(host.editor.document.settings.fps).toBe(30); expect(host.editor.canUndo).toBe(true);
  });
});
