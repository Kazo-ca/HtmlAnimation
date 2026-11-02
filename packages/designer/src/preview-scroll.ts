// packages/designer/src/preview-scroll.ts
/** Keep host scroll positions across the temporary base-style reads of a preview. */
export function capturePreviewScroll(roots: readonly HTMLElement[]): () => boolean {
  const positions = new Map<Element, { readonly left: number; readonly top: number }>();
  for (const root of roots) {
    for (let element: Element | null = root; element; element = element.parentElement) {
      if (!positions.has(element)) positions.set(element, { left: element.scrollLeft, top: element.scrollTop });
    }
    const viewport = root.ownerDocument.scrollingElement;
    if (viewport && !positions.has(viewport)) positions.set(viewport, { left: viewport.scrollLeft, top: viewport.scrollTop });
  }
  return () => {
    let changed = false;
    for (const [element, position] of positions) {
      if (element.scrollLeft === position.left && element.scrollTop === position.top) continue;
      if (typeof element.scrollTo === 'function') element.scrollTo({ left: position.left, top: position.top, behavior: 'instant' });
      else { element.scrollLeft = position.left; element.scrollTop = position.top; }
      changed = true;
    }
    return changed;
  };
}
