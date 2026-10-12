import { writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { completeNewGameWizard } from './new-game-wizard';

const VIEWPORT = { width: 1280, height: 720 };
const SCALES = Array.from({ length: 15 }, (_, index) => Number((0.8 + index * 0.05).toFixed(2)));

async function bootGame(page: Page, scale: number) {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-settings').click();
  const settings = page.getByRole('dialog');
  const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press('Home');
  for (let index = 0; index < Math.round((scale - 0.8) / 0.05); index++)
    await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
}

async function boot(page: Page, scale: number) {
  await bootGame(page, scale);
  await page.keyboard.press('F3');
  await expect(page.getByTestId('diplomacy-panel')).toBeVisible();
}

async function keyboardReaches(page: Page, target: Locator, label: string) {
  const focus: string[] = [];
  let reached = await target.evaluate((node) => document.activeElement === node);
  for (let index = 0; index < 60 && !reached; index++) {
    await page.keyboard.press('Tab');
    focus.push(
      await page.evaluate(() => {
        const node = document.activeElement;
        return `${node?.tagName ?? 'none'}:${node?.getAttribute('aria-label') ?? ''}:${node?.textContent?.trim().slice(0, 40) ?? ''}`;
      }),
    );
    reached = await target.evaluate((node) => document.activeElement === node);
  }
  expect(reached, `${label}: keyboard reaches control`).toBe(true);
  return focus;
}

async function targetGeometry(target: Locator, label: string) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const actual = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    let ancestor = element.parentElement;
    while (ancestor !== null) {
      const style = getComputedStyle(ancestor);
      if (/auto|scroll|hidden|clip/.test(`${style.overflowX} ${style.overflowY}`)) {
        const bounds = ancestor.getBoundingClientRect();
        clip.left = Math.max(clip.left, bounds.left);
        clip.top = Math.max(clip.top, bounds.top);
        clip.right = Math.min(clip.right, bounds.right);
        clip.bottom = Math.min(clip.bottom, bounds.bottom);
      }
      ancestor = ancestor.parentElement;
    }
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      clip,
      visibleWidth: Math.max(0, Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left)),
      visibleHeight: Math.max(0, Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top)),
    };
  });
  expect(actual.visibleWidth, `${label}: reachable width`).toBeGreaterThanOrEqual(32);
  expect(actual.visibleHeight, `${label}: reachable height`).toBeGreaterThanOrEqual(32);
  expect(actual.rect.width, `${label}: physical width`).toBeGreaterThanOrEqual(32);
  expect(actual.rect.height, `${label}: physical height`).toBeGreaterThanOrEqual(32);
  return { label, ...actual };
}

async function textBounds(target: Locator, label: string) {
  await target.scrollIntoViewIfNeeded();
  const actual = await target.evaluate((element) => {
    const host = element.getBoundingClientRect();
    const text = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
    const rects = text.flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right }));
    });
    return { host: { left: host.left, right: host.right }, rects };
  });
  expect(actual.rects.length, `${label}: measured visible text`).toBeGreaterThan(0);
  for (const rect of actual.rects) {
    expect(rect.left, `${label}: text left`).toBeGreaterThanOrEqual(actual.host.left - 1);
    expect(rect.right, `${label}: text right`).toBeLessThanOrEqual(actual.host.right + 1);
  }
  return { label, ...actual };
}

for (const scale of SCALES) {
  test(`diplomacy tabs and actions remain reachable at 1280×720 uiScale ${scale}`, async ({
    page,
  }, info) => {
    await boot(page, scale);
    const panel = page.getByTestId('diplomacy-panel');
    const close = panel.getByRole('button', { name: '外交', exact: true });
    const active = panel.getByRole('tab', { name: '勢力', exact: true });
    const entryFocus = await keyboardReaches(page, active, 'F3 diplomacy entry');
    await writeFile(
      info.outputPath(`diplomacy-entry-focus-${scale}.json`),
      JSON.stringify(entryFocus),
    );
    const geometry: unknown[] = [await targetGeometry(close, 'panel close')];
    const text: unknown[] = [];
    const initial = page.getByRole('tabpanel');
    await expect(panel.getByRole('tab', { name: '勢力', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const roster = initial.locator('button[aria-pressed]');
    expect(await roster.count()).toBeGreaterThan(1);
    geometry.push(await targetGeometry(roster.first(), 'first clan'));
    geometry.push(await targetGeometry(roster.last(), 'last clan'));
    await roster.last().click();
    await expect(roster.last()).toHaveAttribute('aria-pressed', 'true');
    const against = initial.getByRole('combobox', { name: '援軍對抗勢力', exact: true });
    geometry.push(await targetGeometry(against, 'reinforce target'));
    await against.selectOption({ index: 1 });
    for (const name of [
      '締結同盟',
      '締結婚姻同盟',
      '停戰交涉',
      '要求對方稱臣',
      '向對方稱臣',
      '請求援軍',
    ]) {
      const action = initial.getByRole('button', { name, exact: true });
      geometry.push(await targetGeometry(action, name));
      if (await action.isDisabled())
        expect(
          (await action.getAttribute('title'))?.length,
          `${name}: disabled reason`,
        ).toBeGreaterThan(0);
    }
    await page.screenshot({ path: info.outputPath(`diplomacy-勢力-${scale}.png`) });
    await active.focus();
    for (const [name, command] of [
      ['朝廷', '請求下一階官位'],
      ['幕府', '請求下一階役職'],
    ] as const) {
      await page.keyboard.press('ArrowRight');
      const tab = panel.getByRole('tab', { name, exact: true });
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      geometry.push(await targetGeometry(tab, `${name} tab`));
      const pane = panel.getByRole('tabpanel');
      const heading = pane.getByRole('heading', { name, exact: true });
      text.push(await textBounds(heading, `${name} heading`));
      const action = pane.getByRole('button', { name: command, exact: true });
      geometry.push(await targetGeometry(action, command));
      if (await action.isDisabled())
        expect(
          (await action.getAttribute('title'))?.length,
          `${command}: disabled reason`,
        ).toBeGreaterThan(0);
      const finalCell = pane.locator('table tbody tr').last().locator('td').last();
      text.push(await textBounds(finalCell, `${name} final effect`));
      await page.screenshot({ path: info.outputPath(`diplomacy-${name}-${scale}.png`) });
    }
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        viewport: [innerWidth, innerHeight],
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        glVendor: ext && gl ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : null,
        glRenderer: ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
      };
    });
    expect(metrics.documentWidth, 'no page-level horizontal overflow').toBeLessThanOrEqual(1281);
    await close.scrollIntoViewIfNeeded();
    await close.click();
    await expect(panel).toHaveCount(0);
    const raw = JSON.stringify({ scale, geometry, text, metrics });
    await writeFile(info.outputPath(`diplomacy-endpoint-${scale}.json`), raw);
    await info.attach(`diplomacy-endpoint-${scale}`, {
      body: raw,
      contentType: 'application/json',
    });
  });
}

for (const scale of SCALES) {
  test(`corps editor remains reachable at 1280×720 uiScale ${scale}`, async ({ page }, info) => {
    await bootGame(page, scale);
    await page.keyboard.press('F6');
    const panel = page.getByTestId('corps-panel');
    await expect(panel).toBeVisible();
    const create = panel.getByRole('navigation', { name: '軍團' }).getByRole('button', {
      name: '新設軍團',
      exact: true,
    });
    const focus = await keyboardReaches(page, create, 'F6 corps entry');
    const geometry: unknown[] = [];
    const text: unknown[] = [];
    geometry.push(
      await targetGeometry(panel.getByRole('button', { name: '軍團', exact: true }), 'close'),
    );
    geometry.push(await targetGeometry(create, 'new corps navigation'));
    await create.press('Enter');
    const leader = panel.getByRole('combobox', { name: '軍團長（家老以上）', exact: true });
    geometry.push(await targetGeometry(leader, 'corps leader'));
    await leader.selectOption({ index: 1 });
    for (const name of ['攻略', '固守', '開發']) {
      const radio = panel.getByRole('radio', { name, exact: true });
      geometry.push(await targetGeometry(radio.locator('..'), `${name} radio label`));
    }
    await panel.getByRole('radio', { name: '攻略', exact: true }).check();
    const target = panel.getByRole('combobox', { name: '攻略目標', exact: true });
    geometry.push(await targetGeometry(target, 'advance target'));
    await target.selectOption({ index: 1 });
    const castles = panel.getByRole('group', { name: '轄城', exact: true });
    const rows = castles.locator('label');
    expect(await rows.count(), 'owned castles in editor').toBeGreaterThan(0);
    geometry.push(await targetGeometry(rows.first(), 'first castle selection'));
    geometry.push(await targetGeometry(rows.last(), 'last castle selection'));
    await rows.first().click();
    await expect(rows.first().getByRole('checkbox')).toBeChecked();
    const submit = panel.getByRole('button', { name: '新設軍團', exact: true }).last();
    geometry.push(await targetGeometry(submit, 'create corps action'));
    if (await submit.isDisabled())
      expect(
        (await submit.getAttribute('title'))?.length,
        'disabled create reason',
      ).toBeGreaterThan(0);
    text.push(await textBounds(panel.locator('legend').last(), 'castles legend'));
    const metrics = await page.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    }));
    expect(metrics.documentWidth, 'no page-level horizontal overflow').toBeLessThanOrEqual(1281);
    await page.screenshot({ path: info.outputPath(`corps-${scale}.png`) });
    await panel.getByRole('button', { name: '軍團', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await writeFile(
      info.outputPath(`corps-endpoint-${scale}.json`),
      JSON.stringify({ scale, focus, geometry, text, metrics }),
    );
  });

  test(`taimei cards and detail remain reachable at 1280×720 uiScale ${scale}`, async ({
    page,
  }, info) => {
    await bootGame(page, scale);
    await page.keyboard.press('F7');
    const panel = page.getByTestId('taimei-panel');
    await expect(panel).toBeVisible();
    const cards = panel.locator('button[aria-pressed]:has(strong)');
    await expect(cards).toHaveCount(8);
    const focus = await keyboardReaches(page, cards.first(), 'F7 taimei entry');
    const geometry: unknown[] = [];
    const text: unknown[] = [];
    geometry.push(
      await targetGeometry(panel.getByRole('button', { name: '大命', exact: true }), 'close'),
    );
    for (let index = 0; index < 8; index++) {
      const card = cards.nth(index);
      geometry.push(await targetGeometry(card, `taimei card ${index + 1}`));
      text.push(await textBounds(card.locator('strong'), `taimei card ${index + 1} name`));
      await card.click();
      await expect(card).toHaveAttribute('aria-pressed', 'true');
      text.push(
        await textBounds(
          panel.getByRole('region', { name: '大命詳細' }).locator('h2'),
          `taimei detail ${index + 1}`,
        ),
      );
    }
    const invoke = panel.getByRole('button', { name: '發動大命', exact: true });
    geometry.push(await targetGeometry(invoke, 'invoke taimei'));
    const metrics = await page.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    }));
    expect(metrics.documentWidth, 'no page-level horizontal overflow').toBeLessThanOrEqual(1281);
    await page.screenshot({ path: info.outputPath(`taimei-${scale}.png`) });
    await panel.getByRole('button', { name: '大命', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await writeFile(
      info.outputPath(`taimei-endpoint-${scale}.json`),
      JSON.stringify({ scale, focus, geometry, text, metrics }),
    );
  });
}
