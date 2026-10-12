import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import type { SaveFile } from '../src/core/save/serialize';
import { test, expect } from './fixtures';

// The three independent browser workflows share one freshly earned save per
// worker. A failed test starts a new worker, which generates its own save.
test.describe.configure({ mode: 'default' });

const generatorSource = resolve('tests/app/earnedRegionalEndingJourney.spec.tsx');
const generatorArgs = [
  resolve('node_modules/vitest/vitest.mjs'),
  'run',
  '--project',
  'app',
  'tests/app/earnedRegionalEndingJourney.spec.tsx',
  '--minWorkers=1',
  '--maxWorkers=1',
  '-t',
  'loads the earned regional ending into actual App and continues without a phantom day or repeated victory',
];

let earnedArtifact: { path: string; hash: string } | undefined;

// Playwright requires an object pattern even when this hook needs no fixture.
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, info) => {
  const directory = join(info.project.outputDir, `earned-regional-worker-${info.workerIndex}`);
  await mkdir(info.project.outputDir, { recursive: true });
  await mkdir(directory); // Exclusive: a worker must never consume an earlier artifact.
  const artifactPath = join(directory, 'earned-regional-ending.tfusave');
  const generationLog = join(directory, 'earned-regional-route-generation.log');
  const output = await open(generationLog, 'wx');
  const startedAt = Date.now();
  let sourceHash: string;
  try {
    sourceHash = createHash('sha256')
      .update(await readFile(generatorSource))
      .digest('hex');
    const child = spawn(process.execPath, generatorArgs, {
      env: { ...process.env, REGIONAL_EARNED_ENDING_SAVE_PATH: artifactPath },
      stdio: ['ignore', output.fd, output.fd],
      detached: process.platform !== 'win32',
    });
    let closed = false;
    const stopChild = (signal: NodeJS.Signals) => {
      if (closed || child.pid === undefined) return;
      try {
        process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    };
    const onWorkerExit = () => stopChild('SIGKILL');
    process.once('exit', onWorkerExit);
    // Reap the owned process group at the existing Playwright hook deadline.
    // Vitest's own 5-second case limit remains unchanged.
    const remaining = Math.max(0, info.timeout - info.duration);
    const terminate = setTimeout(() => stopChild('SIGTERM'), Math.max(0, remaining - 1_000));
    const kill = setTimeout(() => stopChild('SIGKILL'), remaining);
    try {
      const exitCode = await new Promise<number>((resolveExit, reject) => {
        let spawnError: Error | undefined;
        child.once('error', (error) => {
          spawnError = error;
        });
        child.once('close', (code) => {
          if (spawnError) reject(spawnError);
          else resolveExit(code ?? -1);
        });
      });
      closed = true;
      if (exitCode !== 0) throw new Error(`Earned regional route generator exited ${exitCode}`);
    } finally {
      clearTimeout(terminate);
      clearTimeout(kill);
      process.removeListener('exit', onWorkerExit);
      if (!closed) stopChild('SIGKILL');
    }
  } finally {
    await output.close();
    await info.attach('earned-regional-route-generation', {
      path: generationLog,
      contentType: 'text/plain',
    });
  }
  const raw = await readFile(artifactPath);
  const save = JSON.parse(raw.toString('utf8')) as SaveFile;
  assertEarnedSave(save);
  const hash = createHash('sha256').update(raw).digest('hex');
  await chmod(artifactPath, 0o444);
  await writeFile(
    join(directory, 'provenance.json'),
    JSON.stringify({
      workerIndex: info.workerIndex,
      retry: info.retry,
      startedAt,
      durationMs: Date.now() - startedAt,
      generatorSourceSha256: sourceHash,
      generatorArgs,
      saveSha256: hash,
      saveBytes: raw.byteLength,
    }),
    { flag: 'wx' },
  );
  earnedArtifact = { path: artifactPath, hash };
});

// Envelope and earned-route facts; the native import below also runs the full
// production save decoder and state validation in each browser context.
function assertEarnedSave(save: SaveFile) {
  expect(save.version).toBe(4);
  expect(Number.isSafeInteger(save.timestamp)).toBe(true);
  expect(save.meta).toBeTruthy();
  expect(save.state.meta.scenarioId).toBe('s1560');
  expect(save.state.time.day).toBe(373);
  expect(save.state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
  expect(Object.values(save.state.castles)).toHaveLength(9);
  expect(
    Object.values(save.state.castles).every((castle) => castle.ownerClanId === 'clan.takeda'),
  ).toBe(true);
  expect(save.pendingCommands).toEqual([]);
  expect(save.state.events.flags['victory.ack.unification']).toBeUndefined();
}

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

async function earnedEnding(page: Page, info: TestInfo, scale?: number) {
  if (!earnedArtifact) throw new Error('Earned regional route was not generated by this worker');
  const raw = await readFile(earnedArtifact.path, 'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== earnedArtifact.hash)
    throw new Error('Earned regional route artifact hash changed after generation');
  const save = JSON.parse(raw) as SaveFile;
  assertEarnedSave(save);
  await page.goto('/?debug=1');
  if (scale !== undefined) {
    await page.getByTestId('title-settings').click();
    const settings = page.getByRole('dialog');
    const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
    await slider.press('Home');
    for (let step = 0; step < Math.round((scale - 0.8) / 0.05); step++)
      await slider.press('ArrowRight');
    await expect(slider).toHaveValue(String(scale));
    await settings.getByRole('button', { name: '返回', exact: true }).click();
  }
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

test('earned ending at 1280×720 and 1.5 scale keeps its crest and actions reachable', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await earnedEnding(page, info, 1.5);
  const ending = page.getByTestId('screen-ending');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  const crestTop = await ending.evaluate((node) => {
    const kind = node.querySelector('p')!.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(node).rowGap);
    const side = Number.parseFloat(getComputedStyle(node, '::before').height);
    return kind.top - gap - side - (side * Math.SQRT2 - side) / 2;
  });
  expect(crestTop, 'rotated crest must not be clipped above the viewport').toBeGreaterThanOrEqual(
    0,
  );
  for (const action of [page.getByTestId('ending-continue'), page.getByTestId('ending-title')]) {
    await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
  }
  await page.getByTestId('ending-title').click();
  await expect(page.getByTestId('title-newgame')).toBeVisible();
});

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
