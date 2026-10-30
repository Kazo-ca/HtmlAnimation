// scripts/build.mjs
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
for (const name of ['css-properties', 'dom-tree', 'designer']) {
  const root = resolve('packages', name);
  await build({ configFile: false, root, build: { lib: { entry: resolve(root, 'src/index.ts'), formats: ['es'], fileName: 'index', cssFileName: 'style' }, rollupOptions: { external: ['@kazo-ca/css-properties', '@kazo-ca/hierarchical-dom-tree'] }, outDir: 'dist', emptyOutDir: true } });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', resolve(root, 'tsconfig.build.json')], { stdio: 'inherit' });
  // Styles are an explicit consumer import, not a TypeScript declaration dependency.
  const declarationPath = resolve(root, 'dist/index.d.ts');
  const declaration = await readFile(declarationPath, 'utf8');
  await writeFile(declarationPath, declaration.replace(/^import ['"]\.\/styles\.less['"];\r?\n/gm, ''));
  await copyFile('LICENSE', resolve(root, 'dist/LICENSE'));
}
