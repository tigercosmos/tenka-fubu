import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import type { SaveFile } from '../src/core/save/serialize';

async function newPausedGame(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
}

async function openPanel(page: Page, mode: 'save' | 'load'): Promise<void> {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: mode === 'save' ? '存檔' : '讀檔', exact: true }).click();
  await expect(page.getByTestId('save-load-panel')).toHaveAttribute('aria-busy', 'false');
}

async function closePanel(page: Page): Promise<void> {
  await page
    .getByTestId('save-load-panel')
    .getByRole('button', { name: '返回', exact: true })
    .click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
}

async function day(page: Page): Promise<number> {
  return page.evaluate(() => window.__tenka.debug.getState().time.day);
}

test('manual slots, overwrite/delete cancel-first and dirty load keep one system pause owner', async ({
  page,
}) => {
  await newPausedGame(page);
  const savedDay = await day(page);
  await openPanel(page, 'save');
  const panel = page.getByTestId('save-load-panel');
  await expect(panel.locator('ol > li')).toHaveCount(14);
  await expect(
    page.getByTestId('save-slot-auto:1').getByRole('button', { name: '存檔', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByTestId('save-slot-quick:1').getByRole('button', { name: '存檔', exact: true }),
  ).toBeDisabled();
  const slot = page.getByTestId('save-slot-manual:1');
  await slot.getByRole('button', { name: '存檔', exact: true }).click();
  await expect(slot).toContainText('織田');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await slot.getByRole('button', { name: '存檔', exact: true }).click();
  let confirmation = page.getByRole('dialog').last();
  await expect(confirmation).toContainText('要覆蓋');
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(slot).toContainText('織田');
  await slot.getByRole('button', { name: '刪除', exact: true }).click();
  confirmation = page.getByRole('dialog').last();
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(slot).toContainText('織田');
  await closePanel(page);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('speed-1').click();
  await expect.poll(() => day(page)).toBeGreaterThan(savedDay);
  await page.getByTestId('speed-pause').click();
  const dirtyDay = await day(page);
  await openPanel(page, 'load');
  await slot.getByRole('button', { name: '載入', exact: true }).click();
  confirmation = page.getByRole('dialog').last();
  await expect(confirmation).toContainText('尚有未存檔的進度');
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(await day(page)).toBe(dirtyDay);
  await slot.getByRole('button', { name: '載入', exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => day(page)).toBe(savedDay);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');

  await openPanel(page, 'load');
  await slot.getByRole('button', { name: '刪除', exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(slot).toContainText('（空）');
  await expect(slot.getByRole('button', { name: '載入', exact: true })).toBeDisabled();
  await closePanel(page);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
});

test('export/import preview is non-mutating, stores only manual slots and loads from title after reload', async ({
  page,
}) => {
  await newPausedGame(page);
  const savedDay = await day(page);
  await openPanel(page, 'save');
  const manual = page.getByTestId('save-slot-manual:1');
  await manual.getByRole('button', { name: '存檔', exact: true }).click();
  await expect(manual).toContainText('織田');
  const downloading = page.waitForEvent('download');
  await manual.getByRole('button', { name: '匯出', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^tenkafubu_oda_.*\.tenkafubu\.json$/u);
  const path = await download.path();
  expect(path).not.toBeNull();
  const raw = await readFile(path, 'utf8');
  const exported = JSON.parse(raw) as SaveFile;
  expect(exported.state.time.day).toBe(savedDay);
  expect(exported.pendingCommands).toEqual([]);
  await closePanel(page);
  await openPanel(page, 'load');
  const panel = page.getByTestId('save-load-panel');
  const choosing = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'backup.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  expect(await day(page)).toBe(savedDay);
  await expect(panel.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await expect(panel.getByRole('combobox').locator('option')).toHaveCount(10);
  await panel.getByRole('combobox').selectOption('manual:2');
  await panel.getByRole('button', { name: '存入槽位', exact: true }).click();
  await expect(page.getByTestId('save-slot-manual:2')).toContainText('織田');
  expect(await day(page)).toBe(savedDay);
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  await expect(panel.getByTestId('save-import-file')).toHaveCount(1);
  await closePanel(page);

  await page.reload();
  await page.getByTestId('title-save-list').click();
  await expect(panel).toHaveAttribute('data-context', 'title');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(panel.locator('ol > li')).toHaveCount(14);
  await page
    .getByTestId('save-slot-manual:2')
    .getByRole('button', { name: '載入', exact: true })
    .click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await day(page)).toBe(savedDay);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
});

test('invalid import reports an error; valid direct import always requires cancel-first confirmation', async ({
  page,
}) => {
  await newPausedGame(page);
  const savedDay = await day(page);
  await openPanel(page, 'load');
  const panel = page.getByTestId('save-load-panel');
  await panel.getByTestId('save-import-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await expect(panel.getByRole('alert')).toBeVisible();
  expect(await day(page)).toBe(savedDay);
  const downloading = page.waitForEvent('download');
  await panel.getByRole('button', { name: '匯出目前進度', exact: true }).click();
  const download = await downloading;
  const path = await download.path();
  expect(path).not.toBeNull();
  await panel.getByTestId('save-import-file').setInputFiles(path);
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '直接開始', exact: true }).click();
  const confirmation = page.getByRole('dialog').last();
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  expect(await day(page)).toBe(savedDay);
  await panel.getByRole('button', { name: '直接開始', exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await day(page)).toBe(savedDay);
});

test('F9 dirty quick load is cancel-first and restores the saved day only after confirmation', async ({
  page,
}) => {
  await newPausedGame(page);
  const initialDay = await day(page);
  await page.getByTestId('speed-1').click();
  await expect.poll(() => day(page)).toBeGreaterThan(initialDay);
  await page.getByTestId('speed-pause').click();
  const savedDay = await day(page);
  await page.keyboard.press('Control+s');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(false);
  await openPanel(page, 'load');
  await expect(page.getByTestId('save-slot-quick:1')).toContainText('織田');
  await closePanel(page);
  await page.getByTestId('speed-1').click();
  await expect.poll(() => day(page)).toBeGreaterThan(savedDay);
  await page.getByTestId('speed-pause').click();
  const dirtyDay = await day(page);
  await page.keyboard.press('F9');
  const confirmation = page.getByRole('dialog').last();
  await expect(confirmation).toContainText('尚有未存檔的進度');
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('1');
  await expect(confirmation).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  // Space retains native Cancel-button activation, without toggling the underlying game pause.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  expect(await day(page)).toBe(dirtyDay);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await day(page)).toBe(dirtyDay);
  await page.keyboard.press('F9');
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => day(page)).toBe(savedDay);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
});
