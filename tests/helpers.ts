// tests/helpers.ts
import { createScene } from '../fixtures/scene.js';

export interface SceneFixture {
  readonly scene: HTMLElement;
  readonly propertiesContainer: HTMLDivElement;
  readonly treeContainer: HTMLDivElement;
  readonly buttons: readonly [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
}

export function createSceneFixture(): SceneFixture {
  const scene = createScene(document);
  const propertiesContainer = document.createElement('div');
  const treeContainer = document.createElement('div');
  const [first, second, third, fourth] = scene.querySelectorAll<HTMLButtonElement>('button');
  if (!first || !second || !third || !fourth) throw new Error('Incomplete scene fixture');
  document.body.append(scene, propertiesContainer, treeContainer);
  return { scene, propertiesContainer, treeContainer, buttons: [first, second, third, fourth] };
}

export function propertyInput(container: HTMLElement, property: string): HTMLInputElement {
  const input = [...container.querySelectorAll<HTMLInputElement>('input[data-property]')]
    .find((candidate) => candidate.dataset.property === property);
  if (!input) throw new Error(`Missing property input: ${property}`);
  return input;
}
