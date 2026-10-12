import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('native debug panel reads live scheduler telemetry without changing paused core state', async ({
  page,
}, info) => {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  // Existing canonical debug key; F3 is diplomacy, not the debug toggle.
  await page.keyboard.press('Backquote');
  const panel = page.getByTestId('perf-debug-panel');
  await expect(panel).toBeVisible();
  // Real scheduler rAF samples, no fake timestamps or browser clock installation.
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getPerf().fps))
    .toBeGreaterThan(0);
  await expect
    .poll(async () => Number(await page.getByTestId('perf-fps').textContent()))
    .toBeGreaterThan(0);
  const initialPerf = await page.evaluate(() => window.__tenka.debug.getPerf());
  expect(Number.isFinite(initialPerf.fps)).toBe(true);
  const expectedCounts = {
    castles: Object.keys(before.castles).length,
    districts: Object.keys(before.districts).length,
    officers: Object.keys(before.officers).length,
    armies: Object.keys(before.armies).length,
  };
  expect(initialPerf.entityCounts).toEqual(expectedCounts);
  for (const [kind, count] of Object.entries(expectedCounts))
    await expect(page.getByTestId(`perf-count-${kind}`)).toHaveText(String(count));
  const tickSeq = Number(await page.getByTestId('perf-tick-seq').textContent());
  expect(Number.isFinite(tickSeq)).toBe(true);
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(650); // Open-panel500ms telemetry polling, while the core remains paused.
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  const afterPolling = await page.evaluate(() => window.__tenka.debug.getPerf());
  expect(Number.isFinite(afterPolling.fps) && afterPolling.fps > 0).toBe(true);

  // Only this explicit real debug control advances core simulation in this flow.
  await page.getByTestId('debug-jump-1').click();
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day))
    .toBe(before.time.day + 1);
  await expect
    .poll(async () => Number(await page.getByTestId('perf-tick-seq').textContent()))
    .toBeGreaterThan(tickSeq);
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.__tenka.debug.getPerf().systemBreakdownMs).length),
    )
    .toBe(13);
  const measured = await page.evaluate(() => window.__tenka.debug.getPerf());
  for (const value of [
    measured.lastTickMs,
    measured.avgTickMs,
    measured.maxTickMs,
    ...Object.values(measured.systemBreakdownMs),
  ])
    expect(Number.isFinite(value) && value >= 0).toBe(true);
  expect(measured.maxTickMs).toBeGreaterThanOrEqual(measured.lastTickMs);
  await expect(page.getByTestId('perf-systems').locator('dd')).toHaveCount(13);
  await expect(page.getByTestId('perf-lastTickMs')).toContainText('ms');
  const afterTick = await page.evaluate(() => window.__tenka.debug.getState());
  expect(afterTick).not.toEqual(before);
  expect(measured.entityCounts).toEqual({
    castles: Object.keys(afterTick.castles).length,
    districts: Object.keys(afterTick.districts).length,
    officers: Object.keys(afterTick.officers).length,
    armies: Object.keys(afterTick.armies).length,
  });
  await panel.scrollIntoViewIfNeeded();
  const screenshotPath = info.outputPath('actual-perf-panel.png');
  await page.screenshot({ path: screenshotPath });
  await info.attach('actual-perf-panel', { path: screenshotPath, contentType: 'image/png' });
  await page.getByTestId('perf-fps').scrollIntoViewIfNeeded();
  const fpsScreenshotPath = info.outputPath('actual-perf-fps-context.png');
  await page.screenshot({ path: fpsScreenshotPath });
  await info.attach('actual-perf-fps-context', {
    path: fpsScreenshotPath,
    contentType: 'image/png',
  });
  await page.getByTestId('perf-count-armies').scrollIntoViewIfNeeded();
  const countsScreenshotPath = info.outputPath('actual-perf-counts-context.png');
  await page.screenshot({ path: countsScreenshotPath });
  await info.attach('actual-perf-counts-context', {
    path: countsScreenshotPath,
    contentType: 'image/png',
  });
  const telemetryPath = info.outputPath('actual-scheduler-telemetry.json');
  await writeFile(
    telemetryPath,
    JSON.stringify(
      {
        initialPerf,
        afterPolling,
        measured,
        scope:
          'Strategy scheduler rAF cadence and actual instrumented day tick. Not Pixi/GPU FPS or a hardware performance gate.',
      },
      null,
      2,
    ),
  );
  await info.attach('actual-scheduler-telemetry', {
    path: telemetryPath,
    contentType: 'application/json',
  });
  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('debug-panel')).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(afterTick);
});
