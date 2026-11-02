// integration/project-capture.ts
import type { IEditor } from '@kazo-ca/timeline-editor';
import type { IHtmlStage } from '@kazo-ca/timeline-runtime';
import { encodeEditableProject, ProjectValidationError } from '../packages/designer/src/index.js';
import type { HtmlDesigner, JsonObject, ProjectSourceReference } from '../packages/designer/src/index.js';
import { createTimelineProjectValidationPorts } from './project-codecs.js';
import provenance from '../vendor/timeline/manifest.json';

export interface RealProjectCaptureHost {
  readonly editor: Pick<IEditor, 'document' | 'toJSON' | 'on'>;
  readonly stage: Pick<IHtmlStage, 'animationContext'>;
  canCaptureProject(): boolean;
}
export interface RealProjectCaptureOptions {
  readonly host: RealProjectCaptureHost;
  readonly designer: Pick<HtmlDesigner, 'getDocumentChanges' | 'getFault'>;
  readonly source: ProjectSourceReference;
  readonly metadata?: JsonObject;
}

/** Authoring snapshot only: never sampling, loading, rendering or changing history. */
export function encodeCurrentRealProject(options: RealProjectCaptureOptions): string {
  const { host, designer } = options;
  const fail = (code: string, message: string): never => { throw new ProjectValidationError([{ code, path: '$', message, severity: 'error' }]); };
  if (!host.canCaptureProject() || designer.getFault() !== null) return fail('project-capture-unavailable', 'Terminez ou annulez la transaction et rétablissez un projet cohérent avant de l’enregistrer.');
  let changed = false;
  const subscriptions = (['document:changed', 'document:loaded', 'transaction:changed'] as const).map(event => host.editor.on(event, () => { changed = true; }));
  try {
    const document = host.editor.document;
    const text = encodeEditableProject({
      format: 'html-animation-project', version: 1, source: options.source,
      timeline: host.editor.toJSON(), htmlContext: host.stage.animationContext,
      documentChanges: designer.getDocumentChanges(),
      provenance: { kind: 'real', adapterRevision: 'HA-ADAPTER-001/r6', timelineReference: provenance.reference },
      ...(options.metadata ? { metadata: options.metadata } : {}),
    }, createTimelineProjectValidationPorts());
    if (changed || host.editor.document !== document || !host.canCaptureProject() || designer.getFault() !== null) return fail('project-capture-changed', 'Le projet a changé pendant sa capture. Recommencez l’enregistrement.');
    return text;
  } catch (error) {
    if (error instanceof ProjectValidationError) throw error;
    return fail('project-capture-failed', 'La capture du projet n’a pas pu être validée.');
  } finally { for (const unsubscribe of subscriptions) unsubscribe(); }
}
