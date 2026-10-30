// scripts/check-packages.mjs
// Pack and consume the actual three tarballs; never publishes to a registry.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
const artifacts = resolve('artifacts/packages');
const consumer = resolve('artifacts/consumer');
await mkdir(artifacts, { recursive: true }); await mkdir(consumer, { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check through npm run check:packages.');
function npm(args, cwd) { return execFileSync(process.execPath, [npmCli, ...args, '--cache', resolve('.npm-cache')], { cwd, encoding: 'utf8' }); }
const tarballs = [];
for (const folder of ['css-properties', 'dom-tree', 'designer']) {
  const output = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], resolve('packages', folder)));
  const pack = output[0];
  if (!pack || !pack.files.some(file => file.path === 'dist/index.d.ts') || !pack.files.some(file => file.path === 'dist/style.css')) throw new Error(`Incomplete package ${folder}`);
  if (pack.files.some(file => /fixtures|recorded-timeline|node_modules/.test(file.path))) throw new Error(`Test fixture leaked into ${folder}`);
  tarballs.push(resolve(artifacts, pack.filename));
}
await writeFile(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
process.stdout.write(npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', resolve('.npm-cache'), ...tarballs], consumer));
await writeFile(resolve(consumer, 'main.ts'), `// artifacts/consumer/main.ts
import { CssPropertiesPanel } from '@kazo-ca/css-properties';
import { HierarchicalDomTree } from '@kazo-ca/hierarchical-dom-tree';
import { HtmlDesigner } from '@kazo-ca/html-designer';
import type { TimelineAdapter } from '@kazo-ca/html-designer';
import '@kazo-ca/css-properties/style.css';
import '@kazo-ca/hierarchical-dom-tree/style.css';
import '@kazo-ca/html-designer/style.css';
declare const adapter: TimelineAdapter;
const scene = document.createElement('div');
const panel = new CssPropertiesPanel(document.createElement('div'));
panel.setProperties([{name:'opacity',value:'1'}]);
const tree = new HierarchicalDomTree(document.createElement('div'),{root:scene});
const designer = new HtmlDesigner({scene, propertiesContainer:document.createElement('div'), treeContainer:document.createElement('div'), timeline:adapter,adapter:instance=>instance});
document.body.append(scene);
designer.dispose(); tree.destroy(); panel.destroy();
`);
await writeFile(resolve(consumer, 'index.html'), '<!-- artifacts/consumer/index.html --><html><head></head><body><script type="module" src="./main.ts"></script></body></html>');
await writeFile(resolve(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: false, target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'Bundler', types: [] }, include: ['main.ts'] }));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', resolve(consumer, 'tsconfig.json')], { stdio: 'inherit' });
await build({ configFile: false, root: consumer, build: { outDir: 'dist', emptyOutDir: true } });
for (const tarball of tarballs) if (!(await readFile(tarball)).length) throw new Error('Empty tarball');
process.stdout.write('All three packed packages typecheck and build in an offline consumer.\n');
