// packages/css-properties/src/catalog.ts
import { CSS_CATALOG_DATA, CSS_KEYWORD_SETS, CSS_TYPE_SETS, GENERATED_CATALOG_REVISION } from './generated/css-catalog-data.js';

export type CssEditorKind = 'text' | 'keyword' | 'number' | 'dimension' | 'color' | 'box' | 'border' | 'radius' | 'shadow' | 'gradient' | 'transform' | 'font' | 'background' | 'list' | 'structured';

export interface CssPropertyMetadata {
  readonly name: string;
  readonly known: boolean;
  readonly syntax: string;
  readonly keywords: readonly string[];
  readonly types: readonly string[];
  readonly longhands: readonly string[];
  readonly editor: CssEditorKind;
}

export const CSS_CATALOG_REVISION: string = GENERATED_CATALOG_REVISION;
const propertyNames = Object.freeze(Object.keys(CSS_CATALOG_DATA).sort());
const globalKeywords = Object.freeze(['inherit', 'initial', 'revert', 'revert-layer', 'unset']);
const empty: readonly string[] = Object.freeze([]);
const cache = new Map<string, CssPropertyMetadata>();

/** All concrete names in the pinned data source; browser support is a separate concern. */
export function getCssPropertyNames(): readonly string[] { return propertyNames; }

/** Grammar-derived assistance without constraining unknown, custom or future CSS values. */
export function getCssPropertyMetadata(property: string): CssPropertyMetadata {
  const trimmed = property.trim(); const name = trimmed.startsWith('--') ? trimmed : trimmed.toLowerCase();
  const cached = cache.get(name); if (cached) return cached;
  const data = Object.hasOwn(CSS_CATALOG_DATA, name) ? CSS_CATALOG_DATA[name] : undefined;
  if (!data) return Object.freeze({ name, known: false, syntax: '', keywords: globalKeywords, types: empty, longhands: empty, editor: 'structured' });
  const metadata: CssPropertyMetadata = Object.freeze({
    name, known: true, syntax: data[0], keywords: Object.freeze(CSS_KEYWORD_SETS[data[1]] ?? []),
    types: Object.freeze(CSS_TYPE_SETS[data[2]] ?? []), longhands: Object.freeze(data[3]), editor: data[4],
  });
  cache.set(name, metadata); return metadata;
}
