// vite.config.ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'demo', base: './',
  resolve: { alias: {
    '@kazo-ca/css-properties': fileURLToPath(new URL('./packages/css-properties/src/index.ts', import.meta.url)),
    '@kazo-ca/hierarchical-dom-tree': fileURLToPath(new URL('./packages/dom-tree/src/index.ts', import.meta.url)),
    '@kazo-ca/html-designer': fileURLToPath(new URL('./packages/designer/src/index.ts', import.meta.url)),
  } },
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist/demo', emptyOutDir: true, rolldownOptions: { input: { designer: fileURLToPath(new URL('./demo/index.html', import.meta.url)), realTimeline: fileURLToPath(new URL('./demo/timeline-real.html', import.meta.url)) } } },
});
