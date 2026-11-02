// fixtures/conflict-scene.ts
import { createScene } from './scene.js';

/** Same scene in demo and integration/browser tests, with deliberate class overlap. */
export function createConflictScene(document: Document): HTMLElement {
  const scene = createScene(document);
  const buttons = scene.querySelectorAll('button');
  for (const [index, button] of buttons.entries()) {
    if (index < 3) button.classList.add('tone');
    if (index < 2 || index === 3) button.classList.add('accent');
  }
  const heading = scene.querySelector('h2'); if (heading) heading.textContent = 'Choisir une priorité';
  return scene;
}
