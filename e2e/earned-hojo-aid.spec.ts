import { completeNewGameWizard } from './new-game-wizard';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { GameState, Army } from '../src/core/state/gameState';
import type { ClanId } from '../src/core/state/ids';
import type { Command } from '../src/core/commands/types';
import { validateState } from '../src/core/state/invariants';
import { validateCommand } from '../src/core/commands/validate';
import { validateStartDiploWork } from '../src/core/commands/diplomacyCommands';
import { getTrust, hasPact } from '../src/core/systems/diplomacyCommon';
import { reinforcementAidScore } from '../src/core/systems/diplomacyEval';
import { monthlyDiplomacyWorkCost } from '../src/core/systems/court';
import { effectiveStat } from '../src/core/systems/officers';
import { encodeFullSnapshot } from './full-snapshot-transport';
import { test, expect } from './fixtures';

const actor = 'clan.takeda' as ClanId;
const ally = 'clan.hojo' as ClanId;
const enemy = 'clan.nagao' as ClanId;
const authored = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as { events: { choices: { label: string }[] }[] };
const eventChoices = new Set(
  authored.events.flatMap((event) => event.choices.map((choice) => choice.label)),
);
const state = async (page: Page): Promise<GameState> =>
  JSON.parse(
    await page.evaluate<string>(
      `(${encodeFullSnapshot.toString()})(window.__tenka.debug.getState())`,
    ),
  ) as GameState;
const log = (page: Page) => page.evaluate(() => window.__tenka.debug.exportCommandLog());

/** Diagnostic observation only: no clock, store, command or DOM input writes. */
function observeDays(
  encode: (value: unknown) => string,
  startingDay: number,
  untilDay: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let frame = 0,
      last = startingDay;
    const states: string[] = [];
    const timer = setTimeout(() => {
      cancelAnimationFrame(frame);
      reject(Error('Normal RAF segment exceeded the 12-second observation budget'));
    }, 12000);
    const observe = () => {
      try {
        const game = window.__tenka.debug.getState();
        if (game.time.day !== last) {
          if (game.time.day !== last + 1)
            throw Error(`Skipped actual calendar day ${last} -> ${game.time.day}`);
          states.push(encode(game));
          last = game.time.day;
        }
        const owner = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some(
          (node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden'
            );
          },
        );
        if (owner || last >= untilDay) {
          const button = document.querySelector<HTMLElement>('[data-testid="speed-pause"]');
          const rect = button?.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0)
            throw Error('Actual pause control missing');
          clearTimeout(timer);
          resolve(
            JSON.stringify({
              states,
              last,
              owner,
              point: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
            }),
          );
          return;
        }
        frame = requestAnimationFrame(observe);
      } catch (error) {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    observe();
  });
}

async function collect(
  page: Page,
  before: GameState,
  until: number,
  daily: GameState[],
  speed: '1' | '2' = '2',
) {
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(`speed-${speed}`).click();
  const observation = JSON.parse(
    await page.evaluate<string>(
      `(${observeDays.toString()})((${encodeFullSnapshot.toString()}),${before.time.day},${until})`,
    ),
  ) as { states: string[]; last: number; owner: boolean; point: { x: number; y: number } };
  // A real owner already pauses the normal driver. Otherwise send actual native
  // pointer input; remote input overshoot is a failure, never an extra-day waiver.
  if (!observation.owner) await page.mouse.click(observation.point.x, observation.point.y);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const current = await state(page);
  expect(current.time.day).toBe(observation.last);
  let last = before.time.day;
  for (const encoded of observation.states) {
    const observed = JSON.parse(encoded) as GameState;
    daily.push(observed); // Retain evidence before checking every completed day.
    expect(observed.time.day).toBe(++last);
    expect(validateState(observed), `Daily INV ${observed.time.day}`).toEqual([]);
  }
  expect(current.time.day).toBe(last);
  return current;
}

async function drain(page: Page, decisions: string[], holdSummary = false) {
  const day = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  for (let i = 0; i < 12; i++) {
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) === 0) {
      const pause = page.getByTestId('speed-pause');
      if ((await pause.getAttribute('aria-pressed')) !== 'true') await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(day);
      return;
    }
    expect(await dialog.count(), 'Exactly one known native owner').toBe(1);
    if (await page.getByTestId('month-summary').isVisible()) {
      if (holdSummary) return;
      decisions.push('summary:continue');
      await page.getByTestId('month-summary-continue').click();
    } else if (await page.getByTestId('proposal-inbox').isVisible()) {
      decisions.push('proposal:全部駁回');
      await dialog.getByRole('button', { name: '全部駁回', exact: true }).click();
    } else if (await page.getByTestId('envoy-modal').isVisible()) {
      decisions.push('envoy:拒絕');
      await dialog.getByRole('button', { name: '拒絕', exact: true }).click();
    } else if (await page.getByTestId('event-modal').isVisible()) {
      let chosen = false;
      for (const button of await dialog.getByRole('button').all()) {
        const label = (await button.textContent())?.trim() ?? '';
        if ((label === '繼續' || eventChoices.has(label)) && (await button.isEnabled())) {
          decisions.push(`event:${label}`);
          await button.click();
          chosen = true;
          break;
        }
      }
      expect(chosen, 'Only authored historical choices').toBe(true);
    } else throw Error('Unknown consent owner; no aid-state injection or dismissal bypass');
  }
  throw Error('Native FIFO did not drain');
}

async function hojoPanel(page: Page) {
  await page.getByTestId('rail-diplomacy').click();
  const panel = page.getByTestId('diplomacy-panel');
  await panel.getByRole('button', { name: /北條家 ·/ }).click();
  return panel;
}

async function paidLedger(page: Page, before: GameState, after: GameState) {
  const mission = before.diplomacy.missions.find(
    (m) => m.fromClanId === actor && m.target === ally,
  );
  expect(mission).toBeDefined();
  const charge = monthlyDiplomacyWorkCost(before, mission!);
  expect(charge).toBe(20);
  await expect(page.getByTestId('month-summary-settlement')).toBeVisible();
  const raw = await page.getByTestId('month-summary-settlement').locator('dd').allTextContents();
  expect(raw).toHaveLength(9);
  const number = (text: string) => {
    const match = text.replaceAll(',', '').match(/[-−]?\d+(?:\.\d+)?/u);
    expect(match).not.toBeNull();
    return Number(match![0].replace('−', '-'));
  };
  const closing = number(raw[7]!),
    net = number(raw[6]!);
  expect(closing - net, 'Separate actual monthly economy from paid diplomatic work').toBe(
    before.clans[actor]!.gold - charge,
  );
  expect(after.clans[actor]!.gold).toBe(closing);
  expect(getTrust(after, actor, ally)).toBeGreaterThan(getTrust(before, actor, ally));
  return {
    day: after.time.day,
    charge,
    raw,
    beforeTrust: getTrust(before, actor, ally),
    afterTrust: getTrust(after, actor, ally),
  };
}

test('earned Hojo military aid: paid native work, agreement, actual AI march and ordinary movement', async ({
  page,
}, info) => {
  const daily: GameState[] = [],
    decisions: string[] = [],
    evidence: unknown[] = [];
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?debug=1&seed=42');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.takeda').click();
    await completeNewGameWizard(page);
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    const initial = await state(page);
    evidence.push({ stage: 'initial', state: initial });
    expect(initial.time.day).toBe(0);
    expect(initial.meta.playerClanId).toBe(actor);
    expect(initial.meta.scenarioId).toBe('s1560');
    expect(hasPact(initial, actor, ally, 'alliance')).toBe(true);
    expect(hasPact(initial, actor, ally, 'marriage')).toBe(true);
    expect(getTrust(initial, actor, ally)).toBeLessThan(20);
    const executor = Object.values(initial.officers)
      .filter(
        (officer) =>
          validateStartDiploWork(initial, {
            type: 'startDiploWork',
            clanId: actor,
            target: ally,
            executorId: officer.id,
          }).ok,
      )
      .sort(
        (a, b) => effectiveStat(b, 'pol') - effectiveStat(a, 'pol') || a.id.localeCompare(b.id),
      )[0];
    expect(executor, 'Naturally eligible unmodified Takeda diplomat').toBeDefined();
    const panel = await hojoPanel(page);
    await panel.getByRole('combobox', { name: '執行武將', exact: true }).selectOption(executor!.id);
    await panel.getByRole('button', { name: '開始工作', exact: true }).click();
    expect(await state(page), 'Work queues without direct state mutation').toEqual(initial);
    expect(
      (await log(page)).entries.filter(
        (e) => e.command.type === 'startDiploWork' && e.command.clanId === actor,
      ),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    let current = initial;
    const payments = [];
    while (getTrust(current, actor, ally) < 20) {
      expect(
        current.time.day,
        'Bounded earned route, not a long simulation or timeout waiver',
      ).toBeLessThan(180);
      const monthBoundary = (Math.floor(current.time.day / 30) + 1) * 30;
      current = await collect(page, current, monthBoundary, daily);
      if (current.time.day === monthBoundary) {
        const beforeMonth = daily.find((s) => s.time.day === monthBoundary - 1);
        expect(beforeMonth).toBeDefined();
        // Keep summary visible for payment evidence; earlier known FIFO owners
        // are drained only through their actual buttons, never hidden/reset.
        await drain(page, decisions, true);
        payments.push(await paidLedger(page, beforeMonth!, current));
      }
      await drain(page, decisions);
      current = await state(page);
      if (current.time.day === 90) {
        const transport = {
          type: 'transport' as const,
          clanId: actor,
          fromCastleId: 'castle.tsutsujigasaki' as keyof GameState['castles'],
          toCastleId: 'castle.fukashi' as keyof GameState['castles'],
          soldiers: 1500,
          gold: 0,
          food: 0,
        };
        expect(validateCommand(current, transport).ok, 'Lawful player border redeployment').toBe(
          true,
        );
        await page.locator('body').click({ position: { x: 960, y: 500 } });
        await page.keyboard.press('Home');
        await expect(page.getByTestId('context-transport')).toBeEnabled();
        await page.getByTestId('context-transport').click();
        const castlePanel = page.getByTestId('castle-panel');
        await expect(castlePanel).toContainText('躑躅崎館');
        await page.getByTestId('transport-destination').selectOption(transport.toCastleId);
        const slider = castlePanel.getByRole('slider', { name: '兵力', exact: true });
        await slider.focus();
        await page.keyboard.press('Home');
        for (let step = 0; step < 15; step++) await page.keyboard.press('ArrowRight');
        await expect(slider).toHaveValue('1500');
        await expect(page.getByTestId('transport-execute')).toBeEnabled();
        await page.getByTestId('transport-execute').click();
        expect(await state(page), 'Player command queues without direct state mutation').toEqual(
          current,
        );
        evidence.push({
          stage: 'lawful-transport-queued',
          current,
          transport,
          commandLog: await log(page),
        });
        await castlePanel.locator('header button').click();
      }
      if (current.time.day === 120) {
        const applied = (await log(page)).entries.filter(
          (entry) =>
            entry.command.type === 'transport' &&
            entry.command.fromCastleId === 'castle.tsutsujigasaki' &&
            entry.command.toCastleId === 'castle.fukashi',
        );
        expect(applied).toHaveLength(1);
        expect(applied[0]!.command).toEqual({
          type: 'transport',
          clanId: actor,
          fromCastleId: 'castle.tsutsujigasaki',
          toCastleId: 'castle.fukashi',
          soldiers: 1500,
          gold: 0,
          food: 0,
        });
        evidence.push({ stage: 'lawful-transport-applied', current, command: applied[0] });
      }
    }
    expect(payments.length, 'Trust was earned through actual paid months').toBeGreaterThan(0);
    const request = {
      type: 'proposePact',
      clanId: actor,
      targetClanId: ally,
      kind: 'requestReinforce',
      reinforceAgainstClanId: enemy,
    } as const;
    evidence.push({
      stage: 'earned-eligibility',
      current,
      payments,
      score: reinforcementAidScore(current, actor, ally),
      verdict: validateCommand(current, request),
    });
    expect(validateCommand(current, request).ok, 'A lawful actual alliance aid request').toBe(true);
    expect(
      reinforcementAidScore(current, actor, ally),
      'Actual refreshed Hojo threat must support aid; refusal is not positive proof',
    ).toBeGreaterThanOrEqual(0.5);
    const active = await hojoPanel(page);
    await active.getByRole('combobox', { name: '援軍對抗勢力', exact: true }).selectOption(enemy);
    await active.getByRole('button', { name: '請求援軍', exact: true }).click();
    expect(await state(page)).toEqual(current);
    await page.keyboard.press('Escape');
    const preRequest = current;
    const baselineArmyIds = new Set(Object.keys(current.armies));
    const aidCommands: Extract<Command, { type: 'march' }>[] = [];
    let spawned: Army | undefined;
    for (let attempt = 0; attempt < 4 && !spawned; attempt++) {
      current = await collect(page, current, current.time.day + 1, daily, '1');
      evidence.push({ stage: 'aid-normal-day', current, commandLog: await log(page) });
      const intents = current.ai.intentLog.filter(
        (intent) =>
          intent.clanId === ally &&
          intent.kind === 'diplo.aid' &&
          intent.day >= preRequest.time.day,
      );
      const newlyQueued = intents
        .flatMap((intent) => intent.commands)
        .filter(
          (command): command is Extract<Command, { type: 'march' }> =>
            command.type === 'march' && command.clanId === ally,
        );
      for (const command of newlyQueued)
        if (!aidCommands.some((previous) => JSON.stringify(previous) === JSON.stringify(command)))
          aidCommands.push(command);
      spawned = Object.values(current.armies).find(
        (army) =>
          !baselineArmyIds.has(army.id) &&
          army.clanId === ally &&
          aidCommands.some(
            (command) =>
              command.originCastleId === army.originCastleId &&
              command.leaderId === army.leaderId &&
              command.targetNodeId === army.targetNodeId &&
              current.castles[command.targetNodeId as keyof typeof current.castles]?.ownerClanId ===
                enemy,
          ),
      );
      await drain(page, decisions);
      current = await state(page);
    }
    expect(
      current.reports.some(
        ({ event }) =>
          event.type === 'diplo.reinforceAgreed' &&
          event.fromClanId === actor &&
          event.toClanId === ally &&
          event.againstClanId === enemy &&
          event.day >= preRequest.time.day,
      ),
    ).toBe(true);
    expect(aidCommands.length, 'Agreement alone is not actual military aid').toBeGreaterThan(0);
    expect(spawned, 'An actual new Hojo aid army, not a message or invented unit').toBeDefined();
    const aidLog = await log(page);
    for (const command of aidCommands)
      expect(
        aidLog.entries.some(
          (entry) =>
            JSON.stringify(entry.command) === JSON.stringify(command) &&
            entry.authority?.kind === 'clan' &&
            entry.authority.clanId === ally,
        ),
      ).toBe(true);
    expect(
      aidLog.entries
        .filter((entry) => entry.command.type === 'proposePact' && entry.command.clanId === actor)
        .map((entry) => entry.command),
    ).toEqual([request]);
    expect(getTrust(current, actor, ally)).toBeCloseTo(getTrust(preRequest, actor, ally) - 20, 10);
    const beforeMove = current.armies[spawned!.id]!;
    const moved = await collect(page, current, current.time.day + 1, daily, '1');
    const afterMove = moved.armies[beforeMove.id];
    evidence.push({
      stage: 'actual-aid-movement',
      beforeMove,
      afterMove,
      state: moved,
      commandLog: await log(page),
    });
    expect(afterMove).toBeDefined();
    expect(
      afterMove!.pathCursor > beforeMove.pathCursor ||
        afterMove!.posNodeId !== beforeMove.posNodeId ||
        afterMove!.edgeProgressDays > beforeMove.edgeProgressDays,
      'Actual ordinary movement, not spawn-only evidence',
    ).toBe(true);
    await drain(page, decisions);
    await page.screenshot({ path: info.outputPath('earned-hojo-aid.png') });
  } finally {
    await info.attach('earned-hojo-aid-full-evidence', {
      body: JSON.stringify({ daily, decisions, evidence }),
      contentType: 'application/json',
    });
  }
});
