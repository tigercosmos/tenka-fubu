import { completeNewGameWizard } from './new-game-wizard';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { TenkaDebugApi } from '../src/app/debug';
import type { SaveFile } from '../src/core/save/serialize';
import type { ReportId, SiegeId } from '../src/core/state/ids';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };

async function bootAtLargeScale(page: Page) {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle());
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press('End');
  await expect(slider).toHaveValue('1.5');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe('24px');
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('native large-scale HUD layout', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('every resource number is unclipped and unobscured; report archive clears the minimap', async ({
    page,
  }, info) => {
    await bootAtLargeScale(page);
    const resources = page.getByTestId('hud-resources');
    const measurements = await resources.evaluate((root) => {
      const items = [...root.querySelectorAll<HTMLElement>('[tabindex="0"]')];
      return items.map((item) => {
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        const numbers = [];
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (!/\d/u.test(node.textContent ?? '')) continue;
          const element = node.parentElement!;
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = [...range.getClientRects()].map((rect) => {
            const failures: string[] = [];
            if (rect.width <= 0 || rect.height <= 0) failures.push('empty text rectangle');
            if (
              rect.left < 0 ||
              rect.top < 0 ||
              rect.right > innerWidth ||
              rect.bottom > innerHeight
            )
              failures.push('outside viewport');
            for (
              let ancestor: HTMLElement | null = element;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor);
              const box = ancestor.getBoundingClientRect();
              const left = box.left + ancestor.clientLeft;
              const top = box.top + ancestor.clientTop;
              if (
                /hidden|clip|auto|scroll/u.test(style.overflowX) &&
                (rect.left < left - 0.5 || rect.right > left + ancestor.clientWidth + 0.5)
              )
                failures.push(`horizontal clipping: ${ancestor.tagName}.${ancestor.className}`);
              if (
                /hidden|clip|auto|scroll/u.test(style.overflowY) &&
                (rect.top < top - 0.5 || rect.bottom > top + ancestor.clientHeight + 0.5)
              )
                failures.push(`vertical clipping: ${ancestor.tagName}.${ancestor.className}`);
            }
            for (const fraction of [0.05, 0.5, 0.95]) {
              const hit = document.elementFromPoint(
                rect.left + rect.width * fraction,
                rect.top + rect.height / 2,
              );
              if (hit === null || !item.contains(hit))
                failures.push(`occluded at ${fraction} by ${hit?.tagName ?? 'nothing'}`);
            }
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, failures };
          });
          numbers.push({ text: node.textContent, rects });
        }
        return { label: item.textContent, numbers };
      });
    });
    expect(measurements).toHaveLength(4);
    // Includes all four stock values and the soldier cap, plus finite food coverage when present.
    expect(measurements.flatMap((item) => item.numbers).length).toBeGreaterThanOrEqual(5);
    for (const item of measurements) {
      expect(item.numbers.length, item.label ?? '').toBeGreaterThan(0);
      for (const number of item.numbers) {
        expect(number.rects.length, number.text ?? '').toBeGreaterThan(0);
        for (const rect of number.rects)
          expect(rect.failures, `${item.label}: ${number.text}`).toEqual([]);
      }
    }
    const reports = page.getByTestId('reports-open');
    const stack = reports.locator('..');
    await expect(reports).toBeVisible();
    const toastList = page.getByTestId('report-toast-list');
    await expect(toastList).toBeVisible();
    const toastListBox = await toastList.boundingBox();
    expect(toastListBox).not.toBeNull();
    const listExtent = await toastList.evaluate((element) => ({
      client: element.clientHeight,
      content: element.scrollHeight,
      count: element.children.length,
    }));
    expect(listExtent.count).toBeGreaterThan(0);
    // A single compact card needs its full content, not an empty 100px region.
    // Content that warrants scrolling still retains the original 100px floor.
    expect(listExtent.client, 'actual notification viewport remains usable').toBeGreaterThanOrEqual(
      Math.min(100, listExtent.content),
    );
    const reportBox = await stack.boundingBox();
    const miniBox = await page.getByTestId('minimap').boundingBox();
    expect(reportBox).not.toBeNull();
    expect(miniBox).not.toBeNull();
    const overlap =
      Math.max(
        0,
        Math.min(reportBox!.x + reportBox!.width, miniBox!.x + miniBox!.width) -
          Math.max(reportBox!.x, miniBox!.x),
      ) *
      Math.max(
        0,
        Math.min(reportBox!.y + reportBox!.height, miniBox!.y + miniBox!.height) -
          Math.max(reportBox!.y, miniBox!.y),
      );
    expect(overlap).toBe(0);
    await info.attach('resource-text-visibility', {
      body: JSON.stringify({ measurements, reportBox, miniBox, toastListBox }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('hud-scale-1.5.png') });
    // Unchanged visual fixture, not a maximum-pending notification fixture.
    // Text-range/occlusion assertions are DOM geometry evidence, not glyph-pixel recognition.
  });

  test('five retained critical reports keep a 100px scroll viewport and native last-close access at scale 1.5', async ({
    page,
  }, info) => {
    await page.goto('/?debug=1&seed=42');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await completeNewGameWizard(page);
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '存檔', exact: true }).click();
    const savePanel = page.getByTestId('save-load-panel');
    await expect(savePanel).toHaveAttribute('aria-busy', 'false');
    const downloadPromise = page.waitForEvent('download');
    await savePanel.getByRole('button', { name: '匯出目前進度', exact: true }).click();
    const path = await (await downloadPromise).path();
    if (path === null) throw new Error('Missing exported native report fixture');
    const save = JSON.parse(await readFile(path, 'utf8')) as SaveFile;
    const clanId = save.state.meta.playerClanId;
    const castleId = save.state.clans[clanId]!.homeCastleId;
    if (!castleId) throw new Error('Missing owned report location');
    const attacker = Object.values(save.state.clans).find((clan) => clan.id === 'clan.imagawa');
    if (!attacker) throw new Error('Missing authored historical report attacker');
    // Explicit codec-imported history fixture, not an earned siege claim
    // or a browser mutation of the live game. Production core remains untouched.
    save.state.reports = Array.from({ length: 5 }, (_, index) => ({
      id: `rep.${String(index + 1).padStart(6, '0')}` as ReportId,
      day: save.state.time.day,
      read: false,
      event: {
        type: 'siege.started',
        day: save.state.time.day,
        clanIds: [clanId, attacker.id],
        siegeId: `sie.${String(index + 1).padStart(6, '0')}` as SiegeId,
        attackerClanId: attacker.id,
        castleId,
      },
    }));
    save.state.meta.nextSerials.report = 6;
    save.state.meta.nextSerials.siege = 6;
    await savePanel.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '讀檔', exact: true }).click();
    await expect(savePanel).toHaveAttribute('aria-busy', 'false');
    const chooserPromise = page.waitForEvent('filechooser');
    await savePanel.getByRole('button', { name: '匯入存檔', exact: true }).click();
    await (
      await chooserPromise
    ).setFiles({
      name: 'five-report-layout.tenkafubu.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(save)),
    });
    await savePanel.getByRole('button', { name: '直接開始', exact: true }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: '確定', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '設定', exact: true }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('slider', { name: '介面縮放', exact: true }).press('End');
    await settings.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const before = await page.evaluate(() => ({
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    }));
    const list = page.getByTestId('report-toast-list');
    await expect(list.getByRole('alert')).toHaveCount(5);
    const extent = await list.evaluate((element) => ({
      client: element.clientHeight,
      content: element.scrollHeight,
    }));
    expect(extent.client).toBeGreaterThanOrEqual(100);
    expect(extent.content).toBeGreaterThan(extent.client);
    await list.focus();
    await page.keyboard.press('End');
    const close = list.getByRole('button', { name: '關閉通知', exact: true }).last();
    await expect
      .poll(() =>
        close.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return hit !== null && element.contains(hit);
        }),
      )
      .toBe(true);
    const closeBox = await close.boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(32);
    expect(closeBox!.height).toBeGreaterThanOrEqual(32);
    const archive = await page.getByTestId('reports-open').boundingBox();
    const minimap = await page.getByTestId('minimap').boundingBox();
    expect(archive).not.toBeNull();
    expect(minimap).not.toBeNull();
    expect(archive!.y + archive!.height).toBeLessThanOrEqual(minimap!.y);
    await page.screenshot({ path: info.outputPath('five-critical-reports-1.5.png') });
    await info.attach('five-critical-report-viewport', {
      body: JSON.stringify({ extent, closeBox, archive, minimap }),
      contentType: 'application/json',
    });
    await close.click();
    await expect(list.getByRole('alert')).toHaveCount(4);
    expect(
      await page.evaluate(() => ({
        state: JSON.stringify(window.__tenka.debug.getState()),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
      })),
    ).toEqual(before);
  });

  test('Shift+Tab and forward Tab reach each resource, playback control and report archive at scale 1.5', async ({
    page,
  }) => {
    await bootAtLargeScale(page);
    const visited = new Set<string>();
    // Settings restores the System menu button, after resources/speed in DOM order.
    // Traverse backward first, then forward from a real focused resource. Bare
    // Tab on map/body is the existing faction-map hotkey, not document traversal.
    await expect(page.getByRole('button', { name: '系統選單', exact: true })).toBeFocused();
    const focusTrace = [];
    let backward = true;
    for (let step = 0; step < 100; step++) {
      await page.keyboard.press(backward ? 'Shift+Tab' : 'Tab');
      const current = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return null;
        const resources = document.querySelector('[data-testid="hud-resources"]');
        const items = [...(resources?.querySelectorAll('[tabindex="0"]') ?? [])];
        const index = items.indexOf(active);
        if (index >= 0) return `resource-${index}`;
        return active.dataset.testid ?? null;
      });
      focusTrace.push(current);
      if (current !== null) visited.add(current);
      if (
        [
          'resource-0',
          'resource-1',
          'resource-2',
          'resource-3',
          'speed-pause',
          'speed-1',
          'speed-2',
          'speed-5',
        ].every((id) => visited.has(id))
      )
        backward = false;
      if (
        [
          'resource-0',
          'resource-1',
          'resource-2',
          'resource-3',
          'speed-pause',
          'speed-1',
          'speed-2',
          'speed-5',
          'reports-open',
        ].every((id) => visited.has(id))
      )
        break;
    }
    for (const id of [
      'resource-0',
      'resource-1',
      'resource-2',
      'resource-3',
      'speed-pause',
      'speed-1',
      'speed-2',
      'speed-5',
      'reports-open',
    ])
      expect(
        visited.has(id),
        `actual Tab traversal reaches ${id}; trace=${JSON.stringify(focusTrace)}`,
      ).toBe(true);
    // MiniMap is pointer-only today; this does not assert an invented keyboard navigation contract.
  });
});
