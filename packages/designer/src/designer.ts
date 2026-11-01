// packages/designer/src/designer.ts
import { CssPropertiesPanel } from '@kazo-ca/css-properties';
import type { CssProperty } from '@kazo-ca/css-properties';
import { HierarchicalDomTree } from '@kazo-ca/hierarchical-dom-tree';
import type { TreeSelectionContext } from '@kazo-ca/hierarchical-dom-tree';
import { DomOrigin } from './dom-origin.js';
import { DesignerEmitter } from './events.js';
import type { DesignerEvents, DocumentChange } from './events.js';
import { InspectorUi } from './inspector-ui.js';
import { resolveTarget, specificity, targetChoices } from './targets.js';
import type { MutationResult, TimelineAdapter, TimelineReason } from './timeline-adapter.js';
import { geometryContext, geometryDefaults, geometryProperties, geometryStateKey, geometryValues, isGeometryProperty, pivotCoordinates, projectGeometry, unresolvedPercentageHeight, validGeometryValue } from './geometry-dom.js';
import { geometryLengthPixels, snapPosition, updateGeometry } from './geometry-math.js';
import type { GeometryGuide, GeometryMetrics, GeometryState, GeometryTool, Point } from './geometry-math.js';
import { GeometryControls } from './geometry-controls.js';
import { capturePreviewScroll } from './preview-scroll.js';
import type { GeometryOptions, GeometryUpdateResult, GeometryView } from './geometry-controls.js';
import { ConflictUi } from './conflict-ui.js';
import type { ConflictSnapshot } from './conflict-types.js';
import { conflictWinner, copyConflictSnapshot, guardConflictTargets } from './conflicts.js';
import type { ProjectionCandidate } from './conflicts.js';
import { GradientController } from './gradient-controller.js';
import type { GradientColor, GradientEdit } from '@kazo-ca/css-properties';
import type { GradientSnapshot } from './gradient-types.js';

export interface PropertyEdit { readonly property: string; readonly newValue: string; readonly capture?: boolean }
interface GeometryGesture {
  readonly element: HTMLElement; readonly selector: string; readonly frame: number; readonly tool: GeometryTool;
  readonly state: GeometryState; readonly metrics: GeometryMetrics; readonly rect: DOMRect; readonly parentRect: DOMRect;
  values: Readonly<Partial<GeometryState>>; guides: readonly GeometryGuide[]; confirmation: boolean;
  readonly unknownTransform: string | null; convertedTransform: string | null;
}

export interface DesignerOptions<T> {
  readonly scene: HTMLElement;
  readonly propertiesContainer: HTMLElement;
  readonly treeContainer: HTMLElement;
  readonly timeline: T;
  readonly adapter: (timeline: T) => TimelineAdapter;
}
const commonProperties = ['opacity', 'width', 'height', 'position', 'left', 'top', 'transform', 'margin', 'margin-top', 'padding', 'color', 'background', 'background-color', 'background-image', 'border', 'border-radius', 'box-shadow', 'text-shadow', 'font', 'font-family', 'font-size'];
const labels: Readonly<Record<string, string>> = { opacity: 'Opacité', width: 'Largeur', height: 'Hauteur', 'margin-top': 'Marge supérieure', 'background-color': 'Couleur de fond', color: 'Couleur', transform: 'Transformation', translateX: 'Déplacement X', translateY: 'Déplacement Y', rotation: 'Rotation', rotate: 'Rotation CSS', scaleX: 'Échelle X', scaleY: 'Échelle Y', pivotX: 'Pivot X', pivotY: 'Pivot Y' };

export class HtmlDesigner<T = unknown> {
  private readonly scene: HTMLElement;
  private readonly adapter: TimelineAdapter;
  private readonly origin: DomOrigin;
  private readonly panel: CssPropertiesPanel;
  private readonly tree: HierarchicalDomTree;
  private readonly ui: InspectorUi;
  private readonly conflictsUi: ConflictUi;
  private readonly scrollRoots: readonly HTMLElement[];
  private readonly emitter = new DesignerEmitter();
  private readonly abort = new AbortController();
  private readonly subscriptions: (() => void)[] = [];
  private elements: readonly HTMLElement[] = [];
  private target: string | null = null;
  private changes: readonly DocumentChange[] = [];
  private overlays: HTMLElement[] = [];
  private syncing = false;
  private disposed = false;
  private mode: 'select' | 'test' = 'select';
  private pending: { readonly property: string; readonly value: string } | null = null;
  private pendingDocumentChange: DesignerEvents['documentchange'] | null = null;
  private geometryControls: GeometryControls | undefined;
  private gesture: GeometryGesture | null = null;
  private geometryTool: GeometryTool = 'move';
  private geometryOptions: GeometryOptions = { grid: false, snap: false, guides: true, gridSize: 10 };
  private pendingGeometryTarget = false;
  private projectedValues = new Map<HTMLElement, Readonly<Record<string, string>>>();
  private contextEpoch = 0;
  private pendingConflict: { readonly id: string; readonly signature: string; readonly revision: string; readonly epoch: number; readonly targetsCurrent: () => boolean } | null = null;
  private resolutionsKey = '';
  private gradientController: GradientController | undefined;
  private fault: string | null = null;
  private mutationDepth = 0;
  private deferredNotifications: TimelineReason[] = [];

  public constructor(options: DesignerOptions<T>) {
    this.scene = options.scene; this.adapter = options.adapter(options.timeline);
    this.scrollRoots = [options.scene, options.propertiesContainer, options.treeContainer];
    if (!['HA-TL-001/r1', 'HA-TL-001/r2'].includes(this.adapter.contractRevision)) throw new Error('Révision de contrat Timeline incompatible.');
    this.origin = new DomOrigin(this.scene);
    this.ui = new InspectorUi(options.propertiesContainer, {
      chooseTarget: selector => this.commitTarget(selector),
      cancelTarget: () => { this.pending = null; this.pendingGeometryTarget = false; this.ui.hideTargets(); this.refreshPanel(); },
      changeAttribute: (attribute, value) => { const element = this.elements[0]; if (element) this.setAttribute(element, attribute, value || null); },
    });
    this.panel = new CssPropertiesPanel(this.ui.panelContainer, { commonProperties: true });
    this.conflictsUi = new ConflictUi(this.ui.root, { open: id => this.openConflict(id), apply: (id, choiceId) => { this.resolveConflict(id, choiceId); }, cancel: () => this.cancelConflict() });
    this.resolutionsKey = JSON.stringify(this.getConflictState()?.resolutions ?? []);
    this.tree = new HierarchicalDomTree(options.treeContainer, { root: this.scene });
    this.subscriptions.push(this.panel.onChange(change => this.requestEdit(change.property, change.newValue)), this.tree.onSelectionChange((elements, context) => this.selectTreeElements(elements, context)), this.adapter.onChange(reason => this.timelineChanged(reason)));
    this.geometryControls = new GeometryControls(this.ui.root, { scene: this.scene, read: () => this.geometryView(), setTool: tool => this.setGeometryTool(tool), begin: tool => this.beginGeometryGesture(tool), update: (delta, settings) => this.updateGeometryGesture(delta, settings), commit: () => this.commitGeometryGesture(), cancel: () => this.cancelGeometryGesture(), setOptions: settings => this.setGeometryOptions(settings), setPivot: (x, y) => this.setGeometryPivot(x, y) });
    this.gradientController = new GradientController(this.ui.root, this.scene, this.adapter, { refresh: () => this.render(), report: message => this.report(message), fault: message => this.enterFault(message), mutate: action => this.runMutation(action), property: event => this.emitter.emit('propertychange', event), context: event => this.emitter.emit('gradientchange', event) });
    this.scene.ownerDocument.addEventListener('keydown', event => { if (event.key === 'Escape' && this.gesture) { event.preventDefault(); this.cancelGeometryGesture(); } }, { signal: this.abort.signal });
    this.scene.addEventListener('click', event => {
      if (this.mode === 'test') return;
      event.preventDefault(); event.stopPropagation();
      const target = event.target; if (target instanceof HTMLElement) this.selectElements([target]);
    }, { capture: true, signal: this.abort.signal });
    this.scene.ownerDocument.defaultView?.addEventListener('resize', () => this.highlight(), { signal: this.abort.signal });
    this.scene.ownerDocument.addEventListener('scroll', () => this.highlight(), { capture: true, signal: this.abort.signal });
    this.render();
  }
  public on<K extends keyof DesignerEvents>(type: K, listener: (event: DesignerEvents[K]) => void): () => void { return this.emitter.on(type, listener); }
  public getDocumentChanges(): readonly DocumentChange[] { return this.changes.map(change => ({ ...change })); }
  public getFault(): string | null { return this.fault; }
  public getGradientState(): GradientSnapshot | null { return this.gradientController?.getState() ?? null; }
  public editGradient(changes: readonly GradientEdit[]): MutationResult { return this.runMutation(() => this.gradientController?.edit(changes) ?? this.reject('Aucun dégradé structuré disponible.')); }
  public addGradientStop(gradientId: string, values: { readonly color: GradientColor; readonly opacity: number; readonly position: number }): MutationResult { return this.runMutation(() => this.gradientController?.add(gradientId, values) ?? this.reject('Aucun dégradé structuré disponible.')); }
  public removeGradientStop(gradientId: string, stopId: string): MutationResult { return this.runMutation(() => this.gradientController?.remove(gradientId, stopId) ?? this.reject('Aucun dégradé structuré disponible.')); }
  public selectGradient(gradientId: string, stopId: string | null): void { this.gradientController?.select(gradientId, stopId); }
  public beginGradientGesture(): MutationResult { if (this.fault) return this.faultResult(); this.cancelGeometryGesture(); return this.gradientController?.begin() ?? this.reject('Aucun dégradé structuré disponible.'); }
  public previewGradient(changes: readonly GradientEdit[]): MutationResult { if (this.fault) return this.faultResult(); return this.gradientController?.preview(changes) ?? this.reject('Aucun dégradé structuré disponible.'); }
  public commitGradientGesture(): MutationResult { return this.runMutation(() => this.gradientController?.commit() ?? { status: 'unchanged' }); }
  public cancelGradientGesture(): void { this.gradientController?.cancel(); }
  public getConflictState(): ConflictSnapshot | null { return this.adapter.conflicts ? copyConflictSnapshot(this.adapter.conflicts.read()) : null; }
  private cancelConflict(): void { this.contextEpoch++; this.pendingConflict = null; this.conflictsUi.close(); }
  private openConflict(id: string): void {
    if (this.fault) return;
    this.cancelGeometryGesture(); this.cancelConflict();
    const snapshot = this.getConflictState(); const diagnostic = snapshot?.diagnostics.find(candidate => candidate.id === id);
    if (!snapshot || !diagnostic) return;
    this.conflictsUi.render(snapshot);
    this.pendingConflict = { id, signature: diagnostic.signature, revision: snapshot.revision, epoch: this.contextEpoch, targetsCurrent: guardConflictTargets(this.scene, snapshot) };
    this.conflictsUi.open(id, this.adapter.getState().selectedObjectId);
  }
  public resolveConflict(id: string, choiceId: string): MutationResult {
    if (this.fault) return this.faultResult();
    if (this.disposed) return this.reject('Le Designer est fermé.');
    if (this.gesture) return this.reject('Terminez ou annulez le geste avant de résoudre le conflit.');
    const capability = this.adapter.conflicts; const snapshot = this.getConflictState();
    const diagnostic = snapshot?.diagnostics.find(candidate => candidate.id === id);
    if (!capability || !snapshot || !diagnostic?.choices.some(choice => choice.id === choiceId)) return this.reject('Cette résolution n’est pas disponible dans l’adaptateur courant.');
    const pending = this.pendingConflict;
    const epoch = pending?.epoch ?? this.contextEpoch;
    const revision = pending?.revision ?? snapshot.revision;
    const signature = pending?.signature ?? diagnostic.signature;
    const targetsCurrent = pending?.targetsCurrent ?? guardConflictTargets(this.scene, snapshot);
    const frame = this.adapter.getState().frame;
    const isCurrent = (): boolean => !this.disposed && this.contextEpoch === epoch && this.adapter.getState().frame === frame && capability.read().revision === revision && targetsCurrent();
    if (pending && pending.id !== id || !isCurrent()) { this.cancelConflict(); return this.reject('Le contexte a changé. Ouvrez une nouvelle résolution.'); }
    const result = this.runMutation(() => capability.resolve({ id, signature, choiceId, revision }, isCurrent));
    this.cancelConflict();
    if (result.status === 'rejected') return this.reject(result.message);
    if (result.status === 'changed') this.report('Résolution enregistrée dans le projet. Vous pouvez l’annuler.');
    return result;
  }
  public setMode(mode: 'select' | 'test'): void { this.gradientController?.cancel(false); this.cancelConflict(); this.cancelGeometryGesture(); this.mode = mode; this.render(); }
  private selectTreeElements(elements: readonly HTMLElement[], context?: TreeSelectionContext): void {
    const selector = context?.kind === 'class' ? `.${context.className}` : null;
    if (selector && specificity(selector) === 1) { this.selectTarget(selector); return; }
    this.selectElements(elements);
    if (selector) this.report('Classe sélectionnée pour inspection. Son nom nécessite un échappement CSS non pris en charge pour l’animation.');
  }
  public selectElements(elements: readonly HTMLElement[]): void {
    if (this.disposed) return;
    this.gradientController?.cancel(false);
    this.cancelConflict();
    this.cancelGeometryGesture();
    this.elements = [...new Set(elements)].filter(element => this.origin.has(element) && this.scene.contains(element));
    this.target = null; this.pending = null; this.ui.hideTargets();
    const element = this.elements[0];
    const matches = element ? this.adapter.getState().objects.filter(object => resolveTarget(this.scene, object.selector).includes(element)) : [];
    const associated = this.elements.length === 1 ? matches.find(object => element?.id && object.selector === `#${element.id}` && resolveTarget(this.scene, object.selector).length === 1) : undefined;
    if (associated) this.target = associated.selector;
    this.syncing = true; this.adapter.selectObject(associated?.id ?? null); this.syncing = false;
    if (matches.length > 1 && !associated) this.report('Plusieurs objets correspondent. Choisissez une cible explicitement.');
    this.render(); this.emitter.emit('selectionchange', { elements: this.elements, objectId: associated?.id ?? null });
  }
  public selectTarget(selector: string): void {
    if (this.disposed) return;
    this.gradientController?.cancel(false);
    this.cancelConflict();
    this.cancelGeometryGesture();
    const elements = resolveTarget(this.scene, selector);
    if (!elements.length) { this.report('Cible introuvable ou sélecteur non pris en charge : utilisez un ID ou des classes combinées.'); return; }
    this.pending = null; this.ui.hideTargets();
    this.elements = elements; this.target = selector;
    const object = this.adapter.getState().objects.find(object => object.selector === selector);
    this.syncing = true; this.adapter.selectObject(object?.id ?? null); this.syncing = false;
    this.render(); this.emitter.emit('selectionchange', { elements, objectId: object?.id ?? null });
  }
  private timelineChanged(reason: TimelineReason): void {
    if (this.syncing || this.disposed) return;
    this.gradientController?.cancel(false);
    this.cancelConflict();
    if (this.gesture) { this.gesture = null; }
    if (reason === 'selection') {
      this.pending = null; this.ui.hideTargets();
      const state = this.adapter.getState(); const object = state.objects.find(object => object.id === state.selectedObjectId);
      if (object) { this.target = object.selector; this.elements = resolveTarget(this.scene, object.selector); }
      else { this.target = null; this.elements = []; }
      this.emitter.emit('selectionchange', { elements: this.elements, objectId: state.selectedObjectId });
    }
    this.render();
    if (this.fault) { this.pendingDocumentChange = null; return; }
    if (this.mutationDepth) { this.deferredNotifications.push(reason); return; }
    this.notifyTimelineChange(reason);
  }
  private notifyTimelineChange(reason: TimelineReason): void {
    this.gradientController?.observe(reason);
    const resolutions = this.getConflictState()?.resolutions ?? [];
    const resolutionsKey = JSON.stringify(resolutions);
    const changed = resolutionsKey !== this.resolutionsKey; this.resolutionsKey = resolutionsKey;
    if (changed && (reason === 'execute' || reason === 'undo' || reason === 'redo')) this.emitter.emit('resolutionchange', { resolutions, direction: reason });
    const documentChange = this.pendingDocumentChange;
    this.pendingDocumentChange = null;
    if (documentChange) this.emitter.emit('documentchange', documentChange);
  }
  private requestEdit(property: string, value: string): void {
    if (this.fault) return;
    if (!this.target) {
      this.pending = { property, value };
      const element = this.elements[0];
      this.ui.showTargets(element ? targetChoices(element) : [], selector => resolveTarget(this.scene, selector).length); return;
    }
    this.editProperty(property, value);
  }
  private commitTarget(selector: string): void {
    const pending = this.pending;
    if (!pending && !this.pendingGeometryTarget) return;
    const elements = resolveTarget(this.scene, selector);
    if (!elements.length || !this.elements.every(element => elements.includes(element))) { this.report('La cible doit contenir les éléments inspectés.'); return; }
    this.selectTarget(selector);
    if (!pending) { this.pendingGeometryTarget = false; this.ui.hideTargets(); this.report('Cible choisie. Vous pouvez maintenant manipuler ses poignées.'); return; }
    const result = this.editProperty(pending.property, pending.value);
    if (result.status !== 'rejected') { this.pending = null; this.ui.hideTargets(); }
  }
  public editProperty(property: string, newValue: string): MutationResult {
    return this.editProperties([{ property, newValue }], `Change ${property}`);
  }
  public editProperties(changes: readonly PropertyEdit[], label = 'Change properties'): MutationResult {
    if (this.fault) return this.faultResult();
    if (this.disposed) return this.reject('Le Designer est fermé.');
    if (this.gesture) return this.reject('Terminez ou annulez le geste en cours avant une autre édition.');
    if (!changes.length) return { status: 'unchanged' };
    if (!this.target || !this.elements.length) return this.reject('Choisissez une cible avant d’enregistrer la propriété.');
    if (!this.elements.every(element => resolveTarget(this.scene, this.target ?? '').includes(element))) return this.reject('La cible ne correspond plus à la sélection. Choisissez sa nouvelle référence.');
    if (new Set(changes.map(change => change.property)).size !== changes.length) return this.reject('Une propriété ne peut apparaître qu’une fois dans la commande.');
    const state = this.adapter.getState();
    const object = state.objects.find(object => object.selector === this.target);
    const objectId = object?.id ?? `html:${this.target}`;
    const rank = specificity(this.target) ?? 0;
    const accepted: { property: string; newValue: string; oldValue: string }[] = [];
    for (const { property, newValue, capture } of changes) {
      if (this.gradientController?.blocksCssProperty(property)) return this.reject('Conflit entre le fond CSS complet et les pistes de dégradé. Utilisez les composants du dégradé ; une autre priorité exige une résolution explicite.');
      if (!this.compatible(property)) return this.reject('Valeurs d’origine différentes : utilisez des ID individuels pour cette propriété.');
      const probe = this.scene.ownerDocument.createElement('div');
      if (isGeometryProperty(property)) { if (!validGeometryValue(property, newValue)) return this.reject('Valeur géométrique non valide.'); }
      else { probe.style.setProperty(property, newValue); if (!newValue || !probe.style.getPropertyValue(property)) return this.reject('Valeur CSS non valide.'); }
      const oldValue = this.displayValue(property);
      if (oldValue === newValue && !capture) continue;
      for (const element of this.elements) {
        const entries = state.objects.filter(candidate => candidate.id !== objectId && state.values[candidate.id]?.[property] !== undefined && resolveTarget(this.scene, candidate.selector).includes(element)).map(candidate => ({ objectId: candidate.id, selector: candidate.selector, rank: specificity(candidate.selector) ?? 0, value: state.values[candidate.id]?.[property] ?? '' }));
        entries.push({ objectId, selector: this.target, rank, value: newValue });
        const highest = Math.max(...entries.map(entry => entry.rank)); const winners = entries.filter(entry => entry.rank === highest);
        if (new Set(winners.map(entry => entry.value)).size > 1 && !conflictWinner(this.getConflictState(), this.scene, element, property, state.frame, winners)) return this.reject(`Conflit non résolu : ${winners.map(entry => entry.selector).join(' / ')}, ${property}, image ${state.frame}. Une résolution explicite est nécessaire.`);
      }
      accepted.push({ property, oldValue, newValue });
    }
    if (!accepted.length) return { status: 'unchanged' };
    const result = this.runMutation(() => this.adapter.execute(label, accepted.map(change => ({ objectId, selector: this.target ?? '', property: change.property, value: change.newValue, frame: state.frame }))));
    if (result.status === 'changed') for (const change of accepted) this.emitter.emit('propertychange', { ...change, frame: state.frame });
    if (result.status === 'rejected') return this.reject(result.message);
    return result;
  }
  public setAttribute(element: HTMLElement, attribute: 'id' | 'class', newValue: string | null): MutationResult {
    if (this.fault) return this.faultResult();
    if (this.gesture) return this.reject('Terminez ou annulez le geste avant de modifier le document original.');
    if (attribute !== 'id' && attribute !== 'class') return this.reject('Seuls les attributs ID et classe peuvent être modifiés.');
    if (this.disposed || !this.origin.has(element) || !this.scene.contains(element)) return this.reject('Élément du document original introuvable.');
    const oldValue = element.getAttribute(attribute);
    if (oldValue === newValue) return { status: 'unchanged' };
    if (newValue !== null && (!newValue.trim() || (attribute === 'id' && (specificity(`#${newValue}`) === null || Array.from(element.ownerDocument.querySelectorAll('[id]')).some(candidate => candidate !== element && candidate.id === newValue))))) return this.reject('Identifiant invalide ou déjà utilisé.');
    if (this.adapter.getState().objects.some(object => resolveTarget(this.scene, object.selector).includes(element))) return this.reject('Cette cible possède des clés. Le renommage attend une commande publique de rattachement Timeline.');
    const change: DocumentChange = { fullXPath: this.origin.xpath(element), attribute, oldValue, newValue };
    const before = this.changes;
    const prior = before.find(item => item.fullXPath === change.fullXPath && item.attribute === attribute);
    const net = { ...change, oldValue: prior ? prior.oldValue : oldValue };
    const after = [...before.filter(item => item !== prior), ...(net.oldValue === newValue ? [] : [net])];
    let first = true;
    const apply = (value: string | null, changes: readonly DocumentChange[], direction: 'execute' | 'undo' | 'redo'): void => {
      if (value === null) element.removeAttribute(attribute); else element.setAttribute(attribute, value);
      this.changes = changes; this.tree.refresh();
      if (this.target && !this.elements.every(selected => resolveTarget(this.scene, this.target ?? '').includes(selected))) this.target = null;
      this.pendingDocumentChange = { changes: [change], direction };
    };
    return this.runMutation(() => this.adapter.execute(`Change ${attribute}`, [], {
      redo: () => { apply(newValue, after, first ? 'execute' : 'redo'); first = false; },
      undo: () => apply(oldValue, before, 'undo'),
    }));
  }
  public undo(): MutationResult { if (this.fault) return this.faultResult(); this.gradientController?.cancel(false); this.cancelConflict(); this.cancelGeometryGesture(); return this.disposed ? { status: 'unchanged' } : this.runMutation(() => this.adapter.undo()); }
  public redo(): MutationResult { if (this.fault) return this.faultResult(); this.gradientController?.cancel(false); this.cancelConflict(); this.cancelGeometryGesture(); return this.disposed ? { status: 'unchanged' } : this.runMutation(() => this.adapter.redo()); }
  private compatible(property: string): boolean { return this.elements.length <= 1 || isGeometryProperty(property) || new Set(this.elements.map(element => this.origin.fingerprint(element, property))).size <= 1; }
  private displayValue(property: string, computed?: ReadonlyMap<HTMLElement, CSSStyleDeclaration>): string {
    const state = this.adapter.getState();
    const object = state.objects.find(candidate => candidate.selector === this.target);
    const value = object ? state.values[object.id]?.[property] : undefined;
    if (value !== undefined) return value;
    const first = this.elements[0];
    if (first && isGeometryProperty(property)) {
      const values = new Set(this.elements.map(element => {
        const projected = this.projectedValues.get(element) ?? {};
        const origin = projected['transform-origin'];
        return projected[property] ?? (origin && (property === 'pivotX' || property === 'pivotY') ? pivotCoordinates(origin)[property] : geometryDefaults(this.origin, element)[geometryStateKey(property)]);
      }));
      return values.size === 1 ? [...values][0] ?? '' : '';
    }
    const values = new Set(this.elements.map(element => (computed?.get(element) ?? element.ownerDocument.defaultView?.getComputedStyle(element))?.getPropertyValue(property) ?? ''));
    return values.size === 1 ? [...values][0] ?? '' : '';
  }
  public getGeometryState(): GeometryState | null {
    if (this.gesture) return { ...this.gesture.state, ...this.gesture.values };
    const element = this.elements.length === 1 ? this.elements[0] : undefined;
    if (!element || this.disposed) return null;
    const defaults = geometryDefaults(this.origin, element); const evaluated = this.projectedValues.get(element) ?? {};
    const evaluatedOrigin = evaluated['transform-origin'];
    if (evaluatedOrigin) Object.assign(defaults, pivotCoordinates(evaluatedOrigin));
    const height = evaluated.height ?? defaults.height;
    return { translateX: evaluated.translateX ?? defaults.translateX, translateY: evaluated.translateY ?? defaults.translateY, rotate: evaluated.rotation ?? defaults.rotate, scaleX: evaluated.scaleX ?? defaults.scaleX, scaleY: evaluated.scaleY ?? defaults.scaleY, pivotX: evaluated.pivotX ?? defaults.pivotX, pivotY: evaluated.pivotY ?? defaults.pivotY, width: evaluated.width ?? defaults.width, height: unresolvedPercentageHeight(element, height) ? 'auto' : height };
  }
  private geometryView(): GeometryView {
    return { element: this.elements.length === 1 ? this.elements[0] ?? null : null, state: this.getGeometryState(), tool: this.geometryTool, mode: this.fault ? 'test' : this.mode, active: this.gesture !== null, options: this.geometryOptions, guides: this.gesture?.guides ?? [] };
  }
  public setGeometryTool(tool: GeometryTool): void {
    if (!['move', 'dimensions', 'rotate', 'scale', 'pivot'].includes(tool)) { this.report('Outil géométrique inconnu.'); return; }
    this.cancelGeometryGesture(); this.geometryTool = tool; this.geometryControls?.refresh();
  }
  public setGeometryOptions(settings: Partial<GeometryOptions>): void {
    if (settings.gridSize !== undefined && (!Number.isFinite(settings.gridSize) || settings.gridSize <= 0)) { this.report('Le pas de grille doit être strictement positif.'); return; }
    this.geometryOptions = { ...this.geometryOptions, ...settings }; this.geometryControls?.refresh();
  }
  public beginGeometryGesture(tool: GeometryTool): MutationResult {
    if (this.fault) return this.faultResult();
    this.gradientController?.cancel(false);
    if (this.disposed || this.mode !== 'select') return this.reject('Les outils géométriques sont disponibles en mode Sélection.');
    if (this.gesture) return this.reject('Un geste est déjà en cours.');
    const element = this.elements.length === 1 ? this.elements[0] : undefined;
    if (!element) return this.reject('Sélectionnez une cible individuelle pour manipuler ses poignées.');
    if (!this.target) {
      this.pendingGeometryTarget = true;
      this.ui.showTargets(targetChoices(element), selector => resolveTarget(this.scene, selector).length);
      return this.reject('Choisissez la cible du geste avant son premier enregistrement.');
    }
    const state = this.getGeometryState();
    const base = this.projectedValues.get(element)?.transform ?? this.origin.value(element, 'transform');
    const authoredTransform = this.projectedValues.get(element)?.transform ?? this.origin.authoredValue(element, 'transform');
    if (tool === 'dimensions' && /%|var\(|calc\(/i.test(authoredTransform)) return this.reject('La transformation de base dépend d’unités relatives ou d’expressions. Modifiez les dimensions dans le panneau CSS pour conserver cette source ; le suivi de cette poignée n’est pas pris en charge.');
    const context = geometryContext(element, base, state ?? undefined);
    if (!state || context.status === 'rejected') return this.reject(context.status === 'rejected' ? context.message : 'État géométrique indisponible.');
    this.geometryTool = tool;
    const unknownTransform = base && base !== 'none' && ((!this.origin.authoredValue(element, 'transform') && !this.projectedValues.get(element)?.transform) || /^(?:inherit|revert|revert-layer)$/.test(authoredTransform)) ? base : null;
    this.gesture = { element, selector: this.target, frame: this.adapter.getState().frame, tool, state, metrics: context.metrics, values: {}, guides: [], confirmation: false, rect: element.getBoundingClientRect(), parentRect: element.parentElement?.getBoundingClientRect() ?? this.scene.getBoundingClientRect(), unknownTransform, convertedTransform: null };
    this.geometryControls?.refresh(); return { status: 'changed' };
  }
  public isGeometryGestureActive(): boolean { return this.gesture !== null; }
  public updateGeometryGesture(delta: Point, settings: { allowUnitReplacement?: boolean; bypassSnap?: boolean } = {}): GeometryUpdateResult {
    if (this.fault) return this.faultResult();
    const gesture = this.gesture;
    if (!gesture) return this.reject('Aucun geste géométrique en cours.');
    if (this.adapter.getState().frame !== gesture.frame || this.target !== gesture.selector || !this.scene.contains(gesture.element)) { this.cancelGeometryGesture(); return this.reject('Le contexte du geste a changé.'); }
    let effectiveDelta = delta;
    if (gesture.tool === 'move' && Number.isFinite(delta.x) && Number.isFinite(delta.y)) {
      const targets: { x?: number; y?: number }[] = []; const display = new Map<string, number>();
      const reference = gesture.parentRect;
      const anchors = [reference, ...Array.from(gesture.element.parentElement?.children ?? []).filter(node => node !== gesture.element).map(node => node.getBoundingClientRect())];
      for (const box of anchors) for (const offset of [0, .5, 1]) {
        for (const edge of [0, .5, 1]) {
          const x = box.left + box.width * edge - reference.left - gesture.rect.width * offset;
          const y = box.top + box.height * edge - reference.top - gesture.rect.height * offset;
          targets.push({ x }, { y }); display.set(`x:${x}`, box.left + box.width * edge); display.set(`y:${y}`, box.top + box.height * edge);
        }
      }
      const start = { x: gesture.rect.left - reference.left, y: gesture.rect.top - reference.top };
      const snapped = snapPosition({ x: start.x + delta.x, y: start.y + delta.y }, targets, { enabled: this.geometryOptions.snap, bypass: settings.bypassSnap ?? false, grid: this.geometryOptions.grid ? this.geometryOptions.gridSize : 0, threshold: 6 });
      effectiveDelta = { x: snapped.position.x - start.x, y: snapped.position.y - start.y };
      gesture.guides = this.geometryOptions.guides ? snapped.guides.map(guide => ({ ...guide, value: display.get(`${guide.axis}:${guide.value}`) ?? guide.value + (guide.axis === 'x' ? reference.left : reference.top) })) : [];
    }
    const result = updateGeometry(gesture.state, gesture.metrics, gesture.tool, effectiveDelta, settings);
    if (result.status === 'rejected') return this.reject(result.message);
    const replacements = [...(gesture.unknownTransform ? ['transform'] : []), ...(result.status === 'confirmation-required' ? result.properties : result.replacements)];
    if (replacements.length && !settings.allowUnitReplacement) {
      gesture.confirmation = true;
      const message = `Autoriser le remplacement en pixels des propriétés suivantes : ${replacements.join(', ')}${gesture.unknownTransform ? ' (transformation source inaccessible ou ambiguë : copie de sa matrice)' : ''}.`;
      this.report(message); return { status: 'confirmation-required', properties: replacements, message };
    }
    if (result.status === 'confirmation-required') return result;
    if (gesture.unknownTransform) gesture.convertedTransform = gesture.unknownTransform;
    gesture.confirmation = false; gesture.values = result.values;
    this.render(); return { status: 'changed' };
  }
  public commitGeometryGesture(): MutationResult {
    if (this.fault) return this.faultResult();
    const gesture = this.gesture;
    if (!gesture) return { status: 'unchanged' };
    this.gesture = null; this.render();
    if (gesture.confirmation) return this.reject('La conversion en pixels doit être confirmée avant l’enregistrement.');
    if (this.adapter.getState().frame !== gesture.frame || this.target !== gesture.selector || !this.scene.contains(gesture.element)) return this.reject('Le contexte du geste a changé.');
    return this.editProperties([...Object.entries(geometryValues(gesture.values)).map(([property, newValue]) => ({ property, newValue })), ...(gesture.convertedTransform ? [{ property: 'transform', newValue: gesture.convertedTransform, capture: true }] : [])], `Geometry ${gesture.tool}`);
  }
  public cancelGeometryGesture(): void {
    if (!this.gesture) return;
    this.gesture = null;
    if (!this.disposed) this.render();
  }
  public setGeometryPivot(xPercent: number, yPercent: number): MutationResult {
    if (this.fault) return this.faultResult();
    if (![xPercent, yPercent].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) return this.reject('Le pivot doit se trouver entre 0 et 100 %.');
    const started = this.beginGeometryGesture('pivot'); if (started.status !== 'changed') return started;
    const gesture = this.gesture; if (!gesture) return { status: 'unchanged' };
    const x = geometryLengthPixels(gesture.state.pivotX, gesture.metrics.width, gesture.metrics);
    const y = geometryLengthPixels(gesture.state.pivotY, gesture.metrics.height, gesture.metrics);
    if (x === null || y === null) { this.cancelGeometryGesture(); return this.reject('Les unités du pivot ne peuvent pas être converties fidèlement.'); }
    const result = this.updateGeometryGesture({ x: xPercent * gesture.metrics.width / 100 - x, y: yPercent * gesture.metrics.height / 100 - y }, { bypassSnap: true });
    if (result.status !== 'changed') { this.cancelGeometryGesture(); return result.status === 'confirmation-required' ? this.reject(result.message) : result; }
    return this.commitGeometryGesture();
  }
  private render(): void {
    const restoreScroll = capturePreviewScroll([...this.projectedValues.keys(), ...this.elements, ...this.scrollRoots]);
    try { this.projectPreview(); }
    finally { if (restoreScroll()) this.highlight(); }
  }
  private projectPreview(): void {
    this.origin.restore();
    this.projectedValues = new Map();
    const state = this.adapter.getState();
    if (state.fault !== undefined) this.enterFault(state.fault);
    const conflicts = this.getConflictState();
    const applied = new Map<HTMLElement, Map<string, ProjectionCandidate[]>>();
    const draft = this.gesture ? { ...geometryValues(this.gesture.values), ...(this.gesture.convertedTransform ? { transform: this.gesture.convertedTransform } : {}) } : {};
    const sources = state.objects.map(object => ({ ...object, values: { ...state.values[object.id], ...(object.selector === this.gesture?.selector ? draft : {}) } }));
    const gradientPreview = this.gradientController?.getPreview();
    if (gradientPreview) { const source = sources.find(candidate => candidate.id === gradientPreview.objectId); if (source) Object.assign(source.values, gradientPreview.declarations); }
    if (this.gesture && !sources.some(source => source.selector === this.gesture?.selector)) sources.push({ id: 'gesture-preview', selector: this.gesture.selector, values: draft });
    for (const object of sources) for (const element of resolveTarget(this.scene, object.selector)) {
      const properties = applied.get(element) ?? new Map<string, ProjectionCandidate[]>();
      for (const [property, value] of Object.entries(object.values)) {
        const rank = specificity(object.selector) ?? 0;
        properties.set(property, [...(properties.get(property) ?? []), { objectId: object.id, value, rank, selector: object.selector }]);
      }
      applied.set(element, properties);
    }
    for (const [element, properties] of applied) {
      const values: Record<string, string> = {};
      for (const [property, entries] of properties) {
      const highest = Math.max(...entries.map(entry => entry.rank));
      const winners = entries.filter(entry => entry.rank === highest);
      const ambiguous = new Set(winners.map(entry => entry.value)).size > 1;
      const winner = ambiguous ? conflictWinner(conflicts, this.scene, element, property, state.frame, winners) : winners[0];
      if (!winner) { this.report(`Conflit : ${winners.map(entry => entry.selector).join(' / ')}, ${property}, image ${state.frame}. Aperçu suspendu pour cette propriété.`); continue; }
      values[property] = winner.value;
      }
      const hasGeometry = Object.keys(values).some(isGeometryProperty);
      this.projectedValues.set(element, values);
      for (const [property, value] of Object.entries(values)) if (!isGeometryProperty(property) && !(hasGeometry && property === 'transform')) this.origin.applyPreview(element, property, value);
      if (hasGeometry) projectGeometry(this.origin, element, values);
    }
    this.tree.setSelection(this.elements);
    this.ui.setSelection(this.target ?? (this.elements[0] ? `${this.elements[0].localName}${this.elements[0].id ? `#${this.elements[0].id}` : ''} · inspection` : 'Sélectionnez un élément'), this.elements.length === 1 ? this.elements[0] : undefined);
    this.ui.setChanges(this.changes); this.conflictsUi.render(conflicts);
    this.gradientController?.refresh(state.objects.find(object => object.selector === this.target)?.id ?? null, this.elements, this.mode);
    this.refreshPanel(); this.highlight();
    if (this.fault) this.ui.setFault(this.fault);
  }
  private refreshPanel(): void {
    const element = this.elements[0];
    const properties = element ? [...new Set([...commonProperties, ...geometryProperties, ...this.origin.properties(element)])] : [];
    const computed = new Map<HTMLElement, CSSStyleDeclaration>();
    for (const selected of this.elements) { const style = selected.ownerDocument.defaultView?.getComputedStyle(selected); if (style) computed.set(selected, style); }
    const descriptors: CssProperty[] = properties.map((name): CssProperty => {
      const compatible = this.compatible(name); const value = this.displayValue(name, computed);
      const gradientOwned = this.gradientController?.blocksCssProperty(name) ?? false;
      return { name, label: labels[name] ?? name, value, disabled: this.fault !== null || !compatible || gradientOwned, ...(isGeometryProperty(name) ? { editor: name === 'scaleX' || name === 'scaleY' ? 'number' : 'dimension' } : {}), ...(this.fault ? { diagnostic: this.fault } : !compatible ? { diagnostic: 'Valeurs d’origine différentes. Utilisez des ID individuels pour cette propriété.' } : gradientOwned ? { diagnostic: 'Fond piloté par des pistes de dégradé indépendantes. Utilisez le contrôle Dégradé.' } : (this.elements.length > 1 && !value ? { diagnostic: 'Valeurs d’aperçu différentes. Une cible plus spécifique peut rester prioritaire.' } : {})) };
    });
    this.panel.setProperties(descriptors);
  }
  private highlight(): void {
    for (const overlay of this.overlays) overlay.remove(); this.overlays = [];
    if (this.mode === 'test' || this.disposed) { this.geometryControls?.refresh(); return; }
    for (const element of this.elements) {
      const rect = element.getBoundingClientRect(); const overlay = element.ownerDocument.createElement('div'); overlay.className = 'HtmlDesignerOverlay'; overlay.setAttribute('aria-hidden', 'true');
      Object.assign(overlay.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      element.ownerDocument.body.append(overlay); this.overlays.push(overlay);
    }
    this.geometryControls?.refresh();
  }
  private faultResult(): MutationResult { return { status: 'faulted', message: this.fault ?? 'État du projet incertain.' }; }
  private enterFault(message: string): void {
    if (this.fault !== null) return;
    message = message.trim() ? message : 'État du projet incertain. Rechargez un projet cohérent avant de reprendre.';
    this.fault = message; this.pendingDocumentChange = null; this.deferredNotifications = [];
    this.pending = null; this.pendingGeometryTarget = false; this.gesture = null;
    this.cancelConflict(); this.gradientController?.setFault(message); this.ui.hideTargets(); this.ui.setFault(message);
    this.emitter.emit('fault', { message }); this.emitter.emit('diagnostic', { message });
  }
  /** Delay success notifications until the command has returned a reliable result. */
  private runMutation(action: () => MutationResult): MutationResult {
    if (this.fault) return this.faultResult();
    this.mutationDepth++;
    let result: MutationResult;
    try { result = action(); }
    catch { result = { status: 'faulted', message: 'La commande a échoué dans un état incertain. Rechargez un projet cohérent avant de reprendre.' }; }
    finally { this.mutationDepth--; }
    if (result.status === 'faulted') this.enterFault(result.message);
    if (!this.mutationDepth) {
      const notifications = this.deferredNotifications; this.deferredNotifications = [];
      if (result.status === 'changed' && !this.fault) for (const reason of notifications) this.notifyTimelineChange(reason);
      else this.pendingDocumentChange = null;
    }
    if (this.fault) { this.render(); return this.faultResult(); }
    return result;
  }
  private report(message: string): void { this.ui.setStatus(this.fault ?? message); this.emitter.emit('diagnostic', { message: this.fault ?? message }); }
  private reject(message: string): MutationResult { this.report(message); this.refreshPanel(); return { status: 'rejected', message }; }
  public dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.gradientController?.dispose();
    this.cancelConflict(); this.conflictsUi.destroy();
    this.gesture = null; this.geometryControls?.destroy();
    this.abort.abort(); for (const unsubscribe of this.subscriptions) unsubscribe();
    this.origin.restore(); this.highlight(); this.panel.destroy(); this.tree.destroy(); this.ui.destroy(); this.emitter.clear();
  }
}
