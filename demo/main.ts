// demo/main.ts
import { HtmlDesigner } from '@kazo-ca/html-designer';
import { createScene } from '../fixtures/scene.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import './styles.less';

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector); if (!element) throw new Error(`Élément absent : ${selector}`); return element;
}
const sceneHost = required('#scene-host');
const propertiesContainer = required('#properties');
const treeContainer = required('#tree');
const log = required<HTMLOutputElement>('#event-log');
const undo = required<HTMLButtonElement>('#undo');
const redo = required<HTMLButtonElement>('#redo');
const frame = required<HTMLSelectElement>('#frame');
const keyCount = required('#key-count');
const selectMode = required<HTMLButtonElement>('#select-mode');
const testMode = required<HTMLButtonElement>('#test-mode');
let timeline = createRecordedTimeline({ reference: true });
let designer: HtmlDesigner<typeof timeline>;
let unsubscribe: (() => void) | undefined;
function mount(reference: boolean): void {
  unsubscribe?.(); designer?.dispose();
  timeline = createRecordedTimeline({ reference });
  const scene = createScene(document); sceneHost.replaceChildren(scene);
  designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: instance => instance });
  designer.on('propertychange', change => { log.textContent = `${change.property} : ${change.oldValue} → ${change.newValue} · image ${change.frame}`; });
  designer.on('documentchange', change => { log.textContent = `Document original : ${change.changes.length} modification(s) persistante(s) · ${change.direction === 'undo' ? 'annulation' : change.direction === 'redo' ? 'rétablissement' : 'enregistrement'}`; });
  designer.on('diagnostic', event => { log.textContent = event.message; });
  designer.on('selectionchange', event => { log.textContent = `${event.elements.length} élément(s) sélectionné(s)${event.objectId ? ' · objet temporel associé' : ' · inspection seule'}`; });
  const update = (): void => {
    const state = timeline.getState(); undo.disabled = !state.canUndo; redo.disabled = !state.canRedo; frame.value = String(state.frame); keyCount.textContent = `${timeline.getKeys().length} clés · simulation`;
  };
  unsubscribe = timeline.onChange(update); update();
  selectMode.setAttribute('aria-pressed', 'true'); testMode.setAttribute('aria-pressed', 'false');
  if (reference) designer.selectTarget('.button');
  log.textContent = reference ? 'Cas de référence chargé · groupe 50 %, bouton 2 à 80 % dès l’image 1.' : 'Scène sans clés · sélectionnez un élément, modifiez une propriété puis choisissez sa cible.';
}
undo.addEventListener('click', () => designer.undo()); redo.addEventListener('click', () => designer.redo());
frame.addEventListener('change', () => timeline.navigate(Number(frame.value)));
required('#select-group').addEventListener('click', () => designer.selectTarget('.button'));
required('#select-specific').addEventListener('click', () => designer.selectTarget('#button-2'));
required('#fresh-scene').addEventListener('click', () => mount(false));
selectMode.addEventListener('click', () => { designer.setMode('select'); selectMode.setAttribute('aria-pressed', 'true'); testMode.setAttribute('aria-pressed', 'false'); });
testMode.addEventListener('click', () => { designer.setMode('test'); selectMode.setAttribute('aria-pressed', 'false'); testMode.setAttribute('aria-pressed', 'true'); log.textContent = 'Mode Test · les interactions du contenu sont actives.'; });
mount(true);
