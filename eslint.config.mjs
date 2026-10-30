// eslint.config.mjs
import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'artifacts/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/consistent-type-imports': 'error' } },
  { files: ['scripts/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } } }
);
