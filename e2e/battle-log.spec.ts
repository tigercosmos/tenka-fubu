import { writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function scrollState(log: Locator) {
  return log.evaluate((element) => ({
    top: element.scrollTop,
    height: element.scrollHeight,
    client: element.clientHeight,
  }));
}

async function currentBattle(page: Page) {
  return page.evaluate(() => Object.values(window.__tenka.debug.getState().battles)[0]!);
}

test('real tactical effects log accepted facts and preserve older native scroll reading', async ({
  page,
}, info) => {
  test.setTimeout(75_000);
  await page.goto('/?debug=1');
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  const screen = page.getByTestId('screen-battle');
  await expect(screen).toBeVisible();
  const log = page.getByTestId('battle-log');
  const rows = page.getByTestId('battle-log-list').locator('li');
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const battle = await currentBattle(page);
  const side = before.meta.playerClanId === battle.attackerClanId ? 'attacker' : 'defender';
  const unit = battle.units.find((unit) => unit.side === side && !unit.delegated)!;
  await page.getByTestId(`battle-unit-${unit.id}`).click();
  const target = battle.edges
    .flatMap((edge) => (edge.a === unit.jinId ? [edge.b] : edge.b === unit.jinId ? [edge.a] : []))
    .find((id) => !battle.units.some((unit) => unit.side !== side && unit.jinId === id))!;
  expect(target).toBeDefined();
  await page.getByTestId(`battle-jin-${target}`).click();
  const charge = screen.getByRole('button', { name: /^突擊 5/ });
  await expect(charge).toBeEnabled();
  await charge.click();
  await charge.click();
  await expect(rows).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await screen.getByRole('button', { name: '一倍速 ×1', exact: true }).click();
  await expect(page.locator('[data-log-kind="tactic.accepted"]')).toHaveCount(1);
  const kinds = new Set(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-log-kind')),
    ),
  );
  await expect(page.locator('[data-log-kind="tactic.accepted"]')).toContainText('突擊');
  await expect(page.locator('[data-log-kind="unit.arrived"]')).not.toHaveCount(0);
  await screen.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('[data-log-kind="tactic.accepted"]')).toHaveCount(1);
  expect(
    (await currentBattle(page)).units.find((candidate) => candidate.id === unit.id)!.jinId,
  ).toBe(target);

  await screen.getByRole('button', { name: /^全軍委任：/ }).click();
  await screen.getByRole('button', { name: '一倍速 ×1', exact: true }).click();
  await expect
    .poll(
      async () => {
        const state = await scrollState(log);
        return state.height - state.client;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(80);
  await expect(page.locator('[data-log-kind="unit.changed"]')).not.toHaveCount(0);
  await expect
    .poll(async () =>
      (await page.locator('[data-log-kind="unit.changed"]').allTextContents()).some((text) => {
        const troops = /兵力 ([\d,]+)→([\d,]+)/u.exec(text);
        return (
          text.includes('交戰變化') &&
          troops !== null &&
          Number(troops[1]!.replaceAll(',', '')) > Number(troops[2]!.replaceAll(',', ''))
        );
      }),
    )
    .toBe(true);
  await screen.getByRole('button', { name: '暫停', exact: true }).click();
  const paused = await page.evaluate(() => window.__tenka.debug.getState());
  await expect
    .poll(async () => {
      const state = await scrollState(log);
      return state.height - state.client - state.top;
    })
    .toBeLessThanOrEqual(2);
  const bottom = await scrollState(log);
  await log.hover();
  await page.mouse.wheel(0, -Math.max(80, (bottom.height - bottom.client) / 2));
  await expect
    .poll(async () => {
      const state = await scrollState(log);
      return state.height - state.client - state.top;
    })
    .toBeGreaterThan(32);
  const older = await scrollState(log);
  const anchor = await log.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    const row = [...element.querySelectorAll<HTMLElement>('[data-log-id]')].find((candidate) => {
      const bounds = candidate.getBoundingClientRect();
      return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    });
    return row
      ? { id: row.dataset.logId!, offset: row.getBoundingClientRect().top - viewport.top }
      : null;
  });
  expect(anchor).not.toBeNull();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(paused);
  const tick = (await currentBattle(page)).tick;
  await screen.getByRole('button', { name: '一倍速 ×1', exact: true }).click();
  await expect.poll(async () => (await currentBattle(page)).tick).toBeGreaterThanOrEqual(tick + 2);
  await expect(page.getByTestId('battle-log-latest')).toBeVisible();
  await screen.getByRole('button', { name: '暫停', exact: true }).click();
  const waiting = await page.evaluate(() => window.__tenka.debug.getState());
  expect((await scrollState(log)).top).toBeLessThanOrEqual(older.top + 2);
  const retainedAnchor = await log.evaluate((element, id) => {
    const row = [...element.querySelectorAll<HTMLElement>('[data-log-id]')].find(
      (candidate) => candidate.dataset.logId === id,
    );
    return row ? row.getBoundingClientRect().top - element.getBoundingClientRect().top : null;
  }, anchor!.id);
  if (retainedAnchor !== null)
    expect(Math.abs(retainedAnchor - anchor!.offset)).toBeLessThanOrEqual(2);
  const anchorPath = info.outputPath('older-reader-anchor.json');
  await writeFile(
    anchorPath,
    JSON.stringify(
      {
        anchor,
        retainedOffset: retainedAnchor,
        note:
          retainedAnchor === null
            ? 'Anchor pruned by bounded50-row retention; offset preservation not claimed for this discarded row.'
            : 'Retained actual row identity and viewport offset verified.',
      },
      null,
      2,
    ),
  );
  await info.attach('older-reader-anchor', { path: anchorPath, contentType: 'application/json' });
  await page.getByTestId('battle-log-latest').click();
  await expect
    .poll(async () => {
      const state = await scrollState(log);
      return state.height - state.client - state.top;
    })
    .toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(waiting);
  const screenshotPath = info.outputPath('paused-jump-to-latest-log.png');
  await page.screenshot({ path: screenshotPath });
  await info.attach('paused-jump-to-latest-log', {
    path: screenshotPath,
    contentType: 'image/png',
  });
  const pausedStatePath = info.outputPath('actual-paused-battle-state.json');
  await writeFile(pausedStatePath, JSON.stringify(waiting, null, 2));
  await info.attach('actual-paused-battle-state', {
    path: pausedStatePath,
    contentType: 'application/json',
  });

  for (const kind of await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-log-kind')),
  ))
    kinds.add(kind);
  await screen.getByRole('button', { name: '五倍速 ×5', exact: true }).click();
  await expect
    .poll(
      async () => {
        for (const kind of await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-log-kind')),
        ))
          kinds.add(kind);
        return (await currentBattle(page)).result !== null;
      },
      { timeout: 35_000, intervals: [160, 320] },
    )
    .toBe(true);
  expect(
    kinds.has('unit.routed'),
    'Actual seeded battle must expose routing, not a fabricated log',
  ).toBe(true);
  expect(await rows.count()).toBeLessThanOrEqual(50);
  const evidencePath = info.outputPath('actual-bounded-log.json');
  await writeFile(
    evidencePath,
    JSON.stringify(
      { observedKinds: [...kinds], retainedLines: await rows.allTextContents() },
      null,
      2,
    ),
  );
  await info.attach('actual-bounded-log', { path: evidencePath, contentType: 'application/json' });
});
