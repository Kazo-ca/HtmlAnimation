// scripts/build.mjs
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
execFileSync(process.execPath, ['scripts/generate-css-catalog.mjs', '--check'], { stdio: 'inherit' });
for (const name of ['css-properties', 'dom-tree', 'designer']) {
  const root = resolve('packages', name);
  await build({ configFile: false, root, build: { lib: { entry: resolve(root, 'src/index.ts'), formats: ['es'], fileName: 'index', cssFileName: 'style' }, rollupOptions: { external: ['@kazo-ca/css-properties', '@kazo-ca/hierarchical-dom-tree'] }, outDir: 'dist', emptyOutDir: true } });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', resolve(root, 'tsconfig.build.json')], { stdio: 'inherit' });
  // Styles are an explicit consumer import, not a TypeScript declaration dependency.
  for (const entry of await readdir(resolve(root, 'dist'), { recursive: true })) {
    if (!entry.endsWith('.d.ts')) continue;
    const declarationPath = resolve(root, 'dist', entry);
    const declaration = await readFile(declarationPath, 'utf8');
    await writeFile(declarationPath, declaration.replace(/^import ['"]\.\/[^'"]+\.(?:less|css)['"];\r?$/gm, '// Styles are imported explicitly by the application.'));
  }
  await copyFile('LICENSE', resolve(root, 'dist/LICENSE'));
}
