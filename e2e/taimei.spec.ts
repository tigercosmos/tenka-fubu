import { completeNewGameWizard } from './new-game-wizard';
import { readFile } from 'node:fs/promises';
import type { SaveFile } from '../src/core/save/serialize';
import { BAL } from '../src/core/balance';
import { test, expect } from './fixtures';

test('Taimei confirms once, executes on normal Step1, and restores its active HUD from a quick save', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '存檔', exact: true }).click();
  const savePanel = page.getByTestId('save-load-panel');
  await expect(savePanel).toHaveAttribute('aria-busy', 'false');
  const downloadPromise = page.waitForEvent('download');
  await savePanel.getByRole('button', { name: '匯出目前進度', exact: true }).click();
  const path = await (await downloadPromise).path();
  if (path === null) throw new Error('Expected exported save fixture');
  const save = JSON.parse(await readFile(path, 'utf8')) as SaveFile;
  // Explicit test fixture: unlock all eight commands without adding a production cheat.
  const actor = save.state.meta.playerClanId;
  save.state.clans[actor]!.prestige = BAL.prestigeMax;
  await savePanel.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '讀檔', exact: true }).click();
  await expect(savePanel).toHaveAttribute('aria-busy', 'false');
  const chooserPromise = page.waitForEvent('filechooser');
  await savePanel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'taimei-test.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await savePanel.getByRole('button', { name: '直接開始', exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__tenka.debug.getState().clans[window.__tenka.debug.getState().meta.playerClanId]!
            .prestige,
      ),
    )
    .toBe(BAL.prestigeMax);
  await page.keyboard.press('F7');
  const panel = page.getByTestId('taimei-panel');
  await expect(panel).toBeVisible();
  await expect(
    panel.locator('button[aria-pressed]').filter({ has: page.locator('strong') }),
  ).toHaveCount(8);
  await panel.getByRole('button', { name: /疾風迅雷/ }).click();
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  await panel.getByRole('button', { name: '發動大命', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '發動大命', exact: true });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await panel.getByRole('button', { name: '發動大命', exact: true }).click();
  await confirmation.getByRole('button', { name: '確定', exact: true }).click();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await expect(panel.getByRole('button', { name: '發動大命', exact: true })).toBeDisabled();
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  const active = await page.evaluate(() => window.__tenka.debug.getState());
  expect(active.time.day).toBe(before.time.day + 1);
  expect(active.clans[actor]!.prestige).toBe(
    before.clans[actor]!.prestige - BAL.taimeiShippuPrestige,
  );
  expect(active.clans[actor]!.taimei).toEqual({
    activeTaimeiId: 'taimei.shippu-jinrai',
    activeUntilDay: before.time.day + BAL.taimeiShippuDays,
    cooldownUntilDay: before.time.day + BAL.taimeiShippuDays + BAL.taimeiCooldownDays,
  });
  await expect(page.getByTestId('hud-taimei-active')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status').filter({ hasText: '已快速存檔' })).toBeVisible();
  await page.keyboard.press('F9');
  await expect(page.getByTestId('hud-taimei-active')).toBeVisible();
  // The intent log is intentionally transient; every persisted core field stays identical.
  const persisted = structuredClone(active);
  persisted.ai.intentLog = [];
  await expect.poll(() => page.evaluate(() => window.__tenka.debug.getState())).toEqual(persisted);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
});
