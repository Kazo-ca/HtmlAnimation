// demo/timeline-real.ts
import { HtmlDesigner } from '@kazo-ca/html-designer';
import type { GradientType } from '@kazo-ca/css-properties';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';
import type { RealGradientHost } from '../integration/timeline-real.js';
import provenance from '../vendor/timeline/manifest.json';
import '@kazo-ca/timeline-editor/timeline-editor.css';
import './styles.less';

function required<T extends HTMLElement>(id: string): T { const node = document.getElementById(id); if (!node) throw new Error(`Conteneur absent : ${id}`); return node as T; }
const sceneContainer = required('real-scene'); const editorContainer = required('real-timeline'); const eventLog = required('real-events');
const undo = required<HTMLButtonElement>('real-undo'); const redo = required<HTMLButtonElement>('real-redo'); const frame = required<HTMLInputElement>('real-frame');
let host: RealGradientHost | undefined; let designer: HtmlDesigner | undefined; let unsubscribe: (() => void) | undefined;
required('real-reference').textContent = provenance.reference;
function update(): void {
  if (!host) return;
  const state = host.adapter.getState(); const faulted = (designer?.getFault() ?? null) !== null; undo.disabled = faulted || !state.canUndo; redo.disabled = faulted || !state.canRedo; frame.value = String(state.frame);
  const count = host.editor.document.layers.reduce((sum, layer) => sum + (layer.type === 'layer' ? Object.values(layer.propertyTimelines ?? {}).reduce((total, track) => total + track.keys.length, 0) : 0), 0);
  required('real-key-count').textContent = `${count} clés · packages réels`;
  required('real-document').textContent = JSON.stringify({ timeline: host.editor.document, html: host.stage.animationContext }, null, 2);
}
function mount(type: GradientType): void {
  unsubscribe?.(); designer?.dispose(); host?.dispose(); editorContainer.replaceChildren();
  const scene = createGradientScene(document, type); sceneContainer.replaceChildren(scene);
  host = createRealGradientHost(editorContainer, scene, type);
  designer = new HtmlDesigner({ scene, propertiesContainer: required('real-properties'), treeContainer: required('real-tree'), timeline: host.editor, adapter: () => { if (!host) throw new Error('Hôte réel absent.'); return host.adapter; } });
  designer.on('propertychange', change => { eventLog.textContent = `Propriété enregistrée : ${change.property} · ${change.oldValue} → ${change.newValue} · image ${change.frame}`; update(); });
  designer.on('documentchange', change => { eventLog.textContent = `Document original modifié · ${change.direction}`; });
  designer.on('gradientchange', change => { eventLog.textContent = `Structure du dégradé · ${change.direction} · identités conservées`; update(); });
  designer.on('fault', change => { undo.disabled = true; redo.disabled = true; eventLog.textContent = change.message; });
  designer.on('diagnostic', change => { eventLog.textContent = change.message; });
  unsubscribe = host.adapter.onChange(update); designer.selectTarget('#gradient-box'); update();
  eventLog.textContent = 'Moteur réel prêt · composants indépendants et historique Timeline. Aucun résultat de simulation affiché ici.';
}
required('real-load').addEventListener('click', () => { const value = required<HTMLSelectElement>('real-type').value; mount(value === 'radial' || value === 'conic' ? value : 'linear'); });
required('real-seek').addEventListener('click', () => { const value = Number(frame.value); if (Number.isInteger(value) && value >= 1 && value <= 100) { host?.navigate(value); update(); } else eventLog.textContent = 'Choisissez une image entière de 1 à 100.'; });
undo.addEventListener('click', () => { designer?.undo(); update(); }); redo.addEventListener('click', () => { designer?.redo(); update(); });
let previous = performance.now();
function tick(now: number): void { host?.advance(Math.min(now - previous, 100)); previous = now; requestAnimationFrame(tick); }
window.addEventListener('pagehide', () => { unsubscribe?.(); designer?.dispose(); host?.dispose(); });
mount('linear'); requestAnimationFrame(tick);
