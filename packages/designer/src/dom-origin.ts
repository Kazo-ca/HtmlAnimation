// packages/designer/src/dom-origin.ts
import { authoredStyles } from './authored-styles.js';
interface Origin { readonly values: ReadonlyMap<string, string>; readonly authored: ReadonlyMap<string, string>; readonly xpath: string }
interface Preview { readonly original: string | null; current: string | null; readonly properties: Map<string, { readonly value: string; readonly priority: string; readonly preview: string }> }

export function fullXPath(element: Element): string {
  const parent = element.parentElement;
  const tag = element.localName;
  if (!parent) return `/${tag}`;
  const siblings = Array.from(parent.children).filter(sibling => sibling.localName === tag);
  const index = siblings.indexOf(element) + 1;
  return `${fullXPath(parent)}/${tag}${siblings.length > 1 ? `[${index}]` : ''}`;
}

/** Captured before the first preview; host coordinates external DOM/CSS changes. */
export class DomOrigin {
  private readonly origins = new Map<HTMLElement, Origin>();
  private readonly previews = new Map<HTMLElement, Preview>();
  public constructor(scene: HTMLElement) {
    for (const element of [scene, ...Array.from(scene.querySelectorAll<HTMLElement>('*'))]) {
      const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
      const values = new Map<string, string>();
      if (computed) for (let index = 0; index < computed.length; index++) {
        const name = computed.item(index); values.set(name, computed.getPropertyValue(name));
      }
      const authored = authoredStyles(element);
      this.origins.set(element, { values, authored, xpath: fullXPath(element) });
    }
  }
  public has(element: HTMLElement): boolean { return this.origins.has(element); }
  public value(element: HTMLElement, property: string): string { return this.origins.get(element)?.values.get(property) ?? ''; }
  public authoredValue(element: HTMLElement, property: string): string { return this.origins.get(element)?.authored.get(property) ?? ''; }
  public properties(element: HTMLElement): readonly string[] { return [...(this.origins.get(element)?.values.keys() ?? [])]; }
  public xpath(element: HTMLElement): string { return this.origins.get(element)?.xpath ?? ''; }
  public applyPreview(element: HTMLElement, property: string, value: string): void {
    const preview = this.previews.get(element) ?? { original: element.getAttribute('style'), current: null, properties: new Map() };
    const original = preview.properties.get(property) ?? { value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property), preview: value };
    element.style.setProperty(property, value, 'important');
    preview.properties.set(property, { ...original, preview: element.style.getPropertyValue(property) });
    preview.current = element.getAttribute('style'); this.previews.set(element, preview);
  }
  public restore(): void {
    for (const [element, preview] of this.previews) {
      if (element.getAttribute('style') === preview.current) {
        if (preview.original === null) element.removeAttribute('style'); else element.setAttribute('style', preview.original);
        continue;
      }
      for (const [property, original] of preview.properties) {
        if (element.style.getPropertyValue(property) !== original.preview || element.style.getPropertyPriority(property) !== 'important') continue;
        if (original.value) element.style.setProperty(property, original.value, original.priority); else element.style.removeProperty(property);
      }
      if (!element.style.length && preview.original === null) element.removeAttribute('style');
    }
    this.previews.clear();
  }
}
