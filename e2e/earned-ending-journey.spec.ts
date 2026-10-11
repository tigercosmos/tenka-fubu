import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';
import type { SaveFile } from '../src/core/save/serialize';
import { test, expect } from './fixtures';

const runFile = promisify(execFile);

async function importEarnedEnding(page: Page, testInfo: TestInfo): Promise<SaveFile> {
  // Each case earns a fresh native artifact before browser actions, never during
  // collection. The child runs only the CPU journey, not Playwright recursively.
  // No stale external fixture, browser state setter, or modified save payload.
  const artifactPath = testInfo.outputPath('earned-mini-ending.tfusave');
  await mkdir(dirname(artifactPath), { recursive: true });
  const generated = await runFile(
    process.execPath,
    [
      resolve('node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'app',
      'tests/app/earnedMiniEndingJourney.spec.tsx',
      '--minWorkers=1',
      '--maxWorkers=1',
      '-t',
      'loads the earned ending into actual App statistics and continues without a phantom day or repeated victory',
    ],
    { env: { ...process.env, EARNED_ENDING_SAVE_PATH: artifactPath } },
  );
  await testInfo.attach('earned-route-generation', {
    body: Buffer.from(generated.stdout + generated.stderr),
    contentType: 'text/plain',
  });
  const raw = await readFile(artifactPath, 'utf8');
  const save = JSON.parse(raw) as SaveFile;
  expect(save.state.time.day).toBe(419);
  expect(save.state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
  expect(save.pendingCommands).toEqual([]);
  await page.goto('/?debug=1');
  await page.getByTestId('title-save-list').click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const choosing = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'earned-mini-ending.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  await panel.getByRole('combobox').selectOption('manual:2');
  await panel.getByRole('button', { name: '存入槽位', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  const slot = page.getByTestId('save-slot-manual:2');
  await expect(slot.getByRole('button', { name: '載入', exact: true })).toBeEnabled();
  await slot.getByRole('button', { name: '載入', exact: true }).click();
  // The production event-engine loader deliberately excludes the test-only mini
  // scenario. Preserve this honest boundary rather than changing its scenario ID.
  await expect(panel.getByRole('alert')).toHaveText(
    '無法載入此遊戲。請稍後重試或匯出存檔以保留進度。',
  );
  await expect(page.getByTestId('title-newgame')).toBeVisible();
  await expect(page.getByTestId('screen-ending')).toHaveCount(0);
  await expect(page.getByTestId('screen-strategy')).toHaveCount(0);
  return save;
}

test('earned mini native save is refused by the production scenario loader but remains exportable intact', async ({
  page,
}, testInfo) => {
  const save = await importEarnedEnding(page, testInfo);
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await panel.screenshot({ path: testInfo.outputPath('earned-mini-load-refusal.png') });
  const slot = page.getByTestId('save-slot-manual:2');
  const downloading = page.waitForEvent('download');
  await slot.getByRole('button', { name: '匯出', exact: true }).click();
  const downloadedPath = await (await downloading).path();
  expect(downloadedPath).not.toBeNull();
  if (downloadedPath === null) throw new Error('Expected actual native-save download');
  const exported = JSON.parse(await readFile(downloadedPath, 'utf8')) as SaveFile;
  expect(exported.version).toBe(save.version);
  expect(exported.state).toEqual(save.state);
  expect(exported.pendingCommands).toEqual(save.pendingCommands);
});

test('refused earned mini campaign survives browser reload without being acknowledged or altered', async ({
  page,
}, testInfo) => {
  const save = await importEarnedEnding(page, testInfo);
  await page.reload();
  await expect(page.getByTestId('title-newgame')).toBeVisible();
  await page.getByTestId('title-save-list').click();
  await expect(page.getByTestId('save-load-panel')).toHaveAttribute('aria-busy', 'false');
  await page
    .getByTestId('save-slot-manual:2')
    .getByRole('button', { name: '載入', exact: true })
    .click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel.getByRole('alert')).toHaveText(
    '無法載入此遊戲。請稍後重試或匯出存檔以保留進度。',
  );
  await expect(page.getByTestId('title-newgame')).toBeVisible();
  await expect(page.getByTestId('screen-ending')).toHaveCount(0);
  await expect(page.getByTestId('screen-strategy')).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page
    .getByTestId('save-slot-manual:2')
    .getByRole('button', { name: '匯出', exact: true })
    .click();
  const downloadedPath = await (await downloading).path();
  if (downloadedPath === null) throw new Error('Expected retained native-save download');
  const retained = JSON.parse(await readFile(downloadedPath, 'utf8')) as SaveFile;
  expect(retained.state).toEqual(save.state);
  expect(retained.pendingCommands).toEqual(save.pendingCommands);
  expect(retained.state.events.flags['victory.ack.unification']).toBeUndefined();
});
