import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickRenderedMapAnchor } from './map-pointer-helpers';

async function selectMapCastle(page: Page, id: string, pos: { x: number; y: number }) {
  const mini = page.getByTestId('minimap-frame');
  const bounds = await mini.boundingBox();
  expect(bounds).not.toBeNull();
  // Canonical4096-square minimap presentation transform, not a travel-time calculation.
  await mini.click({
    position: { x: (pos.x / 4096) * bounds!.width, y: (pos.y / 4096) * bounds!.height },
  });
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
  await clickRenderedMapAnchor(page, 'castle', id);
}

test('native transport preview stays read-only and its shortest friendly ETA matches actual cargo arrival', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const clanId = before.meta.playerClanId;
  const sourceId = before.clans[clanId]!.homeCastleId;
  const source = before.castles[sourceId]!;
  await page.locator('body').click({ position: { x: 960, y: 500 } });
  await page.keyboard.press('Home');
  await expect(page.getByTestId('context-transport')).toBeEnabled();
  await page.getByTestId('context-transport').click();
  const panel = page.getByTestId('castle-panel');
  await expect(panel.getByRole('tab', { name: '輸送', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const destination = page.getByTestId('transport-destination');
  const options = await destination
    .locator('option')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ({ id: (node as HTMLOptionElement).value, name: node.textContent }))
        .filter((row) => row.id),
    );
  expect(options.length).toBeGreaterThan(0);
  const routes: { id: string; name: string | null; days: number; text: string }[] = [];
  for (const option of options) {
    expect(before.castles[option.id as keyof typeof before.castles]!.ownerClanId).toBe(clanId);
    expect(option.id).not.toBe(sourceId);
    await destination.selectOption(option.id);
    const text = await page.getByTestId('transport-preview').innerText();
    const match = /預估(\d+)日/.exec(text);
    expect(match, text).not.toBeNull();
    routes.push({ ...option, days: Number(match![1]), text });
  }
  routes.sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
  const route = routes[0]!;
  expect(route.days).toBeGreaterThan(0);
  // Keep this short native trajectory clear of the monthly resource boundary.
  expect(before.time.dayOfMonth + route.days + 2).toBeLessThan(30);
  const target = before.castles[route.id as keyof typeof before.castles]!;
  await panel.locator('header button').click();
  await selectMapCastle(page, target.id, target.pos);
  await page.getByRole('button', { name: '城面板', exact: true }).click();
  await expect(panel).toContainText(target.name);
  // Read actual UI/core-derived capacity; do not duplicate cap formulas in this browser test.
  const foodCap = Number(
    await panel.getByRole('progressbar', { name: '兵糧', exact: true }).getAttribute('max'),
  );
  const soldierCap = Number(
    await panel.getByRole('progressbar', { name: '兵力', exact: true }).getAttribute('max'),
  );
  expect(foodCap - target.food).toBeGreaterThanOrEqual(100);
  const acceptedSoldiers = Math.min(100, Math.max(0, soldierCap - target.soldiers));
  await panel.locator('header button').click();
  await page.locator('body').click({ position: { x: 960, y: 500 } });
  await page.keyboard.press('Home');
  await page.getByTestId('context-transport').click();
  await destination.selectOption(route.id);
  for (const name of ['兵糧', '兵力']) {
    const slider = panel.getByRole('slider', { name, exact: true });
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('100');
  }
  await expect(page.getByTestId('transport-preview')).toHaveText(route.text);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  const previewPath = info.outputPath('native-transport-preview.png');
  await page.screenshot({ path: previewPath });
  await info.attach('native-transport-preview', { path: previewPath, contentType: 'image/png' });
  await page.getByTestId('transport-execute').click();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  const queuedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(queuedLog.entries.filter((entry) => entry.command.type === 'transport')).toHaveLength(0);
  await panel.locator('header button').click();
  await page.getByTestId('speed-1').click();
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ sourceId, targetId }) =>
            window.__tenka.debug
              .getState()
              .reports.some(
                (report) =>
                  report.event.type === 'transport.arrived' &&
                  report.event.fromCastleId === sourceId &&
                  report.event.toCastleId === targetId,
              ),
          { sourceId, targetId: route.id },
        ),
      { timeout: 15_000, intervals: [50] },
    )
    .toBe(true);
  await page.getByTestId('speed-pause').click();
  const arrived = await page.evaluate(() => window.__tenka.debug.getState());
  const arrivalReports = arrived.reports.filter(
    (report) =>
      report.event.type === 'transport.arrived' &&
      report.event.fromCastleId === sourceId &&
      report.event.toCastleId === route.id,
  );
  expect(arrivalReports).toHaveLength(1);
  const arrival = arrivalReports[0]!.event;
  expect(arrival.type).toBe('transport.arrived');
  if (arrival.type !== 'transport.arrived')
    throw new Error('Expected actual core transport arrival');
  expect(arrival.day - before.time.day).toBe(route.days);
  expect(arrival.food).toBe(100);
  expect(arrival.soldiers).toBe(100);
  expect(arrival.gold).toBe(0);
  // Daily upkeep also consumes food. The exact cargo is proven by the successful
  // command transcript and arrival event, not by an unconfounded stock difference.
  expect(arrived.castles[sourceId]!.food).toBeLessThanOrEqual(source.food - 100);
  expect(arrived.castles[sourceId]!.soldiers).toBe(source.soldiers - 100);
  expect(arrived.castles[target.id]!.food).toBeGreaterThan(target.food);
  expect(arrived.castles[target.id]!.food).toBeLessThanOrEqual(target.food + 100);
  expect(arrived.castles[target.id]!.soldiers).toBe(target.soldiers + acceptedSoldiers);
  expect(
    Object.values(arrived.transports).filter(
      (order) => order.fromCastleId === sourceId && order.toCastleId === target.id,
    ),
  ).toHaveLength(0);
  const appliedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const appliedTransports = appliedLog.entries.filter(
    (entry) => entry.command.type === 'transport',
  );
  expect(appliedTransports).toHaveLength(1);
  expect(appliedTransports[0]!.command).toEqual({
    type: 'transport',
    clanId,
    fromCastleId: sourceId,
    toCastleId: target.id,
    soldiers: 100,
    food: 100,
    gold: 0,
  });
  // A second normal-clock day plus the successful-command transcript proves
  // once-only execution independently of daily food upkeep.
  await page.getByTestId('speed-1').click();
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day), { intervals: [50] })
    .toBeGreaterThan(arrived.time.day);
  await page.getByTestId('speed-pause').click();
  const once = await page.evaluate(() => window.__tenka.debug.getState());
  expect(once.castles[sourceId]!.food).toBeLessThanOrEqual(arrived.castles[sourceId]!.food);
  expect(once.castles[sourceId]!.soldiers).toBe(source.soldiers - 100);
  expect(once.castles[target.id]!.food).toBeGreaterThan(target.food);
  expect(once.castles[target.id]!.food).toBeLessThanOrEqual(arrived.castles[target.id]!.food);
  expect(once.castles[target.id]!.soldiers).toBe(target.soldiers + acceptedSoldiers);
  const onceLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(onceLog.entries.filter((entry) => entry.command.type === 'transport')).toEqual(
    appliedTransports,
  );
  expect(
    once.reports.filter(
      (report) =>
        report.event.type === 'transport.arrived' &&
        report.event.fromCastleId === sourceId &&
        report.event.toCastleId === target.id,
    ),
  ).toHaveLength(1);
  expect(
    Object.values(once.transports).filter(
      (order) => order.fromCastleId === sourceId && order.toCastleId === target.id,
    ),
  ).toHaveLength(0);
  const foreign = Object.values(once.castles).find(
    (castle) =>
      castle.ownerClanId !== clanId &&
      castle.pos.x > 1800 &&
      castle.pos.x < 2800 &&
      castle.pos.y > 2200 &&
      castle.pos.y < 3200,
  )!;
  expect(foreign).toBeDefined();
  await selectMapCastle(page, foreign.id, foreign.pos);
  await expect(page.getByTestId('context-transport')).toBeDisabled();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(once);
  const evidencePath = info.outputPath('actual-transport-evidence.json');
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        sourceId,
        targetId: target.id,
        routes,
        arrival,
        queuedLog,
        appliedLog,
        onceLog,
        capacity: { foodCap, soldierCap, acceptedSoldiers },
        before,
        arrived,
        afterOnceOnlyCheck: once,
        scope:
          'Native S1560 transport, shortest actual reachable preview; capacity clipping measured from native overview. Exact cargo and once-only execution proven by one successfully applied command, one actual arrival and exact troop stocks. Food stocks include concurrent daily upkeep, not an exact cargo-only delta. No fabricated core state or ETA/upkeep formula.',
      },
      null,
      2,
    ),
  );
  await info.attach('actual-transport-evidence', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
