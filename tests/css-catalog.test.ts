// tests/css-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { CSS_CATALOG_REVISION, getCssPropertyMetadata, getCssPropertyNames } from '../packages/css-properties/src/catalog.js';

describe('versioned CSS property catalogue', () => {
  it('resolves property aliases and value types for logical border styles', () => {
    const metadata = getCssPropertyMetadata('border-block-start-style');
    expect(metadata.known).toBe(true);
    expect(metadata.types).toContain('line-style');
    expect(metadata.keywords).toEqual(expect.arrayContaining(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'inherit', 'initial', 'revert', 'revert-layer', 'unset']));
    expect(metadata.keywords).not.toContain('line-style');
    expect(metadata.editor).toBe('keyword');
  });

  it('provides deterministic unique names covering every concrete MDN property', () => {
    const names = getCssPropertyNames();
    expect(CSS_CATALOG_REVISION).toBe('mdn-data@2.37.2');
    expect(names).toHaveLength(671);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort());
    expect(names).toEqual(expect.arrayContaining(['background', 'font', 'border', 'border-block-start-style', 'grid-template-columns']));
    expect(names).not.toContain('--*');
    for (const name of names) expect(getCssPropertyMetadata(name).known).toBe(true);
  });

  it.each([
    ['width', 'dimension'], ['opacity', 'number'], ['color', 'color'], ['margin', 'box'],
    ['padding-inline', 'box'], ['border', 'border'], ['border-radius', 'radius'],
    ['box-shadow', 'shadow'], ['text-shadow', 'shadow'], ['transform', 'transform'],
    ['filter', 'transform'], ['font', 'font'], ['font-family', 'font'], ['background', 'background'],
    ['background-image', 'gradient'],
  ])('selects the %s editor as %s', (name, editor) => {
    expect(getCssPropertyMetadata(name).editor).toBe(editor);
  });

  it('keeps remaining complex grammars in structured or list editors', () => {
    expect(['structured', 'list']).toContain(getCssPropertyMetadata('grid-template-columns').editor);
    expect(['structured', 'list']).toContain(getCssPropertyMetadata('animation').editor);
    expect(getCssPropertyMetadata('grid-template-columns').syntax).toContain('<track-list>');
  });

  it('preserves shorthand longhands for compatibility checks', () => {
    expect(getCssPropertyMetadata('margin').longhands).toEqual(['margin-bottom', 'margin-left', 'margin-right', 'margin-top']);
    expect(getCssPropertyMetadata('border-block-start').longhands).toEqual(expect.arrayContaining(['border-block-start-width', 'border-block-start-style', 'border-block-start-color']));
    expect(getCssPropertyMetadata('font').longhands).toContain('font-family');
  });

  it('does not leak range notation or empty function calls into selectable keywords', () => {
    const keywords = getCssPropertyMetadata('color').keywords;
    expect(keywords).toEqual(expect.arrayContaining(['currentColor', 'transparent']));
    expect(keywords.some(keyword => /[<>(),]|^\d/.test(keyword) || keyword.includes('[') || keyword.includes(']'))).toBe(false);
    expect(getCssPropertyMetadata('opacity').keywords).not.toContain('1');
  });

  it('normalizes standard property names while retaining unknown and custom properties', () => {
    expect(getCssPropertyMetadata(' BORDER-BLOCK-START-STYLE ').name).toBe('border-block-start-style');
    const custom = getCssPropertyMetadata('--Brand-Color');
    expect(custom).toMatchObject({ name: '--Brand-Color', known: false, editor: 'structured', syntax: '' });
    expect(getCssPropertyMetadata('future-css-property')).toMatchObject({ known: false, editor: 'structured' });
    expect(getCssPropertyMetadata('__proto__').known).toBe(false);
  });

  it('returns immutable cached metadata without exposing mutable data arrays', () => {
    const metadata = getCssPropertyMetadata('border-block-start-style');
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.keywords)).toBe(true);
    expect(Object.isFrozen(metadata.types)).toBe(true);
    expect(Object.isFrozen(metadata.longhands)).toBe(true);
    expect(Object.isFrozen(getCssPropertyNames())).toBe(true);
    expect(getCssPropertyMetadata('border-block-start-style')).toBe(metadata);
  });

  it('keeps the generated catalogue and coverage report reproducible', () => {
    expect(execFileSync(process.execPath, ['scripts/generate-css-catalog.mjs', '--check'], { encoding: 'utf8' })).toContain('up to date');
  });
});
