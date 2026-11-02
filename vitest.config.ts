// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: {
    '@kazo-ca/css-properties': fileURLToPath(new URL('./packages/css-properties/src/index.ts', import.meta.url)),
    '@kazo-ca/hierarchical-dom-tree': fileURLToPath(new URL('./packages/dom-tree/src/index.ts', import.meta.url)),
  } },
  test: {
    // Bound JSDOM/coverage memory and CPU without relaxing test deadlines.
    maxWorkers: 2,
    environment: 'jsdom', include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['packages/*/src/**/*.ts'], reporter: ['text', 'html', 'json-summary'], thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 } },
  },
});
