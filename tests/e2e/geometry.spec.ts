// tests/e2e/geometry.spec.ts
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openGeometry(page: Page, fixture = 'geometry-scene'): Promise<Locator> {
  await page.goto('/');
  await page.locator(`#${fixture}`).click();
  const element = page.locator('#scene-host #geometry-box');
  await expect(element).toBeVisible();
  await expect(page.getByRole('group', { name: 'Outils géométriques', exact: true })).toBeVisible();
  return element;
}

async function bounds(element: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const result = await element.boundingBox(); if (!result) throw new Error('Geometry element has no visible bounds.'); return result;
}

async function documentBounds(element: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  return element.evaluate(element => { const rect = element.getBoundingClientRect(); return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height }; });
}

async function startDrag(page: Page, handle: Locator): Promise<{ x: number; y: number }> {
  const element = page.locator('#scene-host #geometry-box');
  const renderScroll = (): Promise<void> => page.evaluate(() => new Promise<void>(resolve => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }));
  await renderScroll();
  const initial = await bounds(handle); const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const center = { x: initial.x + initial.width / 2, y: initial.y + initial.height / 2 };
  const offset = { x: center.x < 40 || center.x > viewport.width - 40 ? center.x - viewport.width / 2 : 0, y: center.y < 40 || center.y > viewport.height - 40 ? center.y - viewport.height / 2 : 0 };
  if (offset.x || offset.y) await page.evaluate(offset => { window.scrollBy({ left: offset.x, top: offset.y, behavior: 'instant' }); }, offset);
  await renderScroll();
  await expect.poll(() => handle.evaluate(handle => {
    const rect = handle.getBoundingClientRect(); const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return target !== null && handle.contains(target);
  }), { message: 'The pointer must reach the visible geometry handle before starting its gesture.' }).toBe(true);
  const tool = await handle.getAttribute('data-geometry-handle');
  if (tool === 'dimensions' || tool === 'scale') await expect.poll(async () => {
    const rect = await bounds(handle); const corner = (await corners(element))[2]; const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    if (!corner) throw new Error('The geometry corner is missing.');
    return Math.max(Math.abs(rect.x + rect.width / 2 - corner.x + scroll.x), Math.abs(rect.y + rect.height / 2 - corner.y + scroll.y));
  }, { message: 'The corner handle must finish following the scroll before pointerdown.' }).toBeLessThan(0.5);
  const rect = await bounds(handle); const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  return point;
}

async function drag(page: Page, tool: string, delta: { x: number; y: number }): Promise<void> {
  const handle = page.locator(`[data-geometry-handle="${tool}"]`); const start = await startDrag(page, handle);
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 4 }); await page.mouse.up();
}

async function expectPosition(element: Locator, target: { x: number; y: number }): Promise<void> {
  await expect.poll(async () => { const rect = await documentBounds(element); return Math.max(Math.abs(rect.x - target.x), Math.abs(rect.y - target.y)); }).toBeLessThan(0.5);
}

async function corners(element: Locator): Promise<readonly { x: number; y: number }[]> {
  return element.evaluate(element => {
    if (!(element instanceof HTMLElement)) throw new Error('The geometry fixture must be HTML.');
    const style = getComputedStyle(element); const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
    const origin = style.transformOrigin.split(/\s+/).map(Number.parseFloat); const ox = origin[0] ?? 0; const oy = origin[1] ?? 0;
    const borderBox = (axis: 'width' | 'height'): number => {
      const properties = axis === 'width' ? ['padding-left', 'padding-right', 'border-left-width', 'border-right-width'] : ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'];
      return Number.parseFloat(style.getPropertyValue(axis)) + (style.boxSizing === 'border-box' ? 0 : properties.reduce((sum, name) => sum + (Number.parseFloat(style.getPropertyValue(name)) || 0), 0));
    };
    const width = borderBox('width'); const height = borderBox('height');
    const points = [[0, 0], [width, 0], [width, height], [0, height]].map(([x = 0, y = 0]) => ({ x: matrix.a * (x - ox) + matrix.c * (y - oy) + ox + matrix.e, y: matrix.b * (x - ox) + matrix.d * (y - oy) + oy + matrix.f }));
    const rect = element.getBoundingClientRect(); const minX = Math.min(...points.map(point => point.x)); const minY = Math.min(...points.map(point => point.y));
    return points.map(point => ({ x: point.x + rect.x - minX + window.scrollX, y: point.y + rect.y - minY + window.scrollY }));
  });
}

test('geometry workbench exposes spatial tools separately from the Timeline simulation', async ({ page }) => {
  await openGeometry(page);
  for (const name of ['Déplacement', 'Dimensions', 'Rotation', 'Échelle', 'Pivot']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Timeline simulée', { exact: true })).toBeVisible();
});

test('simulated move previews two axes without keys and commits one reversible command', async ({ page }) => {
  const element = await openGeometry(page); await page.getByLabel('Accrochage', { exact: true }).setChecked(false);
  const original = await documentBounds(element); const start = await startDrag(page, page.locator('[data-geometry-handle="move"]'));
  await page.mouse.move(start.x + 31, start.y + 21, { steps: 4 });
  await expectPosition(element, { x: original.x + 31, y: original.y + 21 });
  await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await page.mouse.up(); await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
  await page.locator('#undo').click(); await expectPosition(element, original); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  await page.locator('#redo').click(); await expectPosition(element, { x: original.x + 31, y: original.y + 21 });
});

test('simulated pointer preview is canceled by Escape without changing history', async ({ page }) => {
  const element = await openGeometry(page); const original = await documentBounds(element);
  const start = await startDrag(page, page.locator('[data-geometry-handle="move"]'));
  await page.mouse.move(start.x + 24, start.y + 18); await page.keyboard.press('Escape'); await page.mouse.up();
  await expectPosition(element, original); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation'); await expect(page.locator('#undo')).toBeDisabled();
});

test('dimensions and scale write independent simulated properties', async ({ page }) => {
  const element = await openGeometry(page); const width = await element.evaluate(element => element.style.width); const height = await element.evaluate(element => element.style.height);
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click(); await drag(page, 'dimensions', { x: 24, y: 18 });
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
  expect(await element.evaluate(element => element.style.width)).not.toBe(width); expect(await element.evaluate(element => element.style.height)).not.toBe(height);
  await page.locator('#undo').click();
  await page.getByRole('button', { name: 'Échelle', exact: true }).click(); await drag(page, 'scale', { x: 24, y: 18 });
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation');
  expect(await element.evaluate(element => element.style.width)).toBe(width); expect(await element.evaluate(element => element.style.height)).toBe(height);
  expect(await page.locator('#properties input[data-property="scaleX"]').inputValue()).not.toBe('1');
  expect(await page.locator('#properties input[data-property="scaleY"]').inputValue()).not.toBe('1');
  await page.locator('#undo').click(); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
});

for (const scenario of [
  { name: 'unrotated relative pivot', rotation: '0deg', pivotX: '50%', pivotY: '50%' },
  { name: 'rotated relative pivot', rotation: '90deg', pivotX: '50%', pivotY: '50%' },
  { name: 'rotated asymmetric pivot', rotation: '90deg', pivotX: '0%', pivotY: '50%' },
  { name: 'rotated fixed pivot', rotation: '90deg', pivotX: '80px', pivotY: '48px' },
]) test(`the dimensions corner follows the pointer with a ${scenario.name} and undo restores it`, async ({ page }, testInfo) => {
  const element = await openGeometry(page);
  for (const [property, value] of [['rotation', scenario.rotation], ['pivotX', scenario.pivotX], ['pivotY', scenario.pivotY]]) {
    const input = page.locator(`#properties input[data-property="${property}"]`); await input.fill(value ?? ''); await input.press('Tab');
  }
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click();
  const before = await corners(element); const handle = page.locator('[data-geometry-handle="dimensions"]'); const start = await startDrag(page, handle);
  for (const delta of [{ x: 10, y: 0 }, { x: 20, y: 8 }, { x: -8, y: 12 }]) {
    await page.mouse.move(start.x + delta.x, start.y + delta.y);
    const corner = (await corners(element))[2]; if (!corner) throw new Error('The geometry corner is missing.');
    const position = await bounds(handle); const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(Math.abs(corner.x - scroll.x - start.x - delta.x)).toBeLessThan(0.5); expect(Math.abs(corner.y - scroll.y - start.y - delta.y)).toBeLessThan(0.5);
    expect(Math.abs(position.x + position.width / 2 - start.x - delta.x)).toBeLessThan(0.5); expect(Math.abs(position.y + position.height / 2 - start.y - delta.y)).toBeLessThan(0.5);
  }
  if (scenario.name === 'rotated relative pivot') await page.screenshot({ path: testInfo.outputPath('dimensions-rotated-corner.png'), animations: 'disabled' });
  await page.mouse.up(); await page.locator('#undo').click(); const restored = await corners(element);
  for (const [index, point] of before.entries()) { expect(Math.abs((restored[index]?.x ?? 0) - point.x)).toBeLessThan(0.5); expect(Math.abs((restored[index]?.y ?? 0) - point.y)).toBeLessThan(0.5); }
});

test('a singular dimensions gesture explains its refusal without adding simulated keys', async ({ page }) => {
  const element = await openGeometry(page); const rotation = page.locator('#properties input[data-property="rotation"]'); await rotation.fill('180deg'); await rotation.press('Tab');
  const before = await corners(element); const keys = await page.locator('#key-count').textContent();
  const transform = await element.evaluate(element => getComputedStyle(element).transform);
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click(); await drag(page, 'dimensions', { x: 20, y: 10 });
  await expect(page.locator('.geometry-status')).toContainText('origine'); await expect(page.locator('#key-count')).toHaveText(keys ?? '');
  expect(await element.evaluate(element => getComputedStyle(element).transform)).toBe(transform);
  const after = await corners(element);
  // Scroll changes alter floating-point addition in document coordinates (Firefox).
  for (const [index, point] of after.entries()) for (const axis of ['x', 'y'] as const) expect(Math.abs(point[axis] - (before[index]?.[axis] ?? Number.NaN))).toBeLessThan(0.0001);
});

test('controlled percentage translations remain relative while the dimensions corner follows the pointer', async ({ page }) => {
  const element = await openGeometry(page);
  for (const [property, value] of [['translateX', '50%'], ['translateY', '25%']]) {
    const input = page.locator(`#properties input[data-property="${property}"]`); await input.fill(value ?? ''); await input.press('Tab');
  }
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click(); const start = await startDrag(page, page.locator('[data-geometry-handle="dimensions"]'));
  await page.mouse.move(start.x + 24, start.y + 15); const corner = (await corners(element))[2]; if (!corner) throw new Error('The geometry corner is missing.'); const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  expect(Math.abs(corner.x - scroll.x - start.x - 24)).toBeLessThan(0.5); expect(Math.abs(corner.y - scroll.y - start.y - 15)).toBeLessThan(0.5);
  await page.mouse.up(); await expect(page.locator('#properties input[data-property="translateX"]')).toHaveValue('50%'); await expect(page.locator('#properties input[data-property="translateY"]')).toHaveValue('25%');
  await page.locator('#undo').click(); await expect(page.locator('#properties input[data-property="width"]')).toHaveValue('160px'); await expect(page.locator('#properties input[data-property="height"]')).toHaveValue('96px');
});

test('moving a pivot after rotation and scale preserves all visual corners and is reversible', async ({ page }) => {
  const element = await openGeometry(page);
  await page.getByRole('button', { name: 'Rotation', exact: true }).click();
  const start = await startDrag(page, page.locator('[data-geometry-handle="rotate"]'));
  const initial = await bounds(element); const center = { x: initial.x + initial.width / 2, y: initial.y + initial.height / 2 };
  await page.mouse.move(center.x - (start.y - center.y), center.y + (start.x - center.x), { steps: 4 }); await page.mouse.up();
  await expect(page.locator('#key-count')).toHaveText('1 clés · simulation');
  await page.getByRole('button', { name: 'Échelle', exact: true }).click(); await drag(page, 'scale', { x: 14, y: 19 });
  const before = await corners(element); const oldPivot = await page.locator('#properties input[data-property="pivotX"]').inputValue();
  await page.getByRole('button', { name: 'Pivot', exact: true }).click(); await page.getByRole('button', { name: 'Pivot haut gauche', exact: true }).click();
  const after = await corners(element);
  expect(after).toHaveLength(before.length);
  for (const [index, point] of before.entries()) { expect(Math.abs((after[index]?.x ?? 0) - point.x)).toBeLessThan(0.5); expect(Math.abs((after[index]?.y ?? 0) - point.y)).toBeLessThan(0.5); }
  await expect(page.locator('#properties input[data-property="pivotX"]')).toHaveValue(/^0(?:%|px)$/); await expect(page.locator('#properties input[data-property="pivotY"]')).toHaveValue(/^0(?:%|px)$/);
  await page.locator('#undo').click(); await expect(page.locator('#properties input[data-property="pivotX"]')).toHaveValue(oldPivot);
  await page.locator('#redo').click(); await expect(page.locator('#properties input[data-property="pivotX"]')).toHaveValue(/^0(?:%|px)$/);
});

test('fractional dimensions preserve the corners when changing pivot and keep the resize handle under the pointer', async ({ page }) => {
  const element = await openGeometry(page);
  for (const [property, value] of [['width', '160.4px'], ['height', '96.4px'], ['rotation', '90deg'], ['scaleX', '3'], ['scaleY', '2']]) {
    const input = page.locator(`#properties input[data-property="${property}"]`); await input.fill(value ?? ''); await input.press('Tab');
  }
  const before = await corners(element); await page.getByRole('button', { name: 'Pivot', exact: true }).click(); await page.getByRole('button', { name: 'Pivot haut gauche', exact: true }).click(); const after = await corners(element);
  for (const [index, point] of before.entries()) { expect(Math.abs((after[index]?.x ?? 0) - point.x)).toBeLessThan(0.5); expect(Math.abs((after[index]?.y ?? 0) - point.y)).toBeLessThan(0.5); }
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click(); const handle = page.locator('[data-geometry-handle="dimensions"]'); const start = await startDrag(page, handle);
  await page.mouse.move(start.x + 20, start.y + 8); const corner = (await corners(element))[2]; if (!corner) throw new Error('The geometry corner is missing.');
  const position = await bounds(handle); const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  expect(Math.abs(corner.x - scroll.x - start.x - 20)).toBeLessThan(0.5); expect(Math.abs(corner.y - scroll.y - start.y - 8)).toBeLessThan(0.5);
  expect(Math.abs(position.x + position.width / 2 - start.x - 20)).toBeLessThan(0.5); expect(Math.abs(position.y + position.height / 2 - start.y - 8)).toBeLessThan(0.5);
  await page.mouse.up(); await page.locator('#undo').click(); const restored = await corners(element);
  for (const [index, point] of after.entries()) { expect(Math.abs((restored[index]?.x ?? 0) - point.x)).toBeLessThan(0.5); expect(Math.abs((restored[index]?.y ?? 0) - point.y)).toBeLessThan(0.5); }
});

test('focused movement handle supports precise keyboard commands without hijacking inputs', async ({ page }) => {
  const element = await openGeometry(page); const original = await documentBounds(element);
  const input = page.locator('#properties input[data-property="width"]'); await input.focus(); await input.press('ArrowRight'); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
  const handle = page.locator('[data-geometry-handle="move"]'); await handle.focus(); await handle.press('ArrowRight');
  await expectPosition(element, { x: original.x + 1, y: original.y });
  await handle.press('Shift+ArrowDown'); await expectPosition(element, { x: original.x + 1, y: original.y + 10 });
  await page.locator('#undo').click(); await expectPosition(element, { x: original.x + 1, y: original.y });
  await page.locator('#undo').click(); await expectPosition(element, original); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
});

test('Alt temporarily bypasses simulated snapping while the optional grid stays visible', async ({ page }) => {
  const element = await openGeometry(page); const original = await documentBounds(element);
  await page.getByLabel('Grille', { exact: true }).setChecked(true); await page.getByLabel('Accrochage', { exact: true }).setChecked(true); await page.getByLabel('Guides', { exact: true }).setChecked(true);
  await expect(page.locator('.HtmlDesignerGeometryGrid')).toBeVisible();
  const first = await startDrag(page, page.locator('[data-geometry-handle="move"]')); await page.mouse.move(first.x + 13, first.y + 17);
  await expect(page.locator('.HtmlDesignerGeometryGuide').first()).toBeVisible(); await page.mouse.up(); const snapped = await documentBounds(element);
  await page.locator('#undo').click(); await expectPosition(element, original);
  await page.keyboard.down('Alt'); const second = await startDrag(page, page.locator('[data-geometry-handle="move"]')); await page.mouse.move(second.x + 13, second.y + 17);
  await expectPosition(element, { x: original.x + 13, y: original.y + 17 }); await expect(page.locator('.HtmlDesignerGeometryGuide')).toHaveCount(0);
  await page.mouse.up(); await page.keyboard.up('Alt');
  expect(Math.abs(snapped.x - original.x - 13) > 0.25 || Math.abs(snapped.y - original.y - 17) > 0.25).toBe(true);
});

test('a second scale gesture uses the same spatial increment after a non-unit scale', async ({ page }) => {
  await openGeometry(page); await page.getByRole('button', { name: 'Échelle', exact: true }).click();
  const x = page.locator('#properties input[data-property="scaleX"]'); const y = page.locator('#properties input[data-property="scaleY"]');
  await drag(page, 'scale', { x: 20, y: 10 }); const firstX = Number(await x.inputValue()); const firstY = Number(await y.inputValue());
  await drag(page, 'scale', { x: 20, y: 10 });
  expect(Number(await x.inputValue()) - firstX).toBeCloseTo(firstX - 1, 5); expect(Number(await y.inputValue()) - firstY).toBeCloseTo(firstY - 1, 5);
  await page.locator('#undo').click(); await expect(x).toHaveValue(String(firstX)); await page.locator('#undo').click(); await expect(x).toHaveValue('1'); await expect(y).toHaveValue('1');
});

test('scale handles follow the pointer with a constant baseline translation and two existing scales', async ({ page }) => {
  const element = await openGeometry(page);
  for (const [property, value] of [['transform', 'translate(20px, 12px)'], ['rotation', '90deg'], ['scaleX', '2'], ['scaleY', '3'], ['translateX', '10px'], ['translateY', '20px']]) {
    const input = page.locator(`#properties input[data-property="${property}"]`); await input.fill(value ?? ''); await input.press('Tab');
  }
  await page.getByRole('button', { name: 'Échelle', exact: true }).click(); const before = await corners(element); const handle = page.locator('[data-geometry-handle="scale"]');
  for (let gesture = 0; gesture < 2; gesture++) {
    const start = await startDrag(page, handle); await page.mouse.move(start.x + 10, start.y + 8);
    const corner = (await corners(element))[2]; if (!corner) throw new Error('The geometry corner is missing.'); const position = await bounds(handle); const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(Math.abs(corner.x - scroll.x - start.x - 10)).toBeLessThan(0.5); expect(Math.abs(corner.y - scroll.y - start.y - 8)).toBeLessThan(0.5);
    expect(Math.abs(position.x + position.width / 2 - start.x - 10)).toBeLessThan(0.5); expect(Math.abs(position.y + position.height / 2 - start.y - 8)).toBeLessThan(0.5); await page.mouse.up();
  }
  await page.locator('#undo').click(); await page.locator('#undo').click(); const restored = await corners(element);
  for (const [index, point] of before.entries()) { expect(Math.abs((restored[index]?.x ?? 0) - point.x)).toBeLessThan(0.5); expect(Math.abs((restored[index]?.y ?? 0) - point.y)).toBeLessThan(0.5); }
});

test('converting a source expression requires consent and remains one reversible command', async ({ page }) => {
  const element = await openGeometry(page, 'geometry-expression'); const originalWidth = await element.evaluate(element => element.style.width); const original = await documentBounds(element);
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click(); await drag(page, 'dimensions', { x: 20, y: 12 });
  await expect(page.locator('.geometry-confirmation')).toBeVisible(); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation'); await expectPosition(element, original);
  expect(await element.evaluate(element => element.style.width)).toBe(originalWidth);
  await page.getByRole('button', { name: 'Annuler le geste', exact: true }).click(); await expect(page.locator('.geometry-confirmation')).toBeHidden(); await expect(page.locator('#undo')).toBeDisabled();
  await drag(page, 'dimensions', { x: 20, y: 12 }); await page.getByRole('button', { name: 'Convertir en pixels et appliquer', exact: true }).click();
  await expect(page.locator('#key-count')).toHaveText('2 clés · simulation'); expect(await element.evaluate(element => element.style.width)).toMatch(/px$/);
  expect((await documentBounds(element)).width - original.width).toBeCloseTo(20, 1);
  await page.locator('#undo').click(); expect(await element.evaluate(element => element.style.width)).toBe(originalWidth); await expect(page.locator('#key-count')).toHaveText('0 clés · simulation');
});

test('the simulated geometry workbench has no detected WCAG A/AA violations', async ({ page }) => {
  await openGeometry(page); const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(results.violations).toEqual([]);
});

for (const width of [320, 1440]) test(`geometry tools fit a ${width}px viewport`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await openGeometry(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`geometry-${width}.png`), fullPage: true, animations: 'disabled' });
});
