import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import type { SaveFile } from '../src/core/save/serialize';
import type { CmdStartPlot } from '../src/core/commands/types';
import type { ClanId, OfficerId } from '../src/core/state/ids';
import { validateState } from '../src/core/state/invariants';
import { validateCommand } from '../src/core/commands/validate';
import { getPlotSuccessRate } from '../src/core/systems/plots';
import { encodeFullSnapshot } from './full-snapshot-transport';
import { test, expect } from './fixtures';

const actor = 'clan.miyoshi' as ClanId;
const target = 'off.miura-masatoshi' as OfficerId;
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
  const path = info.outputPath('earned-imagawa.tfusave');
  await mkdir(dirname(path), { recursive: true });
  const generated = await runFile(
    process.execPath,
    [
      resolve('node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'app',
      'tests/app/earnedImagawaJourney.spec.ts',
      '--minWorkers=1',
      '--maxWorkers=1',
    ],
    {
      env: { ...process.env, EARNED_IMAGAWA_PATH: path },
    },
  );
  await info.attach('CPU-earned-rumors-and-actual-arrivals', {
    body: Buffer.from(generated.stdout + generated.stderr),
    contentType: 'text/plain',
  });
  const raw = await readFile(path, 'utf8');
  const save = JSON.parse(raw) as SaveFile;
  expect(save.state.time.day).toBe(240);
  expect(save.state.meta.playerClanId).toBe(actor);
  expect(save.state.officers[target]).toMatchObject({
    clanId: 'clan.imagawa',
    loyalty: 25,
  });
  expect(save.pendingCommands).toEqual([]);
  await info.attach('CPU-earned-rumors-full-checkpoints-events-command-history', {
    path: `${path}.evidence.json`,
    contentType: 'application/json',
  });
  const control = JSON.parse(await readFile(`${path}.evidence.json`, 'utf8')) as {
    referenceTail: GameState[];
    submitted: { day: number; command: CmdStartPlot }[];
  };
  return { raw, save, control };
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
    name: 'earned-imagawa.tenkafubu.json',
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
  expect(await day(page)).toBe(240);
}

async function nativePlot(page: Page, command: CmdStartPlot) {
  const before = await state(page);
  expect(validateCommand(before, command).ok).toBe(true);
  await page.getByTestId('rail-plot').click();
  const panel = page.getByTestId('plot-panel');
  await panel
    .getByRole('radio', {
      name: command.kind === 'poach' ? '引拔' : '流言',
      exact: true,
    })
    .check();
  await panel
    .getByRole('combobox', { name: '目標勢力', exact: true })
    .selectOption(command.targetClanId);
  await panel
    .getByRole('combobox', { name: '目標武將或城池', exact: true })
    .selectOption(command.targetOfficerId);
  await panel
    .getByRole('combobox', { name: '執行武將', exact: true })
    .selectOption(command.executorId);
  if (command.kind === 'poach')
    await panel
      .getByRole('combobox', { name: '一次性投入（貫）', exact: true })
      .selectOption(String(command.investGold));
  const start = panel.getByRole('button', { name: '著手調略', exact: true });
  await expect(start).toBeEnabled();
  await start.click({ timeout: 5000 });
  expect(await state(page)).toEqual(before);
  await page.keyboard.press('Escape');
}

test('earned Imagawa rumors then native poach form, ordinary monthly resolution and vassal admission', async ({
  page,
}, info) => {
  test.setTimeout(270000);
  const evidence: Record<string, unknown> = {},
    choices: string[] = [],
    schedules: DaySchedule[] = [],
    daily: GameState[] = [];
  const persist = () =>
    writeFile(
      info.outputPath('earned-imagawa-native-tail.json'),
      JSON.stringify({ ...evidence, choices, schedules, daily }),
    );
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const earned = await checkpoint(info);
    evidence.CPUCheckpoint = earned.save;
    await persist();
    await page.clock.install();
    await importCheckpoint(page, earned.raw, earned.save);
    evidence.nativeImport = await state(page);
    await persist();
    await dismissKnownOwners(page, choices);
    await pauseAtBoundary(page);
    const planned = earned.control.submitted.filter(
      (s) => s.day >= 240 && s.command.type === 'startPlot',
    );
    const first = planned.find(
      (s) => s.day === 240 && s.command.kind === 'poach' && s.command.targetOfficerId === target,
    )!;
    expect(first.command.investGold).toBe(1000);
    expect(getPlotSuccessRate(await state(page), first.command)).toBeGreaterThan(0);
    for (const item of planned.filter((s) => s.day === 240)) await nativePlot(page, item.command);
    let current = await state(page);
    while (current.time.day < 300) {
      await dismissKnownOwners(page, choices);
      if (current.time.day === 270) {
        await pauseAtBoundary(page);
        for (const item of planned.filter((s) => s.day === 270))
          await nativePlot(page, item.command);
      }
      current = await normalDay(page, schedules);
      daily.push(current);
      const persistent = structuredClone(current);
      persistent.ai.intentLog = [];
      expect(persistent, `Complete persistent state parity on day ${current.time.day}`).toEqual(
        earned.control.referenceTail[current.time.day - 241],
      );
      await persist();
    }
    expect(current.officers[target]).toMatchObject({
      clanId: actor,
      status: 'serving',
      loyalty: 47,
    });
    expect(current.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'officer.recruited',
            day: 300,
            officerId: target,
            source: 'poach',
          }),
        }),
      ]),
    );
    expect(daily.find((s) => s.time.day === 270)!.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'plot.exposed',
            day: 270,
            kind: 'poach',
            targetOfficerId: 'off.yui-masanobu',
          }),
        }),
      ]),
    );
    await dismissKnownOwners(page, choices);
    await pauseAtBoundary(page);
    await page.getByTestId('rail-officers').click();
    const row = page
      .getByTestId('officer-list')
      .locator('tbody tr')
      .filter({ hasText: '三浦正俊' });
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(page.getByTestId('officer-detail')).toBeVisible();
    await expect(page.getByTestId('officer-detail')).toContainText('三浦正俊');
    evidence.final = { state: await state(page), log: await log(page) };
    await persist();
    await info.attach('earned-Imagawa-poach-full-native-tail', {
      path: info.outputPath('earned-imagawa-native-tail.json'),
      contentType: 'application/json',
    });
  } finally {
    await persist();
  }
});
