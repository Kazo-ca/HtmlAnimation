// packages/css-properties/src/editors/css-value.ts
export type CssValueSeparator = ',' | '/' | 'space';

/** Split only at the current grammar level; retain quoted strings and nested syntax. */
export function splitCssValue(value: string, separator: CssValueSeparator): readonly string[] | null {
  const parts: string[] = []; const stack: string[] = []; let quote = ''; let comment = false; let start = 0;
  const flush = (end: number): void => { const part = value.slice(start, end).trim(); if (part) parts.push(part); };
  for (let index = 0; index < value.length; index++) {
    const char = value[index] ?? ''; const next = value[index + 1];
    if (comment) { if (char === '*' && next === '/') { comment = false; index++; } continue; }
    if (char === '\\') { if (index === value.length - 1) return null; index++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '/' && next === '*') { comment = true; index++; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[' || char === '{') { stack.push(char === '(' ? ')' : char === '[' ? ']' : '}'); continue; }
    if (char === ')' || char === ']' || char === '}') { if (stack.pop() !== char) return null; continue; }
    const delimiter = separator === 'space' ? /\s/.test(char) : char === separator;
    if (stack.length === 0 && delimiter) { flush(index); start = index + 1; }
  }
  if (quote || comment || stack.length) return null;
  flush(value.length); return parts;
}

export interface CssFunctionValue { readonly name: string; readonly args: readonly string[]; readonly separator: string }
export function readCssFunction(value: string): CssFunctionValue | null {
  const match = /^([-\w]+)\(([\s\S]*)\)$/.exec(value.trim());
  if (!match || !splitCssValue(value, 'space')) return null;
  const body = match[2] ?? ''; const commas = splitCssValue(body, ','); if (!commas) return null;
  const args = commas.length > 1 ? commas : splitCssValue(body, 'space');
  return args ? { name: match[1] ?? '', args, separator: commas.length > 1 ? ', ' : ' ' } : null;
}
export function writeCssFunction(value: CssFunctionValue): string { return `${value.name}(${value.args.join(value.separator)})`; }
export function replaceAt<T>(values: readonly T[], index: number, value: T): readonly T[] { return values.map((entry, current) => current === index ? value : entry); }
export function moveItem<T>(values: readonly T[], index: number, offset: number): readonly T[] {
  const next = index + offset; const item = values[index]; if (item === undefined || next < 0 || next >= values.length) return values;
  const result = values.filter((_, current) => current !== index); return [...result.slice(0, next), item, ...result.slice(next)];
}
export function boxValues(value: string): readonly [string, string, string, string] | null {
  const parts = splitCssValue(value, 'space'); if (!parts?.length || parts.length > 4) return null;
  const top = parts[0] ?? ''; const right = parts[1] ?? top; return [top, right, parts[2] ?? top, parts[3] ?? right];
}
export const CSS_LENGTH = /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:%|[a-z]+)?$/i;
