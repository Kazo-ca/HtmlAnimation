// tests/e2e/conflicts.spec.ts
// Browser journeys use the labelled scripted simulation, never a real Timeline.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function load(page: Page, variant = 'priority'): Promise<void> {
  await page.goto('/');
  await page.locator('#conflict-variant').selectOption(variant);
  await page.locator('#conflict-scene').click();
  await expect(page.getByRole('region', { name: 'Conflits d’animation', exact: true })).toBeVisible();
}
function dialog(page: Page): Locator { return page.getByRole('dialog', { name: 'Résoudre le conflit d’animation', exact: true }); }
async function open(page: Page): Promise<void> { await page.getByRole('button', { name: 'Résoudre le conflit', exact: true }).first().click(); await expect(dialog(page)).toBeVisible(); }
async function choose(page: Page, choice = 'accent-wins'): Promise<void> {
  await open(page); await dialog(page).getByLabel('Résolution', { exact: true }).selectOption(choice);
  await dialog(page).getByRole('button', { name: 'Appliquer la résolution', exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
}
async function opacity(page: Page, id: number, value: string): Promise<void> { await expect(page.locator(`#scene-host #button-${id}`)).toHaveCSS('opacity', value); }

test('diagnostic gives the affected targets, property and period; cancel and Escape leave data unchanged', async ({ page }) => {
  await load(page); const count = await page.locator('#key-count').textContent(); const region = page.getByRole('region', { name: 'Conflits d’animation', exact: true });
  await expect(region).toContainText('.tone'); await expect(region).toContainText('.accent'); await expect(region).toContainText('opacity');
  await expect(region).toContainText('1'); await expect(region).toContainText('100');
  await open(page); await expect(dialog(page)).toContainText('#button-1');
  await dialog(page).getByLabel('Résolution', { exact: true }).selectOption('accent-wins');
  await dialog(page).getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  await opacity(page, 1, '1'); await opacity(page, 2, '0.9'); await expect(page.locator('#key-count')).toHaveText(count ?? '');
  await open(page); await dialog(page).getByLabel('Résolution', { exact: true }).press('Escape'); await expect(dialog(page)).toHaveCount(0);
  await opacity(page, 1, '1'); await expect(page.locator('#key-count')).toHaveText(count ?? '');
});

test('an explicit winner affects only its overlap and supports shared undo and redo without source changes', async ({ page }) => {
  await load(page); const count = await page.locator('#key-count').textContent();
  await choose(page); await opacity(page, 1, '0.75'); await opacity(page, 2, '0.9'); await opacity(page, 3, '0.35'); await opacity(page, 4, '0.75');
  await expect(page.locator('#key-count')).toHaveText(count ?? '');
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
  await page.locator('#undo').click(); await opacity(page, 1, '1'); await opacity(page, 2, '0.9');
  await page.locator('#redo').click(); await opacity(page, 1, '0.75'); await expect(page.locator('#key-count')).toHaveText(count ?? '');
});

test('a recorded decision survives node selection and direct navigation to other recorded frames', async ({ page }) => {
  await load(page); await choose(page); const count = await page.locator('#key-count').textContent();
  await page.getByRole('treeitem', { name: /^button#button-3/ }).locator(':scope > .tree-row .tree-label').click();
  await opacity(page, 1, '0.75');
  for (const frame of ['20', '49', '50', '75', '100', '1']) {
    await page.locator('#frame').selectOption(frame); await opacity(page, 1, '0.75'); await opacity(page, 2, '0.9');
  }
  await expect(page.locator('#key-count')).toHaveText(count ?? '');
});

test('Escape discards a draft before selecting another node and opening a fresh confirmation', async ({ page }) => {
  await load(page); const count = await page.locator('#key-count').textContent(); await open(page);
  await dialog(page).getByLabel('Résolution', { exact: true }).selectOption('accent-wins');
  await dialog(page).getByLabel('Résolution', { exact: true }).press('Escape'); await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('treeitem', { name: /^button#button-3/ }).locator(':scope > .tree-row .tree-label').click();
  await opacity(page, 1, '1'); await expect(page.locator('#key-count')).toHaveText(count ?? '');
  await open(page); await expect(dialog(page).getByLabel('Résolution', { exact: true })).not.toHaveValue('accent-wins');
  await dialog(page).getByRole('button', { name: 'Annuler', exact: true }).click(); await opacity(page, 1, '1');
});

test('a start-key solution announces its explicit initial key and one undo restores keys and decision', async ({ page }) => {
  await load(page, 'start-key'); const before = await page.locator('#key-count').textContent();
  if (!before) throw new Error('Missing initial key count'); const count = Number.parseInt(before, 10);
  await open(page); await dialog(page).getByLabel('Résolution', { exact: true }).selectOption('accent-from-start');
  await expect(dialog(page)).toContainText('1'); await expect(dialog(page)).toContainText('clé');
  await expect(page.locator('#key-count')).toHaveText(before);
  await dialog(page).getByRole('button', { name: 'Appliquer la résolution', exact: true }).click();
  await expect(page.locator('#key-count')).toHaveText(`${count + 1} clés · simulation`); await opacity(page, 1, '0.75');
  await page.locator('#undo').click(); await expect(page.locator('#key-count')).toHaveText(before);
  await page.locator('#redo').click(); await expect(page.locator('#key-count')).toHaveText(`${count + 1} clés · simulation`); await opacity(page, 1, '0.75');
});

test('the exact group and ID reference stays automatic without conflict UI or extra keys', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
  for (const frame of ['1', '20', '49', '50', '75', '100']) {
    await page.locator('#frame').selectOption(frame); await opacity(page, 1, '0.5'); await opacity(page, 2, '0.8');
  }
  await expect(page.getByRole('button', { name: 'Résoudre le conflit', exact: true })).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0); await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
});

test('changed contributions mark a stored choice stale until a fresh explicit choice, with coherent undo', async ({ page }) => {
  await load(page, 'stale'); await choose(page); await opacity(page, 1, '0.75');
  await page.locator('#invalidate-conflict').click(); await opacity(page, 1, '1');
  await expect(page.getByRole('region', { name: 'Conflits d’animation', exact: true })).toContainText('Décision périmée');
  await choose(page); await opacity(page, 1, '0.65');
  await page.locator('#undo').click(); await opacity(page, 1, '1');
  await page.locator('#undo').click(); await opacity(page, 1, '0.75');
  await page.locator('#redo').click(); await opacity(page, 1, '1');
});

for (const width of [320, 768, 1024, 1440]) test(`resolution confirmation fits ${width}px with keyboard operation and accessible labels`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await load(page);
  const trigger = page.getByRole('button', { name: 'Résoudre le conflit', exact: true }).first(); await trigger.focus(); await trigger.press('Enter');
  await expect(dialog(page)).toBeVisible(); const choice = dialog(page).getByLabel('Résolution', { exact: true });
  await choice.selectOption('accent-wins'); await choice.focus();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`conflict-confirmation-${width}.png`), animations: 'disabled' });
  await expect(dialog(page)).toBeVisible();
  if (width === 1440) { const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(audit.violations).toEqual([]); }
  await dialog(page).getByRole('button', { name: 'Appliquer la résolution', exact: true }).focus();
  await dialog(page).getByRole('button', { name: 'Appliquer la résolution', exact: true }).press('Enter'); await opacity(page, 1, '0.75');
  await expect(trigger).toBeFocused();
});
