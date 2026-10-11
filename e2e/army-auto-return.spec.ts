import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickRenderedMapAnchor } from './map-pointer-helpers';

async function centerWorld(page: Page, pos: { x: number; y: number }) {
  const mini = page.getByTestId('minimap-frame');
  const box = await mini.boundingBox();
  expect(box).not.toBeNull();
  await mini.click({
    position: { x: (pos.x / 4096) * box!.width, y: (pos.y / 4096) * box!.height },
  });
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
}

async function nativeDay(page: Page) {
  const before = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  const pause = page.getByTestId('speed-pause');
  await expect(pause).toBeVisible();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await pause.focus();
  await expect(pause).toBeFocused();
  // Match the approved army-orders normal RAF clock protocol. Freeze while
  // already paused, then use native keyboard input to start and stop time.
  // This does not invoke debug stepping or mutate authoritative game state.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  try {
    await page.clock.runFor(32);
    expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(before);
    await page.keyboard.press('1');
    await expect(page.getByTestId('speed-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(pause).toBeFocused();
    // x1 is 600 ms/day. The extra 40 ms covers RAF boundaries, not another day.
    await page.clock.runFor(640);
    expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(before + 1);
    await expect(pause).toBeEnabled();
    await expect(pause).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(before + 1);
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await page.clock.resume();
  }
}

test('army auto-return: native deployed army stays authoritative until its single queued toggle executes', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Install before application timers; each nativeDay controls normal RAF only.
  await page.clock.install();
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const initial = await page.evaluate(() => window.__tenka.debug.getState());
  const player = initial.clans[initial.meta.playerClanId]!;
  const leader = initial.officers[player.leaderId]!;
  const target = Object.values(initial.castles).find((castle) => /稻葉山/.test(castle.name));
  expect(target).toBeDefined();
  expect(target!.ownerClanId).not.toBe(player.id);
  await page.locator('body').click({ position: { x: 960, y: 500 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('F2');
  const march = page.getByRole('dialog', { name: '出陣編成', exact: true });
  await expect(march).toBeVisible();
  await march.getByRole('button', { name: `${leader.name} 統`, exact: false }).click();
  const troops = march.getByRole('slider', { name: '兵數', exact: true });
  await troops.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(troops).toHaveValue('100');
  const food = march.getByRole('slider', { name: '攜帶兵糧', exact: true });
  await food.focus();
  await page.keyboard.press('End');
  await march.getByRole('button', { name: '在地圖選擇目標', exact: true }).click();
  await centerWorld(page, target!.pos);
  await clickRenderedMapAnchor(page, 'castle', target!.id);
  await expect(page.getByTestId('march-target-card')).toContainText(target!.name);
  await page.getByTestId('march-target-confirm').click();
  await march.getByRole('button', { name: '出陣', exact: true }).click();
  await expect(march).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(initial);
  await nativeDay(page);
  const deployed = await page.evaluate(() => window.__tenka.debug.getState());
  const army = Object.values(deployed.armies).find(
    (item) => item.clanId === player.id && item.leaderId === leader.id,
  );
  expect(army).toBeDefined();
  expect(army!.autoReturn).toBe(true);
  const from =
    deployed.castles[army!.posNodeId as keyof typeof deployed.castles]?.pos ??
    deployed.districts[army!.posNodeId as keyof typeof deployed.districts]!.pos;
  // The node requests a nearby view only; actual curved/reversed presentation
  // is read from the rendered anchor before native pointer selection.
  await centerWorld(page, from);
  await clickRenderedMapAnchor(page, 'army', army!.id);
  const toggle = page.getByRole('switch', { name: '自動歸還', exact: true });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(deployed);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('army-auto-return-control')).toContainText('目前狀態尚未變更');
  // A disabled switch cannot retain keyboard focus; another global Space would
  // resume time rather than repeat this control. Target the same disabled switch
  // with real pointer presses, without forcing a locator click or synthesizing events.
  const disabledBox = await toggle.boundingBox();
  expect(disabledBox).not.toBeNull();
  const duplicatePoint = {
    x: disabledBox!.x + disabledBox!.width / 2,
    y: disabledBox!.y + disabledBox!.height / 2,
  };
  await page.mouse.move(duplicatePoint.x, duplicatePoint.y);
  for (let index = 0; index < 2; index++) {
    await page.mouse.down();
    await page.mouse.up();
  }
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(deployed);
  const queuedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(queuedLog.entries.filter((entry) => entry.command.type === 'setAutoReturn')).toHaveLength(
    0,
  );
  const pendingPath = info.outputPath('native-army-toggle-pending.png');
  await page.screenshot({ path: pendingPath });
  await info.attach('native-army-toggle-pending', { path: pendingPath, contentType: 'image/png' });
  await nativeDay(page);
  const applied = await page.evaluate(() => window.__tenka.debug.getState());
  expect(applied.armies[army!.id]!.autoReturn).toBe(false);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const appliedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const toggles = appliedLog.entries.filter((entry) => entry.command.type === 'setAutoReturn');
  expect(toggles).toHaveLength(1);
  expect(toggles[0]!.command).toEqual({
    type: 'setAutoReturn',
    clanId: player.id,
    armyId: army!.id,
    enabled: false,
  });
  const evidencePath = info.outputPath('actual-army-auto-return.json');
  await writeFile(
    evidencePath,
    JSON.stringify({ deployed, applied, queuedLog, appliedLog }, null, 2),
  );
  await info.attach('actual-army-auto-return', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
