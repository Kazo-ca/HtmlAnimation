// tests/e2e/css-editors.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function openCssScene(page: Page): Promise<Locator> {
  await page.goto('/'); await page.getByRole('button', { name: 'Atelier CSS', exact: true }).click();
  const target = page.locator('#scene-host #css-box'); await expect(target).toBeVisible();
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation'); return target;
}

async function property(page: Page, name: string): Promise<Locator> {
  await page.getByRole('searchbox', { name: 'Rechercher une propriété CSS', exact: true }).fill(name);
  return page.locator(`#properties input[data-property="${name}"]`);
}

async function editor(page: Page, name: string): Promise<Locator> {
  await property(page, name); await page.getByRole('button', { name: `Modifier ${name} avec un éditeur`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Éditer ${name}`, exact: true }); await expect(dialog).toBeVisible(); return dialog;
}

async function setBorderFields(dialog: Locator): Promise<void> {
  await dialog.getByLabel('Épaisseur de bordure', { exact: true }).fill('3px');
  await dialog.getByLabel('Style de bordure', { exact: true }).selectOption('double');
  await dialog.getByLabel('Couleur de bordure', { exact: true }).fill('rgb(20, 80, 160)');
  await expect(dialog.getByLabel('Valeur CSS de border', { exact: true })).toHaveValue('3px double rgb(20, 80, 160)');
}

test('logical border autocomplete commits a keyboard value once and undo restores the simulated scene', async ({ page }) => {
  const target = await openCssScene(page); const before = await target.evaluate(element => getComputedStyle(element).getPropertyValue('border-block-start-style'));
  const input = await property(page, 'border-block-start-style'); await expect(input).toHaveAttribute('role', 'combobox');
  await page.getByRole('button', { name: 'Afficher les valeurs de border-block-start-style', exact: true }).click();
  for (const value of ['none', 'hidden', 'solid', 'dashed', 'double', 'groove', 'revert-layer']) await expect(page.getByRole('option', { name: value, exact: true })).toBeVisible();
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await input.fill('da'); await input.press('ArrowDown'); await input.press('Enter');
  await expect(target).toHaveCSS('border-block-start-style', 'dashed'); await expect(page.locator('#key-count')).toHaveText('1 clés · simulation');
  await expect(page.locator('#event-log')).toContainText('border-block-start-style');
  await page.locator('#undo').click(); await expect(target).toHaveCSS('border-block-start-style', before); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
});

test('structured border drafts cancel without keys and apply as one reversible accepted change', async ({ page }) => {
  const target = await openCssScene(page); const peer = page.locator('#scene-host #css-peer');
  const before = await target.getAttribute('style'); const sibling = await peer.getAttribute('style');
  let dialog = await editor(page, 'border'); await setBorderFields(dialog);
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation'); await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(target).toHaveAttribute('style', before ?? ''); await expect(page.locator('#undo')).toBeDisabled();
  dialog = await editor(page, 'border'); await setBorderFields(dialog);
  await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click(); await expect(dialog).toBeHidden();
  await expect(target).toHaveCSS('border-top-style', 'double'); await expect(target).toHaveCSS('border-top-width', '3px');
  await expect(peer).toHaveAttribute('style', sibling ?? ''); await expect(page.locator('#key-count')).toHaveText('1 clés · simulation');
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
  await page.locator('#undo').click(); await expect(target).toHaveAttribute('style', before ?? ''); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
});

test('color alpha, gradient and transform drafts each remain one undoable simulated property', async ({ page }) => {
  const target = await openCssScene(page);
  for (const name of ['color', 'background-image', 'transform']) {
    const before = await target.getAttribute('style'); const dialog = await editor(page, name);
    if (name === 'color') await dialog.getByLabel('Opacité de la couleur', { exact: true }).fill('0.35');
    if (name === 'background-image') {
      await dialog.getByLabel('Géométrie du dégradé 1', { exact: true }).fill('45deg');
      await dialog.getByLabel('Position du point 1', { exact: true }).fill('15%');
      await dialog.getByRole('button', { name: 'Ajouter un point', exact: true }).click();
    }
    if (name === 'transform') {
      await dialog.getByLabel('Nouvelle fonction', { exact: true }).selectOption('translate'); await dialog.getByRole('button', { name: 'Ajouter une fonction', exact: true }).click();
      await dialog.getByLabel('Argument 1 de translate 1', { exact: true }).fill('12px'); await dialog.getByLabel('Argument 2 de translate 1', { exact: true }).fill('4px');
      await dialog.getByLabel('Nouvelle fonction', { exact: true }).selectOption('rotate'); await dialog.getByRole('button', { name: 'Ajouter une fonction', exact: true }).click();
      await dialog.getByLabel('Argument 1 de rotate 2', { exact: true }).fill('10deg');
    }
    await expect(page.locator('#key-count')).toHaveText('0 clés · simulation'); await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(page.locator('#key-count')).toHaveText('1 clés · simulation'); await expect(page.locator('#event-log')).toContainText(`${name} :`);
    if (name === 'color') await expect(target).toHaveCSS('color', /rgba\([^)]*, 0\.35\)/);
    if (name === 'background-image') await expect(target).toHaveCSS('background-image', /linear-gradient\(45deg.*15%/);
    if (name === 'transform') await expect(target).not.toHaveCSS('transform', 'none');
    await page.locator('#undo').click(); await expect(target).toHaveAttribute('style', before ?? ''); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  }
});

test('Escape and host navigation discard pending CSS assistants without adding keys', async ({ page }) => {
  const target = await openCssScene(page); const before = await target.getAttribute('style');
  let dialog = await editor(page, 'border'); const source = dialog.getByLabel('Valeur CSS de border', { exact: true }); await source.fill('4px dashed green'); await source.press('Escape');
  await expect(dialog).toBeHidden(); await expect(target).toHaveAttribute('style', before ?? '');
  dialog = await editor(page, 'border'); await dialog.getByLabel('Valeur CSS de border', { exact: true }).fill('5px dotted blue');
  await page.getByLabel('Image', { exact: true }).selectOption('20'); await expect(dialog).toBeHidden(); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  const input = await property(page, 'border-block-start-style'); await input.fill('da'); await expect(page.getByRole('listbox')).toBeVisible();
  await page.locator('#scene-host #css-peer').click(); await expect(page.getByRole('listbox')).toBeHidden(); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await expect(page.locator('#undo')).toBeDisabled();
});

test('CSS editor workbench and its open dialog have no detected WCAG A/AA violations', async ({ page }) => {
  await openCssScene(page); await editor(page, 'border');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(results.violations).toEqual([]);
});

for (const width of [320, 1440]) test(`CSS value menus and structured editors fit a ${width}px viewport`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await openCssScene(page);
  await property(page, 'border-block-start-style'); await page.getByRole('button', { name: 'Afficher les valeurs de border-block-start-style', exact: true }).click();
  await expect(page.getByRole('option', { name: 'solid', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`css-suggestions-${width}.png`), animations: 'disabled' });
  await expect(page.getByRole('option', { name: 'solid', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); const dialog = await editor(page, 'border'); await expect(dialog.getByRole('button', { name: 'Appliquer', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`css-editor-${width}.png`), animations: 'disabled' });
});
