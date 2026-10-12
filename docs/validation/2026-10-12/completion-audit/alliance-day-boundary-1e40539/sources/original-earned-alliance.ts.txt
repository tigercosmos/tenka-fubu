import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';
import LZString from 'lz-string';
import type { GameState } from '../src/core/state/gameState';
import type { SaveFile } from '../src/core/save/serialize';
import type { ClanId } from '../src/core/state/ids';
import { getTrust, hasPact } from '../src/core/systems/diplomacyCommon';
import { validateState } from '../src/core/state/invariants';
import { encodeFullSnapshot } from './full-snapshot-transport';
import { test, expect } from './fixtures';

const runFile = promisify(execFile);
const actor = 'clan.azai' as ClanId,
  target = 'clan.asakura' as ClanId;
const alliance = {
  type: 'proposePact',
  clanId: actor,
  targetClanId: target,
  kind: 'proposeAlliance',
  reinforceAgainstClanId: null,
} as const;
const state = async (page: Page): Promise<GameState> =>
  JSON.parse(
    await page.evaluate<string>(
      `(${encodeFullSnapshot.toString()})(window.__tenka.debug.getState())`,
    ),
  ) as GameState;
const day = (page: Page) => page.evaluate(() => window.__tenka.debug.getState().time.day);
const log = (page: Page) => page.evaluate(() => window.__tenka.debug.exportCommandLog());
function persistent(game: GameState) {
  const copy = structuredClone(game);
  copy.ai.intentLog = [];
  return copy;
}

async function freshCheckpoint(info: TestInfo) {
  const path = info.outputPath('earned-azai-alliance.tfusave');
  await mkdir(dirname(path), { recursive: true });
  const generated = await runFile(
    process.execPath,
    [
      resolve('node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'app',
      'tests/app/earnedAzaiAllianceJourney.spec.ts',
      '--minWorkers=1',
      '--maxWorkers=1',
      '-t',
      'generates the genuinely earned full-world day270 Azai alliance checkpoint',
    ],
    { env: { ...process.env, EARNED_AZAI_ALLIANCE_SAVE_PATH: path } },
  );
  await info.attach('CPU-earned-route-generation', {
    body: Buffer.from(generated.stdout + generated.stderr),
    contentType: 'text/plain',
  });
  const raw = await readFile(path, 'utf8');
  const save = JSON.parse(raw) as SaveFile;
  const evidence = await readFile(`${path}.evidence.json`, 'utf8');
  await info.attach('CPU-earned-route-payments-events-commands', {
    body: Buffer.from(evidence),
    contentType: 'application/json',
  });
  expect(save.state.time.day).toBe(270);
  expect(save.state.meta.playerClanId).toBe(actor);
  expect(save.state.meta.scenarioId).toBe('s1560');
  expect(getTrust(save.state, actor, target)).toBe(60.60960000000001);
  expect(save.pendingCommands).toEqual([]);
  return { raw, save };
}

async function importCheckpoint(page: Page, raw: string, save: SaveFile) {
  await page.goto('/?debug=1');
  await page.getByTestId('title-save-list').click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const choosing = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'earned-azai-alliance.tenkafubu.json',
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

async function dismissKnownOwners(page: Page, decisions: string[], holdSummary = false) {
  for (let i = 0; i < 12; i++) {
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) === 0) return;
    expect(await dialog.count()).toBe(1);
    if (await page.getByTestId('month-summary').isVisible()) {
      if (holdSummary) return;
      await page.getByTestId('month-summary-continue').click();
    } else if (await page.getByTestId('proposal-inbox').isVisible()) {
      decisions.push('proposal:全部駁回');
      await dialog.getByRole('button', { name: '全部駁回', exact: true }).click();
    } else if (await page.getByTestId('envoy-modal').isVisible()) {
      decisions.push('envoy:拒絕');
      await dialog.getByRole('button', { name: '拒絕', exact: true }).click();
    } else throw Error('Unknown native owner; do not bypass earned event/captive consent');
  }
  throw Error('Native FIFO did not drain');
}

async function quickBlob(page: Page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'keyval-store'))
      return null;
    return new Promise<string | null>((resolve, reject) => {
      const opening = indexedDB.open('keyval-store');
      opening.onerror = () => reject(opening.error ?? new Error('IndexedDB open failed'));
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction('keyval', 'readonly');
        const req = tx.objectStore('keyval').get('tf.save.quick:1.blob');
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
      };
    });
  });
}
async function saveAndReload(page: Page, expected: GameState) {
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
async function normalDay(page: Page) {
  const before = await day(page);
  const pause = page.getByTestId('speed-pause');
  if ((await pause.getAttribute('aria-pressed')) === 'true') {
    await pause.focus();
    await page.clock.runFor(32);
    expect(await day(page)).toBe(before);
    await page.getByTestId('speed-5').click();
    await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
    await page.clock.runFor(152);
  } else {
    await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
    await page.clock.runFor(120);
  }
  const after = await state(page);
  expect(after.time.day).toBe(before + 1);
  expect(validateState(after)).toEqual([]);
  expect(
    after.reports.filter(
      (report) => report.event.day === after.time.day && report.event.type === 'command.rejected',
    ),
  ).toEqual([]);
  expect((await log(page)).incompleteReasons ?? []).not.toContain('hardRejection');
  await expect(page.getByTestId('fatal-error-screen')).toHaveCount(0);
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  return after;
}

test('CPU-earned full-world diplomatic work enables an actual native alliance, pending reload and next paid month', async ({
  page,
}, info) => {
  // Alliance only: the separately observed genuine day361 aid refusal is NOT success.
  const { raw, save } = await freshCheckpoint(info);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await importCheckpoint(page, raw, save);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  const decisions: string[] = [];
  await dismissKnownOwners(page, decisions);
  expect(await state(page)).toEqual(save.state);
  await page.getByTestId('rail-diplomacy').click();
  const panel = page.getByTestId('diplomacy-panel');
  await panel.getByRole('button', { name: /朝倉家 ·/ }).click();
  await expect(panel.getByRole('button', { name: '締結同盟', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: '締結同盟', exact: true }).click();
  expect(await state(page)).toEqual(save.state);
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  const pending = await saveAndReload(page, save.state);
  expect(pending.pendingCommands.filter((c) => c.type === 'proposePact')).toEqual([alliance]);
  expect(pending.pendingCommands.filter((c) => c.type === 'resolveProposal').length).toBe(
    Object.values(save.state.proposals).filter((p) => p.clanId === actor && p.status === 'pending')
      .length,
  );
  // Consent already survived in pendingCommands: loading must not solicit or
  // queue the same saved proposal/envoy decision a second time.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const accepted = await normalDay(page);
  expect(getTrust(accepted, actor, target)).toBe(getTrust(save.state, actor, target) - 60);
  expect(hasPact(accepted, actor, target, 'alliance')).toBe(true);
  const row = Object.values(accepted.diplomacy.rows).find(
    (r) => (r.a === actor && r.b === target) || (r.a === target && r.b === actor),
  )!;
  expect(row.pacts.filter((p) => p.kind === 'alliance')).toEqual([
    { kind: 'alliance', startDay: 271, endDay: 271 + 60 * 30, vassalClanId: null },
  ]);
  expect(
    accepted.reports.filter(
      ({ event }) =>
        event.type === 'pact.signed' &&
        event.day === 271 &&
        event.kind === 'alliance' &&
        event.clanIds.includes(actor) &&
        event.clanIds.includes(target),
    ),
  ).toHaveLength(1);
  expect(
    (await log(page)).entries.filter(
      (e) => e.command.type === 'proposePact' && e.command.clanId === actor,
    ),
  ).toHaveLength(1);
  let current = accepted;
  while (current.time.day < 299) {
    await dismissKnownOwners(page, decisions);
    current = await normalDay(page);
  }
  const beforePaid = current;
  await dismissKnownOwners(page, decisions);
  const paid = await normalDay(page);
  expect(paid.time.day).toBe(300);
  expect(getTrust(paid, actor, target) - getTrust(beforePaid, actor, target)).toBeCloseTo(
    7.1004,
    10,
  );
  await dismissKnownOwners(page, decisions, true);
  await expect(page.getByTestId('month-summary-settlement')).toBeVisible();
  const rawLedger = await page
    .getByTestId('month-summary-settlement')
    .locator('dd')
    .allTextContents();
  expect(rawLedger).toHaveLength(9);
  const number = (text: string) =>
    Number(
      text
        .replaceAll(',', '')
        .match(/[-−]?\d+(?:\.\d+)?/u)![0]
        .replace('−', '-'),
    );
  const income = number(rawLedger[0]!),
    received = number(rawLedger[1]!),
    expense = number(rawLedger[5]!),
    net = number(rawLedger[6]!),
    closing = number(rawLedger[7]!);
  expect(net).toBe(income + received - expense);
  expect(closing - net).toBe(beforePaid.clans[actor]!.gold - 20);
  expect(closing).toBe(paid.clans[actor]!.gold);
  await dismissKnownOwners(page, decisions);
  await page.getByTestId('speed-pause').click();
  const final = await state(page);
  expect(final.time.day).toBe(300);
  expect(validateState(final)).toEqual([]);
  const continuationLog = await log(page);
  expect(continuationLog.incompleteReasons ?? []).not.toContain('hardRejection');
  expect(
    (await log(page)).entries.filter(
      (e) => e.command.type === 'proposePact' && e.command.clanId === actor,
    ),
  ).toHaveLength(1);
  await saveAndReload(page, final);
  await info.attach('native-full-state-events-and-command-log', {
    body: Buffer.from(
      JSON.stringify({
        day271: accepted,
        day299: beforePaid,
        day300: paid,
        finalBeforeReload: final,
        commandLog: continuationLog,
        events: final.reports.map((report) => report.event),
      }),
    ),
    contentType: 'application/json',
  });
  await info.attach('native-alliance-paid-month', {
    body: Buffer.from(
      JSON.stringify({
        decisions,
        rawLedger,
        alliance: row.pacts,
        creditAfter: getTrust(final, actor, target),
        day: final.time.day,
      }),
    ),
    contentType: 'application/json',
  });
});
