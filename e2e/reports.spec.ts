import { readFile } from 'node:fs/promises';
import type { SaveFile } from '../src/core/save/serialize';
import type { ReportId } from '../src/core/state/ids';
import { test, expect } from './fixtures';

test('report center filters and paginates retained history without changing core, and navigates only on explicit goto', async ({
  page,
}, testInfo) => {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '存檔', exact: true }).click();
  const savePanel = page.getByTestId('save-load-panel');
  await expect(savePanel).toHaveAttribute('aria-busy', 'false');
  const downloadPromise = page.waitForEvent('download');
  await savePanel.getByRole('button', { name: '匯出目前進度', exact: true }).click();
  const path = await (await downloadPromise).path();
  if (path === null) throw new Error('Expected exported history fixture');
  const save = JSON.parse(await readFile(path, 'utf8')) as SaveFile;
  const actor = save.state.meta.playerClanId;
  const castle = Object.values(save.state.castles).find(
    (item) => item.ownerClanId === actor && item.id !== save.state.clans[actor]!.homeCastleId,
  );
  if (!castle) throw new Error('Expected a genuinely different owned report destination');
  // Explicit codec-imported fixture, not a production mutation hook.
  save.state.reports = Array.from({ length: 101 }, (_, index) => ({
    id: ('rep.' + String(index + 1).padStart(6, '0')) as ReportId,
    day: save.state.time.day,
    read: true,
    event:
      index === 100
        ? {
            type: 'economy.foodShortage',
            day: save.state.time.day,
            clanIds: [actor],
            clanId: actor,
            castleId: castle.id,
          }
        : {
            type: 'economy.income',
            day: save.state.time.day,
            clanIds: [actor],
            clanId: actor,
            gold: index + 1,
            foodByCastle: {},
          },
  }));
  save.state.meta.nextSerials.report = 102;
  await savePanel.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '讀檔', exact: true }).click();
  await expect(savePanel).toHaveAttribute('aria-busy', 'false');
  const chooserPromise = page.waitForEvent('filechooser');
  await savePanel.getByRole('button', { name: '匯入存檔', exact: true }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'reports-test.tenkafubu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await savePanel.getByRole('button', { name: '直接開始', exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().reports.length))
    .toBe(101);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle());
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const map = page.getByTestId('map-canvas-host');
  const beforeMap = await map.screenshot();
  await page.keyboard.press('r');
  const panel = page.getByTestId('reports-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li')).toHaveCount(50);
  await expect(page.getByTestId('reports-open')).toBeHidden();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await panel.screenshot({ path: testInfo.outputPath('reports-panel-1280.png') });
  await expect(panel.getByText('第1／3頁，共101則')).toBeVisible();
  await panel.getByRole('button', { name: '下一頁', exact: true }).click();
  await expect(panel.locator('li')).toHaveCount(50);
  await panel.getByRole('button', { name: '下一頁', exact: true }).click();
  await expect(panel.locator('li')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: '下一頁', exact: true })).toBeDisabled();
  await panel.getByRole('checkbox', { name: /只看重要/ }).check();
  await expect(panel.locator('li')).toHaveCount(1);
  await expect(panel.getByText('第1／1頁，共1則')).toBeVisible();
  await panel.getByRole('checkbox', { name: '內政', exact: true }).uncheck();
  await expect(panel.locator('li')).toHaveCount(0);
  await panel.getByRole('checkbox', { name: '內政', exact: true }).check();
  await panel.getByLabel('開始年月', { exact: true }).selectOption('1560/1');
  await panel.getByLabel('結束年月', { exact: true }).selectOption('1560/1');
  await expect(panel.locator('li')).toHaveCount(1);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await panel.getByRole('button', { name: '前往', exact: true }).click();
  await expect(panel).not.toBeVisible();
  // Observe the actual destination body anchor, independent of ribbon decluttering;
  // idle frames alone need not finish focus.
  await expect
    .poll(() =>
      page.evaluate(
        ({ id }) => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-testid="map-canvas-host"] canvas',
          )!;
          const origin = canvas.getBoundingClientRect();
          const anchor = window.__tenka.debug
            .getMapDiagnostics()
            .castleRendering.nodes.find((entry) => entry.id === id)?.anchor;
          if (!anchor) return Infinity;
          const boxes = (selector: string) =>
            [...document.querySelectorAll(selector)]
              .filter((node) => node.getClientRects().length > 0)
              .map((node) => node.getBoundingClientRect());
          const top =
            Math.max(
              ...boxes(
                '[data-testid="screen-strategy"] > header, [data-testid="layer-control"]',
              ).map((r) => r.bottom - origin.top),
            ) + 12;
          const left =
            Math.max(
              ...boxes('[data-testid="screen-strategy"] > nav, [data-testid="siege-overlay"]').map(
                (r) => r.right - origin.left,
              ),
            ) + 12;
          const rightBoxes = boxes('[data-testid="minimap"]');
          const reports = document.querySelector('[data-testid="reports-open"]')?.parentElement;
          if (reports)
            for (const child of reports.children)
              if (child.getClientRects().length > 0) rightBoxes.push(child.getBoundingClientRect());
          const right = Math.min(origin.width, ...rightBoxes.map((r) => r.left - origin.left - 12));
          const bottom = Math.min(
            origin.height,
            ...boxes('[data-testid="screen-strategy"] > div[aria-hidden="false"]').map(
              (r) => r.top - origin.top - 12,
            ),
          );
          const x = anchor.x;
          const y = anchor.y;
          return Math.max(Math.abs(x - (left + right) / 2), Math.abs(y - (top + bottom) / 2));
        },
        { id: castle.id, tier: castle.tier },
      ),
    )
    .toBeLessThanOrEqual(1);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(30));
  const afterMap = await map.screenshot();
  expect(afterMap.equals(beforeMap)).toBe(false);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('reports-open').click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('li')).toHaveCount(50);
});
