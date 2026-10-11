import { test, expect, type Page, type TestInfo } from '@playwright/test';
import axe, { type AxeResults } from 'axe-core';
import { writeFile } from 'node:fs/promises';

const shapes = [
  'petal5',
  'petal6',
  'bars2',
  'bars3',
  'nestedDiamond',
  'tripleTriangle',
  'crossRing',
  'star3Bar',
  'tomoe3',
  'squareEyes4',
  'ring',
  'doubleRing',
];
const families = [
  '導航／時間',
  '資源／內政',
  '軍事／外交',
  '地圖／圖層',
  '狀態／警告',
  '系統／資料',
];
const additions = [
  'army',
  'road',
  'bridge',
  'terrain',
  'layer',
  'supply',
  'morale',
  'siege',
  'warning',
  'blocked',
  'eye',
  'eye-off',
];
type AxeWindow = Window & { axe: typeof axe };
const browserErrors = new WeakMap<Page, string[]>();

async function audit(page: Page, info: TestInfo, name: string): Promise<void> {
  const result: AxeResults = await page.evaluate(() => (window as unknown as AxeWindow).axe.run());
  const json = JSON.stringify(result, null, 2);
  await writeFile(info.outputPath(`axe-${name}.json`), json);
  await info.attach(`axe-${name}`, { body: json, contentType: 'application/json' });
  const summary = result.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    nodes: nodes.length,
  }));
  await info.attach(`axe-${name}-summary`, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  // Run every default rule and preserve every result. The canonical12T14 gate is critical-only.
  expect
    .soft(
      result.violations.filter((violation) => violation.impact === 'critical'),
      JSON.stringify(summary),
    )
    .toEqual([]);
  // Keep the fixed serious/minor findings from regressing; incomplete checks remain in raw JSON.
  expect.soft(result.violations, JSON.stringify(summary)).toEqual([]);
}

async function liveSessionSnapshot(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const path = '/src/app/store.ts';
    const module = (await import(/* @vite-ignore */ path)) as {
      store: { getState(): { game: unknown; tickSeq: number; session: unknown } };
    };
    const state = module.store.getState();
    return JSON.stringify({ game: state.game, tickSeq: state.tickSeq, session: state.session });
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.push(`console.error: ${message.text()} ${JSON.stringify(message.location())}`);
  });
  await page.goto('/#/dev/components');
  await expect(page.getByTestId('component-gallery')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

test.afterEach(async ({ page }, info) => {
  const errors = browserErrors.get(page) ?? [];
  await info.attach('browser-errors', {
    body: JSON.stringify(errors, null, 2),
    contentType: 'application/json',
  });
  expect(errors, 'Gallery must not emit pageerror or console.error').toEqual([]);
});

test('all six icon families and twelve Kamon shapes render at the canonical sizes', async ({
  page,
}, info) => {
  const gallery = page.getByTestId('component-gallery');
  await expect(gallery.locator('[data-gallery-component]')).toHaveCount(20);
  const icons = gallery.locator('[data-gallery-component="IconButton"]');
  for (const name of families)
    await expect(icons.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(icons.locator('[data-gallery-icon]')).toHaveCount(38 * 3);
  for (const name of additions)
    for (const size of [16, 24, 32]) {
      const icon = icons.locator(`[data-gallery-icon="${name}-${size}"]`);
      await expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
      await expect(icon).toHaveAttribute('width', String(size));
      expect(await icon.locator('path,circle').count()).toBeGreaterThan(0);
      await expect(icon.locator('text,image,use,[id]')).toHaveCount(0);
    }
  const crests = gallery.locator('[data-gallery-component="KamonIcon"]');
  await expect(crests.locator('[data-kamon-shape]')).toHaveCount(12 * 3);
  for (const shape of shapes)
    for (const size of [16, 24, 64]) {
      const crest = crests.locator(`[data-kamon-shape="${shape}"][width="${size}"]`);
      await expect(crest).toHaveAttribute('height', String(size));
      await expect(crest).toHaveAccessibleName(`${shape}家紋${size}像素`);
      const bounds = await crest.boundingBox();
      expect(bounds?.width).toBe(size);
      expect(bounds?.height).toBe(size);
    }
  for (const [name, section] of [
    ['icons-six-families', icons],
    ['kamon-twelve-shapes', crests],
  ] as const) {
    const path = info.outputPath(`${name}.png`);
    await section.screenshot({ path });
    await info.attach(name, { path, contentType: 'image/png' });
  }
});

test('650-row table stays virtualized when scrolling and preserves controlled sorting', async ({
  page,
}) => {
  const wrapper = page.getByTestId('gallery-large-table');
  const rows = wrapper.locator('tbody tr:not([aria-hidden="true"])');
  await expect(rows.first()).toContainText('展示第1城');
  expect(await rows.count()).toBeLessThan(40);
  const viewport = wrapper.locator(':scope > div');
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(rows.last()).toContainText('展示第650城');
  expect(await rows.count()).toBeLessThan(40);
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(rows.first()).toContainText('展示第1城');
  await wrapper.getByRole('button', { name: /兵力/ }).click();
  await expect(wrapper.locator('th').nth(1)).toHaveAttribute('aria-sort', 'descending');
  await expect(rows.first()).toContainText('展示第650城');
  await rows.first().click();
  await expect(page.locator('[data-gallery-component="DataTable"]')).toContainText('已選取：650');
  await expect(wrapper.locator('th').nth(1)).toHaveAttribute('aria-sort', 'descending');
});

test('real dialog, menu, slider and report controls work by keyboard without touching a game session', async ({
  page,
}) => {
  const before = await liveSessionSnapshot(page);
  const opener = page.getByRole('button', { name: '開啟md對話框', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '展示對話框' });
  await expect(dialog).toBeVisible();
  const first = dialog.getByRole('button', { name: '展示對話框', exact: true });
  const last = dialog.getByRole('button', { name: '關閉展示', exact: true });
  const input = dialog.getByRole('textbox', { name: '展示輸入', exact: true });
  await input.focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(input).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  const menu = page.locator('[data-gallery-component="MenuList"]');
  await menu.getByRole('menuitem', { name: '一般動作' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: '危險動作' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toContainText('選單結果：danger');
  await expect(menu.getByRole('menuitem', { name: '停用動作' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  const slider = page.getByRole('slider', { name: '展示兵數' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('5000');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageUp');
  await expect(slider).toHaveValue('1100');
  const reportSection = page.locator('[data-gallery-component="ReportStack"]');
  await reportSection.getByRole('button', { name: '加一條重要' }).focus();
  await page.keyboard.press('Enter');
  const report = reportSection.getByRole('alert');
  await expect(report).toContainText('重要通知：請手動關閉');
  await report.getByRole('button', { name: '關閉通知' }).focus();
  await page.keyboard.press('Enter');
  await expect(report).toHaveCount(0);
  expect(await liveSessionSnapshot(page)).toBe(before);
});

test('default axe checks preserve complete raw results for default and interactive states', async ({
  page,
}, info) => {
  await page.addScriptTag({ content: axe.source });
  const image = info.outputPath('gallery-default.png');
  await page.screenshot({ path: image, fullPage: true });
  await info.attach('gallery-default', { path: image, contentType: 'image/png' });
  await audit(page, info, 'default');
  await page.getByRole('button', { name: '開啟md對話框', exact: true }).click();
  await audit(page, info, 'dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '開啟危險確認', exact: true }).click();
  await audit(page, info, 'danger-confirm');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '加一條重要', exact: true }).click();
  await audit(page, info, 'critical-report');
});
