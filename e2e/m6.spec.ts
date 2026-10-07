import { test, expect } from './fixtures';
import type { ClanId } from '../src/core/state/ids';
import type { Page } from '@playwright/test';
import { DEBUG_M6_FLOW_IDS as ids, DEBUG_M6_FLOW_METADATA } from '../src/core/debugM6';

async function bootFixture(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.evaluate(() => window.__tenka.debug.startM6Flow());
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('proposal-inbox')).toBeVisible();
}

async function rejectFixtureProposal(page: Page): Promise<void> {
  await page.getByTestId('proposal-inbox').getByRole('button', { name: '拒絕' }).click();
  await expect(page.getByTestId('proposal-inbox')).toHaveCount(0);
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  await expect
    .poll(() =>
      page.evaluate((id) => window.__tenka.debug.getState().proposals[id]!.status, ids.proposalId),
    )
    .toBe('rejected');
}

test.describe('M6 management flows', () => {
  test('new game exposes officers, diplomacy, court and validated plot forms', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await page.getByTestId('newgame-start').click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('rail-officers').click();
    await expect(page.getByTestId('officer-list')).toBeVisible();
    await page.getByRole('button', { name: '浪人登用與捕虜' }).click();
    await expect(page.getByTestId('recruit-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId('rail-diplomacy').click();
    const diplomacy = page.getByTestId('diplomacy-panel');
    await expect(diplomacy).toBeVisible();
    await diplomacy.getByRole('tab', { name: '朝廷' }).click();
    await expect(diplomacy.getByRole('button', { name: '請求下一階官位' })).toBeVisible();
    await diplomacy.getByRole('tab', { name: '幕府' }).click();
    await expect(diplomacy.getByRole('button', { name: '擁立將軍' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('rail-plot').click();
    const plots = page.getByTestId('plot-panel');
    await expect(plots).toBeVisible();
    const start = plots.getByRole('button', { name: '著手調略' });
    await expect(start).toBeDisabled();
    await expect(start).toHaveAttribute('aria-describedby', /.+/);
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  });

  test('a manually paused reward stays queued until normal resume advances a tick', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await page.getByTestId('newgame-start').click();
    await page.getByTestId('speed-pause').click();
    await page.getByTestId('rail-officers').click();
    await page
      .getByTestId('officer-list')
      .locator('tbody tr')
      .filter({ hasNotText: '織田信長' })
      .first()
      .click();
    const detail = page.getByTestId('officer-detail');
    await expect(detail).toBeVisible();
    const reward = detail.getByRole('button', { name: /小.*貫/ });
    await expect(reward).toBeEnabled();
    const before = await page.evaluate(() => ({
      gold: window.__tenka.debug.getState().clans['clan.oda' as ClanId]?.gold,
      day: window.__tenka.debug.getState().time.day,
    }));
    await reward.click();
    await expect(page.getByRole('status').filter({ hasText: /命令待下一日執行/ })).toBeVisible();
    const queued = await page.evaluate(() => ({
      gold: window.__tenka.debug.getState().clans['clan.oda' as ClanId]?.gold,
      day: window.__tenka.debug.getState().time.day,
    }));
    expect(queued).toEqual(before);
    await page.getByTestId('speed-1').click();
    await expect
      .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day))
      .toBeGreaterThan(before.day);
    const after = await page.evaluate(
      () => window.__tenka.debug.getState().clans['clan.oda' as ClanId]?.gold,
    );
    expect(after).toBeLessThan(before.gold!);
    await page.getByTestId('speed-pause').click();
  });

  test('debug fixture: actual UI Takeda alliance followed by a one-off reinforcement request', async ({
    page,
  }) => {
    await bootFixture(page);
    await rejectFixtureProposal(page);
    await page.getByTestId('rail-diplomacy').click();
    const panel = page.getByTestId('diplomacy-panel');
    await panel.getByRole('button', { name: /武田家 ·/ }).click();
    await panel.getByRole('button', { name: '締結同盟' }).click();
    await page.evaluate(() => window.__tenka.debug.stepDays(1));
    await expect
      .poll(() =>
        page.evaluate(
          ({ actor, ally }) =>
            Object.values(window.__tenka.debug.getState().diplomacy.rows).some(
              (row) =>
                ((row.a === actor && row.b === ally) || (row.b === actor && row.a === ally)) &&
                row.pacts.some((pact) => pact.kind === 'alliance'),
            ),
          ids,
        ),
      )
      .toBe(true);
    await panel.getByLabel('援軍對抗勢力').selectOption(ids.against);
    const request = panel.getByRole('button', { name: '請求援軍' });
    await expect(request).toBeEnabled();
    await request.click();
    await page.evaluate(() => window.__tenka.debug.stepDays(1));
    await expect
      .poll(() =>
        page.evaluate(
          ({ actor, ally }) =>
            window.__tenka.debug
              .getState()
              .reports.some(
                (report) =>
                  report.event.type === 'diplo.reinforceAgreed' &&
                  report.event.fromClanId === actor &&
                  report.event.toClanId === ally,
              ),
          ids,
        ),
      )
      .toBe(true);
  });

  test('debug fixture: actual UI Imagawa poach succeeds through real monthly plot resolution', async ({
    page,
  }) => {
    await bootFixture(page);
    await rejectFixtureProposal(page);
    await page.getByTestId('rail-plot').click();
    const panel = page.getByTestId('plot-panel');
    await panel.getByLabel('目標勢力').selectOption(ids.enemy);
    await panel.getByLabel('目標武將或城池').selectOption(ids.poachTarget);
    await panel.getByLabel('執行武將').selectOption(ids.plotExecutor);
    await panel
      .getByLabel('一次性投入（貫）')
      .selectOption(String(DEBUG_M6_FLOW_METADATA.poachInvestment));
    const start = panel.getByRole('button', { name: '著手調略' });
    await expect(start).toBeEnabled();
    await start.click();
    await page.evaluate(
      (days) => window.__tenka.debug.stepDays(days),
      DEBUG_M6_FLOW_METADATA.poachSettlementDays,
    );
    await expect
      .poll(() =>
        page.evaluate(
          ({ poachTarget }) => window.__tenka.debug.getState().officers[poachTarget]!.clanId,
          ids,
        ),
      )
      .toBe(ids.actor);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__tenka.debug
            .getState()
            .reports.some((report) => report.event.type === 'plot.succeeded'),
        ),
      )
      .toBe(true);
  });

  test('debug fixture: actual UI proposal adoption executes its payload and rewards its author on tick', async ({
    page,
  }) => {
    await bootFixture(page);
    const before = await page.evaluate(({ actor, proposalOfficer }) => {
      const game = window.__tenka.debug.getState();
      return {
        gold: game.clans[actor]!.gold,
        merit: game.officers[proposalOfficer]!.merit,
        loyalty: game.officers[proposalOfficer]!.loyalty,
      };
    }, ids);
    await page.getByTestId('proposal-inbox').getByRole('button', { name: '採納' }).click();
    await expect(page.getByTestId('proposal-inbox')).toHaveCount(0);
    expect(
      await page.evaluate(
        (id) => window.__tenka.debug.getState().proposals[id]!.status,
        ids.proposalId,
      ),
    ).toBe('pending');
    await page.evaluate(() => window.__tenka.debug.stepDays(1));
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.__tenka.debug.getState().proposals[id]!.status,
          ids.proposalId,
        ),
      )
      .toBe('accepted');
    const after = await page.evaluate(({ actor, proposalOfficer }) => {
      const game = window.__tenka.debug.getState();
      return {
        gold: game.clans[actor]!.gold,
        merit: game.officers[proposalOfficer]!.merit,
        loyalty: game.officers[proposalOfficer]!.loyalty,
      };
    }, ids);
    expect(after.gold).toBeLessThan(before.gold);
    expect(after.merit).toBeGreaterThan(before.merit);
    expect(after.loyalty).toBeGreaterThan(before.loyalty);
  });
});
