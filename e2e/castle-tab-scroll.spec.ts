import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('castle tabs retain distinct native visible-tab scroll offsets across long overview and domestic content', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('hud-date').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('F1');

  const panel = page.getByTestId('castle-panel');
  const scroller = panel.locator(':scope > section');
  const domestic = panel.getByRole('tab', { name: '內政', exact: true });
  const overview = panel.getByRole('tab', { name: '概要', exact: true });
  await expect(domestic).toHaveAttribute('aria-selected', 'true');
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  await panel.getByRole('button', { name: /空位/ }).first().click();
  await expect(panel.getByRole('heading', { name: '建造選單', exact: true })).toBeVisible();
  const long = await scroller.evaluate((node) => ({
    height: node.clientHeight,
    content: node.scrollHeight,
    top: node.scrollTop,
  }));
  expect(long.content).toBeGreaterThan(long.height);
  expect(long.top).toBe(0);

  // Keep the tab fully visible so native click does not first auto-scroll it and
  // alter the saved offset; this control applies regardless of sticky positioning.
  const sectionBox = (await scroller.boundingBox())!;
  const tabBox = (await overview.boundingBox())!;
  const wheelDelta = Math.floor((tabBox.y - sectionBox.y) / 2);
  expect(wheelDelta).toBeGreaterThan(0);
  await scroller.hover({ position: { x: sectionBox.width / 2, y: sectionBox.height / 2 } });
  await page.mouse.wheel(0, wheelDelta);
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(wheelDelta);
  const savedOffset = await scroller.evaluate((node) => node.scrollTop);
  const visibleTab = (await overview.boundingBox())!;
  expect(visibleTab.y).toBeGreaterThanOrEqual(sectionBox.y);
  expect(visibleTab.y + visibleTab.height).toBeLessThanOrEqual(sectionBox.y + sectionBox.height);
  // Locator.click performs scrollIntoView before input even for a visible tab
  // when the scroller has scroll-padding. Use the verified native pointer point.
  await page.mouse.click(visibleTab.x + visibleTab.width / 2, visibleTab.y + visibleTab.height / 2);
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  const alternate = await scroller.evaluate((node) => ({
    height: node.clientHeight,
    content: node.scrollHeight,
    top: node.scrollTop,
  }));
  // Overview now includes actual lord dismissal and control panes. It is not a
  // short-content clamp oracle; each tab still owns its independent offset.
  expect(alternate.content).toBeGreaterThan(alternate.height);
  expect(alternate.top).toBe(0);
  const alternateDelta = Math.max(1, Math.floor(wheelDelta / 2));
  expect(alternateDelta).toBeLessThan(savedOffset);
  await scroller.hover({ position: { x: sectionBox.width / 2, y: sectionBox.height / 2 } });
  await page.mouse.wheel(0, alternateDelta);
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(alternateDelta);
  const alternateOffset = await scroller.evaluate((node) => node.scrollTop);
  const domesticBox = (await domestic.boundingBox())!;
  expect(domesticBox.y).toBeGreaterThanOrEqual(sectionBox.y);
  expect(domesticBox.y + domesticBox.height).toBeLessThanOrEqual(sectionBox.y + sectionBox.height);
  await page.mouse.click(
    domesticBox.x + domesticBox.width / 2,
    domesticBox.y + domesticBox.height / 2,
  );
  await expect(domestic).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(savedOffset);
  await expect(panel.getByRole('heading', { name: '建造選單', exact: true })).toBeVisible();
  const returnOverviewBox = (await overview.boundingBox())!;
  expect(returnOverviewBox.y).toBeGreaterThanOrEqual(sectionBox.y);
  expect(returnOverviewBox.y + returnOverviewBox.height).toBeLessThanOrEqual(
    sectionBox.y + sectionBox.height,
  );
  await page.mouse.click(
    returnOverviewBox.x + returnOverviewBox.width / 2,
    returnOverviewBox.y + returnOverviewBox.height / 2,
  );
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(alternateOffset);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);

  const artifact = info.outputPath('castle-tab-scroll.json');
  await writeFile(
    artifact,
    JSON.stringify(
      {
        scope: 'native visible-tab offset; not offscreen-tab focus retention',
        long,
        alternate,
        savedOffset,
        alternateOffset,
      },
      null,
      2,
    ),
  );
  await info.attach('castle-tab-scroll', { path: artifact, contentType: 'application/json' });
});
