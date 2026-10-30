// packages/designer/src/designer.ts
import { CssPropertiesPanel } from '@kazo-ca/css-properties';
import type { CssProperty } from '@kazo-ca/css-properties';
import { HierarchicalDomTree } from '@kazo-ca/hierarchical-dom-tree';
import { DomOrigin } from './dom-origin.js';
import { DesignerEmitter } from './events.js';
import type { DesignerEvents, DocumentChange } from './events.js';
import { InspectorUi } from './inspector-ui.js';
import { resolveTarget, specificity, targetChoices } from './targets.js';
import type { MutationResult, TimelineAdapter, TimelineReason } from './timeline-adapter.js';

export interface DesignerOptions<T> {
  readonly scene: HTMLElement;
  readonly propertiesContainer: HTMLElement;
  readonly treeContainer: HTMLElement;
  readonly timeline: T;
  readonly adapter: (timeline: T) => TimelineAdapter;
}
const commonProperties = ['opacity', 'width', 'height', 'position', 'left', 'top', 'transform', 'margin-top', 'padding', 'color', 'background-color', 'background-image', 'border-radius', 'font-size'];
const labels: Readonly<Record<string, string>> = { opacity: 'Opacité', width: 'Largeur', height: 'Hauteur', 'margin-top': 'Marge supérieure', 'background-color': 'Couleur de fond', color: 'Couleur', transform: 'Transformation' };

export class HtmlDesigner<T = unknown> {
  private readonly scene: HTMLElement;
  private readonly adapter: TimelineAdapter;
  private readonly origin: DomOrigin;
  private readonly panel: CssPropertiesPanel;
  private readonly tree: HierarchicalDomTree;
  private readonly ui: InspectorUi;
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

  public constructor(options: DesignerOptions<T>) {
    this.scene = options.scene; this.adapter = options.adapter(options.timeline);
    if (this.adapter.contractRevision !== 'HA-TL-001/r1') throw new Error('Révision de contrat Timeline incompatible.');
    this.origin = new DomOrigin(this.scene);
    this.ui = new InspectorUi(options.propertiesContainer, {
      chooseTarget: selector => this.commitTarget(selector),
      cancelTarget: () => { this.pending = null; this.ui.hideTargets(); this.refreshPanel(); },
      changeAttribute: (attribute, value) => { const element = this.elements[0]; if (element) this.setAttribute(element, attribute, value || null); },
    });
    this.panel = new CssPropertiesPanel(this.ui.panelContainer, { commonProperties: true });
    this.tree = new HierarchicalDomTree(options.treeContainer, { root: this.scene });
    this.subscriptions.push(this.panel.onChange(change => this.requestEdit(change.property, change.newValue)), this.tree.onSelectionChange(elements => this.selectElements(elements)), this.adapter.onChange(reason => this.timelineChanged(reason)));
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
  public setMode(mode: 'select' | 'test'): void { this.mode = mode; this.highlight(); }
  public selectElements(elements: readonly HTMLElement[]): void {
    if (this.disposed) return;
    this.elements = elements.filter(element => this.origin.has(element) && this.scene.contains(element));
    this.target = null; this.pending = null; this.ui.hideTargets();
    const element = this.elements[0];
    const matches = element ? this.adapter.getState().objects.filter(object => resolveTarget(this.scene, object.selector).includes(element)) : [];
    const associated = matches.find(object => element?.id && object.selector === `#${element.id}`) ?? (matches.length === 1 ? matches[0] : undefined);
    if (associated) { this.target = associated.selector; this.elements = resolveTarget(this.scene, associated.selector); }
    this.syncing = true; this.adapter.selectObject(associated?.id ?? null); this.syncing = false;
    if (matches.length > 1 && !associated) this.report('Plusieurs objets correspondent. Choisissez une cible explicitement.');
    this.render(); this.emitter.emit('selectionchange', { elements: this.elements, objectId: associated?.id ?? null });
  }
  public selectTarget(selector: string): void {
    if (this.disposed) return;
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
    if (reason === 'selection') {
      this.pending = null; this.ui.hideTargets();
      const state = this.adapter.getState(); const object = state.objects.find(object => object.id === state.selectedObjectId);
      if (object) { this.target = object.selector; this.elements = resolveTarget(this.scene, object.selector); }
      else { this.target = null; this.elements = []; }
      this.emitter.emit('selectionchange', { elements: this.elements, objectId: state.selectedObjectId });
    }
    this.render();
    const documentChange = this.pendingDocumentChange;
    this.pendingDocumentChange = null;
    if (documentChange) this.emitter.emit('documentchange', documentChange);
  }
  private requestEdit(property: string, value: string): void {
    if (!this.target) {
      this.pending = { property, value };
      const element = this.elements[0];
      this.ui.showTargets(element ? targetChoices(element) : [], selector => resolveTarget(this.scene, selector).length); return;
    }
    this.editProperty(property, value);
  }
  private commitTarget(selector: string): void {
    const pending = this.pending;
    if (!pending) return;
    const elements = resolveTarget(this.scene, selector);
    if (!elements.length || !this.elements.every(element => elements.includes(element))) { this.report('La cible doit contenir les éléments inspectés.'); return; }
    this.selectTarget(selector);
    const result = this.editProperty(pending.property, pending.value);
    if (result.status !== 'rejected') { this.pending = null; this.ui.hideTargets(); }
  }
  public editProperty(property: string, newValue: string): MutationResult {
    if (this.disposed) return this.reject('Le Designer est fermé.');
    if (!this.target || !this.elements.length) return this.reject('Choisissez une cible avant d’enregistrer la propriété.');
    if (!this.compatible(property)) return this.reject('Valeurs d’origine différentes : utilisez des ID individuels pour cette propriété.');
    const doc = this.scene.ownerDocument; const probe = doc.createElement('div'); probe.style.setProperty(property, newValue);
    if (!newValue || !probe.style.getPropertyValue(property)) return this.reject('Valeur CSS non valide.');
    const state = this.adapter.getState();
    const object = state.objects.find(object => object.selector === this.target);
    const objectId = object?.id ?? `html:${this.target}`;
    const oldValue = this.displayValue(property);
    if (oldValue === newValue) return { status: 'unchanged' };
    const conflict = state.objects.find(candidate => candidate.id !== objectId && specificity(candidate.selector) === specificity(this.target ?? '') && resolveTarget(this.scene, candidate.selector).some(element => this.elements.includes(element)) && state.values[candidate.id]?.[property] !== undefined && state.values[candidate.id]?.[property] !== newValue);
    if (conflict) return this.reject(`Conflit non résolu : ${conflict.selector} et ${this.target}, ${property}, image ${state.frame}. Une résolution explicite est nécessaire.`);
    const result = this.adapter.execute(`Change ${property}`, [{ objectId, selector: this.target, property, value: newValue, frame: state.frame }]);
    if (result.status === 'changed') this.emitter.emit('propertychange', { property, oldValue, newValue, frame: state.frame });
    if (result.status === 'rejected') return this.reject(result.message);
    return result;
  }
  public setAttribute(element: HTMLElement, attribute: 'id' | 'class', newValue: string | null): MutationResult {
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
      this.pendingDocumentChange = { changes: [change], direction };
    };
    return this.adapter.execute(`Change ${attribute}`, [], {
      redo: () => { apply(newValue, after, first ? 'execute' : 'redo'); first = false; },
      undo: () => apply(oldValue, before, 'undo'),
    });
  }
  public undo(): MutationResult { return this.disposed ? { status: 'unchanged' } : this.adapter.undo(); }
  public redo(): MutationResult { return this.disposed ? { status: 'unchanged' } : this.adapter.redo(); }
  private compatible(property: string): boolean { return new Set(this.elements.map(element => this.origin.value(element, property))).size <= 1; }
  private displayValue(property: string): string {
    const state = this.adapter.getState();
    const object = state.objects.find(candidate => candidate.selector === this.target);
    const value = object ? state.values[object.id]?.[property] : undefined;
    if (value !== undefined) return value;
    const values = new Set(this.elements.map(element => element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(property) ?? ''));
    return values.size === 1 ? [...values][0] ?? '' : '';
  }
  private render(): void {
    this.origin.restore();
    const state = this.adapter.getState();
    const applied = new Map<HTMLElement, Map<string, { value: string; rank: number; selector: string }[]>>();
    for (const object of state.objects) for (const element of resolveTarget(this.scene, object.selector)) {
      const properties = applied.get(element) ?? new Map<string, { value: string; rank: number; selector: string }[]>();
      for (const [property, value] of Object.entries(state.values[object.id] ?? {})) {
        const rank = specificity(object.selector) ?? 0;
        properties.set(property, [...(properties.get(property) ?? []), { value, rank, selector: object.selector }]);
      }
      applied.set(element, properties);
    }
    for (const [element, properties] of applied) for (const [property, entries] of properties) {
      const highest = Math.max(...entries.map(entry => entry.rank));
      const winners = entries.filter(entry => entry.rank === highest);
      if (new Set(winners.map(entry => entry.value)).size > 1) { this.report(`Conflit : ${winners.map(entry => entry.selector).join(' / ')}, ${property}, image ${state.frame}. Aperçu suspendu pour cette propriété.`); continue; }
      const winner = winners[0]; if (winner) this.origin.applyPreview(element, property, winner.value);
    }
    this.tree.setSelection(this.elements);
    this.ui.setSelection(this.target ?? (this.elements[0] ? `${this.elements[0].localName}${this.elements[0].id ? `#${this.elements[0].id}` : ''} · inspection` : 'Sélectionnez un élément'), this.elements.length === 1 ? this.elements[0] : undefined);
    this.ui.setChanges(this.changes); this.refreshPanel(); this.highlight();
  }
  private refreshPanel(): void {
    const element = this.elements[0];
    const properties = element ? [...new Set([...commonProperties, ...this.origin.properties(element)])] : [];
    const descriptors: CssProperty[] = properties.map(name => ({ name, label: labels[name] ?? name, value: this.displayValue(name), disabled: !this.compatible(name), ...(!this.compatible(name) ? { diagnostic: 'Valeurs d’origine différentes. Utilisez des ID individuels pour cette propriété.' } : (this.elements.length > 1 && !this.displayValue(name) ? { diagnostic: 'Valeurs d’aperçu différentes. Une cible plus spécifique peut rester prioritaire.' } : {})) }));
    this.panel.setProperties(descriptors);
  }
  private highlight(): void {
    for (const overlay of this.overlays) overlay.remove(); this.overlays = [];
    if (this.mode === 'test' || this.disposed) return;
    for (const element of this.elements) {
      const rect = element.getBoundingClientRect(); const overlay = element.ownerDocument.createElement('div'); overlay.className = 'HtmlDesignerOverlay'; overlay.setAttribute('aria-hidden', 'true');
      Object.assign(overlay.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      element.ownerDocument.body.append(overlay); this.overlays.push(overlay);
    }
  }
  private report(message: string): void { this.ui.setStatus(message); this.emitter.emit('diagnostic', { message }); }
  private reject(message: string): MutationResult { this.report(message); this.refreshPanel(); return { status: 'rejected', message }; }
  public dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.abort.abort(); for (const unsubscribe of this.subscriptions) unsubscribe();
    this.origin.restore(); this.highlight(); this.panel.destroy(); this.tree.destroy(); this.ui.destroy(); this.emitter.clear();
  }
}
