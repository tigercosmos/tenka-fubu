import { completeNewGameWizard } from './new-game-wizard';
import { readFile } from 'node:fs/promises';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';
import { checkSharedPanelFrame } from './helpers/sharedPanelFrame';

async function newPausedGame(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
}

async function guardedEscapeDiagnostics(target: Locator, testInfo: TestInfo): Promise<void> {
  // Diagnostic browser DOM events exercise the real React handler. They are NOT native IME proof.
  const results = [];
  for (const flags of [{ prevented: true }, { repeat: true }, { isComposing: true }]) {
    results.push(
      await target.evaluate((element, options) => {
        const event = new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
          repeat: 'repeat' in options && options.repeat === true,
          isComposing: 'isComposing' in options && options.isComposing === true,
        });
        if ('prevented' in options && options.prevented) event.preventDefault();
        element.dispatchEvent(event);
        return {
          flags: options,
          defaultPrevented: event.defaultPrevented,
          repeat: event.repeat,
          composing: event.isComposing,
        };
      }, flags),
    );
    await expect(target).toBeVisible();
  }
  await testInfo.attach('synthetic-escape-guard-flags', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
}

async function importCurrentPreview(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '讀檔', exact: true }).click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const downloading = page.waitForEvent('download');
  await panel.getByRole('button', { name: '匯出目前進度', exact: true }).click();
  const download = await downloading;
  const path = await download.path();
  expect(path).not.toBeNull();
  const raw = await readFile(path, 'utf8');
  await panel.getByTestId('save-import-file').setInputFiles({
    name: 'dialog-keyboard.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  return panel;
}

test('SystemMenu settings Escape leaves slider focus first; repeat and composing/prevented guards keep the owner', async ({
  page,
}, testInfo) => {
  await newPausedGame(page);
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const settings = page.getByRole('dialog');
  const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.focus();
  await guardedEscapeDiagnostics(slider, testInfo);
  await expect(slider).toBeFocused();
  // Playwright keyboard.down twice supplies real browser repeat, without an artificial repeat flag.
  await page.keyboard.down('Escape');
  await expect(slider).not.toBeFocused();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await page.keyboard.down('Escape');
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await page.keyboard.up('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '回到遊戲', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
});

test('real SaveLoad native select Escape retains its dialog before returning to SystemMenu', async ({
  page,
}) => {
  await newPausedGame(page);
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const panel = await importCurrentPreview(page);
  const select = panel.getByRole('combobox', { name: '選擇手動槽位', exact: true });
  await select.focus();
  // Activate the actual browser SELECT, not a mock popup. OS popup/IME internals are not asserted.
  await select.press('Space');
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await select.focus();
  await page.keyboard.press('Escape');
  await expect(select).not.toBeFocused();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: '回到遊戲', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
});

test('parent-owned import confirmation preserves dialog identity, guarded Escape and cancel-first Enter without loading or changing core', async ({
  page,
}, testInfo) => {
  await newPausedGame(page);
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const panel = await importCurrentPreview(page);
  const parent = await page.getByRole('dialog').elementHandle();
  expect(parent).not.toBeNull();
  await panel.getByRole('button', { name: '直接開始', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toHaveCount(1);
  expect(await confirmation.evaluate((node, original) => node === original, parent)).toBe(true);
  await expect(panel).toBeHidden();
  const cancel = confirmation.getByRole('button', { name: '取消', exact: true });
  await checkSharedPanelFrame(confirmation, 'dialog', testInfo, 'native-import-consent-frame');
  await expect(cancel).toBeFocused();
  await guardedEscapeDiagnostics(cancel, testInfo);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(panel).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(panel).toBeVisible();
  expect(await confirmation.evaluate((node, original) => node === original, parent)).toBe(true);
  await panel.getByRole('button', { name: '直接開始', exact: true }).click();
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await expect(panel).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(panel).toBeVisible();
  expect(await confirmation.evaluate((node, original) => node === original, parent)).toBe(true);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await parent!.dispose();
});
