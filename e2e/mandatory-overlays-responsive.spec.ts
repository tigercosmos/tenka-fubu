import { writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

const scales = Array.from({ length: 15 }, (_, index) => Number((0.8 + index * 0.05).toFixed(2)));

async function startOda(page: Page, scale: number) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
  expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(0);
}

async function reachable(target: Locator, name: string, minimumAction = false) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box, `${name} exists`).not.toBeNull();
  expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(1280);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(720);
  if (minimumAction) {
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(32);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(32);
  }
  return box;
}

for (const scale of scales) {
  test(`earned proposal and month summary remain usable at scale ${scale}`, async ({
    page,
  }, info) => {
    await startOda(page, scale);
    await page.getByTestId('speed-5').click();
    const inbox = page.getByTestId('proposal-inbox');
    await expect(inbox).toBeVisible({ timeout: 45_000 });
    const proposalState = await page.evaluate(() => window.__tenka.debug.getState());
    expect(proposalState.time.day).toBe(30);
    expect(
      Object.values(proposalState.proposals).filter((item) => item.status === 'pending'),
    ).toHaveLength(3);
    const proposalDialog = page.getByRole('dialog');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
    const proposal = {
      frame: await reachable(proposalDialog, 'proposal frame'),
      heading: await reachable(inbox.getByRole('heading'), 'proposal heading'),
      details: await reachable(inbox.getByTestId('proposal-command-details'), 'proposal details'),
      reject: await reachable(
        inbox.getByRole('button', { name: '拒絕', exact: true }),
        'proposal reject',
        true,
      ),
      adopt: await reachable(
        inbox.getByRole('button', { name: '採納', exact: true }),
        'proposal adopt',
        true,
      ),
      rejectAll: await reachable(
        proposalDialog.getByRole('button', { name: '全部駁回', exact: true }),
        'reject all',
        true,
      ),
    };
    await page.keyboard.press('Escape');
    await expect(inbox).toBeVisible();
    if ([0.8, 1, 1.5].includes(scale))
      await page.screenshot({ path: info.outputPath(`proposal-${scale}.png`) });
    const rejectAll = proposalDialog.getByRole('button', { name: '全部駁回', exact: true });
    expect(await proposalDialog.evaluate((node) => node.contains(document.activeElement))).toBe(
      true,
    );
    for (
      let step = 0;
      step < 4 && !(await rejectAll.evaluate((node) => node === document.activeElement));
      step++
    )
      await page.keyboard.press('Tab');
    await expect(rejectAll).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(inbox).toHaveCount(0);
    const summary = page.getByTestId('month-summary');
    await expect(summary).toBeVisible();
    const summaryDialog = page.getByRole('dialog');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
    const monthly = {
      frame: await reachable(summaryDialog, 'summary frame'),
      settlementHeading: await reachable(
        summary.getByRole('heading', { name: '月初金錢結算' }),
        'settlement heading',
      ),
      settlementLastValue: await reachable(
        summary.getByTestId('month-summary-settlement').locator('dd').last(),
        'settlement last value',
      ),
      lastSectionHeading: await reachable(
        summary.locator('section').last().getByRole('heading'),
        'last report heading',
      ),
      lastSectionText: await reachable(
        summary.locator('section').last().locator('li, p').last(),
        'last report text',
      ),
      continue: await reachable(
        page.getByTestId('month-summary-continue'),
        'summary continue',
        true,
      ),
    };
    await page.keyboard.press('Escape');
    await expect(summary).toBeVisible();
    if ([0.8, 1, 1.5].includes(scale))
      await page.screenshot({ path: info.outputPath(`summary-${scale}.png`) });
    await writeFile(
      info.outputPath(`proposal-summary-${scale}.json`),
      JSON.stringify({ scale, proposal, monthly }),
    );
    await expect(page.getByTestId('month-summary-continue')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(summary).toHaveCount(0);
  });
}
