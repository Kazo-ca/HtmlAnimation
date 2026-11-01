// demo/timeline-real.ts
import { decodeEditableProject, HtmlDesigner } from '@kazo-ca/html-designer';
import type { EditableProject, ProjectProfile } from '@kazo-ca/html-designer';
import type { GradientType } from '@kazo-ca/css-properties';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import type { RealGradientHost } from '../integration/timeline-real.js';
import provenance from '../vendor/timeline/manifest.json';
import { createTimelineProjectValidationPorts } from '../integration/project-codecs.js';
import { encodeCurrentRealProject } from '../integration/project-capture.js';
import { openRealProject } from '../integration/project-open.js';
import projectExampleUrl from '../fixtures/gradient-workshop-conic-project.json?url&no-inline';
import '@kazo-ca/timeline-editor/timeline-editor.css';
import './styles.less';

function required<T extends HTMLElement>(id: string): T { const node = document.getElementById(id); if (!node) throw new Error(`Conteneur absent : ${id}`); return node as T; }
const sceneContainer = required('real-scene'); const editorContainer = required('real-timeline'); const eventLog = required('real-events');
const undo = required<HTMLButtonElement>('real-undo'); const redo = required<HTMLButtonElement>('real-redo'); const frame = required<HTMLInputElement>('real-frame');
let host: RealGradientHost | undefined; let designer: HtmlDesigner | undefined; let unsubscribe: (() => void) | undefined;
let fileGeneration = 0;
const projectSource = { id: 'gradient-workshop', revision: 'source-v1' };
const projectCheck = required('real-project-check'); const projectFile = required<HTMLInputElement>('real-project-file');
const projectFileName = required('real-project-filename');
const openProject = required<HTMLButtonElement>('real-project-open');
const sourceRoot = sceneContainer.cloneNode(false) as HTMLElement;
let checkedProject: EditableProject | null = null;
function currentProfile(): ProjectProfile { return designer?.getProjectState() ?? { source: { ...projectSource } }; }
function sourceType(project: EditableProject): GradientType | null {
  if (project.source.revision !== 'source-v1') return null;
  for (const type of ['linear', 'radial', 'conic'] as const) if (project.source.id === `gradient-workshop-${type}`) return type;
  return null;
}
required('real-reference').textContent = provenance.reference;
required<HTMLAnchorElement>('real-project-example').href = projectExampleUrl;
required<HTMLButtonElement>('real-project-choose').addEventListener('click', () => projectFile.click());
function update(): void {
  if (!host) return;
  const state = host.adapter.getState(); const faulted = (designer?.getFault() ?? null) !== null; undo.disabled = faulted || !state.canUndo; redo.disabled = faulted || !state.canRedo; frame.value = String(state.frame);
  const count = host.editor.document.layers.reduce((sum, layer) => sum + (layer.type === 'layer' ? Object.values(layer.propertyTimelines ?? {}).reduce((total, track) => total + track.keys.length, 0) : 0), 0);
  required('real-key-count').textContent = `${count} clés · packages réels`;
  required('real-document').textContent = JSON.stringify({ timeline: host.editor.document, html: host.stage.animationContext }, null, 2);
  required<HTMLButtonElement>('real-project-save').disabled = faulted || !host.canCaptureProject();
  openProject.disabled = faulted || !host.canCaptureProject() || !checkedProject || !sourceType(checkedProject);
}
function mount(type: GradientType): void {
  fileGeneration++; projectFile.value = ''; projectFileName.textContent = 'Aucun fichier choisi'; checkedProject = null;
  unsubscribe?.(); designer?.dispose(); host?.dispose(); editorContainer.replaceChildren();
  for (const attribute of [...sceneContainer.attributes]) sceneContainer.removeAttributeNode(attribute);
  for (const attribute of sourceRoot.attributes) sceneContainer.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
  const scene = createGradientScene(document, type); sceneContainer.replaceChildren(scene);
  host = createRealGradientHost(editorContainer, sceneContainer, type);
  designer = new HtmlDesigner({ scene: sceneContainer, propertiesContainer: required('real-properties'), treeContainer: required('real-tree'), timeline: host.editor, adapter: () => { if (!host) throw new Error('Hôte réel absent.'); return host.adapter; } });
  designer.on('propertychange', change => { eventLog.textContent = `Propriété enregistrée : ${change.property} · ${change.oldValue} → ${change.newValue} · image ${change.frame}`; update(); });
  designer.on('documentchange', change => { eventLog.textContent = `Document original modifié · ${change.direction}`; });
  designer.on('gradientchange', change => { eventLog.textContent = `Structure du dégradé · ${change.direction} · identités conservées`; update(); });
  designer.on('projectchange', change => { eventLog.textContent = `Projet ouvert · ${change.source.id} · ${change.direction}`; update(); });
  designer.on('fault', change => { undo.disabled = true; redo.disabled = true; openProject.disabled = true; required<HTMLButtonElement>('real-project-save').disabled = true; eventLog.textContent = change.message; });
  designer.on('diagnostic', change => { eventLog.textContent = change.message; });
  unsubscribe = host.adapter.onChange(update); designer.selectTarget('#gradient-box'); update();
  eventLog.textContent = 'Moteur réel prêt · composants indépendants et historique Timeline. Aucun résultat de simulation affiché ici.';
  projectSource.id = `gradient-workshop-${type}`;
  projectCheck.textContent = 'Choisissez un fichier, puis ouvrez-le avec sa source HTML/CSS fournie par cet atelier. L’ouverture peut être annulée.';
}
required('real-project-save').addEventListener('click', () => {
  if (!host || !designer) return;
  try {
    const profile = currentProfile();
    const text = encodeCurrentRealProject({ host, designer, source: profile.source, ...(profile.metadata === undefined ? {} : { metadata: profile.metadata }) });
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const link = document.createElement('a');
    link.href = url; link.download = 'projet-html-animation.json'; link.hidden = true; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    projectCheck.textContent = 'Projet éditable enregistré. La source HTML/CSS d’origine reste fournie par l’hôte.';
  } catch (error) { projectCheck.textContent = error instanceof Error ? error.message : 'Le projet n’a pas pu être enregistré.'; }
});
projectFile.addEventListener('change', async () => {
  const file = projectFile.files?.[0]; const generation = ++fileGeneration; checkedProject = null;
  projectFileName.textContent = file?.name ?? 'Aucun fichier choisi'; update();
  if (!file) { projectCheck.textContent = 'Aucun fichier choisi.'; return; }
  projectCheck.textContent = 'Lecture du fichier projet…';
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Le fichier dépasse la taille de projet autorisée.');
    const text = await file.text(); if (generation !== fileGeneration) return;
    const project = decodeEditableProject(text, createTimelineProjectValidationPorts());
    checkedProject = project; update();
    projectCheck.textContent = `Format de projet valide · source requise : ${project.source.id} (${project.source.revision}) · ${project.documentChanges.length} modification(s) du document. ${sourceType(project) ? 'Prêt à ouvrir. Le projet ouvert est inchangé.' : 'Cette source est indisponible dans cet atelier. Le projet ouvert est inchangé.'}`;
  } catch (error) { if (generation === fileGeneration) projectCheck.textContent = error instanceof Error ? error.message : 'Le fichier projet n’est pas valide.'; }
});
openProject.addEventListener('click', () => {
  if (!host || !designer || !checkedProject) return;
  const project = checkedProject; const type = sourceType(project); if (!type) return;
  const root = sourceRoot.cloneNode(false) as HTMLElement; root.append(createGradientScene(document, type));
  const generation = fileGeneration;
  const result = openRealProject({ host, designer, scene: sceneContainer, project,
    initialProfile: currentProfile(),
    source: { reference: { ...project.source }, root, isCurrent: () => sourceType(project) === type },
    isCurrent: () => checkedProject === project && fileGeneration === generation,
  });
  projectCheck.textContent = 'message' in result ? result.message : result.status === 'changed' ? `Projet ouvert · ${project.source.id}. Annuler restaure le projet précédent.` : 'Le projet est déjà ouvert.';
  update();
});
required('real-load').addEventListener('click', () => { const value = required<HTMLSelectElement>('real-type').value; mount(value === 'radial' || value === 'conic' ? value : 'linear'); });
required('real-seek').addEventListener('click', () => { const value = Number(frame.value); if (Number.isInteger(value) && value >= 1 && value <= 100) { host?.navigate(value); update(); } else eventLog.textContent = 'Choisissez une image entière de 1 à 100.'; });
undo.addEventListener('click', () => { designer?.undo(); update(); }); redo.addEventListener('click', () => { designer?.redo(); update(); });
let previous = performance.now();
function tick(now: number): void { host?.advance(Math.min(now - previous, 100)); previous = now; requestAnimationFrame(tick); }
window.addEventListener('pagehide', () => { unsubscribe?.(); designer?.dispose(); host?.dispose(); });
mount('linear'); requestAnimationFrame(tick);
