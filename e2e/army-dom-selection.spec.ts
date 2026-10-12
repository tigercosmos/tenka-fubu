import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { clickRenderedMapAnchor } from './map-pointer-helpers';

test('native castle army list selects a normally deployed army without gameplay changes', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  const initial = await page.evaluate(() => window.__tenka.debug.getState());
  const clan = initial.clans[initial.meta.playerClanId]!;
  const leader = initial.officers[clan.leaderId]!;
  const target = Object.values(initial.castles).find((castle) => /稻葉山/.test(castle.name));
  expect(target).toBeDefined();
  await page.getByTestId('rail-home').click();
  await page.locator('body').click({ position: { x: 960, y: 500 } });
  await page.keyboard.press('F2');
  const march = page.getByRole('dialog', { name: '出陣編成', exact: true });
  await march.getByRole('button', { name: `${leader.name} 統` }).click();
  const troops = march.getByRole('slider', { name: '兵數', exact: true });
  await troops.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowRight');
  await expect(troops).toHaveValue('2000');
  await march.getByRole('slider', { name: '攜帶兵糧', exact: true }).focus();
  await page.keyboard.press('End');
  await march.getByRole('button', { name: '在地圖選擇目標', exact: true }).click();
  const mini = page.getByTestId('minimap-frame');
  const miniBox = (await mini.boundingBox())!;
  await mini.click({
    position: {
      x: (target!.pos.x / 4096) * miniBox.width,
      y: (target!.pos.y / 4096) * miniBox.height,
    },
  });
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
  await clickRenderedMapAnchor(page, 'castle', target!.id);
  await expect(page.getByTestId('march-target-card')).toContainText(target!.name);
  await page.getByTestId('march-target-confirm').click();
  await march.getByRole('button', { name: '出陣', exact: true }).click();
  await page.getByTestId('speed-1').click();
  await expect
    .poll(() =>
      page.evaluate(
        (leaderId) =>
          Object.values(window.__tenka.debug.getState().armies).some(
            (army) => army.leaderId === leaderId,
          ),
        leader.id,
      ),
    )
    .toBe(true);
  await page.getByTestId('speed-pause').click();
  const before = await page.evaluate(() => ({
    game: window.__tenka.debug.getState(),
    log: window.__tenka.debug.exportCommandLog(),
  }));
  const army = Object.values(before.game.armies).find(
    (item) => item.clanId === clan.id && item.leaderId === leader.id,
  )!;
  expect(army).toBeDefined();
  expect(before.log.entries.filter((entry) => entry.command.type === 'march')).toHaveLength(1);
  const select = async (key: 'Enter' | 'Space') => {
    await page.getByTestId('rail-home').click();
    await page.getByTestId('rail-domestic').click();
    await page.getByRole('tab', { name: '軍事', exact: true }).click();
    const button = page.getByTestId(`castle-army-${army.id}`);
    await expect(button).toHaveAttribute('type', 'button');
    await button.focus();
    await page.keyboard.press(key);
    await expect(page.getByTestId('army-orders-control')).toBeVisible();
    await expect(page.getByTestId('army-retarget')).toBeFocused();
    await expect(page.getByRole('tab', { name: '軍事', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(() => ({
        game: window.__tenka.debug.getState(),
        log: window.__tenka.debug.exportCommandLog(),
      })),
    ).toEqual(before);
  };
  await select('Enter');
  await select('Space');
  const evidence = info.outputPath('native-army-dom-selection.json');
  await writeFile(
    evidence,
    JSON.stringify(
      {
        armyId: army.id,
        acceptedMarch: before.log.entries.filter((entry) => entry.command.type === 'march'),
        pausedDay: before.game.time.day,
        nativeKeys: ['Enter', 'Space'],
        coreRngAndCommandLogUnchanged: true,
        scope:
          'native source-list selection; camera routing covered by shared-projection unit assertions',
      },
      null,
      2,
    ),
  );
  await info.attach('native-army-dom-selection', {
    path: evidence,
    contentType: 'application/json',
  });
});
