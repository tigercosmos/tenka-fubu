import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { DEBUG_M6_FLOW_IDS } from '../src/core/debugM6';

async function boot(page: Page) {
  await page.goto('/?debug=1');
  await page.evaluate(() => window.__tenka.debug.startM6Flow());
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('proposal-inbox').getByRole('button', { name: '拒絕' }).click();
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  await page.getByTestId('speed-pause').click();
  await page.getByTestId('rail-corps').click();
  const panel = page.getByTestId('corps-panel');
  await panel.getByRole('button', { name: '新設軍團' }).click();
  await panel.getByLabel('軍團長（家老以上）').selectOption('off.shibata-katsuie');
  await panel.getByRole('checkbox', { name: '清洲城', exact: true }).check();
  return panel;
}

async function create(page: Page) {
  const panel = await boot(page);
  await panel.getByRole('button', { name: '新設軍團' }).last().click();
  expect(
    await page.evaluate(() => Object.keys(window.__tenka.debug.getState().corps)),
  ).toHaveLength(0);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  const corpsId = await page.evaluate(
    () =>
      Object.values(window.__tenka.debug.getState().corps).find(
        (c) => c.clanId === window.__tenka.debug.getState().meta.playerClanId,
      )!.id,
  );
  await panel.getByRole('button', { name: /柴田勝家軍團 · 1 · 固守/ }).click();
  return { panel, corpsId };
}

test('corps creation waits for normal resume and its directive and wallet are visible', async ({
  page,
}) => {
  const panel = await boot(page);
  const beforeDay = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  await panel.getByRole('button', { name: '新設軍團' }).last().click();
  expect(
    await page.evaluate(() => Object.keys(window.__tenka.debug.getState().corps)),
  ).toHaveLength(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(beforeDay);
  await expect(page.getByRole('status').filter({ hasText: '命令待下一日執行' })).toBeVisible();
  await page.getByTestId('speed-1').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.values(window.__tenka.debug.getState().corps).filter(
            (c) => c.clanId === window.__tenka.debug.getState().meta.playerClanId,
          ).length,
      ),
    )
    .toBe(1);
  await page.getByTestId('speed-pause').click();
  await panel.getByRole('button', { name: /柴田勝家軍團 · 1 · 固守/ }).click();
  await expect(panel.getByText(/軍團金庫：\d+貫/)).toBeVisible();
  await panel.getByRole('radio', { name: '開發', exact: true }).check();
  await panel.getByRole('button', { name: '變更方針' }).click();
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  await expect
    .poll(() =>
      page.evaluate(() => Object.values(window.__tenka.debug.getState().corps)[0]!.directive),
    )
    .toBe('develop');
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const untilMonthStart = await page.evaluate(
    () => 30 - window.__tenka.debug.getState().time.dayOfMonth + 1,
  );
  await page.evaluate((days) => window.__tenka.debug.stepDays(days), untilMonthStart);
  const wallet = await page.evaluate(
    () => Object.values(window.__tenka.debug.getState().corps)[0]!.gold,
  );
  expect(wallet).toBeGreaterThan(0);
  await expect(panel.getByText(`軍團金庫：${wallet}貫`, { exact: true })).toBeVisible();
});

test('assign, remove and confirmed dissolution execute on tick and preserve a manual pause', async ({
  page,
}) => {
  const { panel, corpsId } = await create(page);
  const castles = panel.getByRole('group', { name: '轄城' });
  const nagoya = castles.locator('div').filter({ hasText: '那古野城' });
  await nagoya.getByRole('button', { name: '編入軍團' }).click();
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.values(window.__tenka.debug.getState().castles).find((c) => c.name === '那古野城')!
            .corpsId,
      ),
    )
    .toBe(corpsId);
  await nagoya.getByRole('button', { name: '收回直轄' }).click();
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.values(window.__tenka.debug.getState().castles).find((c) => c.name === '那古野城')!
            .corpsId,
      ),
    )
    .toBeNull();
  await panel.getByRole('button', { name: '解散軍團' }).click();
  const confirmation = page.getByRole('dialog', { name: '解散軍團' });
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(
    await page.evaluate((id) => Boolean(window.__tenka.debug.getState().corps[id]), corpsId),
  ).toBe(true);
  await panel.getByRole('button', { name: '解散軍團' }).click();
  await confirmation.getByRole('button', { name: '確定', exact: true }).click();
  expect(
    await page.evaluate((id) => Boolean(window.__tenka.debug.getState().corps[id]), corpsId),
  ).toBe(true);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  await expect
    .poll(() => page.evaluate((id) => window.__tenka.debug.getState().corps[id] ?? null, corpsId))
    .toBeNull();
  const restored = await page.evaluate(
    (actor) =>
      Object.values(window.__tenka.debug.getState().castles)
        .filter((c) => c.ownerClanId === actor)
        .every((c) => c.corpsId === null && c.directControl),
    DEBUG_M6_FLOW_IDS.actor,
  );
  expect(restored).toBe(true);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
});
