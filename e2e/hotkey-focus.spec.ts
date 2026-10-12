import { test, expect } from './fixtures';

test('Home and M work from non-control panel focus while native keys keep their owners', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await page.getByTestId('speed-pause').click();
  const game = await page.evaluate(() => window.__tenka.debug.getState());
  const homeCastleId = game.clans[game.meta.playerClanId]!.homeCastleId;
  await page.getByTestId('rail-officers').click();
  const list = page.getByTestId('officer-list');
  const minimap = page.getByTestId('minimap');

  const search = list.locator('input[type="search"]');
  await search.focus();
  await page.keyboard.press('m');
  await page.keyboard.press('Home');
  await expect(minimap).toBeVisible();
  expect(
    await page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection),
  ).toBeNull();
  await search.fill('');

  const rail = page.getByTestId('rail-officers');
  await rail.focus();
  await page.keyboard.press('m');
  await page.keyboard.press('Home');
  await expect(minimap).toBeVisible();
  expect(
    await page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection),
  ).toBeNull();

  const resource = page.getByTestId('hud-resources').locator('span[tabindex="0"]').first();
  await resource.focus();
  await page.keyboard.press('Home');
  expect(
    await page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection),
  ).toBeNull();

  await list.locator('tbody tr').filter({ hasText: '織田信長' }).click();
  const trait = page.getByTestId('officer-detail').locator('span[tabindex="0"]').first();
  await trait.focus();
  await expect(trait).toBeFocused();
  await page.keyboard.press('m');
  await expect(minimap).toHaveCount(0);
  await page.keyboard.press('Home');
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(2));
  expect(
    await page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection),
  ).toEqual({
    kind: 'node',
    id: homeCastleId,
  });
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(game);
});
