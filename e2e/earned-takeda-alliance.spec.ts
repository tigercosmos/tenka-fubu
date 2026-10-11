import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import type { SaveFile } from '../src/core/save/serialize';
import type { ClanId } from '../src/core/state/ids';
import { validateState } from '../src/core/state/invariants';
import { validateCommand } from '../src/core/commands/validate';
import { getTrust, hasPact, getDiplomacyRow } from '../src/core/systems/diplomacyCommon';
import { evaluateProposal, reinforcementAidScore } from '../src/core/systems/diplomacyEval';
import { monthlyDiplomacyWorkCost } from '../src/core/systems/court';
import { encodeFullSnapshot } from './full-snapshot-transport';
import { test, expect } from './fixtures';

const actor = 'clan.miyoshi' as ClanId;
const ally = 'clan.takeda' as ClanId;
const enemy = 'clan.nagao' as ClanId;
const runFile = promisify(execFile);

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

async function checkpoint(info: TestInfo) {
  const path = info.outputPath('earned-miyoshi-takeda.tfusave');
  await mkdir(dirname(path), { recursive: true });
  const generated = await runFile(
    process.execPath,
    [
      resolve('node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'app',
      'tests/app/earnedMiyoshiTakedaJourney.spec.ts',
      '--minWorkers=1',
      '--maxWorkers=1',
    ],
    {
      env: { ...process.env, EARNED_MIYOSHI_TAKEDA_SAVE_PATH: path },
    },
  );
  await info.attach('CPU-earned-policy-paid-months-and-actual-arrivals', {
    body: Buffer.from(generated.stdout + generated.stderr),
    contentType: 'text/plain',
  });
  const raw = await readFile(path, 'utf8');
  const save = JSON.parse(raw) as SaveFile;
  expect(save.state.time.day).toBe(300);
  expect(save.state.meta.playerClanId).toBe(actor);
  expect(getTrust(save.state, actor, ally)).toBe(78.10000000000001);
  expect(save.pendingCommands).toEqual([]);
  await info.attach('CPU-earned-full-checkpoints-events-command-history', {
    path: `${path}.evidence.json`,
    contentType: 'application/json',
  });
  return { raw, save };
}

async function importCheckpoint(page: Page, raw: string, save: SaveFile) {
  await page.goto('/?debug=1');
  await page.getByTestId('title-save-list').click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const choosing = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'earned-miyoshi-takeda.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  await panel.getByRole('combobox').selectOption('manual:2');
  await panel.getByRole('button', { name: '存入槽位', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  await page
    .getByTestId('save-slot-manual:2')
    .getByRole('button', { name: '載入', exact: true })
    .click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  expect(await state(page), 'Full codec state parity before any native tail decisions').toEqual(
    save.state,
  );
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 10000);
  expect(await day(page)).toBe(300);
}

async function takedaPanel(page: Page) {
  await page.getByTestId('rail-diplomacy').click();
  const panel = page.getByTestId('diplomacy-panel');
  await panel.getByRole('button', { name: /武田家 ·/ }).click();
  return panel;
}

test('CPU-earned Miyoshi prefix then native paid month, Takeda alliance and lawful refused aid request', async ({
  page,
}, info) => {
  test.setTimeout(270_000);
  const evidence: Record<string, unknown> = {};
  const choices: string[] = [];
  const schedules: DaySchedule[] = [];
  const daily: GameState[] = [];
  const persist = async () => {
    await writeFile(
      info.outputPath('earned-takeda-native-tail.json'),
      JSON.stringify(
        {
          ...evidence,
          choices,
          schedules,
          daily,
        },
        null,
        2,
      ),
    );
  };
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const earned = await checkpoint(info);
    evidence.CPUCheckpoint = earned.save;
    await persist();
    await page.clock.install();
    await importCheckpoint(page, earned.raw, earned.save);
    evidence.nativeImport = await state(page);
    await persist();
    let current = earned.save.state;
    await dismissKnownOwners(page, choices);
    await pauseAtBoundary(page);
    while (current.time.day < 330) {
      await dismissKnownOwners(page, choices);
      current = await normalDay(page, schedules);
      daily.push(current);
      await persist();
    }
    const beforePaid = daily.find((s) => s.time.day === 329)!;
    const paid = current;
    expect(paid.time.day).toBe(330);
    const mission = beforePaid.diplomacy.missions.find(
      (m) => m.fromClanId === actor && m.target === ally,
    );
    expect(mission).toBeDefined();
    expect(monthlyDiplomacyWorkCost(beforePaid, mission!)).toBe(16);
    expect(getTrust(paid, actor, ally) - getTrust(beforePaid, actor, ally)).toBeCloseTo(7.81, 12);
    expect(getTrust(paid, actor, ally)).toBeCloseTo(85.91, 12);
    expect(evaluateProposal(paid, actor, ally, 'proposeAlliance')).toBeGreaterThanOrEqual(60);
    await dismissKnownOwners(page, choices, true);
    const summary = page.getByTestId('month-summary');
    await expect(summary).toBeVisible();
    const ledger = await page
      .getByTestId('month-summary-settlement')
      .locator('dd')
      .allTextContents();
    expect(ledger).toHaveLength(9);
    const number = (text: string) =>
      Number(
        text
          .replaceAll(',', '')
          .match(/[-−]?\d+(?:\.\d+)?/u)![0]
          .replace('−', '-'),
      );
    const closing = number(ledger[7]!),
      net = number(ledger[6]!);
    expect(closing - net).toBe(beforePaid.clans[actor]!.gold - 16);
    expect(closing).toBe(paid.clans[actor]!.gold);
    evidence.paidNativeMonth = { state: paid, ledger, beforePaid };
    await persist();
    await dismissKnownOwners(page, choices);
    await pauseAtBoundary(page);
    const beforeAlliance = await state(page);
    const alliance = {
      type: 'proposePact',
      clanId: actor,
      targetClanId: ally,
      kind: 'proposeAlliance',
      reinforceAgainstClanId: null,
    } as const;
    expect(validateCommand(beforeAlliance, alliance).ok).toBe(true);
    expect(hasPact(beforeAlliance, actor, ally, 'alliance')).toBe(false);
    const panel = await takedaPanel(page);
    await expect(panel.getByRole('button', { name: '締結同盟', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: '締結同盟', exact: true }).click();
    expect(await state(page)).toEqual(beforeAlliance);
    await page.keyboard.press('Escape');
    const allied = await normalDay(page, schedules);
    daily.push(allied);
    await pauseAtBoundary(page);
    expect(allied.time.day).toBe(331);
    expect(hasPact(allied, actor, ally, 'alliance')).toBe(true);
    expect(getTrust(allied, actor, ally)).toBeCloseTo(
      getTrust(beforeAlliance, actor, ally) - 60,
      12,
    );
    expect(
      allied.reports.filter(
        (r) =>
          r.event.type === 'pact.signed' &&
          r.event.kind === 'alliance' &&
          r.event.clanIds.includes(actor) &&
          r.event.clanIds.includes(ally),
      ),
    ).toHaveLength(1);
    evidence.nativeAlliance = { beforeAlliance, allied, log: await log(page) };
    await persist();
    const request = {
      type: 'proposePact',
      clanId: actor,
      targetClanId: ally,
      kind: 'requestReinforce',
      reinforceAgainstClanId: enemy,
    } as const;
    expect(getTrust(allied, actor, ally)).toBeGreaterThanOrEqual(20);
    expect(validateCommand(allied, request).ok).toBe(true);
    expect(reinforcementAidScore(allied, actor, ally)).toBeLessThan(0.5);
    const active = await takedaPanel(page);
    await active
      .getByRole('combobox', { name: '援軍對抗勢力', exact: true })
      .selectOption(enemy, { timeout: 5000 });
    const requestButton = active.getByRole('button', { name: '請求援軍', exact: true });
    await expect(requestButton).toBeEnabled();
    await requestButton.click({ timeout: 5000 });
    expect(await state(page)).toEqual(allied);
    await page.keyboard.press('Escape');
    const refused = await normalDay(page, schedules);
    daily.push(refused);
    await pauseAtBoundary(page);
    expect(refused.time.day).toBe(332);
    expect(validateState(refused)).toEqual([]);
    expect(hasPact(refused, actor, ally, 'alliance')).toBe(true);
    expect(getTrust(refused, actor, ally)).toBe(getTrust(allied, actor, ally));
    expect(
      refused.reports.filter(
        (r) =>
          r.event.type === 'diplo.refused' &&
          r.event.fromClanId === actor &&
          r.event.toClanId === ally &&
          r.event.kind === 'requestReinforce',
      ),
    ).toHaveLength(1);
    expect(
      refused.reports.filter(
        (r) =>
          r.event.type === 'diplo.reinforceAgreed' &&
          r.event.fromClanId === actor &&
          r.event.toClanId === ally,
      ),
    ).toHaveLength(0);
    expect(getDiplomacyRow(refused, actor, ally).refusalCooldownUntilDay.requestReinforce).toBe(
      422,
    );
    const actualLog = await log(page);
    expect(actualLog.incompleteReasons).toEqual(['loadedGame']);
    const sent = actualLog.entries.filter(
      (e) => e.command.type === 'proposePact' && e.command.clanId === actor,
    );
    expect(sent.map((e) => e.command)).toEqual([alliance, request]);
    expect(sent.map((e) => e.day)).toEqual([31, 32]);
    evidence.nativeRequestRefusal = { allied, refused, log: actualLog };
    await persist();
    await info.attach('CPU-prefix-native-import-paid-alliance-and-honest-refusal', {
      path: info.outputPath('earned-takeda-native-tail.json'),
      contentType: 'application/json',
    });
  } finally {
    // All completed stages are already durable; do not query a closed page here.
    await persist();
  }
});
