import { completeNewGameWizard } from './new-game-wizard';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { SaveFile } from '../src/core/save/serialize';
import { DEBUG_M6_FLOW_IDS as ids } from '../src/core/debugM6';
import LZString from 'lz-string';

async function newPausedGame(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
}

async function readQuickBlob(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === 'keyval-store')) return null;
    return new Promise<string | null>((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction('keyval', 'readonly');
        const request = transaction.objectStore('keyval').get('tf.save.quick:1.blob');
        request.onsuccess = () =>
          resolve(typeof request.result === 'string' ? request.result : null);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
        transaction.oncomplete = () => db.close();
        transaction.onabort = () => db.close();
      };
    });
  });
}

async function saveQuick(page: Page): Promise<void> {
  const previous = await readQuickBlob(page);
  await page.keyboard.press('Control+s');
  await expect.poll(() => readQuickBlob(page)).not.toBe(previous);
}

async function readQuickSave(page: Page): Promise<SaveFile> {
  const raw = await readQuickBlob(page);
  expect(raw).not.toBeNull();
  return JSON.parse(LZString.decompressFromUTF16(raw!)) as SaveFile;
}

async function navigationBlocked(page: Page): Promise<boolean> {
  // A diagnostic event exercises the installed listener without navigating or showing a dialog.
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

async function rewardProgress(page: Page) {
  return page.evaluate(({ actor, proposalOfficer }) => {
    const game = window.__tenka.debug.getState();
    return {
      day: game.time.day,
      tick: game.meta.stateVersion,
      seq: game.meta.lastAppliedCmdSeq,
      gold: game.clans[actor]!.gold,
      gifts: game.officers[proposalOfficer]!.rewardGiftsThisYear,
    };
  }, ids);
}

test('paused DOM orders survive quick save and continue, then execute once through normal resume', async ({
  page,
}) => {
  await newPausedGame(page);
  expect(await navigationBlocked(page)).toBe(false);
  await page.getByTestId('rail-officers').click();
  await page
    .getByTestId('officer-list')
    .locator('tbody tr')
    .filter({ hasText: '丹羽長秀' })
    .click();
  const detail = page.getByTestId('officer-detail');
  await expect(detail).toBeVisible();
  const before = await rewardProgress(page);
  const reward = detail.getByRole('button', { name: /小.*貫/ });
  await expect(reward).toBeEnabled();
  await reward.click();
  await expect(page.getByRole('status').filter({ hasText: /命令待下一日執行/ })).toBeVisible();
  expect(await rewardProgress(page)).toEqual(before);
  expect(await navigationBlocked(page)).toBe(true);
  await detail.getByRole('button', { name: /^丹羽長秀・/ }).click();
  await expect(detail).toHaveCount(0);
  // Real app-only elapsed time must reach the canonical metadata, without changing core time.
  await page.waitForTimeout(1100);
  await saveQuick(page);
  const saved = await readQuickSave(page);
  expect(saved.pendingCommands).toEqual([
    {
      type: 'rewardOfficer',
      clanId: ids.actor,
      officerId: ids.proposalOfficer,
      tier: 'small',
    },
  ]);
  expect(saved.state.time.day).toBe(before.day);
  expect(saved.state.meta.lastAppliedCmdSeq).toBe(before.seq);
  expect(saved.meta).toMatchObject({
    scenarioId: 's1560',
    clanId: ids.actor,
    version: saved.version,
    slotLabel: '',
  });
  expect(saved.meta.playtimeSeconds).toBeGreaterThanOrEqual(1);
  expect(saved.meta.seed).toBe(saved.state.meta.seed);
  expect(saved.meta.date).toEqual({
    year: saved.state.time.year,
    month: saved.state.time.month,
    day: saved.state.time.dayOfMonth,
  });
  expect(await navigationBlocked(page)).toBe(false);

  await page.reload();
  await page.getByTestId('title-loadgame').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  expect(await rewardProgress(page)).toEqual(before);
  expect(await navigationBlocked(page)).toBe(false);
  // Saving again before any tick proves that continue restored the queued intent, not just state.
  await saveQuick(page);
  const restored = await readQuickSave(page);
  expect(restored.pendingCommands).toEqual(saved.pendingCommands);
  expect(restored.meta.playtimeSeconds).toBeGreaterThanOrEqual(saved.meta.playtimeSeconds!);

  await page.getByTestId('speed-1').click();
  await expect.poll(async () => (await rewardProgress(page)).gifts).toBe(before.gifts + 1);
  await page.getByTestId('speed-pause').click();
  const after = await rewardProgress(page);
  expect(after.day).toBeGreaterThan(before.day);
  // Normal resume can run multiple days and consume AI orders; the officer counter proves once-only execution.
  expect(after.seq).toBeGreaterThan(before.seq);
  expect(after.gold).toBeLessThan(before.gold);
  expect(await navigationBlocked(page)).toBe(true);
  await saveQuick(page);
  expect((await readQuickSave(page)).pendingCommands).toEqual([]);
  expect(await navigationBlocked(page)).toBe(false);
  // There is no normal single-step control. A second normal resume checks no repeated application.
  await page.getByTestId('speed-1').click();
  await expect.poll(async () => (await rewardProgress(page)).day).toBeGreaterThan(after.day);
  await page.getByTestId('speed-pause').click();
  expect((await rewardProgress(page)).gifts).toBe(before.gifts + 1);
});

test('modal Ctrl+S leaves the existing quick save unchanged', async ({ page }) => {
  await newPausedGame(page);
  await saveQuick(page);
  const before = await readQuickBlob(page);
  expect(before).not.toBeNull();
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await expect(page.getByRole('button', { name: '回到遊戲', exact: true })).toBeVisible();
  await page.keyboard.press('Control+s');
  expect(await readQuickBlob(page)).toBe(before);
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  expect(await navigationBlocked(page)).toBe(false);
});
