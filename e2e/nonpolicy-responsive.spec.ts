import { writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

const SCALES = Array.from({ length: 15 }, (_, index) => Number((0.8 + index * 0.05).toFixed(2)));
const VIEWPORT = { width: 1280, height: 720 };

async function newGameAtScale(page: Page, scale: number): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-settings').click();
  const settings = page.getByRole('dialog');
  const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press('Home');
  for (let step = 0; step < Math.round((scale - 0.8) / 0.05); step++)
    await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.evaluate(() => window.__tenka.debug.waitMapIdle());
}

async function visibleTarget(page: Page, target: Locator, label: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await expect(target, label).toBeVisible();
  const box = (await target.boundingBox())!;
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(32);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(32);
  expect(box.x, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label} top`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label} right`).toBeLessThanOrEqual(VIEWPORT.width + 1);
  expect(box.y + box.height, `${label} bottom`).toBeLessThanOrEqual(VIEWPORT.height + 1);
  expect(
    await target.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit !== null && (node === hit || node.contains(hit));
    }),
    `${label} center remains clickable`,
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
}

async function sizes(
  root: Locator,
  selector: string,
): Promise<{ count: number; minWidth: number; minHeight: number }> {
  return root.locator(selector).evaluateAll((nodes) => {
    const rectangles = nodes.map((node) => node.getBoundingClientRect());
    return {
      count: rectangles.length,
      minWidth: Math.min(...rectangles.map((rect) => rect.width)),
      minHeight: Math.min(...rectangles.map((rect) => rect.height)),
    };
  });
}

for (const scale of SCALES) {
  test(`officer table remains usable at uiScale ${scale}`, async ({ page }, info) => {
    await newGameAtScale(page, scale);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('F4');
    const list = page.getByTestId('officer-list');
    await expect(list).toBeVisible();
    await expect(page.getByTestId('reports-open')).toHaveCount(0);
    const panel = list.locator(':scope > div');
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x).toBeGreaterThanOrEqual(-1);
    expect(panelBox.y).toBeGreaterThanOrEqual(-1);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(1281);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(721);
    const recruit = list.getByRole('button', { name: '浪人登用與捕虜', exact: true });
    const reward = list.getByRole('button', { name: '褒賞家臣', exact: true });
    await visibleTarget(page, recruit, 'officer recruit');
    await visibleTarget(page, reward, 'officer reward');
    await recruit.press('Tab');
    await expect(reward).toBeFocused();
    const controls = await sizes(list, 'button, select, input');
    expect(controls.count).toBeGreaterThan(8);
    expect(controls.minWidth).toBeGreaterThanOrEqual(32);
    expect(controls.minHeight).toBeGreaterThanOrEqual(32);
    const rows = list.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
    const rowSizes = await sizes(list, 'tbody tr');
    expect(rowSizes.minHeight).toBeGreaterThanOrEqual(32);
    const lastNameCell = rows.last().locator('td').first();
    await visibleTarget(page, lastNameCell, 'last officer name cell');
    const tableViewport = list.locator('table').locator('..');
    const tableWidths = await tableViewport.evaluate((node) => ({
      client: node.clientWidth,
      scroll: node.scrollWidth,
    }));
    await tableViewport.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    const lastRoleCell = rows.last().locator('td').last();
    await visibleTarget(page, lastRoleCell, 'last officer role cell');
    if (tableWidths.scroll > tableWidths.client + 1)
      expect(await tableViewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    if ([0.8, 1, 1.5].includes(scale))
      await page.screenshot({ path: info.outputPath(`officer-${scale}.png`) });
    await rows.last().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('officer-detail')).toBeVisible();
    await writeFile(
      info.outputPath(`officer-${scale}.json`),
      JSON.stringify({ scale, controls, rowSizes, tableWidths }),
    );
  });

  test(`settings remain usable at uiScale ${scale}`, async ({ page }, info) => {
    await newGameAtScale(page, scale);
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '設定', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const settings = page.getByTestId('settings-panel');
    await expect(settings).toBeVisible();
    await visibleTarget(
      page,
      settings.getByRole('button', { name: '返回', exact: true }),
      'settings back',
    );
    const controls = await sizes(settings, 'button, select, input, label.choice');
    expect(controls.count).toBeGreaterThan(10);
    expect(controls.minWidth).toBeGreaterThanOrEqual(32);
    expect(controls.minHeight).toBeGreaterThanOrEqual(32);
    const reset = settings.getByRole('button', { name: '回復預設值', exact: true });
    await visibleTarget(page, reset, 'settings reset');
    await reset.press('Enter');
    await expect(page.getByRole('dialog', { name: '回復預設值' })).toBeVisible();
    await page
      .getByRole('dialog', { name: '回復預設值' })
      .getByRole('button', { name: '取消' })
      .click();
    await expect(settings).toBeVisible();
    await writeFile(info.outputPath(`settings-${scale}.json`), JSON.stringify({ scale, controls }));
    if ([0.8, 1, 1.5].includes(scale))
      await page.screenshot({ path: info.outputPath(`settings-${scale}.png`) });
    await settings.getByRole('button', { name: '返回', exact: true }).click();
    await expect(settings).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '回到遊戲', exact: true })).toBeVisible();
  });

  test(`save and load slots remain usable at uiScale ${scale}`, async ({ page }, info) => {
    await newGameAtScale(page, scale);
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '存檔', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const panel = page.getByTestId('save-load-panel');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    const slots = panel.locator('[data-testid^="save-slot-"]');
    await expect(slots).toHaveCount(14);
    const controls = await sizes(panel, 'button');
    expect(controls.minWidth).toBeGreaterThanOrEqual(32);
    expect(controls.minHeight).toBeGreaterThanOrEqual(32);
    const lastManual = panel.getByTestId('save-slot-manual:10');
    const lastSave = lastManual.getByRole('button', { name: '存檔', exact: true });
    await visibleTarget(page, lastSave, 'last manual save');
    await lastSave.press('Enter');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await expect(lastManual).not.toContainText('（空）');
    await writeFile(info.outputPath(`save-${scale}.json`), JSON.stringify({ scale, controls }));
    if ([0.8, 1, 1.5].includes(scale))
      await page.screenshot({ path: info.outputPath(`save-${scale}.png`) });
    await visibleTarget(
      page,
      panel.getByRole('button', { name: '返回', exact: true }),
      'save back',
    );
    await panel.getByRole('button', { name: '返回', exact: true }).click();
    await dialog.getByRole('button', { name: '讀檔', exact: true }).click();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    const lastLoad = panel
      .getByTestId('save-slot-manual:10')
      .getByRole('button', { name: '載入', exact: true });
    await visibleTarget(page, lastLoad, 'last manual load');
    await expect(lastLoad).toBeEnabled();
    const importButton = panel.getByRole('button', { name: '匯入存檔', exact: true });
    await visibleTarget(page, importButton, 'save import');
    if ([0.8, 1, 1.5].includes(scale))
      await page.screenshot({ path: info.outputPath(`load-${scale}.png`) });
  });
}
