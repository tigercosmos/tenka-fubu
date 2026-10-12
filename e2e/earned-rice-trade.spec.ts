import { completeNewGameWizard } from './new-game-wizard';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import type { CastleId, ClanId, FacilityTypeId } from '../src/core/state/ids';
import { validateState } from '../src/core/state/invariants';
import { castleFoodCap, garrisonFoodMonthly } from '../src/core/domestic';
import { traitModifier } from '../src/core/traits';
import { BAL } from '../src/core/balance';
import { test, expect } from './fixtures';
import { encodeFullSnapshot } from './full-snapshot-transport';

const authored = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as { events: { choices: { label: string }[] }[] };
const choices = new Set(
  authored.events.flatMap((event) => event.choices.map((choice) => choice.label)),
);
const castleId = 'castle.kiyosu' as CastleId;
const clanId = 'clan.oda' as ClanId;
const dealer = 'fac.komedoiya' as FacilityTypeId;
const snapshot = async (page: Page): Promise<GameState> =>
  JSON.parse(
    await page.evaluate<string>(
      `(${encodeFullSnapshot.toString()})(window.__tenka.debug.getState())`,
    ),
  ) as GameState;
const commandLog = (page: Page) => page.evaluate(() => window.__tenka.debug.exportCommandLog());

async function drain(page: Page, decisions: string[]) {
  const observedDay = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  for (let count = 0; count < 12; count++) {
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) === 0) {
      // Dismissal can restore the owner's prior speed. Use real native pause
      // and fail if that real-time input lets another calendar day escape.
      const button = page.getByTestId('speed-pause');
      if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(observedDay);
      return;
    }
    expect(await dialog.count(), 'One actual native owner').toBe(1);
    if (await page.getByTestId('month-summary').isVisible()) {
      decisions.push('summary:continue');
      await page.getByTestId('month-summary-continue').click();
    } else if (await page.getByTestId('proposal-inbox').isVisible()) {
      decisions.push('proposal:全部駁回');
      await dialog.getByRole('button', { name: '全部駁回', exact: true }).click();
    } else if (await page.getByTestId('envoy-modal').isVisible()) {
      decisions.push('envoy:拒絕');
      await dialog.getByRole('button', { name: '拒絕', exact: true }).click();
    } else if (await page.getByTestId('event-modal').isVisible()) {
      let accepted = false;
      for (const button of await dialog.getByRole('button').all()) {
        const label = (await button.textContent())?.trim() ?? '';
        if ((label === '繼續' || choices.has(label)) && (await button.isEnabled())) {
          decisions.push(`event:${label}`);
          await button.click();
          accepted = true;
          break;
        }
      }
      expect(accepted, 'Only enabled authored historical choices').toBe(true);
    } else throw Error('Unknown native owner; no consent bypass');
  }
  throw Error('Native FIFO did not drain');
}

async function pause(page: Page) {
  // This helper only verifies already-owned pause; it never assumes an
  // unpaused read and a later native input are an atomic operation.
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
}

async function normalDay(page: Page, days: number[]) {
  const before = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  await pause(page);
  await page.getByTestId('speed-1').click();
  // One read-only in-document observer avoids remote polling/handle roundtrips.
  // The production browser clock/RAF remains real and unmodified. Native pause
  // is still external pointer input, so an overshoot must fail the exact +1.
  const point = await page.evaluate(
    (startingDay) =>
      new Promise<{ x: number; y: number }>((resolve, reject) => {
        let frame = 0;
        const timeout = setTimeout(() => {
          cancelAnimationFrame(frame);
          reject(
            new Error(
              'No ordinary calendar advance within the default 5-second observation budget',
            ),
          );
        }, 5000);
        const observe = () => {
          if (window.__tenka.debug.getState().time.day > startingDay) {
            const button = document.querySelector<HTMLButtonElement>('[data-testid="speed-pause"]');
            const rect = button?.getBoundingClientRect();
            if (button && rect && rect.width > 0 && rect.height > 0) {
              clearTimeout(timeout);
              resolve({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
              return;
            }
          }
          frame = requestAnimationFrame(observe);
        };
        observe();
      }),
    before,
  );
  await page.mouse.click(point.x, point.y);
  await pause(page);
  const after = await snapshot(page);
  expect(after.time.day).toBe(before + 1);
  expect(validateState(after), `Daily invariants at ${after.time.day}`).toEqual([]);
  days.push(after.time.day);
  return after;
}

async function domestic(page: Page) {
  await page.getByTestId('hud-date').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('F1');
  const panel = page.getByTestId('castle-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('tab', { name: '內政', exact: true }).click();
  await expect(panel).toContainText('清洲');
  return panel;
}

test('earned rice dealer: actual Kiyosu construction, queued buy and sell on normal calendar days', async ({
  page,
}, info) => {
  const decisions: string[] = [];
  const days: number[] = [];
  const observations: unknown[] = [];
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?debug=1&seed=42');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await completeNewGameWizard(page);
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    await pause(page);
    const initial = await snapshot(page);
    observations.push({ stage: 'initial', state: initial });
    expect(initial.time.day).toBe(0);
    expect(initial.meta.scenarioId).toBe('s1560');
    expect(initial.meta.playerClanId).toBe(clanId);
    expect(initial.castles[castleId]!.facilities).toContain('fac.ichi');
    expect(initial.castles[castleId]!.facilities).not.toContain('fac.komedoiya');
    const panel = await domestic(page);
    await panel.getByRole('button', { name: /空位/ }).first().click();
    const build = panel.getByRole('button', { name: /米問屋/ });
    await expect(build).toBeEnabled();
    await build.click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(await snapshot(page), 'Cancel-first confirmation is not an execution').toEqual(initial);
    await build.click();
    await page.getByRole('dialog').getByRole('button', { name: '確定', exact: true }).click();
    expect(await snapshot(page), 'Confirmation queues without direct core mutation').toEqual(
      initial,
    );
    expect(
      (await commandLog(page)).entries.filter(
        (entry) => entry.command.type === 'buildFacility' && entry.command.clanId === clanId,
      ),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    let current = await normalDay(page, days);
    observations.push({ stage: 'build-executed', state: current, log: await commandLog(page) });
    const lord = initial.castles[castleId]!.lordId;
    const duration = Math.max(
      1,
      Math.ceil(
        60 * (lord ? traitModifier(initial.officers[lord]!, 'dev.facilityTimeMult').mult : 1),
      ),
    );
    expect(current.castles[castleId]!.buildQueue).toEqual([
      { facilityTypeId: 'fac.komedoiya', daysLeft: duration - 1 },
    ]);
    expect(current.clans[clanId]!.gold).toBe(initial.clans[clanId]!.gold - 250);
    while (!current.castles[castleId]!.facilities.includes(dealer)) {
      await drain(page, decisions);
      expect(current.time.day, 'Bounded actual trait-duration construction').toBeLessThanOrEqual(
        duration,
      );
      current = await normalDay(page, days);
    }
    expect(current.time.day).toBe(duration);
    observations.push({ stage: 'build-complete', state: current });
    await drain(page, decisions);
    // Trade off the monthly boundary so salary/income/reset/harvest are not
    // mistaken for trade accounting. Advancing is still ordinary production RAF.
    while (current.time.dayOfMonth >= 28) {
      current = await normalDay(page, days);
      await drain(page, decisions);
    }
    await pause(page);
    const tradeObservations: unknown[] = [];
    for (const [mode, amount] of [
      ['buy', 101],
      ['sell', 103],
    ] as const) {
      const before = await snapshot(page);
      const castle = before.castles[castleId]!;
      expect(before.time.dayOfMonth).toBeLessThan(28);
      expect(Object.values(before.sieges).some((siege) => siege.castleId === castleId)).toBe(false);
      expect(
        Object.values(before.transports).some(
          (transport) => transport.toCastleId === castleId || transport.fromCastleId === castleId,
        ),
      ).toBe(false);
      const remaining = BAL.riceTradeCapMonthly - castle.riceTradedThisMonth;
      expect(remaining).toBeGreaterThanOrEqual(amount);
      expect(castle.food + (mode === 'buy' ? amount : 0)).toBeLessThan(castleFoodCap(castle));
      const active = await domestic(page);
      const section = active.locator('section[aria-label="米買賣"]');
      await expect(section).toBeVisible();
      await section.getByLabel('交易量（石）', { exact: true }).fill(String(amount));
      const action = section.getByRole('button', {
        name: mode === 'buy' ? '購入兵糧' : '出售兵糧',
        exact: true,
      });
      await expect(action).toBeEnabled();
      const priorLog = await commandLog(page);
      await action.click();
      expect(await snapshot(page), 'Trading only queues a player command').toEqual(before);
      expect(await commandLog(page)).toEqual(priorLog);
      await expect(action).toBeDisabled();
      await page.keyboard.press('Escape');
      const after = await normalDay(page, days);
      await pause(page);
      observations.push({
        stage: 'trade-executed',
        mode,
        amount,
        before,
        after,
        log: await commandLog(page),
      });
      const result = after.castles[castleId]!;
      // No monthly economics, no transport or local siege; independently
      // separate fractional garrison consumption from the queued trade.
      expect(result.soldiers).toBe(castle.soldiers);
      const fraction = castle.foodFrac + garrisonFoodMonthly(before, castle) / 30;
      const consumed = Math.floor(fraction);
      expect(result.foodFrac).toBeCloseTo(fraction - consumed, 10);
      expect(result.food).toBe(castle.food + (mode === 'buy' ? amount : -amount) - consumed);
      const walletDelta = mode === 'buy' ? -Math.ceil(amount * 0.04) : Math.floor(amount * 0.02);
      expect(after.clans[clanId]!.gold).toBe(before.clans[clanId]!.gold + walletDelta);
      expect(result.riceTradedThisMonth).toBe(castle.riceTradedThisMonth + amount);
      const logged = (await commandLog(page)).entries.filter(
        (entry) => entry.command.type === 'tradeRice' && entry.command.clanId === clanId,
      );
      expect(logged.at(-1)?.command).toEqual({ type: 'tradeRice', clanId, castleId, mode, amount });
      expect(logged).toHaveLength(mode === 'buy' ? 1 : 2);
      tradeObservations.push({ mode, amount, before, after, remaining, consumed, walletDelta });
      await drain(page, decisions);
      await pause(page);
    }
    const finalLog = await commandLog(page);
    observations.push({ stage: 'final-full-command-log', finalLog });
    // The supported national world continues to run autonomous construction.
    // Keep those entries as evidence, but do not mistake them for player input.
    expect(
      finalLog.entries.filter(
        (entry) => entry.command.type === 'buildFacility' && entry.command.clanId !== clanId,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      finalLog.entries
        .filter(
          (entry) => entry.command.type === 'buildFacility' && entry.command.clanId === clanId,
        )
        .map((entry) => entry.command),
    ).toEqual([{ type: 'buildFacility', clanId, castleId, facilityTypeId: 'fac.komedoiya' }]);
    observations.push({
      initial,
      duration,
      tradeObservations,
      final: await snapshot(page),
      finalLog,
    });
    await page.screenshot({ path: info.outputPath('earned-rice-trade.png') });
  } finally {
    await info.attach('earned-rice-trade-observations', {
      body: JSON.stringify({ days, decisions, observations }),
      contentType: 'application/json',
    });
  }
});
