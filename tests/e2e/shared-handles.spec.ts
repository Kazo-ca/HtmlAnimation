// tests/e2e/shared-handles.spec.ts
// Genuine workshop: canvas handles preview through the shared owner and record HA11 keys.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { IHtmlAnimationContext, ITimelineDocument } from '@kazo-ca/timeline-runtime';

async function project(page: Page): Promise<{ timeline: ITimelineDocument; html: IHtmlAnimationContext }> {
  const text = await page.locator('#real-document').textContent(); if (!text) throw new Error('Missing genuine editable document');
  return JSON.parse(text) as { timeline: ITimelineDocument; html: IHtmlAnimationContext };
}
const markerCount = (page: Page): Promise<number> => page.locator('#real-scene [class*="html-designer-manipulating-"]').count();

test('genuine move handle previews live, records one spatial key and removes its temporary class', async ({ page }) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
  await page.locator('#real-frame').fill('30'); await page.locator('#real-seek').click();
  const box = page.locator('#real-scene #gradient-box'); const classes = await box.getAttribute('class'); const before = await project(page);
  const handle = page.locator('[data-geometry-handle="move"]'); await expect(handle).toBeVisible();
  const rect = await handle.boundingBox(); if (!rect) throw new Error('Missing move handle');
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 37, start.y + 3, { steps: 4 });
  expect(await markerCount(page)).toBe(1);
  await expect(box).not.toHaveCSS('transform', 'none');
  expect(await project(page)).toEqual(before);
  await page.mouse.up();
  const saved = await project(page); const layer = saved.timeline.layers.find(candidate => candidate.id === 'gradientObject');
  if (!layer || layer.type !== 'layer') throw new Error('Missing gradient layer');
  const key = layer.propertyTimelines?.spatialTranslateX?.keys[0];
  expect(key?.frame).toBe(30); expect(key?.value.kind === 'number' ? key.value.value : 0).toBeGreaterThan(0);
  expect(await markerCount(page)).toBe(0); expect(await box.getAttribute('class')).toBe(classes);
  await page.locator('#real-undo').click(); expect(await project(page)).toEqual(before); await expect(box).toHaveCSS('transform', 'none');
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
});

test('genuine dimensions handle resizes live and records width and height keys in one undo', async ({ page }) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
  const box = page.locator('#real-scene #gradient-box'); const classes = await box.getAttribute('class'); const before = await project(page); const size = await box.boundingBox();
  await page.getByRole('group', { name: 'Outils géométriques' }).getByRole('button', { name: 'Dimensions', exact: true }).click();
  const handle = page.locator('[data-geometry-handle="dimensions"]'); await expect(handle).toBeVisible();
  const rect = await handle.boundingBox(); if (!rect || !size) throw new Error('Missing dimensions handle');
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 33, start.y + 17, { steps: 4 });
  expect(await markerCount(page)).toBe(1); expect(await project(page)).toEqual(before);
  await expect.poll(async () => (await box.boundingBox())?.width ?? 0).toBeGreaterThan(size.width);
  await page.mouse.up();
  const saved = await project(page); const layer = saved.timeline.layers.find(candidate => candidate.id === 'gradientObject');
  if (!layer || layer.type !== 'layer') throw new Error('Missing gradient layer');
  expect(Object.keys(layer.propertyTimelines ?? {})).toEqual(expect.arrayContaining(['width', 'height']));
  expect(await markerCount(page)).toBe(0); expect(await box.getAttribute('class')).toBe(classes);
  await page.locator('#real-undo').click(); expect(await project(page)).toEqual(before);
  await expect.poll(async () => Math.round((await box.boundingBox())?.width ?? 0)).toBe(Math.round(size.width));
});

test('genuine handle gesture cancelled with Escape leaves no key, draft or class', async ({ page }) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
  const box = page.locator('#real-scene #gradient-box'); const classes = await box.getAttribute('class'); const style = await box.getAttribute('style'); const before = await project(page);
  const rect = await page.locator('[data-geometry-handle="move"]').boundingBox(); if (!rect) throw new Error('Missing move handle');
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 25, start.y + 12, { steps: 3 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await project(page)).toEqual(before); expect(await markerCount(page)).toBe(0);
  expect(await box.getAttribute('class')).toBe(classes); expect(await box.getAttribute('style')).toBe(style);
});
