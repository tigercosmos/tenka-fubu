import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';
import type { SaveFile } from '../src/core/save/serialize';
import { test, expect } from './fixtures';

const runFile = promisify(execFile);

async function state(page: Page) {
  return page.evaluate(() => window.__tenka.debug.getState());
}

async function loadSlot(page: Page) {
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await page
    .getByTestId('save-slot-manual:2')
    .getByRole('button', { name: '載入', exact: true })
    .click();
  await expect(page.getByTestId('screen-ending')).toBeVisible();
}

async function earnedEnding(page: Page, info: TestInfo) {
  // Actual supported builder subset, not the full-national wizard campaign.
  // Every case freshly earns the save through legal orders and natural AI/events.
  // This child ends before browser gameplay; no stale fixture or debug state setter.
  const artifactPath = info.outputPath('earned-regional-ending.tfusave');
  await mkdir(dirname(artifactPath), { recursive: true });
  const generation = await runFile(
    process.execPath,
    [
      resolve('node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'app',
      'tests/app/earnedRegionalEndingJourney.spec.tsx',
      '--minWorkers=1',
      '--maxWorkers=1',
      '-t',
      'loads the earned regional ending into actual App and continues without a phantom day or repeated victory',
    ],
    { env: { ...process.env, REGIONAL_EARNED_ENDING_SAVE_PATH: artifactPath } },
  );
  await info.attach('earned-regional-route-generation', {
    body: Buffer.from(generation.stdout + generation.stderr),
    contentType: 'text/plain',
  });
  const raw = await readFile(artifactPath, 'utf8');
  const save = JSON.parse(raw) as SaveFile;
  expect(save.state.meta.scenarioId).toBe('s1560');
  expect(save.state.time.day).toBe(373);
  expect(save.state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
  expect(Object.values(save.state.castles)).toHaveLength(9);
  expect(
    Object.values(save.state.castles).every((castle) => castle.ownerClanId === 'clan.takeda'),
  ).toBe(true);
  expect(save.pendingCommands).toEqual([]);
  expect(save.state.events.flags['victory.ack.unification']).toBeUndefined();
  await page.goto('/?debug=1');
  await page.getByTestId('title-save-list').click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const choosing = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'earned-regional-ending.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  await panel.getByRole('combobox').selectOption('manual:2');
  await panel.getByRole('button', { name: '存入槽位', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  await loadSlot(page);
  expect(await state(page)).toEqual(save.state);
  await expect(
    page.getByRole('heading', { name: '天下布武，四海歸一', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('歷時：1年0月', { exact: true })).toBeVisible();
  const stats = save.state.events.stats;
  await expect(
    page.getByText(`合戰：${stats.battlesFought}戰${stats.battlesWon}勝`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`最大版圖：${stats.maxCastles}城`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`最大石高：${Math.trunc(stats.maxKokudaka).toLocaleString('en-US')}石`, {
      exact: true,
    }),
  ).toBeVisible();
  const officers = Object.values(save.state.officers).filter(
    (officer) => officer.status === 'serving' && officer.clanId === 'clan.takeda',
  ).length;
  await expect(page.getByText(`麾下家臣：${officers}名`, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('earned-regional-ending.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('screen-ending')).toBeVisible();
  expect(await state(page)).toEqual(save.state);
  return save;
}

test('genuinely earned supported regional ending loads, continues and survives an actual native quick save', async ({
  page,
}, info) => {
  const save = await earnedEnding(page, info);
  await page.getByTestId('ending-continue').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const continued = await state(page);
  expect(continued.meta.gameOver).toBeNull();
  expect(continued.events.flags['victory.ack.unification']).toBe(1);
  expect(continued.time).toEqual(save.state.time);
  expect(continued.rng).toEqual(save.state.rng);
  // The genuinely earned campaign retains six mandatory proposals. Resolve
  // their real UI decisions instead of bypassing the production pause owner.
  const proposals = page.getByRole('dialog', { name: /具申/ });
  await expect(proposals).toBeVisible();
  await proposals.getByRole('button', { name: '全部駁回', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('speed-1')).toBeEnabled();
  await page.getByTestId('speed-1').click();
  await expect.poll(async () => (await state(page)).time.day).toBeGreaterThan(save.state.time.day);
  await page.getByTestId('speed-pause').click();
  const progressed = await state(page);
  expect(progressed.meta.gameOver).toBeNull();
  await expect(page.getByTestId('screen-ending')).toHaveCount(0);
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
  await page.reload();
  await expect(page.getByTestId('title-loadgame')).toBeEnabled();
  await page.getByTestId('title-loadgame').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  const restored = await state(page);
  expect(restored.meta.gameOver).toBeNull();
  expect(restored.events.flags['victory.ack.unification']).toBe(1);
  expect(restored.time).toEqual(progressed.time);
  expect(restored.rng).toEqual(progressed.rng);
  await expect(page.getByTestId('screen-ending')).toHaveCount(0);
});

test('genuinely earned supported regional ending returns to title without acknowledging the stored victory', async ({
  page,
}, info) => {
  const save = await earnedEnding(page, info);
  await page.getByTestId('ending-title').click();
  await expect(page.getByTestId('title-newgame')).toBeVisible();
  await page.getByTestId('title-save-list').click();
  await expect(page.getByTestId('save-load-panel')).toHaveAttribute('aria-busy', 'false');
  const downloading = page.waitForEvent('download');
  await page
    .getByTestId('save-slot-manual:2')
    .getByRole('button', { name: '匯出', exact: true })
    .click();
  const downloaded = await (await downloading).path();
  if (!downloaded) throw new Error('Expected real native save export');
  const exported = JSON.parse(await readFile(downloaded, 'utf8')) as SaveFile;
  expect(exported.state).toEqual(save.state);
  expect(exported.pendingCommands).toEqual(save.pendingCommands);
  await loadSlot(page);
  expect(await state(page)).toEqual(save.state);
});
