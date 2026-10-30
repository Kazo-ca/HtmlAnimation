// fixtures/geometry-scene.ts
/** Shared spatial fixture; temporal values still come only from the recorded fake. */
export type GeometrySceneVariant = 'basic' | 'percentage' | 'css-transform' | 'nested-transform' | 'initial-transform' | 'variable-identity';
export function createGeometryScene(document: Document, expression = false, variant: GeometrySceneVariant = 'basic'): HTMLElement {
  const scene = document.createElement('section'); scene.className = 'geometry-scene'; scene.setAttribute('aria-label', 'Scène géométrique');
  const heading = document.createElement('h2'); heading.textContent = expression ? 'Une expression à conserver.' : 'Du geste à la propriété.';
  const hint = document.createElement('p'); hint.textContent = expression ? 'La largeur utilise calc(). Sa conversion doit être acceptée avant toute modification.' : 'Choisissez un outil dans Géométrie, puis faites glisser sa poignée. Échap annule ; une annulation restaure tout le geste.';
  const board = document.createElement('div'); board.className = 'geometry-board';
  const box = document.createElement('div'); box.id = 'geometry-box'; box.className = 'geometry-subject'; box.textContent = 'Élément à manipuler';
  Object.assign(box.style, { position: 'absolute', left: '40px', top: '80px', width: expression ? 'calc(50% - 10px)' : '160px', height: '96px', transformOrigin: '50% 50%', boxSizing: 'border-box' });
  const peer = document.createElement('div'); peer.className = 'geometry-peer'; peer.textContent = 'Repère';
  Object.assign(peer.style, { position: 'absolute', right: '24px', top: '200px', width: '96px', height: '64px' });
  if (variant === 'percentage') {
    const wrapper = document.createElement('div'); wrapper.style.width = '200px'; wrapper.style.height = '160px';
    box.style.width = '50%'; wrapper.append(box); board.append(wrapper);
    hint.textContent = 'La largeur en % dépend du bloc positionné, au-delà du parent statique de 200 px.';
  } else board.append(box);
  if (variant === 'css-transform' || variant === 'nested-transform') {
    const style = document.createElement('style'); box.style.width = '200px';
    style.textContent = variant === 'css-transform' ? '#geometry-box { transform: translateX(10%); }' : '#geometry-box { transform: translateX(10px); &.geometry-subject { transform: translateX(10%); } }';
    scene.append(style); hint.textContent = variant === 'css-transform' ? 'La translation de source reste relative à la largeur. Les poignées Dimensions sont désactivées dans ce contexte ; la saisie CSS reste disponible.' : 'La cascade imbriquée exige un accord explicite avant sa copie en matrice de pixels.';
  }
  if (variant === 'initial-transform') { box.style.transform = 'initial'; hint.textContent = 'Une transformation initiale doit conserver le comportement d’identité.'; }
  if (variant === 'variable-identity') { box.style.transform = 'var(--source-transform)'; box.style.setProperty('--source-transform', 'none'); hint.textContent = 'La variable de transformation vaut none ; les réglages géométriques restent indépendants.'; }
  board.append(peer); scene.append(heading, hint, board); return scene;
}
