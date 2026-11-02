// tests/e2e/playback-outputs.spec.ts
// Genuine workshop: playback outputs come from the installed Timeline compilers.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

async function load(page: Page): Promise<void> {
  await page.goto('/timeline-real.html');
  await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
}
async function keyOpacity(page: Page): Promise<void> {
  await page.locator('#real-frame').fill('50'); await page.locator('#real-seek').click();
  const peer = page.locator('#real-scene #gradient-peer'); await peer.click();
  const opacity = page.locator('#real-properties input[data-property="opacity"]'); await opacity.fill('0.4'); await opacity.press('Tab');
  await page.getByLabel('Cibles existantes', { exact: true }).selectOption('#gradient-peer');
  await page.getByRole('group', { name: 'Choisir la cible pour enregistrer' }).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(peer).toHaveCSS('opacity', '0.4');
}
async function exported(page: Page, testInfo: TestInfo, format: 'json' | 'javascript' | 'css'): Promise<{ name: string; text: string }> {
  const downloading = page.waitForEvent('download'); await page.locator(`#real-export-${format}`).click(); const download = await downloading;
  const path = testInfo.outputPath(download.suggestedFilename()); await download.saveAs(path);
  return { name: download.suggestedFilename(), text: await readFile(path, 'utf8') };
}

test('genuine playback outputs download as frame JSON and a player module, and explain a refused CSS export, without touching the project', async ({ page }, testInfo) => {
  await load(page); await keyOpacity(page);
  const before = await page.locator('#real-document').textContent();
  const json = await exported(page, testInfo, 'json'); expect(json.name).toBe('animation.playback.json');
  const data = JSON.parse(json.text) as { version: number; sampling: string; frames: Record<string, Record<string, Record<string, string>>> };
  expect(data).toMatchObject({ version: 1, sampling: 'frames' }); expect(Object.values(data.frames['50'] ?? {})).toContainEqual(expect.objectContaining({ opacity: '0.4' }));
  await expect(page.locator('#real-export-check')).toContainText('images entières');
  const javascript = await exported(page, testInfo, 'javascript'); expect(javascript.name).toBe('animation.player.js'); expect(javascript.text).toContain('export function createPlayer');
  // The workshop stylesheet declares animation settings: Timeline refuses a CSS export it could not keep faithful.
  let downloads = 0; page.on('download', () => { downloads++; });
  await page.locator('#real-export-css').click();
  await expect(page.locator('#real-export-check')).toContainText('Export CSS refusé, aucun fichier partiel');
  await expect(page.locator('#real-export-check')).toContainText('peut remplacer les paramètres de l’animation CSS exportée');
  await expect(page.locator('#real-export-check')).toContainText('Sorties disponibles : JavaScript ou JSON');
  expect(downloads).toBe(0);
  expect(await page.locator('#real-document').textContent()).toBe(before);
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('Document original inchangé');
});
