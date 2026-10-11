import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import LZString from 'lz-string';
import type { Page, TestInfo } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import type { OfficerId } from '../src/core/state/ids';
import type { SaveFile } from '../src/core/save/serialize';
import { validateState } from '../src/core/state/invariants';
import { encodeFullSnapshot } from './full-snapshot-transport';
import { test, expect } from './fixtures';

const runFile = promisify(execFile);
const target = 'off.saito-tomonobu' as OfficerId;
const release = {
  type: 'handleCaptive',
  clanId: 'clan.takeda',
  officerId: target,
  action: 'release',
  executorId: null,
};
const state = async (page: Page): Promise<GameState> =>
  JSON.parse(
    await page.evaluate<string>(
      `(${encodeFullSnapshot.toString()})(window.__tenka.debug.getState())`,
    ),
  ) as GameState;
function persistent(game: GameState) {
  const copy = structuredClone(game);
  copy.ai.intentLog = [];
  return copy;
}
async function artifact(info: TestInfo) {
  // Only this case generates its unique CPU-earned prerequisite; no static fixture,
  // stale shared /tmp save or subprocess during browser gameplay/measurement.
  const path = info.outputPath('earned-regional-capture.tfusave');
  await mkdir(dirname(path), { recursive: true });
  const generated = await runFile(
    process.execPath,
    [
      resolve('node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'app',
      'tests/app/earnedRegionalCaptureJourney.spec.ts',
      '--minWorkers=1',
      '--maxWorkers=1',
      '-t',
      'generates the genuinely earned supported s1560 day35 regional captive checkpoint',
    ],
    { env: { ...process.env, EARNED_REGIONAL_CAPTURE_SAVE_PATH: path } },
  );
  await info.attach('CPU-earned-regional-capture-generation', {
    body: Buffer.from(generated.stdout + generated.stderr),
    contentType: 'text/plain',
  });
  const raw = await readFile(path, 'utf8');
  await info.attach('CPU-earned-full-commands-events-captures', {
    body: Buffer.from(await readFile(`${path}.evidence.json`, 'utf8')),
    contentType: 'application/json',
  });
  const save = JSON.parse(raw) as SaveFile;
  expect(save.state.meta.scenarioId).toBe('s1560');
  expect(save.state.meta.playerClanId).toBe('clan.takeda');
  expect(save.state.time.day).toBe(35);
  expect(save.state.meta.gameOver).toBeNull();
  expect(save.state.officers[target]).toMatchObject({
    status: 'captive',
    capturedByClanId: 'clan.takeda',
  });
  expect(save.pendingCommands).toEqual([]);
  return { raw, save };
}
async function importCheckpoint(page: Page, raw: string, save: SaveFile) {
  await page.goto('/?debug=1');
  await page.getByTestId('title-save-list').click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const chooser = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'earned-regional-capture.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(panel.getByRole('heading', { name: '匯入預覽', exact: true })).toBeVisible();
  await panel.getByRole('combobox').selectOption('manual:2');
  await panel.getByRole('button', { name: '存入槽位', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  await page
    .getByTestId('save-slot-manual:2')
    .getByRole('button', { name: '載入', exact: true })
    .click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  expect(await state(page)).toEqual(save.state);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
}
async function acknowledgeKnownOwners(page: Page, decisions: string[]) {
  for (let i = 0; i < 16; i++) {
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) === 0) return;
    expect(await dialog.count()).toBe(1);
    if (await page.getByTestId('proposal-inbox').isVisible()) {
      decisions.push('proposal:全部駁回');
      await dialog.getByRole('button', { name: '全部駁回', exact: true }).click();
    } else if (await page.getByTestId('envoy-modal').isVisible()) {
      decisions.push('envoy:拒絕');
      await dialog.getByRole('button', { name: '拒絕', exact: true }).click();
    } else if (await page.getByTestId('month-summary').isVisible()) {
      decisions.push('summary:continue');
      await page.getByTestId('month-summary-continue').click();
    } else throw Error('Unknown real owner: never clear events/captives or invent consent');
  }
  throw Error('Actual owner FIFO did not drain');
}
async function quickBlob(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'keyval-store')) return null;
    return new Promise<string | null>((resolve, reject) => {
      const opening = indexedDB.open('keyval-store');
      opening.onerror = () => reject(opening.error ?? new Error('Save DB open failed'));
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction('keyval', 'readonly');
        const request = tx.objectStore('keyval').get('tf.save.quick:1.blob');
        request.onsuccess = () =>
          resolve(typeof request.result === 'string' ? request.result : null);
        request.onerror = () => reject(request.error ?? new Error('Save read failed'));
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
      };
    });
  });
}
async function saveReload(page: Page, expected: GameState) {
  const before = await quickBlob(page);
  await page.keyboard.press('Control+s');
  await expect.poll(() => quickBlob(page)).not.toBe(before);
  const blob = await quickBlob(page);
  expect(blob).not.toBeNull();
  const saved = JSON.parse(LZString.decompressFromUTF16(blob!)) as SaveFile;
  expect(saved.state).toEqual(persistent(expected));
  await page.reload();
  await expect(page.getByTestId('title-loadgame')).toBeEnabled();
  await page.getByTestId('title-loadgame').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  expect(await state(page)).toEqual(saved.state);
  return saved;
}

test('CPU-earned supported s1560 captive uses real native disposal, pending reload and exactly one normal settlement', async ({
  page,
}, info) => {
  const { raw, save } = await artifact(info);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await importCheckpoint(page, raw, save);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  const decisions: string[] = [];
  await acknowledgeKnownOwners(page, decisions);
  expect(await state(page)).toEqual(save.state);
  // Historical captures deliberately do not become fabricated arrival modals on load.
  await page.getByTestId('rail-officers').click();
  await page
    .getByTestId('officer-list')
    .getByRole('button', { name: '浪人登用與捕虜', exact: true })
    .click();
  const recruit = page.getByTestId('recruit-panel');
  await recruit
    .getByRole('button', { name: new RegExp(save.state.officers[target]!.name) })
    .click();
  await expect(page.getByTestId('captive-modal')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '釋放', exact: true }).click();
  await expect(page.getByTestId('captive-modal')).toHaveCount(0);
  expect(await state(page)).toEqual(save.state);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const pending = await saveReload(page, save.state);
  expect(pending.pendingCommands.filter((c) => c.type === 'handleCaptive')).toEqual([release]);
  expect(pending.pendingCommands.filter((c) => c.type === 'resolveProposal')).toHaveLength(
    Object.values(save.state.proposals).filter(
      (p) => p.status === 'pending' && p.clanId === 'clan.takeda',
    ).length,
  );
  expect(pending.pendingCommands.filter((c) => c.type === 'respondPact')).toHaveLength(
    save.state.diplomacy.pendingProposals.filter((p) => p.toClanId === 'clan.takeda').length,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('rail-officers').click();
  await page
    .getByTestId('officer-list')
    .getByRole('button', { name: '浪人登用與捕虜', exact: true })
    .click();
  await expect(
    page
      .getByTestId('recruit-panel')
      .getByRole('button', { name: new RegExp(save.state.officers[target]!.name) }),
  ).toHaveCount(0);
  expect(await state(page)).toEqual(pending.state);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.clock.runFor(32);
  expect((await state(page)).time.day).toBe(35);
  await page.getByTestId('speed-5').click();
  await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(152);
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const settled = await state(page);
  expect(settled.time.day).toBe(36);
  expect(validateState(settled)).toEqual([]);
  expect(settled.officers[target]).toMatchObject({
    status: 'serving',
    clanId: 'clan.nagao',
    capturedByClanId: null,
  });
  // Canonical applyCommands precedes time advancement: the release is stamped
  // with the pending save's day35 even though the completed normal tick is day36.
  const commandDay = pending.state.time.day;
  const releases = settled.reports.filter(
    (r) => r.event.type === 'officer.released' && r.event.officerId === target,
  );
  expect(releases).toHaveLength(1);
  expect(releases[0]).toMatchObject({
    day: commandDay,
    event: {
      type: 'officer.released',
      day: commandDay,
      officerId: target,
      byClanId: 'clan.takeda',
      clanIds: ['clan.takeda', 'clan.nagao'],
    },
  });
  expect(
    settled.reports.filter(
      (r) =>
        r.event.type === 'command.rejected' &&
        (r.event.day === commandDay || r.event.day === settled.time.day),
    ),
  ).toEqual([]);
  const log = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(log.incompleteReasons ?? []).not.toContain('hardRejection');
  expect(
    log.entries.filter((e) => e.command.type === 'handleCaptive').map((e) => e.command),
  ).toEqual([release]);
  await expect(page.getByTestId('fatal-error-screen')).toHaveCount(0);
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  const finalSave = await saveReload(page, settled);
  expect(finalSave.pendingCommands).toEqual([]);
  expect(await state(page)).toEqual(finalSave.state);
  for (const [name, value] of Object.entries({ pending, settled, log, decisions }))
    await info.attach(`regional-captive-${name}`, {
      body: Buffer.from(JSON.stringify(value)),
      contentType: 'application/json',
    });
});
