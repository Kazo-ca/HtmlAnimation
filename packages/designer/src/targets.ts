// packages/designer/src/targets.ts
const identifier = '(?:--[-_\\p{L}\\p{N}]*|-?[_\\p{L}][-_\\p{L}\\p{N}]*)';
const idPattern = new RegExp(`^#${identifier}$`, 'u');
const classesPattern = new RegExp(`^(?:\\.${identifier})+$`, 'u');

/** r1 explicitly supports ID and compound class targets; broader CSS needs a parser. */
export function specificity(selector: string): number | null {
  if (idPattern.test(selector)) return 1_000;
  if (classesPattern.test(selector)) return selector.split('.').length - 1;
  return null;
}
export function resolveTarget(scene: HTMLElement, selector: string): readonly HTMLElement[] {
  if (specificity(selector) === null) return [];
  try { return [...(scene.matches(selector) ? [scene] : []), ...Array.from(scene.querySelectorAll<HTMLElement>(selector))]; }
  catch { return []; }
}
export function targetChoices(element: HTMLElement): readonly string[] {
  return [element.id ? `#${element.id}` : '', ...Array.from(element.classList, name => `.${name}`), element.classList.length > 1 ? `.${Array.from(element.classList).join('.')}` : '']
    .filter(choice => choice && specificity(choice) !== null);
}
