// tests/e2e/gradients.spec.ts
// Real UI journeys over the explicitly labelled recorded gradient simulation.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function load(page: Page, type = 'linear'): Promise<void> {
  await page.goto('/'); await page.locator('#gradient-type').selectOption(type); await page.locator('#gradient-scene').click();
  await expect(page.getByRole('region', { name: 'Dégradé', exact: true })).toBeVisible();
}
function editor(page: Page): Locator { return page.getByRole('region', { name: 'Dégradé', exact: true }); }
function scene(page: Page): Locator { return page.locator('#scene-host #gradient-box'); }
async function background(page: Page): Promise<string> { return scene(page).evaluate(element => getComputedStyle(element).backgroundImage); }
async function edit(page: Page, label: string, value: string): Promise<void> {
  const input = editor(page).getByLabel(label, { exact: true }); await input.fill(value); await input.press('Tab');
}
async function selectStop(page: Page, id = 'middle'): Promise<void> { await editor(page).locator(`[data-gradient-stop="${id}"]`).click(); }
async function count(page: Page): Promise<number> {
  const value = await page.locator('#key-count').textContent(); if (!value) throw new Error('Missing key count'); return Number.parseInt(value, 10);
}
async function beginPointer(page: Page, kind: string): Promise<{ readonly x: number; readonly y: number }> {
  await scene(page).scrollIntoViewIfNeeded();
  const settle = (): Promise<void> => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await settle(); const handle = page.locator(`[data-gradient-handle="${kind}"]`); let rect = await handle.boundingBox();
  if (!rect) throw new Error(`Missing gradient ${kind} handle`);
  const viewport = page.viewportSize(); if (!viewport) throw new Error('Missing browser viewport');
  const x = rect.x + rect.width / 2; const y = rect.y + rect.height / 2;
  if (x < 40 || x > viewport.width - 40 || y < 40 || y > viewport.height - 40) await page.evaluate(({ x, y }) => { window.scrollBy({ left: x, top: y, behavior: 'instant' }); }, { x: x - viewport.width / 2, y: y - viewport.height / 2 });
  await settle();
  await expect.poll(() => handle.evaluate(handle => { const rect = handle.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit !== null && handle.contains(hit); })).toBe(true);
  rect = await handle.boundingBox(); if (!rect) throw new Error('Missing refreshed handle');
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; await page.mouse.move(point.x, point.y); await page.mouse.down(); return point;
}

test('component changes are independent undoable tracks and never source-document changes', async ({ page }) => {
  await load(page); const original = await background(page); const keys = await count(page);
  await selectStop(page); await edit(page, 'Opacité du point', '0.35'); const alpha = await background(page);
  expect(alpha).not.toBe(original); await expect(editor(page).getByLabel('Opacité du point', { exact: true })).toHaveValue('0.35');
  await edit(page, 'Angle du dégradé', '35'); expect(await background(page)).not.toBe(alpha);
  await expect(page.locator('#gradient-tracks')).toContainText('Dégradé'); expect(await count(page)).toBe(keys + 2);
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
  await page.locator('#undo').click(); expect(await background(page)).toBe(alpha);
  await expect(editor(page).getByLabel('Opacité du point', { exact: true })).toHaveValue('0.35');
  await page.locator('#undo').click(); expect(await background(page)).toBe(original); expect(await count(page)).toBe(keys);
  await page.locator('#redo').click(); expect(await background(page)).toBe(alpha);
});

test('point selection and direct frame navigation do not create tracks', async ({ page }) => {
  await load(page); const keys = await count(page); await selectStop(page, 'last');
  for (const frame of ['50', '1', '20', '49', '75', '100', '1']) await page.locator('#frame').selectOption(frame);
  expect(await count(page)).toBe(keys);
  await expect(editor(page).locator('[data-gradient-stop="first"]')).toHaveCount(1);
  await expect(editor(page).locator('[data-gradient-stop="middle"]')).toHaveCount(1);
  await expect(editor(page).locator('[data-gradient-stop="last"]')).toHaveCount(1);
});

test('adding and removing a stable point is explicit, frame-local and atomic through shared undo', async ({ page }) => {
  await load(page); await page.locator('#frame').selectOption('50'); const keys = await count(page);
  const ids = (): Promise<string[]> => editor(page).locator('[data-gradient-stop]').evaluateAll(elements => elements.map(element => element.getAttribute('data-gradient-stop') ?? ''));
  const beforeIds = await ids();
  await editor(page).getByRole('button', { name: 'Ajouter un point', exact: true }).click();
  let draft = editor(page).getByRole('group', { name: 'Nouveau point', exact: true });
  await draft.getByLabel('Position du nouveau point', { exact: true }).fill('35');
  expect(await count(page)).toBe(keys); await draft.getByRole('button', { name: 'Annuler l’ajout', exact: true }).click();
  expect(await ids()).toEqual(beforeIds); expect(await count(page)).toBe(keys);
  await editor(page).getByRole('button', { name: 'Ajouter un point', exact: true }).click();
  draft = editor(page).getByRole('group', { name: 'Nouveau point', exact: true });
  await draft.getByLabel('Position du nouveau point', { exact: true }).fill('35');
  await draft.getByLabel('Couleur du nouveau point', { exact: true }).fill('#ff8000');
  await draft.getByLabel('Opacité du nouveau point', { exact: true }).fill('0.6');
  expect(await count(page)).toBe(keys); await draft.getByRole('button', { name: 'Ajouter ce point', exact: true }).click();
  const added = (await ids()).find(id => !beforeIds.includes(id)); if (!added) throw new Error('Missing new stable point');
  expect((await ids()).filter(id => id !== added)).toEqual(beforeIds); expect(await count(page)).toBe(keys + 4);
  await expect(page.locator(`#gradient-tracks [data-gradient-stop-id="${added}"]`)).toHaveCount(4);
  await selectStop(page, added); await expect(editor(page).getByLabel('Position du point', { exact: true })).toHaveValue('35');
  await expect(editor(page).getByLabel('Opacité du point', { exact: true })).toHaveValue('0.6');
  await page.locator('#frame').selectOption('1'); await expect(editor(page).locator(`[data-gradient-stop="${added}"]`)).toHaveCount(0); expect(await count(page)).toBe(keys + 4);
  await page.locator('#frame').selectOption('50'); await selectStop(page, added);
  await editor(page).getByRole('button', { name: 'Supprimer le point', exact: true }).click(); await expect(editor(page).locator(`[data-gradient-stop="${added}"]`)).toHaveCount(0);
  expect(await count(page)).toBe(keys + 4);
  await page.locator('#undo').click(); await expect(editor(page).locator(`[data-gradient-stop="${added}"]`)).toHaveCount(1);
  await page.locator('#undo').click(); expect(await ids()).toEqual(beforeIds); expect(await count(page)).toBe(keys);
  await page.locator('#redo').click(); await expect(editor(page).locator(`[data-gradient-stop="${added}"]`)).toHaveCount(1);
  await page.locator('#redo').click(); await expect(editor(page).locator(`[data-gradient-stop="${added}"]`)).toHaveCount(0);
  await editor(page).getByLabel('Point sélectionné', { exact: true }).selectOption(added);
  await editor(page).getByRole('button', { name: 'Rétablir le point', exact: true }).click(); await expect(editor(page).locator(`[data-gradient-stop="${added}"]`)).toHaveCount(1);
  await page.locator('#undo').click(); await expect(editor(page).locator(`[data-gradient-stop="${added}"]`)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
});

test('crossed points render in evaluated position order while their stable identities remain unchanged', async ({ page }) => {
  await load(page); const css = await background(page); const keys = await count(page);
  const before = await editor(page).locator('[data-gradient-stop]').evaluateAll(elements => elements.map(element => element.getAttribute('data-gradient-stop')));
  await selectStop(page, 'first'); await edit(page, 'Position du point', '75');
  const crossed = await background(page); expect(crossed.indexOf('50%')).toBeLessThan(crossed.indexOf('75%')); expect(crossed.indexOf('75%')).toBeLessThan(crossed.indexOf('100%'));
  expect(await editor(page).locator('[data-gradient-stop]').evaluateAll(elements => elements.map(element => element.getAttribute('data-gradient-stop')))).toEqual(before);
  expect(await count(page)).toBe(keys + 1); await page.locator('#undo').click(); expect(await background(page)).toBe(css); expect(await count(page)).toBe(keys);
  await page.locator('#redo').click(); await expect(editor(page).getByLabel('Position du point', { exact: true })).toHaveValue('75');
});

test('a point-position gesture previews without keys and Escape restores its accepted value', async ({ page }) => {
  await load(page); await selectStop(page); const original = await background(page); const keys = await count(page);
  const point = await beginPointer(page, 'stop');
  await page.mouse.move(point.x + 25, point.y);
  expect(await count(page)).toBe(keys); await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await background(page)).toBe(original); expect(await count(page)).toBe(keys);
});

test('an angle gesture commits one undo action and keeps point identities intact', async ({ page }) => {
  await load(page); const original = await background(page); const keys = await count(page);
  await beginPointer(page, 'angle'); const box = await scene(page).boundingBox();
  if (!box) throw new Error('The scene must expose its angle handle');
  await page.mouse.move(box.x + box.width / 2, box.y + 15, { steps: 3 }); expect(await count(page)).toBe(keys);
  await page.mouse.up(); expect(await count(page)).toBe(keys + 1); expect(await background(page)).not.toBe(original);
  await page.locator('#undo').click(); expect(await background(page)).toBe(original); expect(await count(page)).toBe(keys);
  for (const id of ['first', 'middle', 'last']) await expect(editor(page).locator(`[data-gradient-stop="${id}"]`)).toHaveCount(1);
});

for (const type of ['radial', 'conic']) test(`${type} gradients keep geometry controls separate from stop fields`, async ({ page }) => {
  await load(page, type); const original = await background(page); const keys = await count(page);
  await edit(page, 'Centre X du dégradé', '40'); await edit(page, 'Centre Y du dégradé', '60');
  expect(await count(page)).toBe(keys + 2); expect(await background(page)).not.toBe(original);
  if (type === 'radial') {
    await expect(page.locator('[data-gradient-handle="radiusX"]')).toBeVisible(); await expect(page.locator('[data-gradient-handle="radiusY"]')).toBeVisible();
  } else await expect(page.locator('[data-gradient-handle="angle"]')).toBeVisible();
  await page.locator('#undo').click(); await page.locator('#undo').click(); expect(await background(page)).toBe(original);
});

for (const width of [320, 768, 1024, 1440]) test(`gradient controls fit ${width}px with accessible keyboard selection`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await load(page);
  const stop = editor(page).locator('[data-gradient-stop="middle"]'); await stop.focus(); await stop.press('Enter');
  await expect(editor(page).getByLabel('Position du point', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`gradient-editor-${width}.png`), animations: 'disabled' });
  if (width === 1440) { const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(result.violations).toEqual([]); }
});
