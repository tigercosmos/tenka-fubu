import { completeNewGameWizard } from './new-game-wizard';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import { validateState } from '../src/core/state/invariants';
import { validateStartDiploWork } from '../src/core/commands/diplomacyCommands';
import { monthlyDiplomacyWorkCost } from '../src/core/systems/court';
import { effectiveStat } from '../src/core/systems/officers';
import { facilityIsActive, hasPolicy } from '../src/core/domestic';
import { test, expect } from './fixtures';
import { encodeFullSnapshot } from './full-snapshot-transport';

const scriptedEvents = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as { events: { choices: { label: string }[] }[] };
const eventChoices = new Set(
  scriptedEvents.events.flatMap((event) => event.choices.map((choice) => choice.label)),
);

const state = async (page: Page): Promise<GameState> => {
  // Trusted self-contained encoder executes in-page; only the complete JSON
  // string crosses the protocol, not Playwright's recursive object encoding.
  const json = await page.evaluate<string>(
    `(${encodeFullSnapshot.toString()})(window.__tenka.debug.getState())`,
  );
  return JSON.parse(json) as GameState;
};
const day = (page: Page) => page.evaluate(() => window.__tenka.debug.getState().time.day);
const log = (page: Page) => page.evaluate(() => window.__tenka.debug.exportCommandLog());

async function dismissKnownOwners(page: Page, choices: string[], holdSummary = false) {
  for (let index = 0; index < 12; index++) {
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) === 0) return;
    expect(await dialog.count(), 'One native FIFO owner at a time').toBe(1);
    if (await page.getByTestId('month-summary').isVisible()) {
      if (holdSummary) return;
      await page.getByTestId('month-summary-continue').click();
    } else if (await page.getByTestId('proposal-inbox').isVisible()) {
      choices.push('proposal:全部駁回');
      await dialog.getByRole('button', { name: '全部駁回', exact: true }).click();
    } else if (await page.getByTestId('envoy-modal').isVisible()) {
      choices.push('envoy:拒絕');
      await dialog.getByRole('button', { name: '拒絕', exact: true }).click();
    } else if (await page.getByTestId('event-modal').isVisible()) {
      const buttons = await dialog.getByRole('button').all();
      let chosen = false;
      for (const button of buttons) {
        const label = (await button.textContent())?.trim() ?? '';
        if ((label === '繼續' || eventChoices.has(label)) && (await button.isEnabled())) {
          choices.push(`event:${label}`);
          await button.click();
          chosen = true;
          break;
        }
      }
      expect(chosen, 'Only authored enabled historical choices are admitted').toBe(true);
    } else throw new Error('Unknown modal owner; refusing to bypass it');
  }
  throw new Error('Native modal queue did not drain');
}

async function pauseAtBoundary(page: Page) {
  // Modal dismissal may restore its prior speed. Frozen clock means pause input
  // cannot race an extra day while preparing commands or reading settlement.
  const before = await day(page);
  const pause = page.getByTestId('speed-pause');
  if ((await pause.getAttribute('aria-pressed')) !== 'true') await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  expect(await day(page)).toBe(before);
}

async function normalDay(page: Page) {
  const before = await day(page);
  const pause = page.getByTestId('speed-pause');
  if ((await pause.getAttribute('aria-pressed')) === 'true') {
    await pause.focus();
    await page.clock.runFor(32);
    expect(await day(page)).toBe(before);
    await page.getByTestId('speed-5').click();
    await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
    // Production x5 advances one normal day per 120ms. The 32ms margin
    // covers the RAF boundary but remains below a second day's 240ms.
    await page.clock.runFor(152);
  } else {
    // Keep the normal x5 scheduler running between days. Only controlled RAF
    // time advances; native pause is reserved for command/settlement boundaries.
    await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
    await page.clock.runFor(120);
  }
  await expect
    .poll(() =>
      page.evaluate(() => ({
        day: window.__tenka.debug.getState().time.day,
        pendingTicks: window.__tenka.debug.getSimulationDiagnostics().pendingTicks,
      })),
    )
    .toEqual({ day: before + 1, pendingTicks: 0 });
  const after = await state(page);
  expect(after.time.day).toBe(before + 1);
  expect(validateState(after), `All invariants after normal day ${after.time.day}`).toEqual([]);
  return after;
}

async function openCourt(page: Page) {
  await page.getByTestId('rail-diplomacy').click();
  const panel = page.getByTestId('diplomacy-panel');
  await panel.getByRole('tab', { name: '朝廷', exact: true }).click();
  return panel;
}

async function economyLedger(page: Page, before: GameState, charge: number) {
  // Step4 diplomacy precedes Step6 economy. The summary's opening wallet is
  // reconstructed from its actual net and closing wallet, not total treasury delta.
  await expect(page.getByTestId('month-summary-settlement')).toBeVisible();
  const raw = await page.getByTestId('month-summary-settlement').locator('dd').allTextContents();
  expect(raw).toHaveLength(9);
  const number = (text: string) => {
    const match = text.replaceAll(',', '').match(/[-−]?\d+(?:\.\d+)?/u);
    expect(match).not.toBeNull();
    return Number(match![0].replace('−', '-'));
  };
  const income = number(raw[0]!);
  const received = number(raw[1]!);
  const expenses = number(raw[5]!);
  const net = number(raw[6]!);
  const closing = number(raw[7]!);
  expect(net).toBe(income + received - expenses);
  expect(closing - net).toBe(before.clans[before.meta.playerClanId]!.gold - charge);
  expect((await state(page)).clans[before.meta.playerClanId]!.gold).toBe(closing);
  return { raw, income, received, expenses, net, closing, diplomacyCharge: charge };
}

test('Court work: actual queued start, paid month, stop and next month without work payment', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  // Keep the normal scheduler controlled during native modal and panel input,
  // including modal resume. Each runFor below still drives real RAF/core ticks.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  const initial = await state(page);
  expect(initial.meta.scenarioId).toBe('s1560');
  expect(initial.meta.playerClanId).toBe('clan.oda');
  expect(initial.time.day).toBe(0);
  const clanId = initial.meta.playerClanId;
  const executor = Object.values(initial.officers)
    .sort((a, b) => a.id.localeCompare(b.id))
    .find((officer) => {
      const command = {
        type: 'startDiploWork' as const,
        clanId,
        target: 'court' as const,
        executorId: officer.id,
      };
      return (
        validateStartDiploWork(initial, command).ok &&
        monthlyDiplomacyWorkCost(initial, {
          fromClanId: clanId,
          target: 'court',
          officerId: officer.id,
        }) === 50
      );
    });
  expect(executor, 'A naturally eligible unmodified Oda executor').toBeDefined();
  const startCommand = {
    type: 'startDiploWork' as const,
    clanId,
    target: 'court' as const,
    executorId: executor!.id,
  };
  const court = await openCourt(page);
  await court.getByRole('combobox', { name: '執行武將', exact: true }).selectOption(executor!.id);
  await expect(court).toContainText('每月費用 50貫');
  await court.getByRole('button', { name: '開始工作', exact: true }).click();
  expect(await state(page), 'Submitting queues, rather than directly mutating core').toEqual(
    initial,
  );
  expect(
    (await log(page)).entries.filter((entry) => entry.command.type === 'startDiploWork'),
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(court).not.toBeVisible();
  const started = await normalDay(page);
  expect(started.diplomacy.missions.filter((mission) => mission.fromClanId === clanId)).toEqual([
    { fromClanId: clanId, target: 'court', officerId: executor!.id, startDay: 0 },
  ]);
  const choices: string[] = [];
  await dismissKnownOwners(page, choices);
  let beforePaid = started;
  while (beforePaid.time.day < 29) {
    beforePaid = await normalDay(page);
    await dismissKnownOwners(page, choices);
  }
  await pauseAtBoundary(page);
  expect(hasPolicy(beforePaid, clanId, 'pol.enkokinko')).toBe(false);
  expect(
    Object.values(beforePaid.castles).some(
      (castle) =>
        castle.ownerClanId === clanId && facilityIsActive(beforePaid, castle, 'fac.hyojosho'),
    ),
  ).toBe(false);
  const paid = await normalDay(page);
  expect(paid.time.dayOfMonth).toBe(1);
  expect(
    paid.diplomacy.missions.some(
      (mission) => mission.fromClanId === clanId && mission.target === 'court',
    ),
  ).toBe(true);
  expect(paid.court.courtFavor[clanId]).toBeCloseTo(
    (beforePaid.court.courtFavor[clanId] ?? 0) +
      2 +
      effectiveStat(beforePaid.officers[executor!.id]!, 'pol') / 40,
    10,
  );
  await dismissKnownOwners(page, choices, true);
  const paidLedger = await economyLedger(page, beforePaid, 50);
  await dismissKnownOwners(page, choices);
  await pauseAtBoundary(page);
  const activeCourt = await openCourt(page);
  const beforeStop = await state(page);
  await activeCourt.getByRole('button', { name: '停止工作', exact: true }).click();
  expect(await state(page)).toEqual(beforeStop);
  await page.keyboard.press('Escape');
  const stopped = await normalDay(page);
  expect(
    stopped.diplomacy.missions.filter(
      (mission) => mission.fromClanId === clanId && mission.target === 'court',
    ),
  ).toEqual([]);
  await dismissKnownOwners(page, choices);
  let beforeUnpaid = stopped;
  while (beforeUnpaid.time.day < 59) {
    beforeUnpaid = await normalDay(page);
    await dismissKnownOwners(page, choices);
  }
  await pauseAtBoundary(page);
  const next = await normalDay(page);
  expect(
    next.diplomacy.missions.filter(
      (mission) => mission.fromClanId === clanId && mission.target === 'court',
    ),
  ).toEqual([]);
  expect(next.court.courtFavor[clanId]).toBeCloseTo(
    Math.max(0, (beforeUnpaid.court.courtFavor[clanId] ?? 0) - 1),
    10,
  );
  await dismissKnownOwners(page, choices, true);
  const stoppedLedger = await economyLedger(page, beforeUnpaid, 0);
  const commandLog = await log(page);
  expect(
    commandLog.entries
      .filter((entry) => entry.command.type === 'startDiploWork' && entry.command.clanId === clanId)
      .map((entry) => entry.command),
  ).toEqual([startCommand]);
  expect(
    commandLog.entries
      .filter((entry) => entry.command.type === 'stopDiploWork' && entry.command.clanId === clanId)
      .map((entry) => entry.command),
  ).toEqual([{ type: 'stopDiploWork', clanId, target: 'court' }]);
  await info.attach('court-work-production-journey', {
    body: JSON.stringify({
      initial,
      beforePaid,
      paid,
      stopped,
      beforeUnpaid,
      next,
      paidLedger,
      stoppedLedger,
      choices,
      commandLog,
    }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('court-work-second-month.png') });
});
