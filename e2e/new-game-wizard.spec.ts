import { readFile, writeFile } from 'node:fs/promises';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

async function chooseScenarioAndOda(page: Page): Promise<void> {
  await page.getByTestId('title-newgame').click();
  await expect(
    page.getByRole('list', { name: '新遊戲步驟' }).locator('[aria-current="step"]'),
  ).toContainText('選擇劇本');
  await page.getByTestId('scenario-pick-s1560').click();
  await expect(page.getByTestId('screen-daimyo-select')).toBeVisible();
  await expect(page.getByTestId('daimyo-next')).toBeDisabled();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('daimyo-next').click();
  await expect(page.getByTestId('screen-difficulty-select')).toBeVisible();
}

async function readableInViewport(target: Locator, name: string, action = false): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${name} is rendered`).not.toBeNull();
  expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(1280);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(720);
  const fontSize = await target.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  expect(fontSize, `${name} readable text`).toBeGreaterThanOrEqual(12);
  if (action) {
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(32);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(32);
  }
}

async function captureStep(
  page: Page,
  info: TestInfo,
  scale: number,
  name: string,
  screen: Locator,
  action: Locator,
): Promise<void> {
  await expect(screen).toBeVisible();
  const heading = screen.getByRole('heading', { level: 1 });
  await heading.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await readableInViewport(heading, `${name} heading`);
  await readableInViewport(screen.getByRole('list', { name: '新遊戲步驟' }), `${name} progress`);
  await page.screenshot({ path: info.outputPath(`wizard-${scale}-${name}-top.png`) });
  await action.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  await readableInViewport(action, `${name} action`, true);
  await page.screenshot({ path: info.outputPath(`wizard-${scale}-${name}-action.png`) });
}

async function clanCardTextContained(page: Page, info: TestInfo, scale: number): Promise<void> {
  const cards = await page.evaluate(() => {
    const roster = document.querySelector('[data-testid="clan-pick-clan.oda"]')?.parentElement;
    if (!roster) throw new Error('Daimyo roster is missing');
    return {
      scrollable: roster.scrollHeight > roster.clientHeight,
      cards: [...roster.querySelectorAll<HTMLElement>('[data-testid^="clan-pick-"]')].map(
        (card) => {
          const box = card.getBoundingClientRect();
          return {
            id: card.dataset.testid,
            box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
            text: [...card.children].map((child) => {
              const range = document.createRange();
              range.selectNodeContents(child);
              return [...range.getClientRects()].map((text) => ({
                left: text.left,
                right: text.right,
                top: text.top,
                bottom: text.bottom,
              }));
            }),
          };
        },
      ),
    };
  });
  await writeFile(
    info.outputPath(`wizard-${scale}-clan-text-geometry.json`),
    JSON.stringify(cards),
  );
  expect(cards.scrollable).toBe(true);
  const catalog = JSON.parse(await readFile('src/data/scenarios/s1560/clans.json', 'utf8')) as {
    clans: { id: string }[];
  };
  expect(cards.cards.map((card) => card.id)).toEqual(
    catalog.clans.map((clan) => `clan-pick-${clan.id}`),
  );
  for (const card of cards.cards) {
    for (const part of card.text) {
      expect(part.length, `${card.id} has rendered text`).toBeGreaterThan(0);
      for (const text of part) {
        expect(text.left, `${card.id} text left`).toBeGreaterThanOrEqual(card.box.left);
        expect(text.right, `${card.id} text right`).toBeLessThanOrEqual(card.box.right);
        expect(text.top, `${card.id} text top`).toBeGreaterThanOrEqual(card.box.top);
        expect(text.bottom, `${card.id} text bottom`).toBeLessThanOrEqual(card.box.bottom);
      }
    }
  }
}

const scales = Array.from({ length: 15 }, (_, index) => Number((0.8 + index * 0.05).toFixed(2)));

for (const scale of scales) {
  test(`four real steps retain choices and invalid seed text at scale ${scale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?debug=1&seed=42');
    await page.getByTestId('title-settings').click();
    const settings = page.getByRole('dialog');
    const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
    await slider.press('Home');
    for (let step = 0; step < Math.round((scale - 0.8) / 0.05); step++)
      await slider.press('ArrowRight');
    await expect(slider).toHaveValue(String(scale));
    await settings.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByTestId('title-newgame').click();
    const scenario = page.getByTestId('screen-scenario-select');
    await expect(scenario.getByRole('heading', { level: 1 })).toBeFocused();
    await captureStep(
      page,
      info,
      scale,
      'scenario',
      scenario,
      page.getByTestId('scenario-pick-s1560'),
    );
    await readableInViewport(
      scenario.getByTestId('scenario-pick-s1560').getByText(/勢力數/),
      'scenario description',
    );
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('scenario-pick-s1560')).toBeFocused();
    await page.keyboard.press('Enter');
    const daimyo = page.getByTestId('screen-daimyo-select');
    await expect(daimyo.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByTestId('daimyo-next')).toBeDisabled();
    await page.getByTestId('clan-pick-clan.oda').click();
    await clanCardTextContained(page, info, scale);
    const lastClan = daimyo.locator('[data-testid^="clan-pick-"]').last();
    await lastClan.evaluate((element) => element.scrollIntoView({ block: 'end' }));
    await readableInViewport(lastClan, 'last clan card', true);
    await page.screenshot({ path: info.outputPath(`wizard-${scale}-daimyo-last.png`) });
    await page.getByTestId('clan-pick-clan.oda').click();
    await expect(page.getByTestId('clan-pick-clan.oda')).toHaveAttribute('aria-pressed', 'true');
    await captureStep(page, info, scale, 'daimyo', daimyo, page.getByTestId('daimyo-next'));
    const chosenClan = daimyo.locator('aside').getByRole('heading', { level: 2 });
    await chosenClan.evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
    await readableInViewport(chosenClan, 'selected clan');
    await readableInViewport(
      daimyo.locator('aside').getByText('當主', { exact: true }),
      'selected clan label',
    );
    const metricLabel = daimyo.locator('aside dl dt').first();
    await metricLabel.evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
    await readableInViewport(metricLabel, 'selected clan metric label');
    await readableInViewport(daimyo.locator('aside dl dd').first(), 'selected clan metric');
    await page.screenshot({ path: info.outputPath(`wizard-${scale}-daimyo-metadata.png`) });
    await page.getByTestId('daimyo-next').click();
    const difficulty = page.getByTestId('screen-difficulty-select');
    await expect(difficulty.getByRole('heading', { level: 1 })).toBeFocused();
    await captureStep(
      page,
      info,
      scale,
      'difficulty',
      difficulty,
      page.getByTestId('difficulty-next'),
    );
    await readableInViewport(
      page.getByRole('radio', { name: '上級' }).locator('..'),
      'difficulty label',
      true,
    );
    await readableInViewport(
      difficulty.getByRole('group', { name: '選擇難易度' }).locator('legend'),
      'difficulty legend',
    );
    await expect(page.getByTestId('screen-strategy')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: '中級' })).toBeChecked();
    await page.getByRole('radio', { name: '上級' }).check();
    await page.getByTestId('difficulty-back').click();
    await expect(page.getByTestId('clan-pick-clan.oda')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('daimyo-next').click();
    await expect(page.getByRole('radio', { name: '上級' })).toBeChecked();
    await page.getByTestId('difficulty-next').click();
    const seedScreen = page.getByTestId('screen-seed-select');
    await expect(seedScreen.getByRole('heading', { level: 1 })).toBeFocused();
    await captureStep(page, info, scale, 'seed', seedScreen, page.getByTestId('newgame-start'));
    const seed = page.getByTestId('newgame-seed');
    await readableInViewport(seed, 'seed input', true);
    await readableInViewport(seedScreen.locator('#newgame-seed-hint'), 'seed guidance');
    await expect(seed).toHaveValue('42');
    for (const invalid of ['', '-1', '1.5', 'NaN', '4294967296']) {
      await seed.fill(invalid);
      await expect(page.getByTestId('newgame-start')).toBeDisabled();
      await readableInViewport(seedScreen.getByRole('alert'), 'seed validation error');
    }
    await page.getByTestId('seed-back').click();
    await page.getByTestId('difficulty-next').click();
    await expect(seed).toHaveValue('4294967296');
    await seed.fill('00042');
    await expect(page.getByTestId('newgame-start')).toBeEnabled();
    await seed.fill('4294967295');
    await expect(page.getByTestId('newgame-start')).toBeEnabled();
    await seed.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('newgame-start')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    const game = await page.evaluate(() => window.__tenka.debug.getState());
    expect(game.meta.playerClanId).toBe('clan.oda');
    expect(game.meta.difficulty).toBe('hard');
    expect(game.meta.seed).toBe(4294967295);
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  });
}

test('the same selected clan, difficulty and seed start identical game state', async ({ page }) => {
  async function boot(): Promise<unknown> {
    await page.goto('/?debug=1&seed=0');
    await chooseScenarioAndOda(page);
    await page.getByRole('radio', { name: '初級' }).check();
    await page.getByTestId('difficulty-next').click();
    await expect(page.getByTestId('newgame-seed')).toHaveValue('0');
    await page.getByTestId('newgame-start').click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    await page.evaluate(() => window.__tenka.debug.waitSimulationIdle());
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '存檔', exact: true }).click();
    await expect(page.getByTestId('save-load-panel')).toHaveAttribute('aria-busy', 'false');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出目前進度', exact: true }).click();
    const path = await (await downloading).path();
    if (path === null) throw new Error('Expected canonical SaveFile download');
    const exported = JSON.parse(await readFile(path, 'utf8')) as { state: unknown };
    return exported.state;
  }
  expect(await boot()).toEqual(await boot());
});
