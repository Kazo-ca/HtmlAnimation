// integration/project-codecs.ts
import { cloneHtmlAnimationContext, collectLayers, validateDocument } from '@kazo-ca/timeline-runtime';
import type { IHtmlAnimationContext, ITimelineDocument } from '@kazo-ca/timeline-runtime';
import type { JsonObject, ProjectIssue, ProjectValidationPorts } from '../packages/designer/src/index.js';

function contextIssues(input: JsonObject, document: JsonObject): readonly ProjectIssue[] {
  let context: IHtmlAnimationContext;
  try { context = cloneHtmlAnimationContext(input); }
  catch { return [{ code: 'html-context-schema', path: '$.htmlContext', message: 'Le contexte HTML ne respecte pas son format natif.', severity: 'error' }]; }
  if (validateDocument(document, { allowLiveTargets: false }).length) return [];
  // The public validator above established the native shape and semantic invariants.
  const native = document as unknown as ITimelineDocument;
  const ids = new Set(collectLayers(native).map(layer => layer.id));
  const issues: ProjectIssue[] = [];
  for (const section of ['bindings', 'gradients'] as const) for (const id of Object.keys(context[section] ?? {})) {
    if (!ids.has(id)) issues.push({ code: 'html-layer-reference', path: `$.htmlContext.${section}.${id}`, message: 'Ce contexte référence un objet absent du document. Les données sont conservées pour correction.', severity: 'warning' });
  }
  for (const [index] of (context.resolutions ?? []).entries()) {
    // A conflict signature depends on original HTML contributions. Do not invent
    // validity from a JSON-only inspection or rewrite a stale saved decision.
    issues.push({ code: 'resolution-needs-source', path: `$.htmlContext.resolutions[${index}]`, message: 'Cette décision doit être revalidée avec les contributions de la source fournie par l’hôte.', severity: 'warning' });
  }
  return issues;
}

/** Integration port: the reusable codec never imports Timeline. */
export function createTimelineProjectValidationPorts(): ProjectValidationPorts {
  return {
    validateTimeline: document => validateDocument(document, { allowLiveTargets: false }).map(issue => ({ code: `timeline-${issue.code}`, path: `$.timeline${issue.path}`, message: 'Le document temporel ne respecte pas son format ou ses contraintes natives.', severity: 'error' })),
    validateHtmlContext: contextIssues,
  };
}
