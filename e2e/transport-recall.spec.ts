import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('native active transport recall returns real mid-edge cargo exactly once', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const clanId = before.meta.playerClanId;
  const sourceId = before.clans[clanId]!.homeCastleId;
  const source = before.castles[sourceId]!;
  await page.locator('body').click({ position: { x: 960, y: 500 } });
  await page.keyboard.press('Home');
  await page.getByTestId('context-transport').click();
  const panel = page.getByTestId('castle-panel');
  const destination = page.getByTestId('transport-destination');
  const options = await destination
    .locator('option')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean));
  const routes: { id: string; days: number; text: string }[] = [];
  for (const id of options) {
    await destination.selectOption(id);
    const text = await page.getByTestId('transport-preview').innerText();
    const match = /預估(\d+)日/.exec(text);
    expect(match, text).not.toBeNull();
    routes.push({ id, days: Number(match![1]), text });
  }
  // Select a genuinely authored friendly route that cannot finish in its first day.
  // No fabricated roads, terrain, transport progress, or core state.
  const route = routes
    .filter((row) => row.days > 1)
    .sort((a, b) => a.days - b.days || a.id.localeCompare(b.id))[0];
  expect(route, 'S1560 Oda has an actual friendly route longer than one day').toBeDefined();
  if (!route) throw new Error('No actual multi-day native transport route');
  expect(before.time.dayOfMonth + route.days * 2 + 2).toBeLessThan(30);
  const target = before.castles[route.id as keyof typeof before.castles]!;
  await destination.selectOption(route.id);
  for (const name of ['兵糧', '兵力']) {
    const slider = panel.getByRole('slider', { name, exact: true });
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('100');
  }
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await page.getByTestId('transport-execute').click();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await page.getByTestId('speed-1').click();
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day), { intervals: [50] })
    .toBeGreaterThan(before.time.day);
  await page.getByTestId('speed-pause').click();
  const inFlight = await page.evaluate(() => window.__tenka.debug.getState());
  expect(inFlight.time.day).toBe(before.time.day + 1);
  const orders = Object.values(inFlight.transports).filter(
    (order) =>
      order.clanId === clanId && order.fromCastleId === sourceId && order.toCastleId === target.id,
  );
  expect(orders).toHaveLength(1);
  const order = orders[0]!;
  expect(order.returning).toBe(false);
  expect(order.edgeProgressDays).toBeGreaterThan(0);
  expect(order.edgeProgressDays).toBeLessThan(order.edgeCostDays);
  expect(order.pathCursor).toBeLessThan(order.path.length - 1);
  expect(order.food).toBe(100);
  expect(order.soldiers).toBe(100);
  expect(inFlight.castles[sourceId]!.soldiers).toBe(source.soldiers - 100);
  const recall = panel.getByTestId(`transport-recall-${order.id}`);
  const status = panel.getByTestId(`transport-status-${order.id}`);
  await expect(recall).toHaveCount(1);
  await expect(recall).toHaveAccessibleName('撤回輸送');
  await expect(recall).toBeEnabled();
  await expect(status).toHaveText('輸送中');
  await recall.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(inFlight);
  const flightPath = info.outputPath('actual-mid-edge-transport.png');
  await page.screenshot({ path: flightPath });
  await info.attach('actual-mid-edge-transport', { path: flightPath, contentType: 'image/png' });
  await recall.click();
  await expect(recall).toBeDisabled();
  await expect(status).toHaveText('撤回指令待執行');
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(inFlight);
  const queuedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(
    queuedLog.entries.filter((entry) => entry.command.type === 'recallTransport'),
  ).toHaveLength(0);
  await page.getByTestId('speed-1').click();
  await expect
    .poll(
      () =>
        page.evaluate(
          (sourceId) =>
            window.__tenka.debug
              .getState()
              .reports.some(
                (report) =>
                  report.event.type === 'transport.arrived' &&
                  report.event.fromCastleId === sourceId &&
                  report.event.toCastleId === sourceId,
              ),
          sourceId,
        ),
      { timeout: 15_000, intervals: [50] },
    )
    .toBe(true);
  await page.getByTestId('speed-pause').click();
  const returned = await page.evaluate(() => window.__tenka.debug.getState());
  expect(returned.transports[order.id]).toBeUndefined();
  expect(returned.castles[sourceId]!.soldiers).toBe(source.soldiers);
  // Food has daily garrison upkeep; exact returned cargo is the actual arrival event.
  expect(returned.castles[sourceId]!.food).toBeGreaterThan(inFlight.castles[sourceId]!.food);
  expect(returned.castles[sourceId]!.food).toBeLessThanOrEqual(source.food);
  expect(returned.castles[target.id]!.soldiers).toBe(target.soldiers);
  expect(returned.castles[target.id]!.food).toBeLessThanOrEqual(target.food);
  const arrivals = returned.reports.filter(
    (report) => report.event.type === 'transport.arrived' && report.event.fromCastleId === sourceId,
  );
  expect(arrivals).toHaveLength(1);
  expect(arrivals[0]!.event).toMatchObject({
    type: 'transport.arrived',
    toCastleId: sourceId,
    food: 100,
    soldiers: 100,
    gold: 0,
  });
  const appliedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const recallEntries = appliedLog.entries.filter(
    (entry) => entry.command.type === 'recallTransport',
  );
  expect(recallEntries).toHaveLength(1);
  expect(recallEntries[0]!.command).toEqual({
    type: 'recallTransport',
    clanId,
    transportId: order.id,
  });
  expect(appliedLog.entries.filter((entry) => entry.command.type === 'transport')).toHaveLength(1);
  await expect(recall).toHaveCount(0);
  await page.getByTestId('speed-1').click();
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day), { intervals: [50] })
    .toBeGreaterThan(returned.time.day);
  await page.getByTestId('speed-pause').click();
  const once = await page.evaluate(() => window.__tenka.debug.getState());
  const onceLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(onceLog.entries.filter((entry) => entry.command.type === 'recallTransport')).toEqual(
    recallEntries,
  );
  expect(
    once.reports.filter(
      (report) =>
        report.event.type === 'transport.arrived' && report.event.fromCastleId === sourceId,
    ),
  ).toHaveLength(1);
  expect(once.castles[sourceId]!.soldiers).toBe(source.soldiers);
  expect(once.castles[target.id]!.soldiers).toBe(target.soldiers);
  expect(once.transports[order.id]).toBeUndefined();
  const evidencePath = info.outputPath('actual-mid-edge-recall.json');
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        routes,
        route,
        before,
        inFlight,
        actualMidEdge: order,
        queuedLog,
        returned,
        appliedLog,
        once,
        onceLog,
        scope:
          'Real native S1560 route/cargo/recall; mid-edge progress is actual core state. No fake route/progress or guessed food upkeep. Actual successful command and arrival prove once-only return; food stock includes concurrent daily upkeep.',
      },
      null,
      2,
    ),
  );
  await info.attach('actual-mid-edge-recall', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
