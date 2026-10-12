import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function startOda(page: Page) {
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
}

function node(page: Page, path: string[]) {
  return page.locator(`[data-testid="state-viewer-node"][data-path='${JSON.stringify(path)}']`);
}

async function evidence(page: Page) {
  return {
    ...(await page.evaluate(() => ({
      core: JSON.stringify(window.__tenka.debug.getState()),
      log: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    }))),
    pending: await page
      .getByTestId('screen-strategy')
      .getByRole('status')
      .filter({ hasText: '命令待下一日執行' })
      .allTextContents(),
  };
}

test('state viewer native expansion, paging and selected JSON copy preserve queued paused progress', async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?debug=1');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin,
  });
  await startOda(page);
  // A real queued player order makes pending-queue preservation meaningful.
  await page.getByTestId('rail-officers').click();
  await page
    .getByTestId('officer-list')
    .locator('tbody tr')
    .filter({ hasText: '丹羽長秀' })
    .click();
  const detail = page.getByTestId('officer-detail');
  await detail.getByRole('button', { name: /小.*貫/ }).click();
  await expect(page.getByRole('status').filter({ hasText: '命令待下一日執行' })).toBeVisible();
  await detail.getByRole('button', { name: /^丹羽長秀・/ }).click();
  await page.getByTestId('officer-list').locator('header button').click();
  const before = await evidence(page);
  expect(before.pending).toHaveLength(1);
  const beforeCore = await page.evaluate(() => window.__tenka.debug.getState());
  await page.keyboard.press('Backquote');
  const viewer = page.getByTestId('state-viewer');
  await expect(viewer).toBeVisible();
  const root = node(page, []);
  const rootDetails = root.locator(':scope > details');
  await expect(rootDetails).not.toHaveAttribute('open');
  await expect(node(page, ['time'])).toHaveCount(0);
  const rootSummary = rootDetails.locator(':scope > summary');
  const summaryBox = await rootSummary.boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(summaryBox!.height).toBeGreaterThanOrEqual(32);
  const viewerBounds = await viewer.boundingBox();
  expect(viewerBounds).not.toBeNull();
  expect(viewerBounds!.x).toBeGreaterThanOrEqual(0);
  expect(viewerBounds!.x + viewerBounds!.width).toBeLessThanOrEqual(1920);
  expect(await viewer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await rootSummary.focus();
  for (const key of ['1', 'F5', 'r']) {
    await page.keyboard.press(key);
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('castle-panel')).toHaveCount(0);
    await expect(page.getByTestId('reports-panel')).toHaveCount(0);
    expect(await evidence(page)).toEqual(before);
  }
  await page.keyboard.press('Space');
  await expect(rootDetails).toHaveAttribute('open');
  const time = node(page, ['time']);
  await time.locator(':scope > details > summary').click();
  await expect(node(page, ['time', 'day']).locator('code')).toHaveText(String(beforeCore.time.day));
  await time.locator(':scope > [data-testid="state-viewer-copy"]').click();
  await expect(time.locator(':scope > [role="status"]')).toHaveText('已複製');
  const copiedTime = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedTime).toBe(JSON.stringify(beforeCore.time, null, 2));
  const meta = node(page, ['meta']);
  await meta.locator(':scope > details > summary').click();
  await meta.locator(':scope > [data-testid="state-viewer-copy"]').click();
  await expect(meta.locator(':scope > [role="status"]')).toHaveText('已複製');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    JSON.stringify(beforeCore.meta, null, 2),
  );
  const officers = node(page, ['officers']);
  await officers.locator(':scope > details > summary').click();
  const children = officers.locator(':scope > details > ul > li');
  await expect(children).toHaveCount(Math.min(50, Object.keys(beforeCore.officers).length));
  const firstCount = await children.count();
  expect(firstCount).toBeGreaterThan(0);
  expect(firstCount).toBeLessThan(Object.keys(beforeCore.officers).length);
  await officers.locator(':scope > details > [data-testid="state-viewer-more"]').click();
  await expect.poll(() => children.count()).toBeGreaterThan(firstCount);
  await officers.locator(':scope > details > summary').click();
  await expect(children).toHaveCount(0);
  expect(await evidence(page)).toEqual(before);

  // Leave the tree's keyboard scope without hiding it; normal strategy hotkeys
  // advance the real core and execute the reward while the same tree stays mounted.
  await page.getByTestId('hud-date').click();
  await page.keyboard.press('1');
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day), { intervals: [50] })
    .toBeGreaterThan(beforeCore.time.day);
  await page.getByTestId('hud-date').click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const afterCore = await page.evaluate(() => window.__tenka.debug.getState());
  expect(afterCore.time.day).toBe(beforeCore.time.day + 1);
  await expect(node(page, ['time', 'day']).locator('code')).toHaveText(String(afterCore.time.day));
  await expect(time.locator(':scope > details')).toHaveAttribute('open');
  const after = await evidence(page);
  expect(after.pending).toEqual([]);
  const log = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(log.entries.filter((entry) => entry.command.type === 'rewardOfficer')).toHaveLength(1);
  await time.locator(':scope > [data-testid="state-viewer-copy"]').click();
  await expect(time.locator(':scope > [role="status"]')).toHaveText('已複製');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    JSON.stringify(afterCore.time, null, 2),
  );
  await time.locator(':scope > details > summary').scrollIntoViewIfNeeded();
  const screenshot = info.outputPath('actual-readonly-state-viewer.png');
  await page.screenshot({ path: screenshot });
  await info.attach('actual-readonly-state-viewer', { path: screenshot, contentType: 'image/png' });
  expect(await evidence(page)).toEqual(after);
  const artifact = info.outputPath('actual-state-viewer-evidence.json');
  await writeFile(artifact, JSON.stringify({ before, after, copiedTime }, null, 2));
  await info.attach('actual-state-viewer-evidence', {
    path: artifact,
    contentType: 'application/json',
  });

  await page.keyboard.press('Backquote');
  await expect(viewer).toHaveCount(0);
  expect(await evidence(page)).toEqual(after);
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '回到標題', exact: true }).click();
  await page
    .getByRole('dialog', { name: '回到標題', exact: true })
    .getByRole('button', { name: '確定', exact: true })
    .click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await startOda(page);
  await page.keyboard.press('Backquote');
  await expect(node(page, []).locator(':scope > details')).not.toHaveAttribute('open');
  await expect(node(page, ['time'])).toHaveCount(0);
});

test('state viewer is absent from a real nondebug game', async ({ page }) => {
  await page.goto('/');
  await startOda(page);
  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('debug-panel')).toHaveCount(0);
  await expect(page.getByTestId('state-viewer')).toHaveCount(0);
});
