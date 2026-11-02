// fixtures/gradient-scene.ts
import { gradientCss } from '@kazo-ca/css-properties';
import type { GradientDefinition, GradientType } from '@kazo-ca/css-properties';

export function gradientFixtureDefinition(type: GradientType = 'linear'): GradientDefinition {
  return { id: 'main', cssName: 'background-image', type, angle: 90, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, stops: [
    { id: 'first', color: { kind: 'color', r: 0.12, g: 0.38, b: 0.3, a: 1 }, opacity: 1, position: 0, present: true },
    { id: 'middle', color: { kind: 'color', r: 0.95, g: 0.7, b: 0.25, a: 1 }, opacity: 1, position: 50, present: true },
    { id: 'last', color: { kind: 'color', r: 0.2, g: 0.35, b: 0.7, a: 1 }, opacity: 1, position: 100, present: true },
  ] };
}
/** Host-provided initial structure; no arbitrary CSS parsing or Timeline dependency. */
export function createGradientScene(document: Document, type: GradientType = 'linear'): HTMLElement {
  const scene = document.createElement('section'); scene.className = 'gradient-scene'; scene.setAttribute('aria-label', 'Scène de dégradé');
  const heading = document.createElement('h2'); heading.textContent = 'Chaque point garde son identité.';
  const paragraph = document.createElement('p'); paragraph.textContent = 'Sélectionnez un point, modifiez sa couleur ou son opacité, puis annulez. Les poignées et le panneau suivent le même dégradé.';
  const board = document.createElement('div'); board.className = 'gradient-board';
  const subject = document.createElement('div'); subject.id = 'gradient-box'; subject.className = 'gradient-subject'; subject.textContent = 'Dégradé structuré';
  Object.assign(subject.style, { width: '300px', height: '180px', maxWidth: '100%', backgroundImage: gradientCss(gradientFixtureDefinition(type)), backgroundOrigin: 'border-box' });
  const peer = document.createElement('div'); peer.id = 'gradient-peer'; peer.className = 'gradient-subject'; peer.textContent = 'Témoin sans piste';
  Object.assign(peer.style, { width: '120px', height: '72px', maxWidth: '100%', backgroundImage: subject.style.backgroundImage });
  board.append(subject, peer); scene.append(heading, paragraph, board); return scene;
}
