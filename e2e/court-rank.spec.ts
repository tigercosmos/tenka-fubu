import { completeNewGameWizard } from './new-game-wizard';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import { validateState } from '../src/core/state/invariants';
import { validateStartDiploWork } from '../src/core/commands/diplomacyCommands';
import { monthlyDiplomacyWorkCost } from '../src/core/systems/court';
import { effectiveStat } from '../src/core/systems/officers';
import { BAL } from '../src/core/balance';
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
      // Read identity and button eligibility in one DOM observation. A queued
      // choice can replace this owner between separate locator property reads.
      const observations = await page.getByTestId('event-modal').evaluateAll((elements) =>
        elements.map((element) => {
          const dialog = element.closest('[role="dialog"]');
          const titleId = dialog?.getAttribute('aria-labelledby');
          return {
            title: titleId ? (document.getElementById(titleId)?.textContent ?? '') : '',
            busy: element.getAttribute('aria-busy') === 'true',
            buttons: Array.from(element.querySelectorAll('button')).map((button) => ({
              label: button.textContent?.trim() ?? '',
              enabled: !button.disabled,
            })),
          };
        }),
      );
      if (observations.length === 0) continue;
      expect(observations).toHaveLength(1);
      const observed = observations[0]!;
      expect(observed.title).not.toBe('');
      const owner = page
        .getByRole('dialog', { name: observed.title, exact: true })
        .filter({ has: page.getByTestId('event-modal') });
      if (observed.busy) {
        await expect(owner).not.toBeVisible({ timeout: 5000 });
        continue;
      }
      const choice = observed.buttons.find(
        (button) => button.enabled && (button.label === '繼續' || eventChoices.has(button.label)),
      );
      if (!choice && !(await owner.isVisible())) continue;
      expect(choice, 'Only authored enabled historical choices are admitted').toBeDefined();
      try {
        await owner
          .getByRole('button', { name: choice!.label, exact: true })
          .click({ timeout: 5000 });
      } catch (error) {
        if (!(await owner.isVisible())) continue;
        throw error;
      }
      choices.push(`event:${choice!.label}`);
      await expect(owner).not.toBeVisible({ timeout: 5000 });
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

interface DaySchedule {
  before: number;
  after: number;
  slices: number[];
}
async function normalDay(page: Page, schedules: DaySchedule[]) {
  const before = await day(page);
  const schedule: DaySchedule = { before, after: before, slices: [] };
  schedules.push(schedule);
  const pause = page.getByTestId('speed-pause');
  if ((await pause.getAttribute('aria-pressed')) === 'true') {
    await pause.focus();
    schedule.slices.push(32);
    await page.clock.runFor(32);
    expect(await day(page)).toBe(before);
    await page.getByTestId('speed-5').click();
    await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
    // Production x5 advances one normal day per 120ms. The 32ms margin
    // covers the RAF boundary but remains below a second day's 240ms.
    schedule.slices.push(152);
    await page.clock.runFor(152);
  } else {
    // Keep the normal x5 scheduler running between days. Only controlled RAF
    // time advances; native pause is reserved for command/settlement boundaries.
    await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
    schedule.slices.push(120);
    await page.clock.runFor(120);
  }
  // RAF dispatches asynchronously; read only after the real Worker commit.
  await page.evaluate(() => window.__tenka.debug.waitSimulationIdle());
  // Modal resume resets the accumulator between RAF boundaries. Admit at most
  // three more ordinary 16ms frames while x5 is still selected and unobstructed;
  // never resume an auto-pause, and stop immediately on the first committed day.
  for (let frame = 0; frame < 3 && (await day(page)) === before; frame++) {
    if (
      (await page.getByRole('dialog').count()) !== 0 ||
      (await page.getByTestId('speed-5').getAttribute('aria-pressed')) !== 'true'
    )
      break;
    schedule.slices.push(16);
    await page.clock.runFor(16);
    await page.evaluate(() => window.__tenka.debug.waitSimulationIdle());
  }
  const after = await state(page);
  schedule.after = after.time.day;
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

// 08 §3.5 / 11 §3.8: earn favor through ordinary paid months; request the
// next permanent clan rank with its exact one-time cost, then persist it.
test('Earned court rank: normal donations, queued grant, and native save/reload', async ({
  page,
}, info) => {
  test.setTimeout(270_000);
  const evidence: Record<string, unknown> = {};
  const choices: string[] = [];
  const schedules: DaySchedule[] = [];
  try {
    expect(BAL.courtRankTable[0]).toMatchObject({
      id: 'ju5ge',
      favorRequired: 20,
      goldCost: 300,
      prestigeBonus: 50,
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.goto('/?debug=1&seed=1');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await completeNewGameWizard(page);
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    const initial = await state(page);
    evidence.initial = initial;
    expect(initial.meta.seed).toBe(1);
    expect(initial.time.day).toBe(0);
    const clanId = initial.meta.playerClanId;
    expect(clanId).toBe('clan.oda');
    expect(initial.clans[clanId]!.courtRank).toBe('none');
    const executor = Object.values(initial.officers)
      .filter(
        (officer) =>
          validateStartDiploWork(initial, {
            type: 'startDiploWork',
            clanId,
            target: 'court',
            executorId: officer.id,
          }).ok,
      )
      .sort(
        (a, b) => effectiveStat(b, 'pol') - effectiveStat(a, 'pol') || a.id.localeCompare(b.id),
      )[0];
    expect(executor).toBeDefined();
    expect(
      monthlyDiplomacyWorkCost(initial, {
        fromClanId: clanId,
        target: 'court',
        officerId: executor!.id,
      }),
    ).toBe(50);
    evidence.executor = executor;
    let court = await openCourt(page);
    await expect(court.getByRole('button', { name: '請求下一階官位', exact: true })).toBeDisabled();
    await expect(court).toContainText('現任 無');
    await court.getByRole('combobox', { name: '執行武將', exact: true }).selectOption(executor!.id);
    await court.getByRole('button', { name: '開始工作', exact: true }).click();
    expect(await state(page)).toEqual(initial);
    await page.keyboard.press('Escape');
    let earned = initial;
    const monthly: { day: number; favor: number }[] = [];
    evidence.monthly = monthly;
    while ((earned.court.courtFavor[clanId] ?? 0) < 20 && earned.time.day < 240) {
      evidence.lastSettled = earned;
      const before = earned;
      earned = await normalDay(page, schedules);
      if (earned.time.dayOfMonth === 1) {
        expect(
          earned.diplomacy.missions.some(
            (mission) =>
              mission.fromClanId === clanId &&
              mission.target === 'court' &&
              mission.officerId === executor!.id,
          ),
        ).toBe(true);
        expect(earned.court.courtFavor[clanId]).toBeCloseTo(
          (before.court.courtFavor[clanId] ?? 0) +
            BAL.courtFavorGainBase +
            effectiveStat(before.officers[executor!.id]!, 'pol') / BAL.courtFavorGainPolDivisor,
          10,
        );
        monthly.push({ day: earned.time.day, favor: earned.court.courtFavor[clanId] ?? 0 });
      }
      await dismissKnownOwners(page, choices);
    }
    evidence.monthly = monthly;
    evidence.earned = earned;
    expect(earned.court.courtFavor[clanId]).toBeGreaterThanOrEqual(20);
    await pauseAtBoundary(page);
    court = await openCourt(page);
    await expect(court.getByRole('button', { name: '請求下一階官位', exact: true })).toBeEnabled();
    const beforeGrant = await state(page);
    await court.getByRole('button', { name: '請求下一階官位', exact: true }).click();
    expect(await state(page), 'Request must remain queued until the ordinary day').toEqual(
      beforeGrant,
    );
    expect(
      (await log(page)).entries.filter((entry) => entry.command.type === 'requestCourtRank'),
    ).toHaveLength(0);
    await page.keyboard.press('Escape');
    const granted = await normalDay(page, schedules);
    evidence.granted = granted;
    expect(granted.time.dayOfMonth).not.toBe(1);
    expect(granted.clans[clanId]!.courtRank).toBe('ju5ge');
    expect(granted.clans[clanId]!.gold).toBe(beforeGrant.clans[clanId]!.gold - 300);
    expect(granted.clans[clanId]!.prestige).toBe(beforeGrant.clans[clanId]!.prestige + 50);
    expect(granted.court.courtFavor[clanId]).toBe(beforeGrant.court.courtFavor[clanId]);
    await dismissKnownOwners(page, choices);
    await pauseAtBoundary(page);
    court = await openCourt(page);
    await expect(court).toContainText('現任 從五位下');
    await expect(court.getByRole('button', { name: '請求下一階官位', exact: true })).toBeDisabled();
    await expect(court.locator('[aria-current="step"]')).toContainText('從五位下');
    const commandLog = await log(page);
    evidence.commandLog = commandLog;
    expect(
      commandLog.entries
        .filter((entry) => entry.command.type === 'requestCourtRank')
        .map((entry) => entry.command),
    ).toEqual([{ type: 'requestCourtRank', clanId }]);
    await page.keyboard.press('Escape');
    const beforeSave = await state(page);
    // 02 §3.4 / 09 §3.11 omit the transient AI intent log; 16 §3.2 saves a JSON snapshot.
    const expectedReload = JSON.parse(
      JSON.stringify({ ...beforeSave, ai: { ...beforeSave.ai, intentLog: [] } }),
    ) as GameState;
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '存檔', exact: true }).click();
    const panel = page.getByTestId('save-load-panel');
    const slot = page.getByTestId('save-slot-manual:1');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await slot.getByRole('button', { name: '存檔', exact: true }).click();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await expect(slot).toContainText(beforeSave.clans[clanId]!.name);
    await page.reload();
    await page.getByTestId('title-save-list').click();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await slot.getByRole('button', { name: '載入', exact: true }).click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    const reloaded = await state(page);
    evidence.reloaded = reloaded;
    expect(reloaded).toEqual(expectedReload);
    expect(validateState(reloaded)).toEqual([]);
    court = await openCourt(page);
    await expect(court).toContainText('現任 從五位下');
    await expect(court.getByRole('button', { name: '請求下一階官位', exact: true })).toBeDisabled();
  } finally {
    evidence.choices = choices;
    evidence.schedules = schedules;
    evidence.lastObservedDay = await day(page).catch(() => null);
    const path = info.outputPath('earned-court-rank-production-journey.json');
    await writeFile(path, JSON.stringify(evidence));
    await info.attach('earned-court-rank-production-journey', {
      path,
      contentType: 'application/json',
    });
  }
});
