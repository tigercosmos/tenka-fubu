import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import axe, { type AxeResults } from 'axe-core';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

type AxeWindow = Window & { axe: typeof axe };

async function newPausedGame(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.evaluate(async () => {
    await window.__tenka.debug.waitSimulationIdle();
    await window.__tenka.debug.waitMapIdle();
  });
}

async function audit(page: Page, info: TestInfo, name: string): Promise<AxeResults> {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => (window as unknown as AxeWindow).axe.run());
  const raw = JSON.stringify(result, null, 2);
  await writeFile(info.outputPath(`axe-${name}.json`), raw);
  await info.attach(`axe-${name}`, { body: raw, contentType: 'application/json' });
  // Preserve all default rules, violations and incomplete checks. M6-V11 requires no critical.
  expect.soft(result.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
  return result;
}

test('production screens have no critical axe findings and dialogs preserve one page banner', async ({
  page,
}, info) => {
  await page.goto('/?debug=1');
  await expect(page.getByTestId('title-newgame')).toBeVisible();
  await page.addScriptTag({ content: axe.source });
  await audit(page, info, 'title');
  await page.getByTestId('title-newgame').click();
  await expect(page.getByTestId('scenario-pick-s1560')).toBeVisible();
  await audit(page, info, 'new-game');
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.evaluate(async () => {
    await window.__tenka.debug.waitSimulationIdle();
    await window.__tenka.debug.waitMapIdle();
  });
  await audit(page, info, 'main');
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  const settings = await audit(page, info, 'settings');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '讀檔', exact: true }).click();
  await expect(page.getByTestId('save-load-panel')).toHaveAttribute('aria-busy', 'false');
  const saveLoad = await audit(page, info, 'save-load');
  for (const result of [settings, saveLoad]) {
    expect
      .soft(
        result.violations.filter((violation) =>
          ['landmark-no-duplicate-banner', 'landmark-unique'].includes(violation.id),
        ),
      )
      .toEqual([]);
  }
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(
    await dialog.evaluate((element) => {
      const heading = document.getElementById(element.getAttribute('aria-labelledby') ?? '');
      return heading?.tagName === 'H2' && element.contains(heading);
    }),
  ).toBe(true);
  await expect(page.getByRole('banner')).toHaveCount(1);
});

test('empty load registry remains reachable and scrollable with native keyboard input', async ({
  page,
}, info) => {
  await newPausedGame(page);
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '讀檔', exact: true }).click();
  const panel = page.getByTestId('save-load-panel');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const list = panel.locator('ol');
  expect(await list.locator('button:enabled').count()).toBe(0);
  const before = await list.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    scrollTop: element.scrollTop,
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  await panel.getByRole('button', { name: '返回', exact: true }).focus();
  await page.keyboard.press('Tab');
  // Chromium exposes automatic scroll-container focus despite the absence of explicit tabindex.
  await expect(list).toBeFocused();
  const focus = await list.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outline: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      shadow: style.boxShadow,
    };
  });
  expect((focus.outline !== 'none' && focus.width >= 2) || focus.shadow !== 'none').toBe(true);
  await page.keyboard.press('End');
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(before.scrollTop);
  const after = await list.evaluate((element) => element.scrollTop);
  await info.attach('empty-registry-native-keyboard', {
    body: JSON.stringify({ before, after, focus }),
    contentType: 'application/json',
  });
});
