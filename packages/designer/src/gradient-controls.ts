// packages/designer/src/gradient-controls.ts
import type { GradientDefinition, GradientEdit } from '@kazo-ca/css-properties';
import { gradientHandleEdits, gradientHandlePoint } from './gradient-math.js';
import type { GradientHandle, GradientPoint } from './gradient-math.js';
import './gradient-controls.less';

export type { GradientHandle } from './gradient-math.js';
export interface GradientStageView {
  readonly element: HTMLElement | null;
  readonly gradient: GradientDefinition | null;
  readonly stopId: string | null;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly active?: boolean;
}
export interface GradientControlsOptions {
  readonly read: () => GradientStageView;
  readonly begin: () => void;
  readonly preview: (changes: readonly GradientEdit[]) => void;
  readonly commit: () => void;
  readonly cancel: () => void;
}
interface Drag {
  readonly pointerId: number;
  readonly button: HTMLButtonElement;
  readonly handle: GradientHandle;
  readonly element: HTMLElement;
  readonly gradient: GradientDefinition;
  readonly stopId: string | null;
  readonly rect: GradientArea;
  readonly pointerOffset: GradientPoint;
  readonly visualOffset: GradientPoint;
  previousStopPosition?: number;
}
export interface GradientArea { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
const HANDLES: readonly { readonly kind: GradientHandle; readonly label: string; readonly symbol: string }[] = [
  { kind: 'angle', label: 'Angle du dégradé', symbol: '↻' },
  { kind: 'center', label: 'Centre du dégradé', symbol: '⊕' },
  { kind: 'radiusX', label: 'Rayon horizontal du dégradé', symbol: '↔' },
  { kind: 'radiusY', label: 'Rayon vertical du dégradé', symbol: '↕' },
  { kind: 'stop', label: 'Position du point sélectionné', symbol: '◆' },
];
const MIN_HANDLE_DISTANCE = 34;
const HANDLE_SPACING = 36;
const HANDLE_ORDER: readonly GradientHandle[] = ['center', 'angle', 'radiusX', 'radiusY', 'stop'];
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
function snapshotGradient(gradient: GradientDefinition): GradientDefinition { return { ...gradient, stops: gradient.stops.map(stop => ({ ...stop, color: { ...stop.color } })) }; }
function sameRect(first: GradientArea, second: GradientArea): boolean { return (['left', 'top', 'width', 'height'] as const).every(key => Math.abs(first[key] - second[key]) < 0.000001); }
function sameSelection(first: GradientStageView, second: GradientStageView): boolean { return first.element === second.element && first.gradient?.id === second.gradient?.id && first.gradient?.type === second.gradient?.type && first.stopId === second.stopId; }
function separatedOffset(point: GradientPoint, occupied: readonly GradientPoint[]): GradientPoint {
  const candidates: GradientPoint[] = [{ x: 0, y: 0 }];
  for (let distance = HANDLE_SPACING; distance <= HANDLE_SPACING * HANDLES.length; distance += HANDLE_SPACING) {
    candidates.push({ x: 0, y: -distance }, { x: distance, y: 0 }, { x: 0, y: distance }, { x: -distance, y: 0 });
  }
  return candidates.find(offset => occupied.every(other => Math.hypot(point.x + offset.x - other.x, point.y + offset.y - other.y) >= MIN_HANDLE_DISTANCE)) ?? { x: 0, y: HANDLE_SPACING * (HANDLES.length + 1) };
}

/** CSS positioning area for an auto-sized gradient with a single origin policy. */
export function gradientElementArea(element: HTMLElement): GradientArea | null {
  const rect = element.getBoundingClientRect(); const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  const origin = style.backgroundOrigin || 'padding-box';
  if (!['border-box', 'padding-box', 'content-box'].includes(origin)) return null;
  const inset = (side: 'left' | 'top' | 'right' | 'bottom'): number => {
    const length = (property: string): number => { const value = style.getPropertyValue(property); return value ? Number.parseFloat(value) : 0; };
    return origin === 'border-box' ? 0 : length(`border-${side}-width`) + (origin === 'content-box' ? length(`padding-${side}`) : 0);
  };
  const left = inset('left'); const right = inset('right'); const top = inset('top'); const bottom = inset('bottom');
  if (![left, right, top, bottom].every(value => Number.isFinite(value) && value >= 0)) return null;
  const width = rect.width - left - right; const height = rect.height - top - bottom;
  return width > 0 && height > 0 ? { left: rect.left + left, top: rect.top + top, width, height } : null;
}

/** Scene affordances only: the host controls preview, validation and atomic history. */
export class GradientControls {
  private readonly root: HTMLElement;
  private readonly line: SVGLineElement;
  private readonly connectors: SVGGElement;
  private readonly handles = new Map<GradientHandle, HTMLButtonElement>();
  private readonly handleOffsets = new Map<GradientHandle, GradientPoint>();
  private readonly abort = new AbortController();
  private drag: Drag | null = null;
  private destroyed = false;

  public constructor(container: HTMLElement, private readonly options: GradientControlsOptions) {
    const document = container.ownerDocument;
    this.root = document.createElement('div'); this.root.className = 'HtmlDesignerGradientOverlay';
    this.root.setAttribute('role', 'group'); this.root.setAttribute('aria-label', 'Poignées du dégradé');
    const decoration = document.createElementNS(SVG_NAMESPACE, 'svg'); decoration.setAttribute('aria-hidden', 'true');
    this.line = document.createElementNS(SVG_NAMESPACE, 'line'); this.connectors = document.createElementNS(SVG_NAMESPACE, 'g'); decoration.append(this.line, this.connectors); this.root.append(decoration);
    for (const definition of HANDLES) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = definition.symbol;
      button.className = `gradient-handle gradient-handle-${definition.kind}`;
      button.dataset.gradientHandle = definition.kind; button.setAttribute('aria-label', definition.label); button.title = definition.label;
      button.addEventListener('pointerdown', event => this.start(event, definition.kind, button), { signal: this.abort.signal });
      button.addEventListener('lostpointercapture', event => { if (this.drag?.button === button && event.pointerId === this.drag.pointerId) this.cancel(); }, { signal: this.abort.signal });
      button.addEventListener('keydown', event => this.keyboard(event, definition.kind), { signal: this.abort.signal });
      this.handles.set(definition.kind, button); this.root.append(button);
    }
    document.body.append(this.root);
    const window = document.defaultView;
    window?.addEventListener('pointermove', event => this.move(event), { signal: this.abort.signal });
    window?.addEventListener('pointerup', event => this.end(event), { signal: this.abort.signal });
    window?.addEventListener('pointercancel', event => { if (event.pointerId === this.drag?.pointerId) this.cancel(); }, { signal: this.abort.signal });
    window?.addEventListener('resize', () => this.refresh(), { signal: this.abort.signal });
    document.addEventListener('scroll', () => this.refresh(), { capture: true, signal: this.abort.signal });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.drag) { event.preventDefault(); event.stopPropagation(); this.cancel(); } }, { signal: this.abort.signal });
    this.refresh();
  }

  private clearDrag(): Drag | null {
    const drag = this.drag; this.drag = null;
    if (drag && typeof drag.button.hasPointerCapture === 'function' && drag.button.hasPointerCapture(drag.pointerId)) drag.button.releasePointerCapture(drag.pointerId);
    return drag;
  }
  private cancel(): void { const drag = this.clearDrag(); if (drag) this.options.cancel(); this.refresh(); }
  private start(event: PointerEvent, handle: GradientHandle, button: HTMLButtonElement): void {
    if (this.destroyed || event.button !== 0) return;
    const before = this.options.read();
    if (!before.visible || !before.interactive || !before.gradient || !before.element || button.hidden || button.disabled) return;
    event.preventDefault(); event.stopPropagation(); this.cancel();
    this.options.begin(); const view = this.options.read();
    if (!view.visible || !view.interactive || !view.gradient || !view.element || view.active === false) return;
    const rect = gradientElementArea(view.element);
    if (!sameSelection(before, view) || !rect) { this.options.cancel(); this.refresh(); return; }
    const point = gradientHandlePoint(view.gradient, handle, view.stopId, rect);
    if (!point) { this.options.cancel(); this.refresh(); return; }
    this.drag = { pointerId: event.pointerId, button, handle, element: view.element, gradient: snapshotGradient(view.gradient), stopId: view.stopId, rect,
      pointerOffset: { x: event.clientX - rect.left - point.x, y: event.clientY - rect.top - point.y }, visualOffset: this.handleOffsets.get(handle) ?? { x: 0, y: 0 } };
    button.focus({ preventScroll: true });
    if (typeof button.setPointerCapture === 'function') {
      try { button.setPointerCapture(event.pointerId); }
      catch { this.cancel(); return; }
    }
    this.refresh();
  }
  private move(event: PointerEvent): void {
    if (event.pointerId !== this.drag?.pointerId) return;
    this.refresh();
    const drag = this.drag; if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const source = drag.gradient.type === 'conic' && drag.handle === 'stop' && drag.previousStopPosition !== undefined ? { ...drag.gradient, stops: drag.gradient.stops.map(stop => stop.id === drag.stopId ? { ...stop, position: drag.previousStopPosition ?? stop.position } : stop) } : drag.gradient;
    const changes = gradientHandleEdits(source, drag.handle, drag.stopId, drag.rect, { x: event.clientX - drag.rect.left - drag.pointerOffset.x, y: event.clientY - drag.rect.top - drag.pointerOffset.y });
    const position = changes.find(change => change.component === 'position')?.value;
    if (typeof position === 'number') drag.previousStopPosition = position;
    if (changes.length) this.options.preview(changes);
    this.refresh();
  }
  private end(event: PointerEvent): void {
    if (event.pointerId !== this.drag?.pointerId) return;
    this.refresh(); if (!this.drag) return;
    this.clearDrag();
    if (this.options.read().active !== false) this.options.commit();
    this.refresh();
  }
  private keyboard(event: KeyboardEvent, handle: GradientHandle): void {
    const view = this.options.read(); const gradient = view.gradient;
    if (!view.visible || !view.interactive || !gradient || !view.element || this.destroyed) return;
    const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!horizontal && !vertical) return;
    const step = event.shiftKey ? 10 : 1;
    const edit = (component: GradientEdit['component'], value: number): GradientEdit => ({ gradientId: gradient.id, component, value });
    let changes: readonly GradientEdit[];
    if (handle === 'stop') {
      const stop = gradient.stops.find(candidate => candidate.id === view.stopId && candidate.present); if (!stop) return;
      changes = [{ gradientId: gradient.id, stopId: stop.id, component: 'position', value: stop.position + (horizontal || -vertical) * step }];
    } else if (handle === 'center') changes = [edit(horizontal ? 'centerX' : 'centerY', (horizontal ? gradient.centerX : gradient.centerY) + (horizontal || vertical) * step)];
    else changes = [edit(handle, gradient[handle] + (horizontal || -vertical) * step)];
    event.preventDefault(); event.stopPropagation(); this.cancel(); this.options.begin();
    const current = this.options.read();
    if (current.active === false) return;
    if (!sameSelection(view, current)) { this.options.cancel(); this.refresh(); return; }
    this.options.preview(changes); if (this.options.read().active !== false) this.options.commit();
    this.refresh();
  }

  public refresh(): void {
    if (this.destroyed) return;
    const view = this.options.read(); const element = view.element; const gradient = view.gradient;
    const rect = element ? gradientElementArea(element) : null;
    if (this.drag) {
      if (view.active === false) this.clearDrag();
      else if (!view.visible || !view.interactive || !element || !gradient || !rect || this.drag.element !== element || this.drag.gradient.id !== gradient.id || this.drag.gradient.type !== gradient.type || this.drag.stopId !== view.stopId || !sameRect(this.drag.rect, rect)) { this.cancel(); return; }
    }
    this.root.hidden = !view.visible || !element || !gradient || !rect;
    if (!element || !gradient || !rect) return;
    Object.assign(this.root.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    this.placeHandles(gradient, view.stopId, rect, view.interactive);
    const center = gradient.type === 'linear' ? { x: rect.width / 2, y: rect.height / 2 } : { x: gradient.centerX * rect.width / 100, y: gradient.centerY * rect.height / 100 };
    const point = gradientHandlePoint(gradient, 'stop', view.stopId, rect);
    this.line.setAttribute('x1', String(center.x)); this.line.setAttribute('y1', String(center.y));
    this.line.setAttribute('x2', String(point?.x ?? center.x)); this.line.setAttribute('y2', String(point?.y ?? center.y));
  }
  private placeHandles(gradient: GradientDefinition, stopId: string | null, area: GradientArea, interactive: boolean): void {
    const occupied: GradientPoint[] = [];
    const order = this.drag ? [this.drag.handle, ...HANDLE_ORDER.filter(handle => handle !== this.drag?.handle)] : HANDLE_ORDER;
    this.handleOffsets.clear(); this.connectors.replaceChildren();
    for (const kind of order) {
      const button = this.handles.get(kind); if (!button) continue;
      const point = gradientHandlePoint(gradient, kind, stopId, area); button.hidden = point === null; button.disabled = !interactive;
      if (!point) continue;
      const offset = this.drag?.handle === kind ? this.drag.visualOffset : separatedOffset(point, occupied);
      this.handleOffsets.set(kind, offset);
      const placed = { x: point.x + offset.x, y: point.y + offset.y }; occupied.push(placed);
      Object.assign(button.style, { left: `${placed.x}px`, top: `${placed.y}px` });
      if (offset.x || offset.y) this.connect(point, placed);
    }
  }
  private connect(source: GradientPoint, handle: GradientPoint): void {
    const document = this.root.ownerDocument; const line = document.createElementNS(SVG_NAMESPACE, 'line'); line.classList.add('gradient-handle-connector');
    line.setAttribute('x1', String(source.x)); line.setAttribute('y1', String(source.y)); line.setAttribute('x2', String(handle.x)); line.setAttribute('y2', String(handle.y));
    const pin = document.createElementNS(SVG_NAMESPACE, 'circle'); pin.classList.add('gradient-handle-pin');
    pin.setAttribute('cx', String(source.x)); pin.setAttribute('cy', String(source.y)); pin.setAttribute('r', '2.5'); this.connectors.append(line, pin);
  }
  public destroy(): void {
    if (this.destroyed) return; this.destroyed = true;
    if (this.clearDrag()) this.options.cancel();
    this.abort.abort(); this.root.remove();
  }
}
