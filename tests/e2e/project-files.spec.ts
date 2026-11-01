// Native editable files, separate from playback exports and source reattachment.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditableProject } from '../../packages/designer/src/index.js';
import type { IHtmlAnimationContext, ITimelineDocument } from '@kazo-ca/timeline-runtime';

async function currentDocument(page: Page): Promise<string> { return await page.locator('#real-document').textContent() ?? ''; }

test('manual save downloads original native keys and context without evaluated frames or preview HTML', async ({ page }, testInfo) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
  await page.locator('#real-frame').fill('50'); await page.locator('#real-seek').click();
  const angle = page.getByRole('region', { name: 'Dégradé', exact: true }).getByLabel('Angle du dégradé', { exact: true }); await angle.fill('35'); await angle.press('Tab');
  const before = await currentDocument(page); const downloading = page.waitForEvent('download'); await page.locator('#real-project-save').click(); const download = await downloading;
  const path = testInfo.outputPath('native-project.json'); await download.saveAs(path);
  const saved = JSON.parse(await readFile(path, 'utf8')) as EditableProject;
  expect(saved.format).toBe('html-animation-project'); expect(saved.version).toBe(1); expect(saved.source).toEqual({ id: 'gradient-workshop-linear', revision: 'source-v1' });
  const document = saved.timeline as unknown as ITimelineDocument; const context = saved.htmlContext as unknown as IHtmlAnimationContext;
  const property = Object.entries(context.bindings?.gradientObject ?? {}).find(([, binding]) => binding.kind === 'gradient' && binding.component === 'angle')?.[0];
  const layer = document.layers[0]; if (!property || !layer || layer.type !== 'layer') throw new Error('Missing saved native angle');
  expect(layer.propertyTimelines?.[property]?.initialValue).toEqual({ kind: 'number', value: 90 }); expect(layer.propertyTimelines?.[property]?.keys).toEqual([{ frame: 50, value: { kind: 'number', value: 35 } }]);
  expect(saved.provenance.kind).toBe('real'); expect(saved.documentChanges).toEqual([]); expect(Object.keys(saved)).not.toContain('sampling'); expect(Object.keys(saved)).not.toContain('html');
  expect(await currentDocument(page)).toBe(before); await expect(page.locator('#real-project-check')).toContainText('Projet éditable enregistré');
  await page.locator('#real-undo').click(); await expect(angle).toHaveValue('90');
});

test('checking a native authoring file retains its curves and leaves the current project untouched', async ({ page }) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt'); const before = await currentDocument(page);
  await page.locator('#real-project-file').setInputFiles(resolve('fixtures/native-editable-project.json'));
  await expect(page.locator('#real-project-check')).toContainText('Format de projet valide'); await expect(page.locator('#real-project-check')).toContainText('native-project-fixture');
  await expect(page.locator('#real-project-check')).toContainText('source est indisponible'); await expect(page.locator('#real-project-open')).toBeDisabled();
  expect(await currentDocument(page)).toBe(before); await expect(page.locator('#real-key-count')).toHaveText('0 clés · packages réels');
});

test('opening a saved project shares undo with edits on both sides and retains its source journal and metadata', async ({ page }, testInfo) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
  const selectGradient = async (): Promise<void> => { await page.locator('#real-scene #gradient-box').click(); };
  const angle = page.getByRole('region', { name: 'Dégradé', exact: true }).getByLabel('Angle du dégradé', { exact: true });
  const editAngle = async (value: string): Promise<void> => { await selectGradient(); await angle.fill(value); await angle.press('Tab'); };
  const downloadProject = async (name: string): Promise<EditableProject> => {
    const downloading = page.waitForEvent('download'); await page.locator('#real-project-save').click();
    const download = await downloading; const path = testInfo.outputPath(name); await download.saveAs(path);
    return JSON.parse(await readFile(path, 'utf8')) as EditableProject;
  };
  await page.locator('#real-type').selectOption('conic'); await page.locator('#real-load').click();
  await page.locator('#real-frame').fill('50'); await page.locator('#real-seek').click(); await editAngle('55');
  await page.locator('#real-scene #gradient-peer').click(); await page.getByLabel('Nouvel identifiant', { exact: true }).fill('saved-peer');
  await page.getByRole('button', { name: 'Appliquer l’ID', exact: true }).click();
  const savedB = await downloadProject('project-b.json'); const projectB = { ...savedB, metadata: { hostNote: 'Metadata retained on reopening' } };

  await page.locator('#real-type').selectOption('linear'); await page.locator('#real-load').click();
  const peerA = page.locator('#real-scene #gradient-peer'); const originalClass = await peerA.getAttribute('class'); await peerA.click();
  await page.getByLabel('Classes du document', { exact: true }).fill('gradient-subject project-a'); await page.getByRole('button', { name: 'Appliquer les classes', exact: true }).click();
  await page.locator('#real-frame').fill('50'); await page.locator('#real-seek').click(); await editAngle('35'); const documentA = await currentDocument(page);
  await page.locator('#real-project-file').setInputFiles({ name: 'project-b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(projectB)) });
  await expect(page.locator('#real-project-check')).toContainText('Prêt à ouvrir'); expect(await currentDocument(page)).toBe(documentA);
  await page.locator('#real-project-open').click(); await expect(page.locator('#real-project-check')).toContainText('Projet ouvert');
  await selectGradient(); await expect(angle).toHaveValue('55'); await expect(page.locator('#real-scene #saved-peer')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Modifications du document original' })).toContainText('gradient-peer → saved-peer');
  const roundTrip = await downloadProject('project-b-reopened.json'); expect(roundTrip.timeline).toEqual(savedB.timeline); expect(roundTrip.htmlContext).toEqual(savedB.htmlContext);
  expect(roundTrip.documentChanges).toEqual(savedB.documentChanges); expect(roundTrip.metadata).toEqual(projectB.metadata); expect(roundTrip.source).toEqual(savedB.source);
  await editAngle('75'); await page.locator('#real-undo').click(); await expect(angle).toHaveValue('55');
  await page.locator('#real-undo').click(); await selectGradient(); await expect(angle).toHaveValue('35'); expect(await currentDocument(page)).toBe(documentA); await expect(peerA).toHaveAttribute('class', 'gradient-subject project-a');
  await page.locator('#real-undo').click(); await expect(angle).toHaveValue('90'); await page.locator('#real-undo').click(); await expect(peerA).toHaveAttribute('class', originalClass ?? '');
  await page.locator('#real-redo').click(); await page.locator('#real-redo').click(); await page.locator('#real-redo').click(); await selectGradient(); await expect(angle).toHaveValue('55');
  await page.locator('#real-redo').click(); await expect(angle).toHaveValue('75');
});

test('playback dictionaries and malformed project files are refused without changing history', async ({ page }) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt'); const before = await currentDocument(page);
  const input = page.locator('#real-project-file');
  await input.setInputFiles({ name: 'playback.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: '1.0.0', sampling: 'frames', frames: {} })) });
  await expect(page.locator('#real-project-check')).toContainText('pas'); expect(await currentDocument(page)).toBe(before);
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
  await expect(page.locator('#real-project-check')).toContainText('JSON valide'); expect(await currentDocument(page)).toBe(before); await expect(page.locator('#real-undo')).toBeDisabled();
});

test('starting a fresh workshop restores source root attributes after persistent root edits', async ({ page }) => {
  await page.goto('/timeline-real.html'); await expect(page.locator('#real-events')).toContainText('Moteur réel prêt');
  await page.locator('#real-tree').getByText('div#real-scene', { exact: true }).click();
  await page.getByLabel('Nouvel identifiant', { exact: true }).fill('edited-scene'); await page.getByRole('button', { name: 'Appliquer l’ID', exact: true }).click();
  await page.getByLabel('Classes du document', { exact: true }).fill('root-revised'); await page.getByRole('button', { name: 'Appliquer les classes', exact: true }).click();
  await expect(page.locator('#edited-scene')).toHaveAttribute('class', 'root-revised');
  const journal = page.getByRole('region', { name: 'Modifications du document original' }); await expect(journal.locator('li')).toHaveCount(2);
  await page.locator('#real-load').click();
  await expect(page.locator('#edited-scene')).toHaveCount(0); await expect(page.locator('#real-scene')).toHaveCount(1);
  expect(await page.locator('#real-scene').getAttribute('class')).toBeNull(); await expect(journal).toContainText('Document original inchangé'); await expect(page.locator('#real-undo')).toBeDisabled();
});
