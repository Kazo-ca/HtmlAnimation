// packages/designer/src/gradient-controller.ts
import { cloneGradientDefinitions, GradientEditor, readGradientComponent } from '@kazo-ca/css-properties';
import type { GradientColor, GradientDefinition, GradientEdit, GradientIntent } from '@kazo-ca/css-properties';
import { GradientControls, gradientElementArea } from './gradient-controls.js';
import type { GradientStageView } from './gradient-controls.js';
import type { GradientComposition, GradientMutationResult, GradientRequest, GradientSnapshot } from './gradient-types.js';
import type { MutationResult, TimelineAdapter, TimelineReason } from './timeline-adapter.js';
import type { DesignerEvents } from './events.js';
import { resolveTarget } from './targets.js';

interface ControllerActions {
  refresh(): void;
  /** Explicit local draft writes; ordinary refreshes remain observations. */
  draft?(preview: { readonly objectId: string; readonly declarations: Readonly<Record<string, string>> } | null): MutationResult;
  report(message: string): void;
  fault(message: string): void;
  mutate(action: () => MutationResult): MutationResult;
  property(event: DesignerEvents['propertychange']): void;
  context(event: DesignerEvents['gradientchange']): void;
}
interface Ticket { readonly request: GradientRequest; readonly current: () => boolean; readonly snapshot: GradientSnapshot }
interface Draft { readonly ticket: Ticket; readonly source: 'panel' | 'stage'; readonly changes: readonly GradientEdit[]; readonly projection: Extract<GradientComposition, {status: 'composed'}> | null }
interface GradientSession {
  readonly contexts: readonly (readonly [string, readonly GradientDefinition[]])[];
  readonly snapshot: GradientSnapshot | null;
  readonly objectId: string | null;
  readonly elements: readonly HTMLElement[];
  readonly mode: 'select' | 'test';
  readonly epoch: number;
  readonly draft: Draft | null;
}
function copy(snapshot: GradientSnapshot): GradientSnapshot { return { ...snapshot, definitions: cloneGradientDefinitions(snapshot.definitions), gradients: cloneGradientDefinitions(snapshot.gradients), tracks: snapshot.tracks.map(track => ({ ...track })) }; }
function text(value: unknown): string { return typeof value === 'string' ? value : JSON.stringify(value) ?? ''; }

/** Coordinates controlled UI and adapter commands; contains no temporal evaluator. */
export class GradientController {
  private readonly editor: GradientEditor;
  private readonly controls: GradientControls;
  private readonly root: HTMLElement;
  private readonly hint: HTMLOutputElement;
  private readonly contexts = new Map<string, readonly GradientDefinition[]>();
  private snapshot: GradientSnapshot | null = null;
  private objectId: string | null = null;
  private elements: readonly HTMLElement[] = [];
  private mode: 'select' | 'test' = 'select';
  private epoch = 0;
  private draft: Draft | null = null;
  private disposed = false;
  private fault: string | null = null;
  public constructor(container: HTMLElement, private readonly scene: HTMLElement, private readonly adapter: TimelineAdapter, private readonly actions: ControllerActions) {
    this.root = container.ownerDocument.createElement('div'); container.append(this.root);
    this.editor = new GradientEditor(this.root, {
      onChange: intent => { this.actions.mutate(() => this.execute(intent)); },
      onPreview: changes => { if (changes) { if (!this.draft) this.begin('panel'); this.preview(changes); } else this.cancel(); },
      onSelectionChange: () => { this.cancel(); this.controls.refresh(); },
    });
    this.hint = container.ownerDocument.createElement('output'); this.hint.setAttribute('aria-live', 'polite'); this.root.append(this.hint);
    container.querySelector('.CssPropertiesPanel')?.parentElement?.before(this.root);
    this.controls = new GradientControls(container, { read: () => this.stageView(), begin: () => { this.begin('stage'); }, preview: changes => { this.preview(changes); }, commit: () => { this.actions.mutate(() => this.commit()); }, cancel: () => this.cancel() });
    for (const object of adapter.getState().objects) { const state = adapter.gradients?.read(object.id); if (state) this.contexts.set(object.id, cloneGradientDefinitions(state.definitions)); }
    this.root.hidden = true;
  }
  public observe(reason: TimelineReason): void {
    if (!this.adapter.gradients || !['execute', 'undo', 'redo'].includes(reason)) return;
    const ids = new Set([...this.contexts.keys(), ...this.adapter.getState().objects.map(object => object.id)]);
    for (const id of ids) {
      const definitions = this.adapter.gradients.read(id)?.definitions ?? [];
      const previous = this.contexts.get(id) ?? []; this.contexts.set(id, cloneGradientDefinitions(definitions));
      if (JSON.stringify(previous) !== JSON.stringify(definitions)) this.actions.context({ objectId: id, definitions: cloneGradientDefinitions(definitions), direction: reason as 'execute' | 'undo' | 'redo' });
    }
  }
  /** Package-internal transaction state. Capturing/restoring never renders or writes CSS. */
  public captureSession(): GradientSession {
    return { contexts: [...this.contexts].map(([id, definitions]) => [id, cloneGradientDefinitions(definitions)] as const), snapshot: this.snapshot ? copy(this.snapshot) : null, objectId: this.objectId, elements: [...this.elements], mode: this.mode, epoch: this.epoch, draft: this.draft };
  }
  public restoreSession(session: GradientSession): void {
    this.contexts.clear();
    for (const [id, definitions] of session.contexts) this.contexts.set(id, cloneGradientDefinitions(definitions));
    this.snapshot = session.snapshot ? copy(session.snapshot) : null; this.objectId = session.objectId;
    this.elements = [...session.elements]; this.mode = session.mode; this.epoch = session.epoch;
    this.draft = this.fault ? null : session.draft;
  }
  public resetForProject(): void {
    this.epoch++; this.contexts.clear(); this.snapshot = null; this.objectId = null;
    this.elements = []; this.draft = null;
  }
  public resetContexts(): void {
    const next = new Map<string, readonly GradientDefinition[]>();
    for (const object of this.adapter.getState().objects) {
      const state = this.adapter.gradients?.read(object.id);
      if (state) next.set(object.id, cloneGradientDefinitions(state.definitions));
    }
    this.contexts.clear(); for (const [id, definitions] of next) this.contexts.set(id, definitions);
  }
  public refresh(objectId: string | null, elements: readonly HTMLElement[], mode: 'select' | 'test'): void {
    if (this.disposed) return;
    this.objectId = objectId; this.elements = [...elements]; this.mode = mode;
    this.snapshot = objectId ? this.adapter.gradients?.read(objectId) ?? null : null;
    this.root.hidden = this.snapshot === null;
    const displayed = this.draft?.projection?.gradients ?? this.snapshot?.gradients ?? [];
    if (this.draft?.source !== 'panel') this.editor.setGradients(displayed, { disabled: this.fault !== null || !this.snapshot?.editable || mode === 'test', ...(this.fault ? { diagnostic: this.fault } : this.snapshot?.reason ? { diagnostic: this.snapshot.reason } : {}), preview: this.draft !== null, addDisabled: this.snapshot?.canAddStop === false, ...(this.snapshot?.structureReason ? { addDiagnostic: this.snapshot.structureReason } : {}) });
    this.hint.textContent = this.elements.length === 1 && this.snapshot ? this.stageProblem(this.elements[0] ?? null) ?? '' : this.snapshot ? 'Choisissez un élément individuel pour les poignées du dégradé.' : '';
    this.controls.refresh();
  }
  public getState(): GradientSnapshot | null { return this.snapshot ? copy({ ...this.snapshot, gradients: this.draft?.projection?.gradients ?? this.snapshot.gradients }) : null; }
  public getPreview(): { readonly objectId: string; readonly declarations: Readonly<Record<string, string>> } | null { return this.draft?.projection ? { objectId: this.draft.ticket.snapshot.objectId, declarations: this.draft.projection.declarations } : null; }
  public blocksCssProperty(property: string): boolean { return Boolean(this.snapshot?.gradients.length && (property === 'background' || property === 'background-image')); }
  private reject(message: string): MutationResult { this.actions.report(message); return { status: 'rejected', message }; }
  private ticket(intent: GradientIntent): Ticket | null {
    if (this.disposed || !this.objectId || !this.adapter.gradients) return null;
    const snapshot = this.adapter.gradients.read(this.objectId); if (!snapshot?.editable) return null;
    const frame = this.adapter.getState().frame; const epoch = this.epoch;
    const members = resolveTarget(this.scene, snapshot.selector).map(element => ({ element, id: element.id, classes: element.className }));
    const current = (): boolean => !this.disposed && this.epoch === epoch && this.objectId === snapshot.objectId && this.adapter.getState().frame === frame && this.adapter.gradients?.read(snapshot.objectId)?.revision === snapshot.revision && members.length === resolveTarget(this.scene, snapshot.selector).length && members.every(entry => this.scene.contains(entry.element) && entry.element.id === entry.id && entry.element.className === entry.classes);
    return { request: { objectId: snapshot.objectId, revision: snapshot.revision, frame, intent }, snapshot: copy(snapshot), current };
  }
  private execute(intent: GradientIntent, ticket = this.draft?.ticket ?? this.ticket(intent)): MutationResult {
    if (this.fault) return { status: 'faulted', message: this.fault };
    if (!ticket || !this.adapter.gradients) return this.reject('Aucun dégradé structuré modifiable n’est fourni pour cette cible.');
    if (intent.kind === 'edit' && new Set(intent.changes.map(change => JSON.stringify([change.gradientId, change.stopId, change.component]))).size !== intent.changes.length) return this.reject('Une composante de dégradé ne peut apparaître qu’une fois dans la commande.');
    if (intent.kind === 'add-stop' && ticket.snapshot.canAddStop === false) return this.reject(ticket.snapshot.structureReason ?? 'L’ajout structurel atomique n’est pas disponible dans cet adaptateur.');
    if (!ticket.current()) { this.cancel(); return this.reject('Le contexte du dégradé a changé. Recommencez la modification.'); }
    const request = { ...ticket.request, intent };
    let result: GradientMutationResult;
    try { result = this.adapter.gradients.execute(request, ticket.current); }
    catch { result = { status: 'faulted', message: 'La modification du dégradé a échoué dans un état incertain. Rechargez un projet cohérent avant de reprendre.' }; }
    this.cancel(false, result.status !== 'faulted');
    if (result.status === 'faulted') { this.setFault(result.message); this.actions.fault(result.message); }
    if (this.fault) { this.actions.refresh(); return { status: 'faulted', message: this.fault }; }
    if (result.status === 'changed') {
      const after = this.adapter.gradients.read(request.objectId);
      for (const change of result.changes) {
        const oldValue = readGradientComponent(ticket.snapshot.gradients, change); const newValue = change.value;
        if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
        const track = after?.tracks.find(candidate => candidate.gradientId === change.gradientId && candidate.stopId === change.stopId && candidate.component === change.component);
        this.actions.property({ property: track?.property ?? `gradient:${change.gradientId}:${change.stopId ?? ''}:${change.component}`, oldValue: text(oldValue), newValue: text(newValue), frame: request.frame });
      }
    }
    this.actions.refresh();
    return result.status === 'rejected' ? this.reject(result.message) : result.status === 'faulted' ? result : { status: result.status };
  }
  public edit(changes: readonly GradientEdit[]): MutationResult { return this.execute({ kind: 'edit', changes }); }
  public add(gradientId: string, values: { readonly color: GradientColor; readonly opacity: number; readonly position: number }): MutationResult { return this.execute({ kind: 'add-stop', gradientId, ...values }); }
  public remove(gradientId: string, stopId: string): MutationResult { return this.edit([{ gradientId, stopId, component: 'present', value: false }]); }
  public select(gradientId: string, stopId: string | null): void { this.cancel(); this.editor.setSelection(gradientId, stopId); this.controls.refresh(); }
  public begin(source: 'panel' | 'stage' = 'stage'): MutationResult {
    if (this.fault) return { status: 'faulted', message: this.fault };
    this.cancel(false);
    const ticket = this.ticket({ kind: 'edit', changes: [] }); if (!ticket) return this.reject('Choisissez une cible avec un dégradé structuré modifiable.');
    this.draft = { ticket, source, changes: [], projection: null }; return { status: 'changed' };
  }
  public preview(changes: readonly GradientEdit[]): MutationResult {
    if (this.fault) return { status: 'faulted', message: this.fault };
    const draft = this.draft; if (!draft || !this.adapter.gradients) return this.reject('Commencez le geste de dégradé avant son aperçu.');
    if (!draft.ticket.current()) { this.cancel(); return this.reject('Le contexte a changé pendant le geste.'); }
    let result: GradientComposition;
    try { result = this.adapter.gradients.compose({ ...draft.ticket.request, intent: { kind: 'edit', changes } }); }
    catch { result = { status: 'rejected', message: 'Aperçu de dégradé indisponible.' }; }
    if (this.draft !== draft || !draft.ticket.current()) { this.cancel(); return this.reject('Le contexte a changé pendant la composition du dégradé.'); }
    if (result.status === 'rejected') { this.cancel(); return this.reject(result.message); }
    this.draft = { ...draft, changes, projection: result };
    const applied = this.actions.draft?.(this.getPreview());
    if (applied?.status === 'faulted') { this.setFault(applied.message); this.actions.fault(applied.message); this.actions.refresh(); return applied; }
    if (applied?.status === 'rejected') { this.draft = draft; this.actions.refresh(); return this.reject(applied.message); }
    this.actions.refresh(); return { status: 'changed' };
  }
  public commit(): MutationResult { if (this.fault) return { status: 'faulted', message: this.fault }; const draft = this.draft; return draft ? this.execute({ kind: 'edit', changes: draft.changes }, draft.ticket) : { status: 'unchanged' }; }
  public setFault(message: string): void { this.fault ??= message.trim() ? message : 'État du projet incertain. Rechargez un projet cohérent avant de reprendre.'; this.cancel(false, false); }
  public cancel(notify = true, restorePreview = true): void {
    const previous = this.draft; this.epoch++; this.draft = null;
    if (previous && restorePreview && !this.fault) {
      const restored = this.actions.draft?.(null);
      if (restored?.status === 'faulted') { this.setFault(restored.message); this.actions.fault(restored.message); }
      else if (restored?.status === 'rejected') { this.draft = previous; this.actions.report(restored.message); }
    }
    if (previous && notify && !this.disposed) this.actions.refresh();
  }
  private stageProblem(element: HTMLElement | null): string | null {
    if (!element || !gradientElementArea(element)) return 'Poignées indisponibles : la zone de fond n’est pas mesurable ou son origine est incompatible. Les champs restent disponibles.';
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = current.ownerDocument.defaultView?.getComputedStyle(current);
      if (style && ([style.transform, style.perspective, style.rotate, style.translate, style.scale].some(value => value && value !== 'none') || style.zoom && style.zoom !== 'normal' && style.zoom !== '1')) return 'Poignées indisponibles avec une transformation ou un zoom dans ce contexte. Utilisez les champs du dégradé.';
    }
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.backgroundAttachment && style.backgroundAttachment !== 'scroll') return 'Poignées indisponibles pour cet attachement du fond. Utilisez les champs du dégradé.';
    if (style && (style.backgroundSize && !['auto', 'auto auto'].includes(style.backgroundSize) || style.backgroundPosition && !['0% 0%', '0px 0px', 'left top'].includes(style.backgroundPosition))) return 'Poignées indisponibles pour ce cadrage du fond. Utilisez les champs du dégradé.';
    return null;
  }
  private stageView(): GradientStageView {
    const selection = this.editor.getSelection(); const gradients = this.draft?.projection?.gradients ?? this.snapshot?.gradients ?? [];
    const gradient = gradients.find(candidate => candidate.id === selection?.gradientId) ?? null;
    const element = this.elements.length === 1 ? this.elements[0] ?? null : null;
    const plane = element !== null && this.stageProblem(element) === null;
    return { element, gradient, stopId: selection?.stopId ?? null, visible: this.fault === null && this.mode === 'select' && Boolean(gradient), interactive: this.fault === null && plane && Boolean(this.snapshot?.editable), active: this.draft !== null };
  }
  public dispose(): void { if (this.disposed) return; this.cancel(false, !this.fault); this.disposed = true; this.draft = null; this.controls.destroy(); this.editor.destroy(); this.root.remove(); }
}
