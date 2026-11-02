// packages/css-properties/src/gradient-editor.ts
import { applyGradientEdits, cloneGradientDefinitions, gradientCss, readGradientComponent, validateGradientDefinitions } from './gradient-model.js';
import type { GradientColor, GradientComponent, GradientDefinition, GradientEdit, GradientEditorOptions, GradientIntent, GradientSelection, GradientStop, GradientValue, GradientViewOptions } from './gradient-types.js';
import './gradient-editor.less';

const typeLabels = { linear: 'Linéaire', radial: 'Radial', conic: 'Conique' } as const;
function toHex(value: GradientColor): string { return `#${[value.r, value.g, value.b].map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`; }
function fromHex(value: string): GradientColor | null {
  if (!/^#[\da-f]{6}$/i.test(value)) return null;
  return { kind: 'color', r: Number.parseInt(value.slice(1, 3), 16) / 255, g: Number.parseInt(value.slice(3, 5), 16) / 255, b: Number.parseInt(value.slice(5, 7), 16) / 255, a: 1 };
}

/** Controlled structured values. Only the host accepts and persists an intent. */
export class GradientEditor {
  public readonly root: HTMLElement;
  private values: readonly GradientDefinition[] = [];
  private selection: GradientSelection = { gradientId: '', stopId: null };
  private view: GradientViewOptions = {};
  private rowAbort = new AbortController();
  private readonly abort = new AbortController();
  private destroyed = false;
  private preview: readonly GradientEdit[] | null = null;
  private adding = false;
  private status: HTMLOutputElement;
  private bar: HTMLElement | null = null;

  public constructor(container: HTMLElement, private readonly options: GradientEditorOptions = {}) {
    const document = container.ownerDocument;
    this.root = document.createElement('section'); this.root.className = 'CssGradientEditor'; this.root.setAttribute('aria-label', 'Dégradé');
    this.status = document.createElement('output'); this.status.setAttribute('aria-live', 'polite');
    this.root.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); this.adding = false; this.cancelPreview(); this.render();
    }, { signal: this.abort.signal });
    container.append(this.root); this.setGradients([]);
  }
  public setGradients(values: readonly GradientDefinition[], view: GradientViewOptions = {}): void {
    if (this.destroyed) return;
    const error = validateGradientDefinitions(values);
    this.values = error ? [] : cloneGradientDefinitions(values); this.view = error ? { ...view, disabled: true, diagnostic: error } : { ...view };
    if (!view.preview) { this.preview = null; this.adding = false; }
    this.keepSelection(); this.render();
  }
  public getSelection(): GradientSelection { return { ...this.selection }; }
  public setSelection(gradientId: string, stopId: string | null): void {
    if (this.destroyed) return;
    this.preview = null; this.adding = false; this.selection = { gradientId, stopId }; this.keepSelection(); this.render();
  }
  private keepSelection(): void {
    const gradient = this.values.find(value => value.id === this.selection.gradientId) ?? this.values[0];
    this.selection = gradient ? { gradientId: gradient.id, stopId: gradient.stops.some(stop => stop.id === this.selection.stopId) ? this.selection.stopId : gradient.stops.find(stop => stop.present)?.id ?? null } : { gradientId: '', stopId: null };
  }
  private current(): GradientDefinition | undefined { return this.values.find(value => value.id === this.selection.gradientId); }
  private select(gradientId: string, stopId: string | null): void {
    this.cancelPreview(); this.setSelection(gradientId, stopId);
    try { this.options.onSelectionChange?.(this.getSelection()); } catch { this.status.textContent = 'La sélection n’a pas pu être transmise à l’hôte.'; }
  }
  private render(): void {
    const document = this.root.ownerDocument; const active = document.activeElement;
    const key = active instanceof HTMLElement && this.root.contains(active) ? active.dataset.gradientField : undefined;
    const stopId = active instanceof HTMLElement && this.root.contains(active) ? active.dataset.gradientStop : undefined;
    this.rowAbort.abort(); this.rowAbort = new AbortController(); this.root.replaceChildren(); this.bar = null;
    this.root.setAttribute('aria-disabled', String(Boolean(this.view.disabled)));
    const title = document.createElement('h3'); title.textContent = 'Dégradé';
    this.status = document.createElement('output'); this.status.className = 'gradient-status'; this.status.setAttribute('aria-live', 'polite'); this.status.textContent = [this.view.diagnostic, this.view.addDisabled ? this.view.addDiagnostic : undefined].filter(Boolean).join(' ');
    this.root.append(title, this.status);
    const gradient = this.current();
    if (!gradient) { const empty = document.createElement('p'); empty.textContent = 'Aucun dégradé structuré fourni par l’hôte.'; this.root.append(empty); return; }
    this.renderGradientChoice(gradient); this.renderBar(gradient); this.renderGeometry(gradient);
    const stop = gradient.stops.find(value => value.id === this.selection.stopId);
    if (stop) this.renderStop(gradient, stop);
    this.root.append(this.button('Ajouter un point', () => { this.adding = true; this.render(); this.findField('new-position')?.focus(); }, this.view.disabled || this.view.addDisabled));
    if (this.adding) this.renderAdd(gradient);
    const focus = key ? this.findField(key) : stopId ? [...this.root.querySelectorAll<HTMLButtonElement>('[data-gradient-stop]')].find(button => button.dataset.gradientStop === stopId) : undefined;
    focus?.focus();
  }
  private renderGradientChoice(gradient: GradientDefinition): void {
    const select = this.selectField('Dégradé structuré', 'gradient', this.values.map((value, index) => ({ value: value.id, text: `${index + 1} · ${typeLabels[value.type]}` })), gradient.id);
    select.addEventListener('change', () => { if (!this.view.disabled) this.select(select.value, null); }, { signal: this.rowAbort.signal });
  }
  private renderBar(gradient: GradientDefinition): void {
    const document = this.root.ownerDocument;
    const bar = document.createElement('div'); bar.className = 'gradient-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Points de couleur du dégradé'); this.bar = bar;
    try { bar.style.backgroundImage = gradientCss(gradient); } catch (error) { this.status.textContent = error instanceof Error ? error.message : 'Aperçu du dégradé indisponible.'; }
    for (const [index, stop] of gradient.stops.entries()) {
      if (!stop.present) continue;
      const button = this.button(String(index + 1), () => this.select(gradient.id, stop.id), this.view.disabled);
      button.dataset.gradientStop = stop.id; button.dataset.stopId = stop.id; button.setAttribute('aria-label', `Point ${index + 1} à ${stop.position} %`); button.setAttribute('aria-pressed', String(stop.id === this.selection.stopId));
      button.style.left = `${Math.max(0, Math.min(100, stop.position))}%`; button.style.setProperty('--stop-color', toHex(stop.color));
      button.addEventListener('keydown', event => {
        const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (!delta || this.view.disabled) return; event.preventDefault();
        this.request([{ gradientId: gradient.id, stopId: stop.id, component: 'position', value: stop.position + delta * (event.shiftKey ? 10 : 1) }]);
      }, { signal: this.rowAbort.signal }); bar.append(button);
    }
    this.root.append(bar);
    const selection = this.selectField('Point sélectionné', 'point', gradient.stops.map((stop, index) => ({ value: stop.id, text: `Point ${index + 1}${stop.present ? '' : ' · absent à cette image'}` })), this.selection.stopId ?? '');
    selection.addEventListener('change', () => { if (!this.view.disabled) this.select(gradient.id, selection.value); }, { signal: this.rowAbort.signal });
  }
  private renderGeometry(gradient: GradientDefinition): void {
    const type = this.selectField('Type de dégradé', 'type', Object.entries(typeLabels).map(([value, text]) => ({ value, text })), gradient.type);
    type.addEventListener('change', () => { if (type.value === 'linear' || type.value === 'radial' || type.value === 'conic') this.request([{ gradientId: gradient.id, component: 'type', value: type.value }]); }, { signal: this.rowAbort.signal });
    if (gradient.type !== 'radial') this.numeric('Angle du dégradé', 'angle', gradient.angle, value => this.request([{ gradientId: gradient.id, component: 'angle', value }]));
    if (gradient.type !== 'linear') for (const [component, label] of [['centerX', 'Centre X du dégradé'], ['centerY', 'Centre Y du dégradé']] as const) this.numeric(label, component, gradient[component], value => this.request([{ gradientId: gradient.id, component, value }]));
    if (gradient.type === 'radial') for (const [component, label] of [['radiusX', 'Rayon horizontal du dégradé'], ['radiusY', 'Rayon vertical du dégradé']] as const) this.numeric(label, component, gradient[component], value => this.request([{ gradientId: gradient.id, component, value }]), { min: 0 });
  }
  private renderStop(gradient: GradientDefinition, stop: GradientStop): void {
    const edit = (component: GradientComponent, value: GradientValue): void => this.request([{ gradientId: gradient.id, stopId: stop.id, component, value }]);
    const color = this.input('Couleur du point', 'point-color', 'color', toHex(stop.color));
    color.addEventListener('change', () => { const value = fromHex(color.value); if (value) edit('color', value); }, { signal: this.rowAbort.signal });
    this.numeric('Opacité du point', 'point-opacity', stop.opacity, value => edit('opacity', value), { min: 0, max: 1, step: 0.01 });
    this.numeric('Position du point', 'point-position', stop.position, value => edit('position', value));
    this.range(gradient, stop, 'position', 'Déplacer le point dans la barre', stop.position, 0, 100);
    this.range(gradient, stop, 'opacity', 'Ajuster l’opacité du point', stop.opacity, 0, 1);
    this.root.append(this.button(stop.present ? 'Supprimer le point' : 'Rétablir le point', () => edit('present', !stop.present), this.view.disabled || stop.present && gradient.stops.filter(value => value.present).length <= 2));
  }
  private range(gradient: GradientDefinition, stop: GradientStop, component: 'position' | 'opacity', label: string, value: number, min: number, max: number): void {
    const input = this.input(label, `range-${component}`, 'range', String(Math.max(min, Math.min(max, value)))); input.min = String(min); input.max = String(max); input.step = component === 'opacity' ? '0.01' : '0.1'; input.value = String(Math.max(min, Math.min(max, value)));
    const edits = (): readonly GradientEdit[] => [{ gradientId: gradient.id, stopId: stop.id, component, value: Number(input.value) }];
    input.addEventListener('input', () => this.previewChanges(edits()), { signal: this.rowAbort.signal });
    input.addEventListener('change', () => {
      const changes = edits(); const pending = this.preview;
      this.request(changes);
      if (this.preview === pending) this.cancelPreview();
      else if (pending && !this.preview) this.notifyPreviewEnd();
    }, { signal: this.rowAbort.signal });
    input.addEventListener('pointercancel', () => this.cancelPreview(), { signal: this.rowAbort.signal });
  }
  private previewChanges(edits: readonly GradientEdit[]): void {
    if (this.destroyed || this.view.disabled) return;
    try {
      const values = applyGradientEdits(this.values, edits); const gradient = values.find(value => value.id === this.selection.gradientId); if (!gradient) return;
      const css = gradientCss(gradient); this.preview = edits;
      if (this.bar) this.bar.style.backgroundImage = css;
      this.paintMarkers(gradient);
      for (const edit of edits) { const input = this.findField(`point-${edit.component}`); if (input instanceof HTMLInputElement) input.value = String(edit.value); }
      this.options.onPreview?.(edits.map(edit => ({ ...edit })));
    } catch (error) { this.status.textContent = error instanceof Error ? error.message : 'Aperçu indisponible.'; }
  }
  private cancelPreview(): void {
    const pending = this.preview; this.preview = null;
    if (pending) {
      const gradient = this.current(); if (gradient && this.bar) { try { this.bar.style.backgroundImage = gradientCss(gradient); } catch { this.bar.style.backgroundImage = ''; } this.paintMarkers(gradient); }
      for (const edit of pending) { const value = readGradientComponent(this.values, edit); for (const key of [`point-${edit.component}`, `range-${edit.component}`]) { const input = this.findField(key); if (input instanceof HTMLInputElement && typeof value === 'number') input.value = String(value); } }
      this.notifyPreviewEnd();
    }
  }
  private paintMarkers(gradient: GradientDefinition): void {
    for (const [index, stop] of gradient.stops.entries()) {
      const marker = [...this.bar?.querySelectorAll<HTMLButtonElement>('[data-gradient-stop]') ?? []].find(button => button.dataset.gradientStop === stop.id);
      if (!marker) continue;
      marker.style.left = `${Math.max(0, Math.min(100, stop.position))}%`; marker.setAttribute('aria-label', `Point ${index + 1} à ${stop.position} %`);
    }
  }
  private notifyPreviewEnd(): void { try { this.options.onPreview?.(null); } catch { this.status.textContent = 'L’hôte n’a pas pu fermer l’aperçu.'; } }
  private request(edits: readonly GradientEdit[]): void {
    if (this.destroyed || this.view.disabled) return;
    try {
      applyGradientEdits(this.values, edits);
      if (edits.every(edit => JSON.stringify(readGradientComponent(this.values, edit)) === JSON.stringify(edit.value))) return;
      this.options.onChange?.({ kind: 'edit', changes: edits.map(edit => ({ ...edit, ...(typeof edit.value === 'object' ? { value: { ...edit.value } } : {}) })) });
    } catch (error) { this.status.textContent = error instanceof Error ? error.message : 'L’hôte n’a pas pu traiter la modification.'; }
  }
  private renderAdd(gradient: GradientDefinition): void {
    const document = this.root.ownerDocument; const draft = document.createElement('fieldset'); draft.className = 'gradient-add';
    const legend = document.createElement('legend'); legend.textContent = 'Nouveau point'; draft.append(legend); this.root.append(draft);
    const position = this.input('Position du nouveau point', 'new-position', 'number', '50', draft);
    const color = this.input('Couleur du nouveau point', 'new-color', 'color', '#808080', draft);
    const opacity = this.input('Opacité du nouveau point', 'new-opacity', 'number', '1', draft); opacity.min = '0'; opacity.max = '1'; opacity.step = '0.01';
    draft.append(this.button('Ajouter ce point', () => {
      if (!this.adding) return;
      const value = fromHex(color.value); const alpha = Number(opacity.value); const at = Number(position.value);
      if (!value || !opacity.value.trim() || !position.value.trim() || !Number.isFinite(alpha) || alpha < 0 || alpha > 1 || !Number.isFinite(at)) { this.status.textContent = 'Vérifiez la position, la couleur et l’opacité du nouveau point.'; return; }
      if (this.view.disabled) return;
      const intent: GradientIntent = { kind: 'add-stop', gradientId: gradient.id, color: value, opacity: alpha, position: at };
      this.adding = false; this.render();
      try { this.options.onChange?.(intent); } catch { this.status.textContent = 'L’hôte n’a pas pu ajouter le point.'; }
    }, this.view.disabled), this.button('Annuler l’ajout', () => { this.adding = false; this.render(); }, false));
  }
  private button(text: string, action: () => void, disabled = false): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button'); button.type = 'button'; button.textContent = text; button.disabled = disabled;
    button.addEventListener('click', () => { if (!button.disabled && !this.destroyed) action(); }, { signal: this.rowAbort.signal }); return button;
  }
  private input(label: string, key: string, type: string, value: string, parent: HTMLElement = this.root): HTMLInputElement {
    const document = this.root.ownerDocument; const wrapper = document.createElement('label'); wrapper.textContent = label;
    const input = document.createElement('input'); input.type = type; input.value = value; input.dataset.gradientField = key; input.setAttribute('aria-label', label); input.disabled = Boolean(this.view.disabled); wrapper.append(input); parent.append(wrapper); return input;
  }
  private numeric(label: string, key: string, value: number, accept: (value: number) => void, bounds: { readonly min?: number; readonly max?: number; readonly step?: number } = {}): void {
    const input = this.input(label, key, 'number', String(value)); input.step = String(bounds.step ?? 'any'); if (bounds.min !== undefined) input.min = String(bounds.min); if (bounds.max !== undefined) input.max = String(bounds.max);
    input.addEventListener('change', () => {
      const next = Number(input.value);
      if (!input.value.trim() || !Number.isFinite(next) || bounds.min !== undefined && next < bounds.min || bounds.max !== undefined && next > bounds.max) { input.value = String(value); this.status.textContent = 'Valeur numérique non valide.'; return; }
      accept(next);
    }, { signal: this.rowAbort.signal });
  }
  private selectField(label: string, key: string, choices: readonly { readonly value: string; readonly text: string }[], value: string): HTMLSelectElement {
    const document = this.root.ownerDocument; const wrapper = document.createElement('label'); wrapper.textContent = label;
    const select = document.createElement('select'); select.setAttribute('aria-label', label); select.dataset.gradientField = key; select.disabled = Boolean(this.view.disabled);
    for (const choice of choices) { const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.text; select.append(option); }
    select.value = value; wrapper.append(select); this.root.append(wrapper); return select;
  }
  private findField(key: string): HTMLInputElement | HTMLSelectElement | undefined { return [...this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')].find(input => input.dataset.gradientField === key); }
  public destroy(): void { if (this.destroyed) return; this.cancelPreview(); this.destroyed = true; this.rowAbort.abort(); this.abort.abort(); this.root.remove(); }
}
