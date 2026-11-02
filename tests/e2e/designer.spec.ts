// tests/e2e/designer.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openDemo(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Timeline simulée', { exact: true })).toBeVisible();
  await expect(page.locator('#scene-host .button')).toHaveCount(4);
}

async function openFreshScene(page: Page): Promise<void> {
  await openDemo(page);
  await page.getByRole('button', { name: 'Scène sans clés', exact: true }).click();
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
}

test('recorded case 59 preserves group and ID values on direct frame navigation without new keys', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Groupe .button', exact: true }).click();
  const opacity = page.locator('#properties input[data-property="opacity"]');
  const margin = page.locator('#properties input[data-property="margin-top"]');
  await expect(margin).toBeDisabled();
  await expect(page.locator('#properties [data-property-row="margin-top"]')).toContainText('ID individuels');
  await expect(page.locator('.HtmlDesignerOverlay')).toHaveCount(4);
  await expect(page.locator('.HtmlDesignerOverlay').first()).toHaveCSS('position', 'fixed');
  await expect(page.locator('.HtmlDesignerOverlay').first()).toHaveCSS('border-top-style', 'solid');
  for (const frame of ['1', '20', '49', '50', '100']) {
    await page.getByLabel('Image', { exact: true }).selectOption(frame);
    await expect(page.locator('#scene-host #button-2')).toHaveCSS('opacity', '0.8');
    for (const index of [1, 3, 4]) await expect(page.locator(`#scene-host #button-${index}`)).toHaveCSS('opacity', '0.5');
    await expect(opacity).toHaveValue('0.5');
    await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
    await expect(page.locator('#undo')).toBeDisabled();
    await expect(page.getByRole('group', { name: 'Choisir la cible pour enregistrer' })).toBeHidden();
  }
  await page.getByRole('button', { name: 'Objet #button-2', exact: true }).click();
  await expect(opacity).toHaveValue('0.8');
  await expect(margin).toBeEnabled();
  await expect(page.locator('.HtmlDesignerOverlay')).toHaveCount(1);
  await expect(page.locator('#tree [aria-selected="true"]')).toHaveAccessibleName('button#button-2.button');
});

test('first property edit requires explicit targeting and undo restores both preview and key creation', async ({ page }) => {
  await openFreshScene(page);
  await page.locator('#scene-host #button-2').click();
  await expect(page.locator('#event-log')).toContainText('inspection seule');
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  const opacity = page.locator('#properties input[data-property="opacity"]');
  await opacity.fill('0.35');
  await opacity.press('Tab');
  const picker = page.getByRole('group', { name: 'Choisir la cible pour enregistrer' });
  await expect(picker).toBeVisible();
  await expect(page.locator('#scene-host #button-2')).toHaveCSS('opacity', '1');
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await page.getByLabel('Cibles existantes', { exact: true }).selectOption('#button-2');
  await picker.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator('#scene-host #button-2')).toHaveCSS('opacity', '0.35');
  await expect(page.locator('#key-count')).toHaveText('1 clés · simulation');
  await expect(page.locator('#event-log')).toContainText('opacity : 1 → 0.35 · image 1');
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
  await page.locator('#undo').click();
  await expect(page.locator('#scene-host #button-2')).toHaveCSS('opacity', '1');
  await expect(opacity).toHaveValue('1');
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await page.locator('#redo').click();
  await expect(page.locator('#scene-host #button-2')).toHaveCSS('opacity', '0.35');
  await expect(page.locator('#key-count')).toHaveText('1 clés · simulation');
});

test('canceling first-target selection leaves document and history unchanged', async ({ page }) => {
  await openFreshScene(page);
  await page.locator('#scene-host #button-1').click();
  const opacity = page.locator('#properties input[data-property="opacity"]');
  await opacity.fill('0.2');
  await opacity.press('Tab');
  await page.getByLabel('Cibles existantes', { exact: true }).selectOption('.button');
  await expect(page.getByRole('group', { name: 'Choisir la cible pour enregistrer' })).toContainText('4 éléments seront ciblés');
  await page.getByRole('button', { name: 'Annuler le choix', exact: true }).click();
  await expect(opacity).toHaveValue('1');
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#scene-host #button-1')).toHaveCSS('opacity', '1');
});

test('persistent ID edit reports its original full XPath and supports undo and redo', async ({ page }) => {
  await openFreshScene(page);
  await page.locator('#scene-host #button-2').click();
  await page.getByLabel('Nouvel identifiant', { exact: true }).fill('renamed-button');
  await page.getByRole('button', { name: 'Appliquer l’ID', exact: true }).click();
  await expect(page.locator('#scene-host #renamed-button')).toBeVisible();
  const journal = page.getByRole('region', { name: 'Modifications du document original' });
  await expect(journal).toContainText('Document original modifié · 1');
  await expect(journal).toContainText(/\/html\/body\/.*\/button\[2\]/);
  await expect(journal).toContainText('id : button-2 → renamed-button');
  await expect(page.locator('#event-log')).toContainText('Document original : 1 modification(s) persistante(s) · enregistrement');
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await page.locator('#undo').click();
  await expect(page.locator('#scene-host #button-2')).toBeVisible();
  await expect(journal).toContainText('Document original inchangé');
  await expect(page.locator('#event-log')).toContainText('annulation');
  await page.locator('#redo').click();
  await expect(page.locator('#scene-host #renamed-button')).toBeVisible();
  await expect(journal).toContainText('id : button-2 → renamed-button');
  await expect(page.locator('#event-log')).toContainText('rétablissement');
});

test('Test mode delivers ordinary content interactions while Selection mode intercepts them', async ({ page }) => {
  await openDemo(page);
  const button = page.locator('#scene-host #button-2');
  await button.evaluate((element) => {
    element.addEventListener('click', () => {
      const clicks = Number(element.getAttribute('data-test-clicks') ?? '0');
      element.setAttribute('data-test-clicks', String(clicks + 1));
    });
  });
  await button.click();
  await expect(button).not.toHaveAttribute('data-test-clicks');
  await page.locator('#test-mode').click();
  await expect(page.locator('#test-mode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.HtmlDesignerOverlay')).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute('data-test-clicks', '1');
  // WebKit preserves its native platform rule: clicking a button need not focus it.
  await page.locator('#select-mode').click();
  await button.click();
  await expect(button).toHaveAttribute('data-test-clicks', '1');
  await expect(page.locator('.HtmlDesignerOverlay')).toHaveCount(1);
});

test('tree keyboard selection synchronizes the inspector and restores manual ancestor collapse', async ({ page }) => {
  await openDemo(page);
  const parent = page.getByRole('treeitem', { name: 'div.button-group', exact: true });
  await parent.getByRole('button', { name: 'Replier div.button-group', exact: true }).click();
  await expect(parent).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Objet #button-2', exact: true }).click();
  await expect(parent).toHaveAttribute('aria-expanded', 'true');
  const item = page.getByRole('treeitem', { name: 'button#button-2.button', exact: true });
  await item.focus();
  await item.press('Enter');
  await expect(page.locator('#properties input[data-property="opacity"]')).toHaveValue('0.8');
  await expect(item).toHaveAttribute('aria-selected', 'true');
  await item.press('Home');
  const root = page.getByRole('treeitem', { name: 'section.example-scene', exact: true });
  await expect(root).toBeFocused();
  await root.press('Enter');
  await expect(parent).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#properties .designer-selection')).toContainText('section');
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
});

test('recorded demo remains accessible with an incompatible group property', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Groupe .button', exact: true }).click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

for (const width of [320, 768, 1024, 1440]) {
  test(`recorded demo at ${width}px has no horizontal overflow and exposes its main controls`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDemo(page);
    await expect(page.locator('#scene-host')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Propriétés', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Groupe .button', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`recorded-designer-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}
