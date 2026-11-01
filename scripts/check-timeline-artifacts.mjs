// scripts/check-timeline-artifacts.mjs
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const manifest = JSON.parse(await readFile('vendor/timeline/manifest.json', 'utf8'));
const require = createRequire(import.meta.url);
const names = ['runtime', 'editor', 'export-css'];
if (!/^[a-f0-9]{40}$/.test(manifest.reference) || manifest.packages.length !== 3) throw new Error('Invalid Timeline provenance manifest.');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
for (const suffix of names) {
  const name = `@kazo-ca/timeline-${suffix}`; const archive = `kazo-ca-timeline-${suffix}-1.0.0.tgz`;
  const item = manifest.packages.find(candidate => candidate.name === name && candidate.archive === archive);
  if (!item) throw new Error(`Missing immutable archive: ${name}`);
  const relative = `vendor/timeline/${manifest.reference}/${archive}`;
  if (rootPackage.devDependencies[name] !== `file:${relative}`) throw new Error(`Wrong installed Timeline reference: ${name}`);
  const bytes = await readFile(relative);
  if (bytes.length !== item.bytes || createHash('sha256').update(bytes).digest('hex').toUpperCase() !== item.sha256) throw new Error(`Timeline checksum mismatch: ${name}`);
  const installed = dirname(require.resolve(`${name}/package.json`));
  for (const filename of ['package.json', `dist/timeline-${suffix}.mjs`]) {
    const packed = execFileSync('tar', ['-xOf', resolve(relative), `package/${filename}`]);
    if (!(await readFile(resolve(installed, filename))).equals(packed)) throw new Error(`Installed package differs from verified archive: ${name}/${filename}`);
  }
  process.stdout.write(`Verified ${name} against ${manifest.reference}.\n`);
}
