// integration/project-open.ts
import { CommandRefusedError, createCommand } from '@kazo-ca/timeline-editor';
import { cloneHtmlAnimationContext } from '@kazo-ca/timeline-runtime';
import type { ITimelineDocument, LayerNode } from '@kazo-ca/timeline-runtime';
import { DomPreviewOwner, ProjectValidationError, decodeEditableProject, resolveProjectSourceJournal, validateEditableProject } from '../packages/designer/src/index.js';
import type { EditableProject, HtmlDesigner, MutationResult, ProjectProfile, ProjectSourceReference } from '../packages/designer/src/index.js';
import { fullXPath } from '../packages/designer/src/dom-origin.js';
import { encodeCurrentRealProject } from './project-capture.js';
import { createTimelineProjectValidationPorts } from './project-codecs.js';
import type { RealGradientHost } from './timeline-real.js';

/** Trusted original HTML/CSS prepared by the host, never an arbitrary HTML string. */
export interface PreparedRealProjectSource {
  readonly reference: ProjectSourceReference;
  /** Detached source root: same localName/namespace as scene; its children are consumed. */
  readonly root: HTMLElement;
  /** Resource availability/revision guard, independent of a short-lived UI ticket. */
  readonly isCurrent: () => boolean;
}
export interface OpenRealProjectOptions {
  readonly host: RealGradientHost;
  readonly designer: HtmlDesigner;
  readonly scene: HTMLElement;
  readonly project: unknown;
  readonly source: PreparedRealProjectSource;
  /** Required until this Designer has adopted its first persisted source profile. */
  readonly initialProfile?: ProjectProfile;
  /** Initial user confirmation only; never reused on undo/redo. */
  readonly isCurrent?: () => boolean;
}
interface AttributeValue { readonly namespace: string | null; readonly name: string; readonly value: string }
interface NodeState { readonly node: Node; readonly value: string | null; readonly children: readonly Node[]; readonly attributes: readonly AttributeValue[] }
interface SourceState {
  readonly project: EditableProject;
  readonly nodes: readonly Node[];
  attributes: readonly AttributeValue[];
  structure: readonly NodeState[];
  owner: DomPreviewOwner | undefined;
  activeGuard: (() => void) | null;
}
function attributes(element: Element): readonly AttributeValue[] { return [...element.attributes].map(attribute => ({ namespace: attribute.namespaceURI, name: attribute.name, value: attribute.value })); }
function setAttributes(element: Element, values: readonly AttributeValue[]): void {
  for (const attribute of [...element.attributes]) element.removeAttributeNode(attribute);
  for (const value of values) element.setAttributeNS(value.namespace, value.name, value.value);
}
function nodeState(nodes: readonly Node[]): readonly NodeState[] {
  return nodes.flatMap(node => [{ node, value: node.nodeValue, children: [...node.childNodes], attributes: node instanceof Element ? attributes(node) : [] }, ...nodeState([...node.childNodes])]);
}
function sameNodes(left: readonly Node[], right: readonly Node[]): boolean { return left.length === right.length && left.every((node, index) => node === right[index]); }
function unchanged(state: readonly NodeState[]): boolean {
  return state.every(entry => entry.value === entry.node.nodeValue && sameNodes(entry.children, [...entry.node.childNodes]) && JSON.stringify(entry.attributes) === JSON.stringify(entry.node instanceof Element ? attributes(entry.node) : []));
}
function restoreAll(actions: readonly (() => void)[]): void {
  let failure: unknown; let failed = false;
  for (const action of actions) try { action(); } catch (error) { if (!failed) failure = error; failed = true; }
  if (failed) throw failure;
}
function rawAttribute(element: Element, name: string, value: string | null): void { if (value === null) element.removeAttribute(name); else element.setAttribute(name, value); }
function selectorLayerIds(nodes: readonly LayerNode[]): readonly string[] {
  return nodes.flatMap(node => node.type === 'folder' ? selectorLayerIds(node.children) : node.target && 'selector' in node.target ? [node.id] : []);
}
/** The general bridge maps folders and any selector layer; a gradient must still belong to one. */
function requireWorkshopMapping(project: EditableProject): void {
  const document = project.timeline as unknown as ITimelineDocument;
  const context = cloneHtmlAnimationContext(project.htmlContext);
  const owners = new Set(selectorLayerIds(document.layers));
  const gradientOwners = [...Object.keys(context.gradients ?? {}), ...Object.entries(context.bindings ?? {}).flatMap(([id, bindings]) => Object.values(bindings).some(binding => binding.kind === 'gradient') ? [id] : [])];
  if (gradientOwners.some(id => !owners.has(id))) throw new Error('Cet atelier ne raccorde pas un dégradé dont le propriétaire n’est pas un calque ciblé par sélecteur. Le projet reste intact pour un hôte compatible.');
}

/**
 * One native transaction replaces authoring data, context and trusted source together.
 * The mounted source receives scene's original document location for Full XPath checks.
 * Neither Editor.load nor a second history stack participates.
 */
export function openRealProject(options: OpenRealProjectOptions): MutationResult {
  const { host, designer, scene, source } = options;
  const fault = designer.getFault() ?? host.adapter.getState().fault;
  if (fault) return { status: 'faulted', message: fault };
  try {
    if (!host.canCaptureProject()) throw new Error('Terminez ou annulez la transaction avant d’ouvrir un projet.');
    const validation = createTimelineProjectValidationPorts();
    const decoded = validateEditableProject(options.project, validation);
    if (decoded.status === 'invalid') throw new ProjectValidationError(decoded.issues);
    const project = decoded.project;
    requireWorkshopMapping(project);
    if (source.reference.id !== project.source.id || source.reference.revision !== project.source.revision) throw new Error('La référence de la source fournie ne correspond pas au projet.');
    if (source.root === scene || source.root.isConnected || source.root.ownerDocument !== scene.ownerDocument || source.root.localName !== scene.localName || source.root.namespaceURI !== scene.namespaceURI) throw new Error('L’hôte doit préparer une racine source détachée, de même nom et espace de noms que la scène.');
    if (!source.isCurrent() || options.isCurrent?.() === false) throw new Error('La source préparée ou la confirmation d’ouverture n’est plus actuelle.');
    const profile = designer.getProjectState() ?? options.initialProfile;
    if (!profile) throw new Error('L’hôte doit fournir la référence de la source actuelle avant la première ouverture.');
    const previousProject = decodeEditableProject(encodeCurrentRealProject({ host, designer, ...profile }), validation);
    requireWorkshopMapping(previousProject);
    const previousDocument = host.editor.document;
    const originalPath = fullXPath(scene);
    const originalSourceAttributes = attributes(source.root);
    const before: SourceState = { project: previousProject, nodes: [...scene.childNodes], attributes: attributes(scene), structure: [], owner: host.previewOwner, activeGuard: host.projectRenderPolicy.active };
    const after: SourceState = { project, nodes: [...source.root.childNodes], attributes: attributes(source.root), structure: nodeState([...source.root.childNodes]), owner: undefined, activeGuard: null };
    const label = 'Open editable project';
    const command = createCommand(label, document => {
      if (JSON.stringify(document) !== JSON.stringify(previousProject.timeline)) throw new CommandRefusedError(label, 'Le document courant ne correspond plus au projet précédent.');
      return project.timeline as unknown as ITimelineDocument;
    }, document => {
      if (JSON.stringify(document) !== JSON.stringify(project.timeline)) throw new CommandRefusedError(label, 'Le document courant ne correspond plus au projet ouvert.');
      return previousDocument;
    });
    return designer.executeProjectMutation(() => host.executeTransaction({ label, commands: [command], htmlContext: { stageId: host.stage.id, context: cloneHtmlAnimationContext(project.htmlContext) },
      isCurrent: () => host.editor.document === previousDocument && source.isCurrent() && options.isCurrent?.() !== false,
      effect: { prepare(direction) {
        const current = direction === 'undo' ? after : before;
        const next = direction === 'undo' ? before : after;
        const requireCurrent = (): void => {
          if (!source.isCurrent() || source.reference.id !== project.source.id || source.reference.revision !== project.source.revision || JSON.stringify(attributes(source.root)) !== JSON.stringify(originalSourceAttributes) || fullXPath(scene) !== originalPath || !scene.isConnected || host.previewOwner !== current.owner || !sameNodes([...scene.childNodes], current.nodes)) throw new Error('Les ressources ou la scène ont changé depuis cette ouverture.');
          if (!unchanged(next.structure)) throw new Error('Les nœuds conservés du projet ont été modifiés hors de son historique.');
        };
        requireCurrent();
        const prior = { attributes: attributes(scene), nodes: [...scene.childNodes], owner: host.previewOwner,
          policy: host.projectRenderPolicy, parents: next.nodes.map(node => ({ node, parent: node.parentNode, following: node.nextSibling })),
          currentAttributes: current.attributes, currentStructure: current.structure, nextOwner: next.owner, nextAttributes: next.attributes, nextStructure: next.structure, nextGuard: next.activeGuard };
        const sourceRestore = prior.owner.prepareRestore();
        const root = designer.prepareProjectRehydration(() => {
          if (!next.owner) throw new Error('Le propriétaire de la nouvelle source n’est pas prêt.');
          return { project: next.project, preview: next.owner, validation };
        }, direction);
        const journalCapture: { readonly element: Element; readonly name: string; readonly value: string | null }[] = [];
        const requireMounted = (): void => {
          if (!source.isCurrent() || source.reference.id !== project.source.id || source.reference.revision !== project.source.revision || JSON.stringify(attributes(source.root)) !== JSON.stringify(originalSourceAttributes) || fullXPath(scene) !== originalPath || !scene.isConnected || host.previewOwner !== next.owner || !sameNodes([...scene.childNodes], next.nodes)) throw new Error('La source montée ou ses ressources ont changé pendant l’ouverture ou le rendu.');
        };
        let started = false;
        return { changed: true, apply() {
          requireCurrent(); started = true;
          sourceRestore.apply();
          current.attributes = attributes(scene); current.structure = nodeState(current.nodes);
          setAttributes(scene, next.attributes); scene.replaceChildren(...next.nodes);
          if (!next.owner) {
            const journal = resolveProjectSourceJournal(scene, source.reference, next.project);
            if (journal.status === 'invalid') throw new ProjectValidationError(journal.issues);
            for (const { element, change } of journal.entries) {
              journalCapture.push({ element, name: change.attribute, value: element.getAttribute(change.attribute) });
              rawAttribute(element, change.attribute, change.newValue);
            }
            next.owner = new DomPreviewOwner(scene);
            next.activeGuard = requireMounted;
          }
          host.installPreviewOwner(next.owner); host.installProjectRenderPolicy({ active: next.activeGuard, transition: requireMounted }); root.apply(); requireMounted();
        }, rollback() {
          if (!started) return;
          restoreAll([
            () => root.rollback(),
            ...journalCapture.slice().reverse().map(entry => () => rawAttribute(entry.element, entry.name, entry.value)),
            () => setAttributes(scene, prior.attributes),
            () => scene.replaceChildren(...prior.nodes),
            ...prior.parents.slice().reverse().map(entry => () => { if (entry.parent) entry.parent.insertBefore(entry.node, entry.following); else entry.node.parentNode?.removeChild(entry.node); }),
            () => host.installPreviewOwner(prior.owner),
            () => host.installProjectRenderPolicy(prior.policy),
            () => sourceRestore.rollback(),
            () => { current.attributes = prior.currentAttributes; current.structure = prior.currentStructure; next.owner = prior.nextOwner; next.attributes = prior.nextAttributes; next.structure = prior.nextStructure; next.activeGuard = prior.nextGuard; },
          ]);
        } };
      } },
    }));
  } catch (error) {
    return { status: 'rejected', message: error instanceof Error && error.message.trim() ? error.message : 'L’ouverture du projet a été refusée.' };
  }
}
