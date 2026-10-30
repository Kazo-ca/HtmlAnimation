// tests/e2e/node-selection.spec.ts
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

function buttonNode(page: Page, id = 'button-1'): Locator { return page.getByRole('treeitem', { name: `button#${id}.button`, exact: true }); }
function classAction(page: Page): Locator { return buttonNode(page).getByRole('button', { name: 'Sélectionner tous les éléments de la classe .button', exact: true }); }

test('structure starts with the real DOM and a row selects only its node before and after class selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#scene-host .button')).toHaveCount(4);
  await expect(page.locator('#tree [role="treeitem"]')).toHaveCount(await page.locator('#scene-host *').count());
  await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(0);
  await expect(page.locator('.HtmlDesignerOverlay')).toHaveCount(0);
  const row = buttonNode(page); await row.locator(':scope > .tree-row .tree-label').click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('.HtmlDesignerOverlay')).toHaveCount(1);
  await expect(page.locator('#properties input[data-property="opacity"]')).toHaveValue('0.5');
  await expect(page.locator('#properties input[data-property="margin-top"]')).toBeEnabled();
  await expect(page.locator('#event-log')).toContainText('1 élément(s) sélectionné(s)');
  await classAction(page).click();
  await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(4);
  await expect(page.locator('.HtmlDesignerOverlay')).toHaveCount(4);
  await expect(page.locator('#properties .designer-selection')).toHaveText('.button');
  await expect(page.locator('#properties input[data-property="margin-top"]')).toBeDisabled();
  await row.locator(':scope > .tree-row .tree-label').click();
  await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('#properties input[data-property="margin-top"]')).toBeEnabled();
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation'); await expect(page.locator('#undo')).toBeDisabled();
});

test('class actions work from the keyboard and the row keyboard selects one node', async ({ page }) => {
  await page.goto('/'); const row = buttonNode(page); const action = classAction(page);
  await action.focus(); await action.press('Enter'); await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(4);
  await row.focus(); await row.press('Enter'); await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(1);
  await action.focus(); await action.press('Space'); await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(4);
  await row.focus(); await row.press('Space'); await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation'); await expect(page.locator('#undo')).toBeDisabled();
});

test('an individual edit from structure leaves sibling samples intact and undo restores its keys and preview', async ({ page }) => {
  await page.goto('/'); await buttonNode(page).locator(':scope > .tree-row .tree-label').click();
  const opacity = page.locator('#properties input[data-property="opacity"]'); await opacity.fill('0.3'); await opacity.press('Tab');
  const picker = page.getByRole('group', { name: 'Choisir la cible pour enregistrer' }); await expect(picker).toBeVisible();
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
  await page.getByLabel('Cibles existantes', { exact: true }).selectOption('#button-1'); await picker.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('#scene-host #button-1')).toHaveCSS('opacity', '0.3'); await expect(page.locator('#scene-host #button-2')).toHaveCSS('opacity', '0.8');
  await expect(page.locator('#scene-host #button-3')).toHaveCSS('opacity', '0.5'); await expect(page.locator('#key-count')).toHaveText('3 clés · simulation');
  await expect(page.locator('#event-log')).toContainText('opacity : 0.5 → 0.3');
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
  await page.locator('#undo').click(); await expect(page.locator('#scene-host #button-1')).toHaveCSS('opacity', '0.5');
  await expect(page.locator('#scene-host #button-2')).toHaveCSS('opacity', '0.8'); await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
  await expect(page.locator('#tree [aria-selected="true"]')).toHaveCount(1);
});
