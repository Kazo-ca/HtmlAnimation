// demo/main.ts
import { HtmlDesigner } from '@kazo-ca/html-designer';
import { createScene } from '../fixtures/scene.js';
import { createRecordedTimeline } from '../fixtures/recorded-timeline.js';
import { createGeometryScene } from '../fixtures/geometry-scene.js';
import { createCssScene } from '../fixtures/css-scene.js';
import { createConflictScene } from '../fixtures/conflict-scene.js';
import { createConflictTimeline } from '../fixtures/conflict-timeline.js';
import type { ConflictTimeline, ConflictVariant } from '../fixtures/conflict-timeline.js';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createGradientTimeline } from '../fixtures/gradient-timeline.js';
import type { GradientTimeline } from '../fixtures/gradient-timeline.js';
import type { GradientType } from '@kazo-ca/css-properties';
import type { GeometrySceneVariant } from '../fixtures/geometry-scene.js';
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
let conflictTimeline: ConflictTimeline | undefined;
let gradientTimeline: GradientTimeline | undefined;
let designer: HtmlDesigner<typeof timeline>;
let unsubscribe: (() => void) | undefined;
function mount(reference: boolean, geometry: 'none' | 'plain' | 'expression' | 'css' | 'conflict' | 'gradient' = 'none', variant: GeometrySceneVariant = 'basic', conflictVariant: ConflictVariant = 'priority', gradientType: GradientType = 'linear'): void {
  unsubscribe?.(); designer?.dispose();
  conflictTimeline = geometry === 'conflict' ? createConflictTimeline(conflictVariant) : undefined;
  gradientTimeline = geometry === 'gradient' ? createGradientTimeline(gradientType) : undefined;
  timeline = gradientTimeline ?? conflictTimeline ?? createRecordedTimeline({ reference });
  required('#invalidate-conflict').hidden = geometry !== 'conflict' || conflictVariant !== 'stale';
  const scene = geometry === 'gradient' ? createGradientScene(document, gradientType) : geometry === 'conflict' ? createConflictScene(document) : geometry === 'css' ? createCssScene(document) : geometry === 'none' ? createScene(document) : createGeometryScene(document, geometry === 'expression', variant); sceneHost.replaceChildren(scene);
  designer = new HtmlDesigner({ scene, propertiesContainer, treeContainer, timeline, adapter: instance => instance });
  designer.on('propertychange', change => { log.textContent = `${change.property} : ${change.oldValue} → ${change.newValue} · image ${change.frame}`; });
  designer.on('documentchange', change => { log.textContent = `Document original : ${change.changes.length} modification(s) persistante(s) · ${change.direction === 'undo' ? 'annulation' : change.direction === 'redo' ? 'rétablissement' : 'enregistrement'}`; });
  designer.on('resolutionchange', change => { log.textContent = `Résolutions du projet : ${change.resolutions.length} · ${change.direction === 'undo' ? 'annulation' : change.direction === 'redo' ? 'rétablissement' : 'enregistrement'}`; });
  designer.on('gradientchange', change => { log.textContent = `Structure de dégradé du projet · ${change.direction === 'undo' ? 'annulation' : change.direction === 'redo' ? 'rétablissement' : 'enregistrement'} · identités conservées`; });
  designer.on('diagnostic', event => { log.textContent = event.message; });
  designer.on('fault', event => { undo.disabled = true; redo.disabled = true; log.textContent = event.message; });
  designer.on('selectionchange', event => { log.textContent = `${event.elements.length} élément(s) sélectionné(s)${event.objectId ? ' · objet temporel associé' : ' · inspection seule'}`; });
  const update = (): void => {
    const state = timeline.getState(); undo.disabled = designer.getFault() !== null || !state.canUndo; redo.disabled = designer.getFault() !== null || !state.canRedo; frame.value = String(state.frame); keyCount.textContent = `${timeline.getKeys().length} clés · simulation`;
    const tracks = required('#gradient-tracks'); tracks.hidden = !gradientTimeline; tracks.replaceChildren();
    if (gradientTimeline) {
      const heading = document.createElement('h3'); heading.textContent = 'Dégradé · pistes enregistrées'; const list = document.createElement('ul');
      for (const track of gradientTimeline.gradients.read('gradient-object')?.tracks ?? []) {
        const item = document.createElement('li'); item.dataset.gradientComponent = track.component; if (track.stopId) item.dataset.gradientStopId = track.stopId;
        const frames = timeline.getKeys().filter(key => key.property === track.property).map(key => key.frame);
        item.textContent = `${track.stopId ? `Point ${track.stopId} · ` : ''}${track.component} · image(s) ${frames.join(', ')}`; list.append(item);
      }
      tracks.append(heading, list);
    }
  };
  unsubscribe = timeline.onChange(update); update();
  selectMode.setAttribute('aria-pressed', 'true'); testMode.setAttribute('aria-pressed', 'false');
  if (geometry === 'plain' || geometry === 'expression') designer.selectTarget('#geometry-box');
  if (geometry === 'css') designer.selectTarget('#css-box');
  if (geometry === 'gradient') designer.selectTarget('#gradient-box');
  required('#sample-description').textContent = geometry === 'gradient' ? 'Dégradé fourni par l’hôte, points stables et pistes indépendantes. Les échantillons sont enregistrés ; une édition simulée ne change que son image. Aucun maintien ni aucune interpolation n’est calculé ici.' : geometry === 'conflict' ? 'Contributions et diagnostic enregistrés aux images proposées. Le choix de priorité est conservé et annulable ; aucun moteur temporel n’est exécuté ici.' : 'Évaluations enregistrées du cas groupe/ID. L’édition simulée ne modifie que l’image courante. Aucune interpolation n’est exécutée ici.';
  log.textContent = geometry === 'gradient' ? 'Atelier des dégradés · couleur, opacité, position et présence ont leurs pistes propres.' : geometry === 'conflict' ? 'Atelier des conflits · inspectez le diagnostic puis confirmez un choix de priorité.' : geometry === 'css' ? 'Atelier CSS · suggestions et éditeurs · les brouillons ne créent aucune clé.' : geometry !== 'none' ? 'Atelier géométrique · cible #geometry-box fournie par l’hôte · aucune clé avant validation du geste.' : reference ? 'Cas de référence chargé · groupe 50 %, bouton 2 à 80 % dès l’image 1.' : 'Scène sans clés · sélectionnez un élément, modifiez une propriété puis choisissez sa cible.';
}
undo.addEventListener('click', () => designer.undo()); redo.addEventListener('click', () => designer.redo());
frame.addEventListener('change', () => timeline.navigate(Number(frame.value)));
required('#select-group').addEventListener('click', () => designer.selectTarget('.button'));
required('#select-specific').addEventListener('click', () => designer.selectTarget('#button-2'));
required('#fresh-scene').addEventListener('click', () => mount(false));
required('#geometry-scene').addEventListener('click', () => {
  const value = required<HTMLSelectElement>('#geometry-variant').value;
  const variant = value === 'percentage' || value === 'css-transform' || value === 'nested-transform' || value === 'initial-transform' || value === 'variable-identity' ? value : 'basic';
  mount(false, 'plain', variant);
});
required('#geometry-expression').addEventListener('click', () => mount(false, 'expression'));
required('#css-scene').addEventListener('click', () => mount(false, 'css'));
required('#conflict-scene').addEventListener('click', () => {
  const value = required<HTMLSelectElement>('#conflict-variant').value;
  mount(false, 'conflict', 'basic', value === 'start-key' || value === 'stale' ? value : 'priority');
});
required('#invalidate-conflict').addEventListener('click', () => { conflictTimeline?.invalidateContribution(); });
required('#gradient-scene').addEventListener('click', () => { const value = required<HTMLSelectElement>('#gradient-type').value; mount(false, 'gradient', 'basic', 'priority', value === 'radial' || value === 'conic' ? value : 'linear'); });
selectMode.addEventListener('click', () => { designer.setMode('select'); selectMode.setAttribute('aria-pressed', 'true'); testMode.setAttribute('aria-pressed', 'false'); });
testMode.addEventListener('click', () => { designer.setMode('test'); selectMode.setAttribute('aria-pressed', 'false'); testMode.setAttribute('aria-pressed', 'true'); log.textContent = 'Mode Test · les interactions du contenu sont actives.'; });
mount(true);
