// scripts/generate-css-catalog.mjs
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(workspace, 'node_modules/mdn-data');
const sourcePaths = ['package.json', 'css/properties.json', 'css/syntaxes.json', 'LICENSE'];
const sourceTexts = await Promise.all(sourcePaths.map(path => readFile(resolve(sourceRoot, path), 'utf8')));
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Only --check is supported.');
const check = process.argv.includes('--check');

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected an object: ${label}`);
  return value;
}
const pkg = record(JSON.parse(sourceTexts[0]), 'mdn-data/package.json');
const properties = record(JSON.parse(sourceTexts[1]), 'CSS properties');
const syntaxes = record(JSON.parse(sourceTexts[2]), 'CSS syntaxes');
if (pkg.version !== '2.37.2' || pkg.license !== 'CC0-1.0') throw new Error('This generator requires the reviewed mdn-data@2.37.2 (CC0-1.0) source.');
const revision = `mdn-data@${pkg.version}`;
const globalKeywords = ['inherit', 'initial', 'revert', 'revert-layer', 'unset'];
const names = Object.keys(properties).filter(name => name !== '--*').sort();
const keywordSets = []; const typeSets = [];
const keywordIndex = new Map(); const typeIndex = new Map();

function intern(values, sets, indices) {
  const key = JSON.stringify(values);
  if (!indices.has(key)) { indices.set(key, sets.length); sets.push(values); }
  return indices.get(key);
}

function grammar(syntax, state) {
  for (const reference of syntax.matchAll(/<([^>]+)>/g)) {
    const body = reference[1];
    const property = /^'([^']+)'$/.exec(body);
    const name = property ? property[1] : body.replace(/\s*\[.*$/, '').trim();
    const key = `${property ? 'property' : 'type'}:${name}`;
    if (!property) state.types.add(name);
    if (state.seen.has(key)) continue;
    state.seen.add(key);
    const definition = property ? properties[name] : syntaxes[name];
    if (definition && typeof definition.syntax === 'string') grammar(definition.syntax, state);
    else state.leaves.add(name);
  }
  const literals = syntax.replace(/<[^>]+>/g, ' ').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  for (const token of literals.matchAll(/[-_a-zA-Z][-_a-zA-Z0-9]*/g)) {
    if (/^\s*\(/.test(literals.slice(token.index + token[0].length))) continue;
    const canonical = token[0].toLowerCase();
    if (!state.keywords.has(canonical)) state.keywords.set(canonical, token[0]);
  }
}

function complexSyntax(syntax) {
  if (/\|\||&&|[#{}+*/]/.test(syntax)) return true;
  const skeleton = syntax.replace(/<[^>]+>/g, 'T').replace(/\[|\]|\?/g, '');
  return skeleton.split('|').some(alternative => alternative.trim().split(/\s+/).length > 1);
}

function editorFor(name, syntax, state) {
  const base = name.replace(/^-(?:webkit|moz|ms|o)-/, '');
  if (/(?:^|-)shadow$/.test(base)) return 'shadow';
  if (['transform', 'translate', 'rotate', 'scale', 'filter', 'backdrop-filter'].includes(base)) return 'transform';
  if (/(?:^|-)radius$/.test(base)) return 'radius';
  if (/^(?:border(?:-(?:top|right|bottom|left|block(?:-start|-end)?|inline(?:-start|-end)?))?|outline|column-rule)$/.test(base)) return 'border';
  if (/^(?:margin|padding|inset)(?:-(?:block|inline))?$/.test(base) || /^(?:border-(?:block-|inline-)?(?:color|style|width)|gap|border-spacing|place-content|place-items|place-self|transform-origin|perspective-origin)$/.test(base)) return 'box';
  if (base === 'color' || base.endsWith('-color') || syntax.trim() === '<color>') return 'color';
  if (['background-image', 'mask-image', 'mask-border-source', 'border-image-source'].includes(base)) return 'gradient';
  if (base === 'background' || base.startsWith('background-') || base === 'mask') return 'background';
  if (base === 'font' || base === 'font-family') return 'font';
  if (/^(?:opacity|.*-opacity|flex-grow|flex-shrink|order|z-index|orphans|widows|font-weight)$/.test(base)) return 'number';
  if (/^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|top|right|bottom|left|inset-(?:block|inline)-(?:start|end)|margin-.+|padding-.+|border-.+-width|outline-width|outline-offset|font-size|line-height|letter-spacing|word-spacing|text-indent|perspective|(?:row|column)-gap)$/.test(base)) return 'dimension';
  const complex = complexSyntax(syntax);
  if (!complex && state.leaves.size === 0) return 'keyword';
  const leaves = [...state.leaves];
  if (!complex && leaves.length && leaves.every(type => ['number', 'integer', 'percentage'].includes(type))) return 'number';
  if (!complex && leaves.length && leaves.every(type => ['length', 'percentage', 'number', 'integer', 'angle', 'time', 'resolution', 'flex'].includes(type))) return 'dimension';
  if (/#/.test(syntax) || /<(?:[^>]*-)?list>/.test(syntax)) return 'list';
  return 'structured';
}

const entries = names.map(name => {
  const property = record(properties[name], name);
  if (typeof property.syntax !== 'string') throw new Error(`Missing CSS syntax for ${name}.`);
  const state = { seen: new Set([`property:${name}`]), keywords: new Map(), types: new Set(), leaves: new Set() };
  grammar(property.syntax, state);
  const keywords = [...state.keywords.values()].filter(keyword => !globalKeywords.includes(keyword.toLowerCase())).sort();
  keywords.push(...globalKeywords);
  const types = [...state.types].sort();
  const longhands = [...new Set([...(Array.isArray(property.computed) ? property.computed : []), ...(Array.isArray(property.initial) ? property.initial : [])])]
    .filter(value => typeof value === 'string' && Object.hasOwn(properties, value) && value !== name).sort();
  const editor = editorFor(name, property.syntax, state);
  return { name, syntax: property.syntax, keywords, types, longhands, editor, status: property.status ?? 'unknown' };
});

const dataLines = entries.map(entry => {
  const tuple = [entry.syntax, intern(entry.keywords, keywordSets, keywordIndex), intern(entry.types, typeSets, typeIndex), entry.longhands, entry.editor];
  return `  ${JSON.stringify(entry.name)}: ${JSON.stringify(tuple)},`;
});
const generated = `// packages/css-properties/src/generated/css-catalog-data.ts
// Generated by scripts/generate-css-catalog.mjs; do not edit by hand.
// CSS data: ${revision}, Mozilla Developer Network, CC0-1.0.
// Source: https://github.com/mdn/data (npm package revision above).
import type { CssEditorKind } from '../catalog.js';

type CatalogData = readonly [syntax: string, keywordSet: number, typeSet: number, longhands: readonly string[], editor: CssEditorKind];
export const GENERATED_CATALOG_REVISION = ${JSON.stringify(revision)};
export const CSS_KEYWORD_SETS: readonly (readonly string[])[] = ${JSON.stringify(keywordSets)};
export const CSS_TYPE_SETS: readonly (readonly string[])[] = ${JSON.stringify(typeSets)};
export const CSS_CATALOG_DATA: Readonly<Record<string, CatalogData>> = {
${dataLines.join('\n')}
};
`;
const counts = {};
for (const entry of entries) counts[entry.editor] = (counts[entry.editor] ?? 0) + 1;
const report = {
  revision, generator: 'scripts/generate-css-catalog.mjs', generatorRevision: 1,
  provenance: { package: 'mdn-data', version: pkg.version, license: pkg.license, repository: 'https://github.com/mdn/data',
    files: Object.fromEntries(sourcePaths.map((path, index) => [path, { sha256: createHash('sha256').update(sourceTexts[index]).digest('hex') }])) },
  sourcePropertyCount: Object.keys(properties).length, propertyCount: entries.length, excludedWildcard: '--*',
  keywordScope: 'Literal grammar tokens plus global CSS keywords. Function placeholders and numerical range notation are excluded. Tokens from compound grammars may need browser validation before being used as a complete value.',
  fallback: 'Unknown/custom properties use a structured editor and retain free CSS input. This catalogue is not a browser support, interpolation or export capability claim.',
  counts,
  properties: entries.map(({ name, syntax, keywords, types, longhands, editor, status }) => ({ name, syntax, editor, keywordCount: keywords.length, types, longhands, status })),
};
const outputs = [
  ['packages/css-properties/src/generated/css-catalog-data.ts', generated],
  ['doc/implementation/css-catalog-coverage.json', `${JSON.stringify(report, null, 2)}\n`],
];
for (const [path, content] of outputs) {
  const target = resolve(workspace, path);
  if (check) {
    const actual = await readFile(target, 'utf8').catch(() => '');
    if (actual.replace(/\r\n/g, '\n') !== content) throw new Error(`${path} is stale; run node scripts/generate-css-catalog.mjs.`);
  } else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, content); }
}
process.stdout.write(check ? `CSS catalogue ${revision}: up to date (${entries.length} properties).\n` : `Generated CSS catalogue ${revision}: ${entries.length} properties.\n`);
