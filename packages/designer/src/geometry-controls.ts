// packages/designer/src/geometry-controls.ts
import type { GeometryState, GeometryTool, Point } from './geometry-math.js';
import { geometryLengthPixels } from './geometry-math.js';
import { geometryBoxMetrics, geometryContext } from './geometry-dom.js';
import type { MutationResult } from './timeline-adapter.js';
import './geometry-controls.less';

export interface GeometryOptions { readonly grid: boolean; readonly snap: boolean; readonly guides: boolean; readonly gridSize: number }
export interface GeometryView {
  readonly element: HTMLElement | null;
  readonly state: GeometryState | null;
  readonly tool: GeometryTool;
  readonly mode: 'select' | 'test';
  readonly active: boolean;
  readonly options: GeometryOptions;
  readonly guides: readonly { readonly axis: 'x' | 'y'; readonly value: number }[];
}
export type GeometryUpdateResult = MutationResult | { readonly status: 'confirmation-required'; readonly properties: readonly string[]; readonly message: string };
export interface GeometryControlsOptions {
  readonly scene: HTMLElement;
  readonly read: () => GeometryView;
  readonly setTool: (tool: GeometryTool) => void;
  readonly begin: (tool: GeometryTool) => MutationResult;
  readonly update: (delta: Point, options?: { allowUnitReplacement?: boolean; bypassSnap?: boolean }) => GeometryUpdateResult;
  readonly commit: () => MutationResult;
  readonly cancel: () => void;
  readonly setOptions: (options: Partial<GeometryOptions>) => void;
  readonly setPivot: (xPercent: number, yPercent: number) => MutationResult;
}
interface Matrix { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number }
interface Drag {
  readonly pointerId: number;
  readonly handle: HTMLButtonElement;
  readonly tool: GeometryTool;
  readonly start: Point;
  readonly matrix: Matrix;
  readonly pivot: Point;
  readonly scale: { readonly axis: Point; readonly width: number; readonly height: number; readonly cosine: number; readonly sine: number } | null;
}
interface Confirmation { readonly delta: Point; readonly bypassSnap: boolean }
const TOOLS: readonly { readonly tool: GeometryTool; readonly label: string; readonly handle: string; readonly symbol: string }[] = [
  { tool: 'move', label: 'Déplacement', handle: 'Déplacer l’élément', symbol: '↔' },
  { tool: 'dimensions', label: 'Dimensions', handle: 'Redimensionner l’élément', symbol: '↘' },
  { tool: 'rotate', label: 'Rotation', handle: 'Faire pivoter l’élément', symbol: '↻' },
  { tool: 'scale', label: 'Échelle', handle: 'Mettre à l’échelle', symbol: '⤢' },
  { tool: 'pivot', label: 'Pivot', handle: 'Déplacer le pivot', symbol: '⊕' },
];
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** UI-only spatial tools: the host owns preview validation, commands and history. */
export class GeometryControls {
  private readonly root: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly guides: HTMLElement;
  private readonly tools = new Map<GeometryTool, HTMLButtonElement>();
  private readonly handles = new Map<GeometryTool, HTMLButtonElement>();
  private readonly toggles = new Map<'grid' | 'snap' | 'guides', HTMLInputElement>();
  private readonly presets: HTMLButtonElement[] = [];
  private readonly status: HTMLOutputElement;
  private readonly summary: HTMLOutputElement;
  private readonly toolbar: HTMLElement;
  private readonly aids: HTMLElement;
  private readonly pivotPresets: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly confirmationUi: HTMLElement;
  private readonly confirmationText: HTMLElement;
  private readonly abort = new AbortController();
  private drag: Drag | null = null;
  private confirmation: Confirmation | null = null;
  private destroyed = false;

  public constructor(container: HTMLElement, private readonly options: GeometryControlsOptions) {
    const doc = container.ownerDocument;
    this.root = doc.createElement('section'); this.root.className = 'HtmlDesignerGeometry';
    const title = doc.createElement('h3'); title.textContent = 'Géométrie';
    const toolbar = doc.createElement('div'); this.toolbar = toolbar; toolbar.className = 'geometry-tools'; toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Outils géométriques');
    for (const item of TOOLS) {
      const button = this.button(item.label, () => { this.options.cancel(); this.options.setTool(item.tool); this.refresh(); });
      button.dataset.geometryTool = item.tool; this.tools.set(item.tool, button); toolbar.append(button);
    }
    const aids = doc.createElement('div'); this.aids = aids; aids.className = 'geometry-aids';
    for (const [key, name] of [['grid', 'Grille'], ['snap', 'Accrochage'], ['guides', 'Guides']] as const) {
      const label = doc.createElement('label'); const input = doc.createElement('input'); input.type = 'checkbox';
      input.addEventListener('change', () => { this.options.setOptions({ [key]: input.checked }); this.refresh(); }, { signal: this.abort.signal });
      label.append(input, doc.createTextNode(name)); this.toggles.set(key, input); aids.append(label);
    }
    const pivotPresets = doc.createElement('fieldset'); this.pivotPresets = pivotPresets; pivotPresets.className = 'geometry-pivots';
    const legend = doc.createElement('legend'); legend.textContent = 'Positions du pivot'; pivotPresets.append(legend);
    for (const [y, row] of ['haut', 'milieu', 'bas'].entries()) for (const [x, column] of ['gauche', 'centre', 'droite'].entries()) {
      const label = x === 1 && y === 1 ? 'Pivot au centre' : `Pivot ${row} ${column}`;
      const button = this.button('⊕', () => { this.options.cancel(); this.showResult(this.options.setPivot(x * 50, y * 50)); this.refresh(); });
      button.setAttribute('aria-label', label); button.title = label; button.dataset.pivot = `${x * 50},${y * 50}`;
      this.presets.push(button); pivotPresets.append(button);
    }
    this.summary = doc.createElement('output'); this.summary.className = 'geometry-summary'; this.summary.setAttribute('aria-label', 'Valeurs géométriques');
    const hint = doc.createElement('p'); this.hint = hint; hint.className = 'geometry-hint'; hint.textContent = 'Poignée : glisser pour modifier. Flèches : 1 px ; Maj : 10 px ; Alt : sans accrochage. Échap annule le geste.';
    this.status = doc.createElement('output'); this.status.className = 'geometry-status'; this.status.setAttribute('aria-live', 'polite');
    this.confirmationUi = doc.createElement('div'); this.confirmationUi.className = 'geometry-confirmation'; this.confirmationUi.hidden = true;
    this.confirmationText = doc.createElement('p');
    this.confirmationUi.append(this.confirmationText, this.button('Convertir en pixels et appliquer', () => this.acceptConversion()), this.button('Annuler le geste', () => this.cancel()));
    this.root.append(title, toolbar, aids, pivotPresets, this.summary, hint, this.status, this.confirmationUi); container.prepend(this.root);
    this.overlay = doc.createElement('div'); this.overlay.className = 'HtmlDesignerGeometryOverlay';
    for (const item of TOOLS) {
      const handle = this.button(item.symbol, () => undefined); handle.className = `geometry-handle geometry-${item.tool}`; handle.setAttribute('aria-label', item.handle); handle.title = item.handle;
      handle.dataset.geometryHandle = item.tool; handle.addEventListener('pointerdown', event => this.startPointer(event, handle, item.tool), { signal: this.abort.signal });
      handle.addEventListener('lostpointercapture', () => { if (this.drag?.handle === handle) this.cancel(); }, { signal: this.abort.signal });
      handle.addEventListener('keydown', event => this.keyboard(event), { signal: this.abort.signal }); this.handles.set(item.tool, handle); this.overlay.append(handle);
    }
    this.grid = doc.createElement('div'); this.grid.className = 'HtmlDesignerGeometryGrid'; this.grid.setAttribute('aria-hidden', 'true');
    this.guides = doc.createElement('div'); this.guides.className = 'HtmlDesignerGeometryGuides'; this.guides.setAttribute('aria-hidden', 'true');
    doc.body.append(this.grid, this.guides, this.overlay);
    const win = doc.defaultView;
    win?.addEventListener('pointermove', event => this.movePointer(event), { signal: this.abort.signal });
    win?.addEventListener('pointerup', event => this.endPointer(event), { signal: this.abort.signal });
    win?.addEventListener('pointercancel', event => { if (event.pointerId === this.drag?.pointerId) this.cancel(); }, { signal: this.abort.signal });
    win?.addEventListener('resize', () => this.refresh(), { signal: this.abort.signal });
    doc.addEventListener('scroll', () => this.refresh(), { capture: true, signal: this.abort.signal });
    doc.addEventListener('keydown', event => { if (event.key === 'Escape' && this.options.read().active) { event.preventDefault(); this.cancel(); } }, { signal: this.abort.signal });
    this.refresh();
  }
  private button(label: string, action: () => void): HTMLButtonElement {
    const button = this.options.scene.ownerDocument.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action, { signal: this.abort.signal }); return button;
  }
  private showResult(result: GeometryUpdateResult): void { if (result.status === 'rejected') this.status.textContent = result.message; }
  private matrix(element: HTMLElement): Matrix {
    const win = element.ownerDocument.defaultView; const transform = win?.getComputedStyle(element).transform;
    if (!transform || transform === 'none' || !win?.DOMMatrix) return IDENTITY;
    const matrix = new win.DOMMatrix(transform); return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
  }
  private frame(element: HTMLElement): { width: number; height: number; origin: Point } {
    const computed = element.ownerDocument.defaultView?.getComputedStyle(element); const { width, height } = geometryBoxMetrics(element);
    const origin = (computed?.transformOrigin || `${width / 2}px ${height / 2}px`).split(/\s+/);
    const length = (value: string | undefined, size: number): number => value?.endsWith('%') ? Number.parseFloat(value) * size / 100 : Number.parseFloat(value ?? '') || 0;
    return { width, height, origin: { x: length(origin[0], width), y: length(origin[1], height) } };
  }
  private point(element: HTMLElement, matrix: Matrix, point: Point): Point {
    const rect = element.getBoundingClientRect(); const { width, height } = this.frame(element);
    const xs = [0, matrix.a * width, matrix.c * height, matrix.a * width + matrix.c * height];
    const ys = [0, matrix.b * width, matrix.d * height, matrix.b * width + matrix.d * height];
    return { x: rect.left + matrix.a * point.x + matrix.c * point.y - Math.min(...xs), y: rect.top + matrix.b * point.x + matrix.d * point.y - Math.min(...ys) };
  }
  private scaleContext(element: HTMLElement, matrix: Matrix, state: GeometryState): Drag['scale'] {
    const rotation = Number.parseFloat(state.rotate) * (state.rotate.endsWith('rad') ? 1 : state.rotate.endsWith('turn') ? Math.PI * 2 : Math.PI / 180);
    const cosine = Math.cos(rotation); const sine = Math.sin(rotation); const sx = Number(state.scaleX); const sy = Number(state.scaleY);
    const { width, height, origin } = this.frame(element); const x = width - origin.x; const y = height - origin.y;
    const context = geometryContext(element, element.ownerDocument.defaultView?.getComputedStyle(element).transform ?? 'none', state);
    if (context.status === 'rejected') return null;
    const tx = geometryLengthPixels(state.translateX, width, context.metrics); const ty = geometryLengthPixels(state.translateY, height, context.metrics);
    if (tx === null || ty === null) return null;
    const e = matrix.e - tx; const f = matrix.f - ty;
    const axis = { x: ((cosine * matrix.a + sine * matrix.b) * x + (cosine * matrix.c + sine * matrix.d) * y + cosine * e + sine * f) / sx, y: ((-sine * matrix.a + cosine * matrix.b) * x + (-sine * matrix.c + cosine * matrix.d) * y - sine * e + cosine * f) / sy };
    if (![axis.x, axis.y, sx, sy].every(Number.isFinite) || sx <= 0 || sy <= 0 || Math.abs(axis.x) < 0.001 || Math.abs(axis.y) < 0.001) return null;
    return { axis, width, height, cosine, sine };
  }
  private dimensionsMatrix(matrix: Matrix, state: GeometryState): Matrix | null {
    const fraction = (value: string): number => {
      const match = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*(px|%|em|rem|vw|vh)?$/i.exec(value.trim());
      if (!match || (!match[1] && Number(value) !== 0)) return Number.NaN;
      return match[1] === '%' ? Number.parseFloat(value) / 100 : 0;
    };
    const fx = fraction(state.pivotX); const fy = fraction(state.pivotY);
    // A relative origin and controlled percentage translation move with the resized box.
    const result = { a: matrix.a * (1 - fx) + fx + fraction(state.translateX), b: matrix.b * (1 - fx), c: matrix.c * (1 - fy), d: matrix.d * (1 - fy) + fy + fraction(state.translateY), e: 0, f: 0 };
    const determinant = result.a * result.d - result.b * result.c;
    return Object.values(result).every(Number.isFinite) && Math.abs(determinant) > 0.000001 ? result : null;
  }
  private startPointer(event: PointerEvent, handle: HTMLButtonElement, tool: GeometryTool): void {
    if (event.button !== 0 || this.destroyed) return;
    event.preventDefault(); event.stopPropagation(); this.cancel(); this.options.setTool(tool);
    const result = this.options.begin(tool); this.showResult(result);
    const view = this.options.read(); const element = view.element;
    if (result.status === 'rejected' || !view.active || !element) return;
    const matrix = this.matrix(element); const scale = tool === 'scale' && view.state ? this.scaleContext(element, matrix, view.state) : null;
    const movementMatrix = tool === 'dimensions' && view.state ? this.dimensionsMatrix(matrix, view.state) : matrix;
    if (!movementMatrix) { this.options.cancel(); this.status.textContent = 'Cette rotation et cette origine ne permettent pas de redimensionner fidèlement avec la poignée. Modifiez les dimensions dans les propriétés.'; this.refresh(); return; }
    if (tool === 'scale' && !scale) { this.options.cancel(); this.status.textContent = 'Cette poignée ne peut pas modifier fidèlement les deux axes. Déplacez le pivot ou utilisez les propriétés d’échelle.'; this.refresh(); return; }
    this.drag = { pointerId: event.pointerId, handle, tool, start: { x: event.clientX, y: event.clientY }, matrix: movementMatrix, pivot: this.point(element, matrix, this.frame(element).origin), scale };
    this.status.textContent = ''; handle.focus(); handle.setPointerCapture(event.pointerId); this.refresh();
  }
  private delta(drag: Drag, event: PointerEvent): Point {
    const dx = event.clientX - drag.start.x; const dy = event.clientY - drag.start.y;
    if (drag.tool === 'move') return { x: dx, y: dy };
    if (drag.tool === 'scale' && drag.scale) {
      const { axis, width, height, cosine, sine } = drag.scale;
      return { x: (cosine * dx + sine * dy) / axis.x * width, y: (-sine * dx + cosine * dy) / axis.y * height };
    }
    if (drag.tool === 'rotate') {
      const angle = Math.atan2(event.clientY - drag.pivot.y, event.clientX - drag.pivot.x) - Math.atan2(drag.start.y - drag.pivot.y, drag.start.x - drag.pivot.x);
      return { x: Math.atan2(Math.sin(angle), Math.cos(angle)) * 180 / Math.PI, y: 0 };
    }
    const { a, b, c, d } = drag.matrix; const determinant = a * d - b * c;
    return { x: (d * dx - c * dy) / determinant, y: (-b * dx + a * dy) / determinant };
  }
  private movePointer(event: PointerEvent): void {
    const drag = this.drag; if (!drag || event.pointerId !== drag.pointerId) return;
    if (!this.options.read().active) { this.clearDrag(); return; }
    event.preventDefault(); const delta = this.delta(drag, event);
    const result = this.options.update(delta, { bypassSnap: event.altKey });
    if (result.status === 'confirmation-required') {
      this.confirmation = { delta, bypassSnap: event.altKey }; this.confirmationText.textContent = result.message; this.confirmationUi.hidden = false;
    } else { this.confirmation = null; this.confirmationUi.hidden = true; this.showResult(result); }
    this.refresh();
  }
  private endPointer(event: PointerEvent): void {
    if (event.pointerId !== this.drag?.pointerId) return;
    const confirmation = this.confirmation; this.clearDrag();
    if (!confirmation) { this.showResult(this.options.commit()); this.refresh(); }
  }
  private clearDrag(): void {
    const drag = this.drag; this.drag = null;
    if (drag?.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  }
  private acceptConversion(): void {
    const confirmation = this.confirmation; if (!confirmation || !this.options.read().active) { this.refresh(); return; }
    const result = this.options.update(confirmation.delta, { allowUnitReplacement: true, bypassSnap: confirmation.bypassSnap });
    this.showResult(result); if (result.status === 'rejected' || result.status === 'confirmation-required') return;
    this.confirmation = null; this.confirmationUi.hidden = true; this.showResult(this.options.commit()); this.refresh();
  }
  private cancel(): void { this.clearDrag(); this.confirmation = null; this.confirmationUi.hidden = true; this.options.cancel(); this.refresh(); }
  private keyboard(event: KeyboardEvent): void {
    if (event.target !== this.handles.get('move') || this.options.read().mode !== 'select') return;
    const directions: Readonly<Record<string, Point>> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const direction = directions[event.key]; if (!direction) return;
    event.preventDefault(); event.stopPropagation(); this.cancel();
    const start = this.options.begin('move'); this.showResult(start); if (start.status === 'rejected') return;
    const step = event.shiftKey ? 10 : 1;
    const result = this.options.update({ x: direction.x * step, y: direction.y * step }, { bypassSnap: true });
    this.showResult(result); if (result.status === 'rejected') this.options.cancel(); else this.showResult(this.options.commit()); this.refresh();
  }
  public refresh(): void {
    if (this.destroyed) return;
    const view = this.options.read();
    if (!view.active) { this.clearDrag(); this.confirmation = null; this.confirmationUi.hidden = true; }
    const enabled = view.element !== null && view.state !== null && view.mode === 'select';
    this.toolbar.hidden = !enabled; this.aids.hidden = !enabled; this.pivotPresets.hidden = !enabled || view.tool !== 'pivot'; this.hint.hidden = !enabled;
    for (const [tool, button] of this.tools) { button.disabled = !enabled; button.setAttribute('aria-pressed', String(tool === view.tool)); }
    for (const [key, input] of this.toggles) input.checked = view.options[key];
    for (const button of this.presets) button.disabled = !enabled;
    this.summary.textContent = view.state ? `X ${view.state.translateX} · Y ${view.state.translateY} · ${view.state.width} × ${view.state.height} · ${view.state.rotate} · échelle ${view.state.scaleX} / ${view.state.scaleY}` : 'Sélectionnez une cible individuelle pour utiliser les poignées.';
    this.overlay.hidden = !enabled;
    for (const [tool, handle] of this.handles) handle.hidden = tool !== view.tool;
    if (enabled && view.element) {
      const rect = view.element.getBoundingClientRect(); Object.assign(this.overlay.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const matrix = this.matrix(view.element); const frame = this.frame(view.element);
      const pivot = this.point(view.element, matrix, frame.origin); const handle = this.handles.get('pivot');
      if (handle) Object.assign(handle.style, { left: `${pivot.x - rect.left}px`, top: `${pivot.y - rect.top}px` });
      const corner = this.point(view.element, matrix, { x: frame.width, y: frame.height });
      for (const name of ['dimensions', 'scale'] as const) { const cornerHandle = this.handles.get(name); if (cornerHandle) Object.assign(cornerHandle.style, { left: `${corner.x - rect.left}px`, top: `${corner.y - rect.top}px` }); }
    }
    this.refreshAids(view);
  }
  private refreshAids(view: GeometryView): void {
    const rect = this.options.scene.getBoundingClientRect(); const show = view.mode === 'select';
    const gridRect = view.element?.parentElement?.getBoundingClientRect() ?? rect;
    this.grid.hidden = !view.options.grid || !show;
    Object.assign(this.grid.style, { left: `${gridRect.left}px`, top: `${gridRect.top}px`, width: `${gridRect.width}px`, height: `${gridRect.height}px`, backgroundSize: `${view.options.gridSize}px ${view.options.gridSize}px` });
    this.guides.replaceChildren(); if (!view.options.guides || !show) return;
    for (const guide of view.guides) {
      const line = this.root.ownerDocument.createElement('div'); line.className = `HtmlDesignerGeometryGuide geometry-guide-${guide.axis}`;
      Object.assign(line.style, guide.axis === 'x' ? { left: `${guide.value}px`, top: `${rect.top}px`, height: `${rect.height}px` } : { top: `${guide.value}px`, left: `${rect.left}px`, width: `${rect.width}px` }); this.guides.append(line);
    }
  }
  public destroy(): void {
    if (this.destroyed) return; this.destroyed = true; this.clearDrag(); this.abort.abort(); this.root.remove(); this.overlay.remove(); this.grid.remove(); this.guides.remove();
  }
}
