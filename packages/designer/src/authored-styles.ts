// packages/designer/src/authored-styles.ts
/** Conservatively recover source syntax; ambiguous/inaccessible cascades stay unknown. */
const spatialProperties = ['width', 'height', 'transform', 'transform-origin'] as const;
export function authoredStyles(element: HTMLElement): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < element.style.length; index++) {
    const name = element.style.item(index); values.set(name, element.style.getPropertyValue(name));
  }
  // WebKit may enumerate origin longhands instead of the authored shorthand.
  for (const property of spatialProperties) {
    const value = element.style.getPropertyValue(property) || (property === 'transform-origin' ? element.style.transformOrigin : '');
    if (value) values.set(property, value);
  }
  const candidates = new Map<string, { value: string; important: boolean }[]>();
  let unknown = false;
  const collect = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (typeof CSSStyleRule !== 'undefined' && rule instanceof CSSStyleRule) {
        // Native CSS nesting can override the outer declaration or target descendants.
        if ('cssRules' in rule && rule.cssRules.length > 0) unknown = true;
        try {
          if (!element.matches(rule.selectorText)) continue;
          for (const property of spatialProperties) {
            const value = rule.style.getPropertyValue(property) || (property === 'transform-origin' ? rule.style.transformOrigin : '');
            if (value) candidates.set(property, [...(candidates.get(property) ?? []), { value, important: rule.style.getPropertyPriority(property) === 'important' }]);
          }
        } catch { unknown = true; }
      } else if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
        const match = element.ownerDocument.defaultView?.matchMedia?.(rule.conditionText);
        if (!match) unknown = true; else if (match.matches) collect(rule.cssRules);
      } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
        if (typeof CSS === 'undefined' || !CSS.supports) unknown = true; else if (CSS.supports(rule.conditionText)) collect(rule.cssRules);
      } else if ('cssRules' in rule) {
        // Conditional groups such as container/scope require unavailable cascade context.
        if (rule.constructor.name === 'CSSLayerBlockRule') collect((rule as CSSGroupingRule).cssRules); else if (rule.type !== CSSRule.KEYFRAMES_RULE) unknown = true;
      } else if (rule.type === CSSRule.IMPORT_RULE) unknown = true;
    }
  };
  for (const sheet of Array.from(element.ownerDocument.styleSheets)) {
    if (sheet.disabled) continue;
    if (sheet.media?.mediaText) {
      const match = element.ownerDocument.defaultView?.matchMedia?.(sheet.media.mediaText);
      if (!match) { unknown = true; continue; }
      if (!match.matches) continue;
    }
    try { collect(sheet.cssRules); } catch { unknown = true; }
  }
  for (const property of spatialProperties) {
    const inline = element.style.getPropertyValue(property) || (property === 'transform-origin' ? element.style.transformOrigin : '');
    if (inline && element.style.getPropertyPriority(property) === 'important') continue;
    const declarations = candidates.get(property) ?? [];
    const important = declarations.filter(declaration => declaration.important);
    if (unknown) { values.delete(property); continue; }
    if (inline && !important.length) continue;
    const possible = new Set((important.length ? important : declarations).map(declaration => declaration.value));
    if (possible.size === 1) values.set(property, [...possible][0] ?? ''); else values.delete(property);
  }
  return values;
}
