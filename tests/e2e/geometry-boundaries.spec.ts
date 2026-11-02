// tests/e2e/geometry-boundaries.spec.ts
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
async function load(page: Page, variant: string): Promise<void> {
  await page.goto('/'); await page.getByLabel('Scénario géométrique', { exact: true }).selectOption(variant); await page.locator('#geometry-scene').click();
  await expect(page.locator('#geometry-box')).toBeVisible();
}
async function move(page: Page, x = 14, y = 0): Promise<void> {
  const handle = page.locator('[data-geometry-handle="move"]'); const rect = await handle.boundingBox();
  if (!rect) throw new Error('Move handle unavailable');
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + x, start.y + y, { steps: 3 }); await page.mouse.up();
}
test('percentage dimensions follow the positioned containing block instead of a static wrapper', async ({ page }) => {
  await load(page, 'percentage'); const box = page.locator('#geometry-box');
  const before = await box.evaluate(element => Number.parseFloat(getComputedStyle(element).width));
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click();
  const handle = page.locator('[data-geometry-handle="dimensions"]'); const rect = await handle.boundingBox(); if (!rect) throw new Error('Missing dimensions handle');
  const x = rect.x + rect.width / 2; const y = rect.y + rect.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y); await page.mouse.up();
  expect(await box.evaluate(element => Number.parseFloat(getComputedStyle(element).width))).toBeCloseTo(before + 40, 0);
  expect(await box.evaluate(element => element instanceof HTMLElement && element.style.width.endsWith('%'))).toBe(true);
  await page.locator('#undo').click(); expect(await box.evaluate(element => Number.parseFloat(getComputedStyle(element).width))).toBeCloseTo(before, 0);
});
test('a recovered stylesheet percentage transform stays relative after a property edit', async ({ page }) => {
  await load(page, 'css-transform'); await move(page);
  const box = page.locator('#geometry-box');
  const translation = (): Promise<number> => box.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).e);
  expect(await translation()).toBeCloseTo(34, 0);
  const width = page.locator('#properties [data-property="width"]'); await width.fill('400px'); await width.press('Tab');
  expect(await translation()).toBeCloseTo(54, 0); await page.locator('#undo').click(); expect(await translation()).toBeCloseTo(34, 0);
});
test('native CSS nesting requires explicit conversion and leaves source intact when canceled', async ({ page }) => {
  await load(page, 'nested-transform'); const box = page.locator('#geometry-box'); const before = await box.getAttribute('style');
  await move(page); await expect(page.getByRole('button', { name: 'Convertir en pixels et appliquer', exact: true })).toBeVisible();
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation'); expect(await box.getAttribute('style')).toBe(before);
  await page.getByRole('button', { name: 'Annuler le geste', exact: true }).click(); expect(await box.getAttribute('style')).toBe(before);
  await move(page); await page.getByRole('button', { name: 'Convertir en pixels et appliquer', exact: true }).click();
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation'); await page.locator('#undo').click(); expect(await box.getAttribute('style')).toBe(before);
});
for (const variant of ['initial-transform', 'variable-identity']) test(`identity composition remains valid for ${variant}`, async ({ page }) => {
  await load(page, variant); const box = page.locator('#geometry-box'); const original = await box.getAttribute('style');
  const position = (): Promise<number> => box.evaluate(element => element.getBoundingClientRect().left + window.scrollX);
  const before = await position(); await move(page); expect(await position()).toBeCloseTo(before + 14, 0);
  await expect(page.locator('#key-count')).toHaveText('1 clés · simulation'); await page.locator('#undo').click(); expect(await box.getAttribute('style')).toBe(original);
});
