import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import type { ArmyId } from '../src/core/state/ids';
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
  // Clock-controlled normal RAF ticks, not debug stepping or wall-clock latency.
  // Freeze only while already paused; reset the real controller's accumulator
  // through paused frames. Native keyboard input still starts and stops time.
  // https://playwright.dev/docs/clock#tick-through-time-manually-firing-all-the-timers-consistently
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  try {
    await page.clock.runFor(32);
    expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(before);
    await page.keyboard.press('1');
    await expect(page.getByTestId('speed-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(pause).toBeFocused();
    // x1 requires 600 ms; forty extra ms covers the first/last RAF boundary,
    // never a second day. No remote observation-to-pause scheduling window.
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
async function selectArmy(page: Page, game: GameState, armyId: ArmyId) {
  const army = game.armies[armyId]!;
  const position = (id: string) =>
    game.castles[id as keyof typeof game.castles]?.pos ??
    game.districts[id as keyof typeof game.districts]!.pos;
  // The current node only requests a nearby view; pointer input uses the actual
  // rendered army anchor, including curved-road and reverse-leg presentation.
  await centerWorld(page, position(army.posNodeId));
  await clickRenderedMapAnchor(page, 'army', armyId);
  await expect(page.getByTestId('army-orders-control')).toBeVisible();
}

test('native army orders: pure physical-position preview, one retarget and one recall on normal days', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Install before application timers, as required by Playwright Clock.
  await page.clock.install();
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const initial = await page.evaluate(() => window.__tenka.debug.getState());
  expect(initial.meta.seed).toBe(42);
  const player = initial.clans[initial.meta.playerClanId]!,
    leader = initial.officers[player.leaderId]!;
  const originalTarget = Object.values(initial.castles).find((castle) =>
    /稻葉山/.test(castle.name),
  );
  expect(originalTarget).toBeDefined();
  await page.locator('body').click({ position: { x: 960, y: 500 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('F2');
  const march = page.getByRole('dialog', { name: '出陣編成', exact: true });
  await expect(march).toBeVisible();
  await march.getByRole('button', { name: `${leader.name} 統`, exact: false }).click();
  const troops = march.getByRole('slider', { name: '兵數', exact: true });
  await troops.focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('ArrowRight');
  await expect(troops).toHaveValue('2000');
  await march.getByRole('slider', { name: '攜帶兵糧', exact: true }).focus();
  await page.keyboard.press('End');
  await march.getByRole('button', { name: '在地圖選擇目標', exact: true }).click();
  await centerWorld(page, originalTarget!.pos);
  await clickRenderedMapAnchor(page, 'castle', originalTarget!.id);
  await expect(page.getByTestId('march-target-card')).toContainText(originalTarget!.name);
  await page.getByTestId('march-target-confirm').click();
  await march.getByRole('button', { name: '出陣', exact: true }).click();
  await expect(march).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(initial);
  await nativeDay(page);
  let deployed = await page.evaluate(() => window.__tenka.debug.getState());
  const army = Object.values(deployed.armies).find(
    (item) => item.clanId === player.id && item.leaderId === leader.id,
  );
  expect(army).toBeDefined();
  await selectArmy(page, deployed, army!.id);
  const autoReturn = page.getByRole('switch', { name: '自動歸還', exact: true });
  await expect(autoReturn).toHaveAttribute('aria-checked', 'true');
  await autoReturn.focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(deployed);
  await nativeDay(page);
  deployed = await page.evaluate(() => window.__tenka.debug.getState());
  expect(deployed.armies[army!.id]!.autoReturn).toBe(false);
  await selectArmy(page, deployed, army!.id);
  await page.getByTestId('army-retarget').focus();
  await page.keyboard.press('Enter');
  const targetDialog = page.getByRole('dialog', { name: '變更目標', exact: true });
  await expect(targetDialog).toBeVisible();
  await expect(targetDialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  const select = page.getByTestId('army-target-select');
  const options = await select.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      text: node.textContent ?? '',
    })),
  );
  let selected: { id: string; name: string; baselineDays: number } | null = null;
  // Choose an actual different, legal native option with a multi-day baseline route.
  // This speed-1 physical baseline is not a guaranteed arrival date.
  for (let index = 1; index < options.length; index += 1) {
    const option = options[index]!;
    if (!option.value || option.value === army!.targetNodeId) continue;
    await select.focus();
    await expect(select).toBeFocused();
    // Chromium's macOS headless native popup ignores these selection keys even
    // on an isolated select without app handlers. Use its native option action;
    // focus and explicit submission remain keyboard-tested below.
    await select.selectOption(option.value);
    await expect(select).toHaveValue(option.value);
    const text = await page.getByTestId('army-target-preview').innerText();
    const amount = /基準路程([\d,.]+)日/.exec(text);
    expect(amount).not.toBeNull();
    const baselineDays = Number(amount![1]!.replaceAll(',', ''));
    if (baselineDays >= 3) {
      selected = { id: option.value, name: option.text, baselineDays };
      break;
    }
  }
  expect(
    selected,
    'the real current dropdown must offer a different multi-day route',
  ).not.toBeNull();
  await expect(page.getByTestId('army-target-preview')).toContainText('從目前實際位置起算');
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(deployed);
  const previewLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(previewLog.entries.filter((entry) => entry.command.type === 'setArmyTarget')).toHaveLength(
    0,
  );
  await page.getByTestId('army-target-submit').focus();
  await page.keyboard.press('Enter');
  await expect(targetDialog).toHaveCount(0);
  await expect(page.getByTestId('army-retarget')).toBeDisabled();
  await expect(page.getByTestId('army-recall')).toBeDisabled();
  await expect(page.getByTestId('army-orders-control')).toContainText('目前目標與狀態尚未變更');
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(deployed);
  const pendingTargetLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(
    pendingTargetLog.entries.filter((entry) => entry.command.type === 'setArmyTarget'),
  ).toHaveLength(0);
  const targetScreenshot = info.outputPath('native-army-retarget-pending.png');
  await page.screenshot({ path: targetScreenshot });
  await info.attach('native-army-retarget-pending', {
    path: targetScreenshot,
    contentType: 'image/png',
  });
  await nativeDay(page);
  const retargeted = await page.evaluate(() => window.__tenka.debug.getState());
  expect(retargeted.armies[army!.id]).toBeDefined();
  expect(retargeted.armies[army!.id]!.targetNodeId).toBe(selected!.id);
  const retargetedLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const targetCommands = retargetedLog.entries.filter(
    (entry) => entry.command.type === 'setArmyTarget',
  );
  expect(targetCommands).toHaveLength(1);
  expect(targetCommands[0]!.command).toEqual({
    type: 'setArmyTarget',
    clanId: player.id,
    armyId: army!.id,
    targetNodeId: selected!.id,
  });
  const midpointArmy = retargeted.armies[army!.id]!;
  expect(midpointArmy.edgeProgressDays).toBeGreaterThan(0);
  expect(midpointArmy.edgeProgressDays).toBeLessThan(midpointArmy.edgeCostDays);
  await selectArmy(page, retargeted, army!.id);
  await page.getByTestId('army-retarget').click();
  const midpointDialog = page.getByRole('dialog', { name: '變更目標', exact: true });
  await expect(midpointDialog).toBeVisible();
  await page.getByTestId('army-target-select').selectOption(midpointArmy.originCastleId);
  await expect(page.getByTestId('army-target-preview')).toContainText('從目前實際位置起算');
  await expect(page.getByTestId('army-target-preview')).toContainText('目前的');
  // The real remaining route is shorter than a day, not the old integer-truncated zero.
  const midpointPreview = await page.getByTestId('army-target-preview').innerText();
  const midpointDays = /基準路程([\d,.]+)日/.exec(midpointPreview);
  expect(midpointDays).not.toBeNull();
  expect(Number(midpointDays![1]!.replaceAll(',', ''))).toBeGreaterThan(0);
  expect(Number(midpointDays![1]!.replaceAll(',', ''))).toBeLessThan(1);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(retargeted);
  await midpointDialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(retargeted);
  // Recall is deliberately tested only at a genuinely reached node. This does not
  // certify the separately tracked pre-existing mid-edge recall/retarget mechanics.
  let beforeRecall = retargeted;
  const nodeWaitStates: GameState[] = [];
  for (let day = 0; day < 30; day += 1) {
    const current = beforeRecall.armies[army!.id];
    expect(current, 'army must remain deployed until a real node is reached').toBeDefined();
    if (
      current!.edgeProgressDays === 0 &&
      (current!.edgeCostDays === 0 || current!.posNodeId !== deployed.armies[army!.id]!.posNodeId)
    )
      break;
    await nativeDay(page);
    beforeRecall = await page.evaluate(() => window.__tenka.debug.getState());
    nodeWaitStates.push(beforeRecall);
  }
  const physicalNodeArmy = beforeRecall.armies[army!.id]!;
  expect(physicalNodeArmy.edgeProgressDays).toBe(0);
  expect(
    physicalNodeArmy.edgeCostDays === 0 ||
      physicalNodeArmy.posNodeId !== deployed.armies[army!.id]!.posNodeId,
    'recall must originate at an actual reached node, never a partially traversed edge',
  ).toBe(true);
  await selectArmy(page, beforeRecall, army!.id);
  await expect(page.getByTestId('army-recall')).toBeEnabled();
  await page.getByTestId('army-recall').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('army-recall')).toBeDisabled();
  await expect(page.getByTestId('army-retarget')).toBeDisabled();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(beforeRecall);
  const pendingRecallLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(
    pendingRecallLog.entries.filter((entry) => entry.command.type === 'recallArmy'),
  ).toHaveLength(0);
  const recallScreenshot = info.outputPath('native-army-recall-pending.png');
  await page.screenshot({ path: recallScreenshot });
  await info.attach('native-army-recall-pending', {
    path: recallScreenshot,
    contentType: 'image/png',
  });
  await nativeDay(page);
  const recalled = await page.evaluate(() => window.__tenka.debug.getState());
  const recalledArmy = recalled.armies[army!.id];
  if (recalledArmy) expect(recalledArmy.status).toBe('returning');
  else {
    expect(recalled.officers[leader.id]!.armyId).toBeNull();
    expect(
      recalled.reports.filter(
        (report) => report.event.type === 'army.returned' && report.event.armyId === army!.id,
      ),
    ).toHaveLength(1);
  }
  const recalledLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const recalls = recalledLog.entries.filter((entry) => entry.command.type === 'recallArmy');
  expect(recalls).toHaveLength(1);
  expect(recalls[0]!.command).toEqual({ type: 'recallArmy', clanId: player.id, armyId: army!.id });
  expect(
    recalledLog.entries.filter((entry) => entry.command.type === 'setArmyTarget'),
  ).toHaveLength(1);
  const evidencePath = info.outputPath('actual-army-order-lifecycle.json');
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        timeControl:
          'Playwright Clock controls normal RAF ticks; speed and pause use native keyboard input. Not wall-clock responsiveness or FPS evidence.',
        selected,
        initial,
        deployed,
        retargeted,
        midpointPreview,
        beforeRecall,
        nodeWaitStates,
        recalled,
        previewLog,
        pendingTargetLog,
        retargetedLog,
        pendingRecallLog,
        recalledLog,
      },
      null,
      2,
    ),
  );
  await info.attach('actual-army-order-lifecycle', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
