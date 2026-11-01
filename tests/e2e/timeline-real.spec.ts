// tests/e2e/timeline-real.spec.ts
// Genuine installed package journeys; never the recorded Timeline fixture.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { ITimelineDocument, IHtmlAnimationContext } from '@kazo-ca/timeline-runtime';
import provenance from '../../vendor/timeline/manifest.json' with { type: 'json' };

function panel(page: Page): Locator { return page.getByRole('region', { name: 'Dégradé', exact: true }); }
async function load(page: Page, type = 'linear'): Promise<void> {
  await page.goto('/timeline-real.html');
  await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
  if (type !== 'linear') { await page.locator('#real-type').selectOption(type); await page.locator('#real-load').click(); }
  await expect(page.locator('#real-reference')).toHaveText(provenance.reference);
}
async function seek(page: Page, frame: number): Promise<void> { await page.locator('#real-frame').fill(String(frame)); await page.locator('#real-seek').click(); }
async function edit(page: Page, label: string, value: string): Promise<void> { const input = panel(page).getByLabel(label, { exact: true }); await input.fill(value); await input.press('Tab'); }
async function project(page: Page): Promise<{timeline:ITimelineDocument;html:IHtmlAnimationContext}> {
  const text = await page.locator('#real-document').textContent(); if (!text) throw new Error('Missing genuine editable document');
  return JSON.parse(text) as {timeline:ITimelineDocument;html:IHtmlAnimationContext};
}
async function keys(page: Page): Promise<number> {
  const data = await project(page);
  return data.timeline.layers.reduce((sum, layer) => sum + (layer.type === 'layer' ? Object.values(layer.propertyTimelines ?? {}).reduce((count, track) => count + track.keys.length, 0) : 0), 0);
}

test('genuine angle editing holds after its key and direct seeking preserves its original base', async ({ page }) => {
  await load(page); await expect(page.locator('#real-key-count')).toHaveText('0 clés · packages réels');
  await seek(page, 50); await edit(page, 'Angle du dégradé', '35'); expect(await keys(page)).toBe(1);
  await expect(page.locator('#real-events')).toContainText('image 50');
  await seek(page, 20); await expect(panel(page).getByLabel('Angle du dégradé', { exact: true })).toHaveValue('90');
  await seek(page, 75); await expect(panel(page).getByLabel('Angle du dégradé', { exact: true })).toHaveValue('35');
  await page.locator('#real-undo').click(); expect(await keys(page)).toBe(0);
  await expect(panel(page).getByLabel('Angle du dégradé', { exact: true })).toHaveValue('90');
  await page.locator('#real-redo').click(); expect(await keys(page)).toBe(1);
  await expect(panel(page).getByLabel('Angle du dégradé', { exact: true })).toHaveValue('35');
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
});

test('genuine pre-registered presence uses initial false without an invented earlier key', async ({ page }) => {
  await load(page); await panel(page).getByLabel('Point sélectionné', { exact: true }).selectOption('reserved');
  await expect(panel(page).locator('[data-gradient-stop="reserved"]')).toHaveCount(0);
  await seek(page, 50); await panel(page).getByRole('button', { name: 'Rétablir le point', exact: true }).click();
  expect(await keys(page)).toBe(1); await expect(panel(page).locator('[data-gradient-stop="reserved"]')).toHaveCount(1);
  const data = await project(page); const layer = data.timeline.layers[0];
  if (!layer || layer.type !== 'layer') throw new Error('Missing genuine layer');
  const track = Object.values(layer.propertyTimelines ?? {})[0];
  expect(track?.initialValue).toEqual({ kind: 'boolean', value: false }); expect(track?.keys).toEqual([{ frame: 50, value: { kind: 'boolean', value: true } }]);
  await seek(page, 20); await expect(panel(page).locator('[data-gradient-stop="reserved"]')).toHaveCount(0);
  await seek(page, 75); await expect(panel(page).locator('[data-gradient-stop="reserved"]')).toHaveCount(1);
  await page.locator('#real-undo').click(); expect(await keys(page)).toBe(0);
  expect((await project(page)).html.gradients?.gradientObject?.[0]?.stops.some(stop => stop.id === 'reserved')).toBe(true);
});

test('genuine crossed stops render sorted while editable identities and alpha remain independent', async ({ page }) => {
  await load(page); await panel(page).locator('[data-gradient-stop="first"]').click();
  await edit(page, 'Position du point', '75');
  const data = await project(page);
  expect(data.html.gradients?.gradientObject?.[0]?.stops.map(stop => stop.id)).toEqual(['first', 'reserved', 'middle', 'last']);
  const image = await page.locator('#real-scene #gradient-box').evaluate(element => getComputedStyle(element).backgroundImage);
  expect(image.indexOf('50%')).toBeLessThan(image.indexOf('75%')); expect(image.indexOf('75%')).toBeLessThan(image.indexOf('100%'));
  await edit(page, 'Opacité du point', '0.4'); expect(await keys(page)).toBe(2);
  await page.locator('#real-undo').click(); await expect(panel(page).getByLabel('Position du point', { exact: true })).toHaveValue('75');
  await expect(panel(page).getByLabel('Opacité du point', { exact: true })).toHaveValue('1');
  await page.locator('#real-undo').click(); expect(await keys(page)).toBe(0);
});

test('genuine radial center gesture previews and commits two keys as one undo action', async ({ page }) => {
  await load(page, 'radial'); const scene = page.locator('#real-scene #gradient-box'); await scene.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const handle = page.locator('[data-gradient-handle="center"]'); const rect = await handle.boundingBox(); if (!rect) throw new Error('Missing genuine radial center handle');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 18, rect.y + rect.height / 2 + 12); expect(await keys(page)).toBe(0);
  await page.mouse.up(); expect(await keys(page)).toBe(2);
  await page.locator('#real-undo').click(); expect(await keys(page)).toBe(0);
  await expect(panel(page).getByLabel('Centre X du dégradé', { exact: true })).toHaveValue('50');
  await expect(panel(page).getByLabel('Centre Y du dégradé', { exact: true })).toHaveValue('50');
});

test('genuine unsupported structural and spatial guarantees are visibly refused without changing keys', async ({ page }) => {
  await load(page); await expect(panel(page).getByRole('button', { name: 'Ajouter un point', exact: true })).toBeDisabled();
  await expect(panel(page)).toContainText('atomique');
  const rotation = page.locator('#real-properties input[data-property="rotation"]'); await rotation.fill('45deg'); await rotation.press('Tab');
  await expect(page.locator('#real-events')).toContainText('r3'); expect(await keys(page)).toBe(0);
  const hasTimelineService = await page.locator('#real-timeline .JsTimeLine').count(); expect(hasTimelineService).toBeGreaterThan(0);
});

for (const width of [320, 1440]) test(`genuine package workbench fits ${width}px and preserves keyboard point selection`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await load(page);
  const stop = panel(page).locator('[data-gradient-stop="middle"]'); await stop.focus(); await stop.press('Enter');
  await expect(panel(page).getByLabel('Position du point', { exact: true })).toHaveValue('50');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`timeline-real-${width}.png`), animations: 'disabled' });
  expect(await keys(page)).toBe(0);
});
