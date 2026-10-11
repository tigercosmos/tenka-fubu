import { test, expect } from './fixtures';

test('native castle city entry shows only the actual local adult ronin roster without changing the game', async ({
  page,
}) => {
  await page.goto('/?debug=1&seed=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const before = await page.evaluate(() => ({
    game: window.__tenka.debug.getState(),
    log: window.__tenka.debug.exportCommandLog(),
  }));
  const clan = before.game.clans[before.game.meta.playerClanId]!;
  const castle = before.game.castles[clan.homeCastleId]!;
  expect(castle.ownerClanId).toBe(clan.id);
  const candidates = Object.values(before.game.officers).filter(
    (officer) =>
      officer.hasComeOfAge && officer.status === 'ronin' && officer.locationCastleId === castle.id,
  );
  await page.getByTestId('rail-home').click();
  await page.keyboard.press('F1');
  const castlePanel = page.getByTestId('castle-panel');
  await castlePanel.getByRole('tab', { name: '內政', exact: true }).click();
  const entry = castlePanel.getByRole('button', { name: '查看在野武將', exact: true });
  await expect(entry).toBeVisible();
  const box = await entry.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(32);
  await entry.focus();
  await page.keyboard.press('Enter');
  const list = page.getByTestId('recruit-panel');
  await expect(list).toBeVisible();
  // Include empty real rosters; do not fabricate an eligible candidate or bypass native navigation.
  for (const officer of candidates)
    await expect(
      list.getByRole('button', { name: `${officer.name} · 浪人 · ${castle.name}`, exact: true }),
    ).toBeVisible();
  for (const officer of Object.values(before.game.officers).filter(
    (officer) =>
      officer.hasComeOfAge && officer.status === 'ronin' && officer.locationCastleId !== castle.id,
  ))
    await expect(list.getByRole('button', { name: new RegExp(officer.name) })).toHaveCount(0);
  if (candidates.length === 0)
    await expect(list.getByText('本城目前沒有成年在野武將', { exact: true })).toBeVisible();
  const after = await page.evaluate(() => ({
    game: window.__tenka.debug.getState(),
    log: window.__tenka.debug.exportCommandLog(),
  }));
  expect(after).toEqual(before);
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
});
