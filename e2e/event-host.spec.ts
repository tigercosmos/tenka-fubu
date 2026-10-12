import { completeNewGameWizard } from './new-game-wizard';
import { readFile } from 'node:fs/promises';
import type { SaveFile } from '../src/core/save/serialize';
import type { EventId } from '../src/core/state/ids';
import { test, expect } from './fixtures';

test('restored unknown pending event stays mandatory and exports intact progress', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '存檔', exact: true }).click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const downloading = page.waitForEvent('download');
  await panel.getByRole('button', { name: '匯出目前進度', exact: true }).click();
  const downloaded = await downloading;
  const path = await downloaded.path();
  if (path === null) throw new Error('Expected exported progress file');
  const save = JSON.parse(await readFile(path, 'utf8')) as SaveFile;
  // Compatibility recovery fixture: this ID is absent from the real production catalog.
  save.state.events.pendingChoiceEventId = 'evt.unknown-legacy' as EventId;
  save.state.events.pendingChoiceBinding = {
    clanId: save.state.meta.playerClanId,
    castleId: null,
    districtId: null,
  };
  await panel.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '讀檔', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const chooserPromise = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'pending.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '直接開始', exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(page.getByTestId('event-unavailable')).toBeVisible();
  const eventDialog = page.getByRole('dialog');
  await expect(eventDialog).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('event-unavailable')).toBeVisible();
  const current = await page.evaluate(() => window.__tenka.debug.getState());
  expect(current.time.day).toBe(save.state.time.day);
  expect(current.events.pendingChoiceEventId).toBe(save.state.events.pendingChoiceEventId);
  const exporting = page.waitForEvent('download');
  await eventDialog.getByRole('button', { name: '匯出目前進度', exact: true }).click();
  const exported = await exporting;
  const exportedPath = await exported.path();
  if (exportedPath === null) throw new Error('Expected recovery export file');
  const recovered = JSON.parse(await readFile(exportedPath, 'utf8')) as SaveFile;
  expect(recovered.state).toEqual(save.state);
  expect(recovered.pendingCommands).toEqual(save.pendingCommands);
  await expect(page.getByTestId('event-unavailable')).toBeVisible();
});
