// tests/e2e/geometry-scroll.spec.ts
import { expect, test } from '@playwright/test';

for (const behavior of ['auto', 'smooth']) test(`a spatial preview preserves a ${behavior} scrolled host container and undo restores the gesture`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await page.addStyleTag({ content: `.geometry-board { height: 200px !important; overflow: auto !important; scroll-behavior: ${behavior}; }` });
  await page.locator('#geometry-scene').click();
  for (const [property, value] of [['rotation', '90deg'], ['scaleX', '3'], ['scaleY', '2']]) {
    const input = page.locator(`#properties input[data-property="${property}"]`); await input.fill(value ?? ''); await input.press('Tab');
  }
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click();
  const board = page.locator('.geometry-board');
  await expect(board).toHaveCSS('scroll-behavior', behavior);
  await board.evaluate(element => { element.scrollTo({ top: 80, behavior: 'instant' }); });
  await expect.poll(() => board.evaluate(element => element.scrollTop)).toBe(80);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const element = page.locator('#scene-host #geometry-box'); const handle = page.locator('[data-geometry-handle="dimensions"]');
  const before = await element.boundingBox(); const rect = await handle.boundingBox();
  if (!before || !rect) throw new Error('The scrolled scene must expose its geometry handle.');
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  expect(Math.abs(start.x - before.x)).toBeLessThan(0.5); expect(Math.abs(start.y - before.y - before.height)).toBeLessThan(0.5);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await board.evaluate(board => {
    const target = board.querySelector('#geometry-box'); if (!target) throw new Error('The scene target is missing.');
    board.ownerDocument.defaultView?.addEventListener('pointermove', () => {
      const rect = target.getBoundingClientRect(); board.setAttribute('data-preview-scroll', String(board.scrollTop));
      board.setAttribute('data-preview-x', String(rect.x)); board.setAttribute('data-preview-y', String(rect.y)); board.setAttribute('data-preview-height', String(rect.height));
    }, { once: true });
  });
  await page.mouse.move(start.x + 12, start.y + 8);
  const preview = await board.evaluate(board => ({ scrollTop: Number(board.getAttribute('data-preview-scroll')), x: Number(board.getAttribute('data-preview-x')), y: Number(board.getAttribute('data-preview-y')), height: Number(board.getAttribute('data-preview-height')) }));
  expect(preview.scrollTop).toBe(80);
  expect(Math.abs(preview.x - start.x - 12)).toBeLessThan(0.5); expect(Math.abs(preview.y + preview.height - start.y - 8)).toBeLessThan(0.5);
  await page.mouse.up(); expect(await board.evaluate(element => element.scrollTop)).toBe(80);
  await page.locator('#undo').click(); expect(await board.evaluate(element => element.scrollTop)).toBe(80);
  const restored = await element.boundingBox(); if (!restored) throw new Error('Undo must restore the original preview.');
  for (const property of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(restored[property] - before[property])).toBeLessThan(0.5);
});
