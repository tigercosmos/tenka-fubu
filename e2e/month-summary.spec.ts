import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';

const events = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as { events: { choices: { label: string }[] }[] };

const knownChoices = new Set(
  events.events.flatMap((event) => event.choices.map((choice) => choice.label)),
);

async function boot(page: Page, scale: number, monthPause: boolean) {
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-settings').click();
  const settings = page.getByRole('dialog');
  const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press('Home');
  for (let index = 0; index < Math.round((scale - 0.8) / 0.05); index++)
    await slider.press('ArrowRight');
  if (!monthPause) await settings.getByRole('switch', { name: '月初', exact: true }).uncheck();
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
}

async function evidence(page: Page) {
  const state = await page.evaluate(() => ({
    core: JSON.stringify(window.__tenka.debug.getState()),
    log: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  return {
    ...state,
    pendingIndicator: await page
      .getByTestId('screen-strategy')
      .getByRole('status')
      .filter({ hasText: '命令待下一日執行' })
      .allTextContents(),
  };
}

type MonthlyObservation = {
  monthVisible: boolean;
  toastVisible: boolean;
  owner: 'proposal' | 'envoy' | 'event' | null;
  dialogs: number;
  paused: boolean;
};

async function readMonthlyObservation(page: Page): Promise<MonthlyObservation> {
  // Read all owner and notification facts in one browser task, without interleaved effects.
  return page.evaluate(() => {
    const visible = (node: Element | null): node is Element => {
      if (!node || node.closest('[aria-hidden="true"]')) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility === 'visible';
    };
    const byId = (id: string) => visible(document.querySelector(`[data-testid="${id}"]`));
    const owners = [
      ['proposal-inbox', 'proposal'],
      ['envoy-modal', 'envoy'],
      ['event-modal', 'event'],
    ] as const;
    return {
      monthVisible: byId('month-summary'),
      toastVisible: [...document.querySelectorAll('[role="status"], [role="alert"]')].some(
        (node) =>
          visible(node) &&
          /本次月初金錢結算淨增減.*目前城內兵糧.*非歷史兵糧增減/.test(node.textContent ?? ''),
      ),
      owner: owners.find(([id]) => byId(id))?.[1] ?? null,
      dialogs: [...document.querySelectorAll('[role="dialog"], dialog')].filter(visible).length,
      paused:
        document.querySelector('[data-testid="speed-pause"]')?.getAttribute('aria-pressed') ===
        'true',
    };
  });
}

function assertKnownOwner(observation: MonthlyObservation): void {
  if (observation.owner === null)
    expect(observation.dialogs, 'Unknown dialog must not be bypassed').toBe(0);
  else expect(observation.dialogs, 'Exactly one known modal owns the observed dialog').toBe(1);
}

function monthlyToastComplete(
  observation: MonthlyObservation,
  seen: boolean,
  handled: string[],
): boolean {
  assertKnownOwner(observation);
  return seen && handled.includes('proposal');
}

async function decideKnownModal(
  page: Page,
  handled: string[],
  observation: MonthlyObservation,
): Promise<boolean> {
  assertKnownOwner(observation);
  if (observation.owner === null) {
    return false;
  }
  if (observation.owner === 'proposal') {
    handled.push('proposal');
    await page.getByRole('dialog').getByRole('button', { name: '全部駁回', exact: true }).click();
    return true;
  }
  if (observation.owner === 'envoy') {
    handled.push('envoy');
    await page
      .getByTestId('envoy-modal')
      .getByRole('button', { name: '拒絕', exact: true })
      .click();
    return true;
  }
  if (observation.owner === 'event') {
    const dialog = page.getByRole('dialog');
    const buttons = dialog.getByRole('button');
    for (const button of await buttons.all()) {
      const label = (await button.textContent())?.trim() ?? '';
      if ((label === '繼續' || knownChoices.has(label)) && (await button.isEnabled())) {
        handled.push(`event:${label}`);
        await button.click();
        return true;
      }
    }
    throw new Error('No known enabled event choice; refusing generic dialog dismissal');
  }
  return false;
}

test('monthly observation reads one coherent owner snapshot and refuses unknown dialogs', async ({
  page,
}) => {
  await page.setContent('<button data-testid="speed-pause" aria-pressed="true">Pause</button>');
  const quiet = await readMonthlyObservation(page);
  expect(quiet).toEqual({
    monthVisible: false,
    toastVisible: false,
    owner: null,
    dialogs: 0,
    paused: true,
  });
  // A later effect must produce a new snapshot, not amend the earlier no-owner observation.
  await page.evaluate(() => {
    queueMicrotask(() => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('data-testid', 'proposal-inbox');
      dialog.innerHTML = '<button>全部駁回</button>';
      dialog.querySelector('button')!.addEventListener('click', () => dialog.remove());
      document.body.append(dialog);
      const toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.textContent = '本次月初金錢結算淨增減，目前城內兵糧，非歷史兵糧增減';
      document.body.append(toast);
    });
  });
  expect(quiet.dialogs).toBe(0);
  const owned = await readMonthlyObservation(page);
  expect(owned).toEqual({
    monthVisible: false,
    toastVisible: true,
    owner: 'proposal',
    dialogs: 1,
    paused: true,
  });
  const handled: string[] = [];
  expect(await decideKnownModal(page, handled, owned)).toBe(true);
  expect(handled).toEqual(['proposal']);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setContent('<div role="dialog"><button>Unknown close</button></div>');
  const unknown = await readMonthlyObservation(page);
  expect(unknown.owner).toBeNull();
  expect(unknown.dialogs).toBe(1);
  expect(() =>
    monthlyToastComplete({ ...unknown, toastVisible: true }, true, ['proposal']),
  ).toThrow('Unknown dialog must not be bypassed');
  await expect(decideKnownModal(page, handled, unknown)).rejects.toThrow(
    'Unknown dialog must not be bypassed',
  );
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(handled).toEqual(['proposal']);
});

for (const scale of [1, 1.5]) {
  test(`native monthly reward and fief navigation scale ${scale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page, scale, true);
    const handled: string[] = [];
    await page.getByTestId('speed-5').click();
    await expect
      .poll(
        async () => {
          const observation = await readMonthlyObservation(page);
          if (observation.monthVisible) return true;
          if (await decideKnownModal(page, handled, observation)) return false;
          if (observation.paused) await page.getByTestId('speed-5').click();
          return false;
        },
        { timeout: 45_000 },
      )
      .toBe(true);
    const before = await evidence(page);
    const openingDay = await page.evaluate(() => window.__tenka.debug.getState().time.day);
    await page.getByRole('dialog').getByRole('button', { name: '褒賞家臣', exact: true }).click();
    const roster = page.getByTestId('reward-roster');
    await expect(roster).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(roster.getByText('本月已支出褒賞金：0貫', { exact: true })).toBeVisible();
    const first = roster.locator('tbody tr').first();
    const action = first.getByRole('button', { name: '加封', exact: true });
    await action.scrollIntoViewIfNeeded();
    const hit = await action.boundingBox();
    expect(hit).not.toBeNull();
    expect(hit!.height).toBeGreaterThanOrEqual(32);
    await page.screenshot({ path: info.outputPath('monthly-reward-roster.png'), fullPage: true });
    await action.click();
    const fief = page.getByTestId('reward-fief-pane');
    await expect(fief).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(await evidence(page)).toEqual(before);
    await fief.getByRole('button', { name: '返回', exact: true }).click();
    await expect(fief).toHaveCount(0);
    expect(await evidence(page)).toEqual(before);
    const dialog = page.getByRole('dialog');
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
    await dialog.locator('header').getByRole('button', { name: '褒賞家臣', exact: true }).click();
    await expect(roster).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day))
      .toBeGreaterThan(openingDay);
    await page.getByTestId('speed-pause').click();
    await info.attach('reward-navigation-evidence', {
      body: JSON.stringify({ scale, handled, hit, bounds }),
      contentType: 'application/json',
    });
  });
  test(`native monthly opening summary at 1280×720 scale ${scale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page, scale, true);
    const handled: string[] = [];
    const startingDay = await page.evaluate(() => window.__tenka.debug.getState().time.day);
    await page.getByTestId('speed-5').click();
    await expect
      .poll(
        async () => {
          const observation = await readMonthlyObservation(page);
          if (observation.monthVisible) return true;
          if (await decideKnownModal(page, handled, observation)) return false;
          // An unrelated siege notice can pause before month one; resume only without a dialog owner.
          if (observation.paused) await page.getByTestId('speed-5').click();
          return false;
        },
        { timeout: 45_000 },
      )
      .toBe(true);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCount(1);
    await expect(page.getByTestId('proposal-inbox')).toHaveCount(0);
    await expect(page.getByTestId('event-modal')).toHaveCount(0);
    const core = await page.evaluate(() => {
      const game = window.__tenka.debug.getState();
      return {
        day: game.time.day,
        income: game.reports
          .filter(
            (report) =>
              report.event.type === 'economy.income' &&
              report.event.clanId === game.meta.playerClanId,
          )
          .sort((a, b) => b.day - a.day)
          .slice(0, 1)
          .map((report) => (report.event.type === 'economy.income' ? report.event.gold : 0)),
      };
    });
    expect(core.day).toBeGreaterThan(startingDay);
    expect(core.income).toHaveLength(1);
    const amount = async (label: string) => {
      const text = await page
        .getByTestId('month-summary-settlement')
        .locator('dt')
        .evaluateAll((nodes, exactLabel) => {
          const matches = nodes.filter((node) => node.textContent === exactLabel);
          if (matches.length !== 1)
            throw new Error(`Expected one exact figure label: ${exactLabel}`);
          return matches[0]!.nextElementSibling?.textContent ?? '';
        }, label);
      return Number(text.replace(/−/g, '-').replace(/[^\d-]/g, ''));
    };
    const income = await amount('本家收入（不含收取貢金）');
    expect(income).toBe(core.income[0]);
    const received = await amount('收取貢金');
    const expenses = await amount('實付支出合計');
    const net = await amount('本次結算金錢淨增減');
    expect(net).toBe(income + received - expenses);
    const before = await evidence(page);
    const button = page.getByTestId('month-summary-continue');
    await expect(button).toBeFocused();
    await page.keyboard.press('Escape');
    await page.mouse.click(2, 2);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    const region = page.getByTestId('month-summary');
    await region.focus();
    await region.press('Home');
    await expect.poll(() => region.evaluate((node) => node.scrollTop)).toBe(0);
    await page.screenshot({ path: info.outputPath('monthly-summary-opening.png'), fullPage: true });
    expect(await region.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await region.press('End');
    await expect.poll(() => region.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    expect(await evidence(page)).toEqual(before);
    const bounds = await dialog.boundingBox();
    const hit = await button.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
    expect(hit!.height).toBeGreaterThanOrEqual(32);
    await page.screenshot({ path: info.outputPath('monthly-summary.png'), fullPage: true });
    await info.attach('opening-evidence', {
      body: JSON.stringify({ scale, handled, core, income, received, expenses, net, bounds, hit }),
      contentType: 'application/json',
    });
    await button.click();
    await expect(page.getByTestId('month-summary')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day))
      .toBeGreaterThan(core.day);
    await page.getByTestId('speed-pause').click();
  });
}

test('disabled month pause produces an actual opening toast without suppressing mandatory proposals', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, 1, false);
  const handled: string[] = [];
  await page.getByTestId('speed-5').click();
  const toast = page.getByText(/本次月初金錢結算淨增減.*目前城內兵糧.*非歷史兵糧增減/);
  let openingToastSeen = false;
  await expect
    .poll(
      async () => {
        const observation = await readMonthlyObservation(page);
        openingToastSeen ||= observation.toastVisible;
        // Toast publication is synchronous; the mandatory inbox is queued by a later React
        // effect and may follow another known FIFO owner. Both observations are required.
        if (monthlyToastComplete(observation, openingToastSeen, handled)) return true;
        if (await decideKnownModal(page, handled, observation)) return false;
        if (observation.paused) await page.getByTestId('speed-5').click();
        return false;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
  await expect(page.getByTestId('month-summary')).toHaveCount(0);
  expect(openingToastSeen).toBe(true);
  await expect(toast).toBeVisible();
  expect(handled).toContain('proposal');
  await page.screenshot({ path: info.outputPath('monthly-toast.png'), fullPage: true });
  await info.attach('toast-evidence', {
    body: JSON.stringify({ handled, text: await toast.textContent() }),
    contentType: 'application/json',
  });
  await page.getByTestId('speed-pause').click();
});
