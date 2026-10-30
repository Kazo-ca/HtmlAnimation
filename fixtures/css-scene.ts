// fixtures/css-scene.ts
/** Source-only CSS examples shared by the demo and browser scenarios. */
export function createCssScene(document: Document): HTMLElement {
  const scene = document.createElement('section'); scene.className = 'css-editor-scene'; scene.setAttribute('aria-label', 'Scène des éditeurs CSS');
  const title = document.createElement('h2'); title.textContent = 'Une valeur, plusieurs façons de créer.';
  const hint = document.createElement('p'); hint.textContent = 'Recherchez border-block-start-style pour choisir une valeur. Les boutons ⋯ ouvrent les éditeurs ; Appliquer enregistre une seule commande annulable.';
  const board = document.createElement('div'); board.className = 'css-editor-board';
  for (const [id, text] of [['css-box', 'Votre élément'], ['css-peer', 'Le voisin reste intact']]) {
    const element = document.createElement('div'); element.id = id ?? ''; element.className = 'css-subject'; element.textContent = text ?? '';
    Object.assign(element.style, { width: '100%', minHeight: '140px', boxSizing: 'border-box', padding: '16px', color: 'rgb(20, 60, 45)', border: '1px solid rgb(180, 60, 30)', borderBlockStartStyle: 'solid', borderRadius: '12px 4px / 6px 10px', boxShadow: '2px 4px 6px rgba(0, 0, 0, 0.2)', backgroundImage: 'linear-gradient(90deg, rgba(210, 235, 220, 0.8) 0%, rgb(242, 233, 207) 100%)', font: 'italic 600 18px/1.5 Georgia, serif', transform: 'none' });
    board.append(element);
  }
  scene.append(title, hint, board); return scene;
}
