import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { checkSharedPanelFrame } from './helpers/sharedPanelFrame';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as {
  events: { id: string; cutscene: { title: string }; choices: { label: string }[] }[];
};
const historical = catalog.events.find((event) => event.id === 'evt.okehazama')!;
const choiceLabels = new Set(
  catalog.events.flatMap((event) => event.choices.map((choice) => choice.label)),
);

async function resumeWhenUnowned(page: Page) {
  const speed = page.getByTestId('speed-5');
  if (
    (await page.getByRole('dialog').count()) > 0 ||
    !(await speed.isEnabled()) ||
    (await speed.getAttribute('aria-pressed')) === 'true'
  )
    return;
  try {
    await speed.click({ timeout: 500 });
  } catch (error) {
    // A mandatory owner can mount between the check and native actionability.
    // Return to owner handling instead of waiting for its disabled background control.
    if (
      error instanceof Error &&
      error.name === 'TimeoutError' &&
      (await page.getByRole('dialog').count()) > 0 &&
      (await speed.isDisabled())
    )
      return;
    throw error;
  }
}

async function handleKnownOwner(page: Page, handled: string[]) {
  if (await page.getByTestId('month-summary').isVisible()) {
    handled.push('month-summary');
    await page.getByTestId('month-summary-continue').click();
    return true;
  }
  if (await page.getByTestId('proposal-inbox').isVisible()) {
    handled.push('proposal-inbox');
    await page.getByRole('dialog').getByRole('button', { name: '全部駁回', exact: true }).click();
    return true;
  }
  if (await page.getByTestId('envoy-modal').isVisible()) {
    handled.push('envoy');
    await page
      .getByTestId('envoy-modal')
      .getByRole('button', { name: '拒絕', exact: true })
      .click();
    return true;
  }
  if (await page.getByTestId('event-modal').isVisible()) {
    // Core can publish the target event between the caller's pending-ID read
    // and this modal check. Never let the generic owner drain consume it.
    const pending = await page.evaluate(
      () => window.__tenka.debug.getState().events.pendingChoiceEventId,
    );
    if (pending === historical.id) return false;
    for (const button of await page.getByRole('dialog').getByRole('button').all()) {
      const label = (await button.textContent())?.trim() ?? '';
      if ((label === '繼續' || choiceLabels.has(label)) && (await button.isEnabled())) {
        handled.push(`event:${label}`);
        await button.click();
        return true;
      }
    }
    throw new Error('Authored event has no known enabled native choice');
  }
  // Take one DOM snapshot: a known owner may mount after its earlier visibility
  // check. Retry through the outer poll rather than mistaking it for unknown UI.
  const owners = await page.getByRole('dialog').evaluateAll((dialogs) => {
    const knownIds = ['month-summary', 'proposal-inbox', 'envoy-modal', 'event-modal'];
    return dialogs.map((dialog) => ({
      owner:
        knownIds.find(
          (id) =>
            dialog.getAttribute('data-testid') === id ||
            dialog.querySelector(`[data-testid="${id}"]`) !== null,
        ) ?? null,
      label: dialog.getAttribute('aria-label'),
      labelledBy: dialog.getAttribute('aria-labelledby'),
    }));
  });
  expect(
    owners.filter((owner) => owner.owner === null),
    'Never bypass an unknown mandatory owner',
  ).toEqual([]);
  return owners.length > 0;
}

test('production event catalog fires actual Oda Okehazama, queues its native choice and survives native save/load', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const initial = await page.evaluate(() => window.__tenka.debug.getState());
  expect(initial.meta.seed).toBe(42);
  const handled: string[] = [];
  await page.getByTestId('speed-5').click();
  await expect
    .poll(
      async () => {
        const pending = await page.evaluate(
          () => window.__tenka.debug.getState().events.pendingChoiceEventId,
        );
        if (
          pending === historical.id &&
          (await page
            .getByRole('dialog', { name: historical.cutscene.title, exact: true })
            .isVisible())
        )
          return true;
        await handleKnownOwner(page, handled);
        await resumeWhenUnowned(page);
        const current = await page.evaluate(() => window.__tenka.debug.getState());
        expect(current.time.year).toBe(1560);
        expect(
          current.time.month,
          'Actual historical trigger must not be skipped',
        ).toBeLessThanOrEqual(5);
        return false;
      },
      { timeout: 55_000, intervals: [100] },
    )
    .toBe(true);
  const pending = await page.evaluate(() => window.__tenka.debug.getState());
  expect(pending.time).toMatchObject({ year: 1560, month: 5, dayOfMonth: 1 });
  expect(pending.events.pendingChoiceBinding?.clanId).toBe(pending.meta.playerClanId);
  expect(
    pending.officers['off.imagawa-yoshimoto' as keyof typeof pending.officers]!.status,
  ).not.toBe('dead');
  const pendingLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const eventDialog = page.getByRole('dialog', { name: historical.cutscene.title, exact: true });
  await checkSharedPanelFrame(eventDialog, 'dialog', info, 'actual-historical-event-frame', false);
  await page.keyboard.press('Escape');
  await expect(eventDialog).toBeVisible();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(pending);
  const pendingPath = info.outputPath('actual-production-okehazama-pending.png');
  await page.screenshot({ path: pendingPath });
  await info.attach('actual-production-okehazama-pending', {
    path: pendingPath,
    contentType: 'image/png',
  });
  await eventDialog
    .getByRole('button', { name: historical.choices[0]!.label, exact: true })
    .click();
  // Closing the owned modal resumes x5; a real tick may run before Playwright returns.
  // The applied command log below proves resolution happened on the next strategy day.
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => window.__tenka.debug.getState());
        if (state.events.flags['okehazama-win'] === 1) return true;
        await handleKnownOwner(page, handled);
        await resumeWhenUnowned(page);
        return false;
      },
      { timeout: 15_000, intervals: [50] },
    )
    .toBe(true);
  // The resolving tick may publish another mandatory FIFO owner. Drain only
  // known owners before using background speed controls; never bypass them.
  for (let owners = 0; owners < 16 && (await page.getByRole('dialog').count()) > 0; owners++)
    await handleKnownOwner(page, handled);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('speed-pause')).toBeEnabled();
  await page.getByTestId('speed-pause').click();
  const resolved = await page.evaluate(() => window.__tenka.debug.getState());
  expect(resolved.events.pendingChoiceEventId).toBeNull();
  expect(resolved.events.pendingChoiceBinding).toBeNull();
  expect(resolved.officers['off.imagawa-yoshimoto' as keyof typeof resolved.officers]!.status).toBe(
    'dead',
  );
  const resolvedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const resolutions = resolvedLog.entries.filter(
    (entry) =>
      entry.command.type === 'resolveEventChoice' && entry.command.eventId === historical.id,
  );
  expect(resolutions).toHaveLength(1);
  expect(resolutions[0]!.day).toBe(pending.time.day + 1);
  const saved = await page.evaluate(() => window.__tenka.debug.getState());
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '存檔', exact: true }).click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await page
    .getByTestId('save-slot-manual:1')
    .getByRole('button', { name: '存檔', exact: true })
    .click();
  await expect(page.getByTestId('save-slot-manual:1')).toContainText('織田');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await panel.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '讀檔', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await page
    .getByTestId('save-slot-manual:1')
    .getByRole('button', { name: '載入', exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  const loaded = await page.evaluate(() => window.__tenka.debug.getState());
  expect(loaded.events).toEqual(saved.events);
  expect(loaded.rng).toEqual(saved.rng);
  expect(loaded.time).toEqual(saved.time);
  expect(loaded.officers['off.imagawa-yoshimoto' as keyof typeof loaded.officers]).toEqual(
    saved.officers['off.imagawa-yoshimoto' as keyof typeof saved.officers],
  );
  await expect(page.getByTestId('event-unavailable')).toHaveCount(0);
  const path = info.outputPath('actual-production-event-evidence.json');
  await writeFile(
    path,
    JSON.stringify(
      {
        initialSeed: initial.meta.seed,
        pending,
        pendingLog,
        resolved,
        resolvedLog,
        saved,
        loaded,
        handled,
      },
      null,
      2,
    ),
  );
  await info.attach('actual-production-event-evidence', { path, contentType: 'application/json' });
});

for (const scale of Array.from({ length: 15 }, (_, index) =>
  Number((0.8 + index * 0.05).toFixed(2)),
)) {
  test(`earned Okehazama choice stays reachable at 1280×720 scale ${scale}`, async ({
    page,
  }, info) => {
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
    await page.getByTestId('speed-pause').click();
    const handled: string[] = [];
    await page.getByTestId('speed-5').click();
    const event = page.getByRole('dialog', { name: historical.cutscene.title, exact: true });
    await expect
      .poll(
        async () => {
          const pending = await page.evaluate(
            () => window.__tenka.debug.getState().events.pendingChoiceEventId,
          );
          if (pending === historical.id && (await event.isVisible())) return true;
          await handleKnownOwner(page, handled);
          await resumeWhenUnowned(page);
          return false;
        },
        { timeout: 45_000, intervals: [100] },
      )
      .toBe(true);
    const state = await page.evaluate(() => window.__tenka.debug.getState());
    expect(state.time).toMatchObject({ year: 1560, month: 5, dayOfMonth: 1 });
    expect(state.events.pendingChoiceEventId).toBe(historical.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
    const viewport = { width: 1280, height: 720 };
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const [name, target, action] of [
      ['dialog', event, false],
      ['title', event.getByRole('heading'), false],
      [
        'body',
        event
          .getByTestId('event-modal')
          .locator('p')
          .filter({ has: page.getByTestId('event-text') }),
        false,
      ],
      [
        'choice',
        event.getByRole('button', { name: historical.choices[0]!.label, exact: true }),
        true,
      ],
    ] as const) {
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(0);
      expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(viewport.height);
      if (action) {
        expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(32);
        expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(32);
      }
      boxes[name] = box!;
    }
    expect(await event.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(event).toBeVisible();
    if ([0.8, 1, 1.5].includes(scale))
      await page.screenshot({ path: info.outputPath(`event-${scale}.png`) });
    await writeFile(
      info.outputPath(`event-${scale}.json`),
      JSON.stringify({ scale, time: state.time, handled, boxes }),
    );
    const choice = event.getByRole('button', { name: historical.choices[0]!.label, exact: true });
    await expect(choice).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(event).toHaveCount(0);
  });
}
