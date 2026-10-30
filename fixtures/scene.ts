// fixtures/scene.ts
/** Shared acceptance scene: one divergent base margin, common base opacity. */
export function createScene(document: Document): HTMLElement {
  const root = document.createElement('section');
  root.className = 'example-scene'; root.setAttribute('aria-label', 'Scène de démonstration');
  const heading = document.createElement('h2'); heading.textContent = 'Un même groupe. Une exception.';
  const paragraph = document.createElement('p'); paragraph.textContent = 'Quatre boutons partagent leur apparence. Le deuxième possède sa propre opacité.';
  const group = document.createElement('div'); group.className = 'button-group';
  for (let index = 1; index <= 4; index++) {
    const button = document.createElement('button');
    button.id = `button-${index}`; button.className = 'button'; button.textContent = `Bouton ${index}`;
    button.style.opacity = '1'; button.style.marginTop = index === 4 ? '12px' : '0px';
    group.append(button);
  }
  const note = document.createElement('p'); note.className = 'scene-note'; note.textContent = 'Le quatrième bouton a une marge différente dans le document d’origine.';
  root.append(heading, paragraph, group, note); return root;
}
