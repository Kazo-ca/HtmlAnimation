// packages/designer/src/manipulation-marker.ts
/** Every temporary manipulation class starts with this prefix, so a sweep can find all of them. */
export const manipulationClassPrefix = 'html-designer-manipulating-';
let sequence = 0;

interface MarkedElement { readonly element: Element; readonly original: string | null }

/**
 * Marks the elements of one canvas manipulation with a class unique to it. Removal restores
 * each element's exact original `class` attribute, including its absence, so the host HTML
 * is never altered irreversibly. The marker is never a document change or journal entry.
 */
export class ManipulationMarker {
  public readonly className = `${manipulationClassPrefix}${Date.now().toString(36)}-${++sequence}`;
  private readonly marked: readonly MarkedElement[];
  private released = false;

  public constructor(elements: readonly Element[]) {
    this.marked = elements.map(element => ({ element, original: element.getAttribute('class') }));
    for (const { element } of this.marked) element.classList.add(this.className);
  }
  /** Idempotent: restores the original attribute when only this marker was added. */
  public release(): void {
    if (this.released) return;
    this.released = true;
    for (const { element, original } of this.marked) {
      element.classList.remove(this.className);
      const remaining = element.getAttribute('class');
      const unchanged = (remaining ?? '').split(/\s+/).filter(Boolean).join(' ') === (original ?? '').split(/\s+/).filter(Boolean).join(' ');
      if (!unchanged) continue;
      if (original === null) element.removeAttribute('class'); else element.setAttribute('class', original);
    }
  }
}

/** Removes any leftover manipulation class under a root, for disposal and fault recovery. */
export function sweepManipulationMarkers(root: Element): void {
  for (const element of [root, ...root.querySelectorAll(`[class*="${manipulationClassPrefix}"]`)]) {
    const leftovers = [...element.classList].filter(name => name.startsWith(manipulationClassPrefix));
    if (!leftovers.length) continue;
    element.classList.remove(...leftovers);
    if (element.getAttribute('class') === '') element.removeAttribute('class');
  }
}
