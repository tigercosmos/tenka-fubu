import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const SCALES = Array.from({ length: 15 }, (_, index) => Number((0.8 + index * 0.05).toFixed(2)));
const VIEWPORT = { width: 1280, height: 720 };

async function openPolicyPanel(page: Page, scale: number): Promise<void> {
  await page.setViewportSize(VIEWPORT);
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
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.keyboard.press('F5');
  await expect(page.getByTestId('policy-panel')).toBeVisible();
}

test.describe('M8-23 policy panel at the minimum supported viewport', () => {
  for (const scale of SCALES) {
    test(`all twelve policy details remain reachable at uiScale ${scale}`, async ({
      page,
    }, testInfo) => {
      await openPolicyPanel(page, scale);
      const panel = page.getByTestId('policy-panel');
      const cards = panel.locator('[data-testid^="policy-card-"]');
      const detail = page.getByTestId('policy-detail');
      await expect(cards).toHaveCount(12);
      const close = panel.getByRole('button', { name: '政策', exact: true });
      await expect(close).toBeVisible();
      const closeBox = (await close.boundingBox())!;
      const panelBox = (await panel.boundingBox())!;
      expect(closeBox.x).toBeGreaterThanOrEqual(panelBox.x - 1);
      expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
      expect(closeBox.y).toBeGreaterThanOrEqual(panelBox.y - 1);
      expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);

      const firstKeyboardButton = cards.first().getByRole('button', { name: /查看.+詳情/ });
      const entryFocus: string[] = [];
      let enteredFirstCard = false;
      for (let press = 0; press < 60 && !enteredFirstCard; press++) {
        await page.keyboard.press('Tab');
        entryFocus.push(
          await page.evaluate(() => {
            const node = document.activeElement;
            return `${node?.tagName ?? 'none'}:${node?.getAttribute('aria-label') ?? ''}:${node?.textContent?.trim().slice(0, 40) ?? ''}`;
          }),
        );
        enteredFirstCard = await firstKeyboardButton.evaluate(
          (node) => document.activeElement === node,
        );
      }
      await writeFile(
        testInfo.outputPath(`policy-entry-focus-${scale}.json`),
        JSON.stringify(entryFocus),
      );
      expect(enteredFirstCard, `uiScale ${scale}: keyboard enters the panel after F5`).toBe(true);
      await page.keyboard.press('Enter');
      await expect(detail.getByRole('heading', { name: '樂市樂座詳情' })).toBeVisible();

      const measurements: unknown[] = [];
      for (let index = 0; index < 12; index++) {
        const card = cards.nth(index);
        const id = await card.getAttribute('data-testid');
        const heading = (await card.locator('h3').textContent())?.trim() ?? '';
        const button = card.getByRole('button', { name: `查看${heading}詳情` });
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeVisible();
        await button.click();
        await expect(detail.getByRole('heading', { name: `${heading}詳情` })).toBeVisible();
        const action = detail.getByRole('button', { name: /採用|廢止/ });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeVisible();
        const actionBox = (await action.boundingBox())!;
        const detailBox = (await detail.boundingBox())!;
        expect(actionBox.x, `${id}: detail action left`).toBeGreaterThanOrEqual(detailBox.x - 1);
        expect(actionBox.x + actionBox.width, `${id}: detail action right`).toBeLessThanOrEqual(
          detailBox.x + detailBox.width + 1,
        );
        expect(actionBox.y, `${id}: detail action top`).toBeGreaterThanOrEqual(detailBox.y - 1);
        expect(actionBox.y + actionBox.height, `${id}: detail action bottom`).toBeLessThanOrEqual(
          detailBox.y + detailBox.height + 1,
        );

        const geometry = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('[data-testid="policy-panel"]')!;
          const grid = panel.querySelector<HTMLElement>('[class*="grid"]')!;
          const detail = document.querySelector<HTMLElement>('[data-testid="policy-detail"]')!;
          const rect = panel.getBoundingClientRect();
          const detailRect = detail.getBoundingClientRect();
          const cardText = [
            ...panel.querySelectorAll<HTMLElement>(
              '[data-testid^="policy-card-"] h3, [data-testid^="policy-card-"] [data-testid="policy-summary"]',
            ),
          ];
          return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            panel: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
            grid: {
              clientWidth: grid.clientWidth,
              scrollWidth: grid.scrollWidth,
              clientHeight: grid.clientHeight,
              scrollHeight: grid.scrollHeight,
              overflowY: getComputedStyle(grid).overflowY,
            },
            cardTextOverflow: cardText
              .filter((node) => node.scrollWidth > node.clientWidth + 1)
              .map((node) => node.textContent),
            detail: {
              x: detailRect.x,
              y: detailRect.y,
              right: detailRect.right,
              bottom: detailRect.bottom,
              clientWidth: detail.clientWidth,
              scrollWidth: detail.scrollWidth,
              clientHeight: detail.clientHeight,
              scrollHeight: detail.scrollHeight,
              overflowY: getComputedStyle(detail).overflowY,
            },
          };
        });
        measurements.push({ scale, id, heading, geometry });
        expect(geometry.documentWidth, `${id}: document horizontal overflow`).toBeLessThanOrEqual(
          VIEWPORT.width + 1,
        );
        expect(geometry.panel.x, `${id}: panel left`).toBeGreaterThanOrEqual(-1);
        expect(geometry.panel.y, `${id}: panel top`).toBeGreaterThanOrEqual(-1);
        expect(geometry.panel.right, `${id}: panel right`).toBeLessThanOrEqual(VIEWPORT.width + 1);
        expect(geometry.panel.bottom, `${id}: panel bottom`).toBeLessThanOrEqual(
          VIEWPORT.height + 1,
        );
        expect(
          geometry.grid.scrollWidth,
          `${id}: card-grid horizontal overflow`,
        ).toBeLessThanOrEqual(geometry.grid.clientWidth + 1);
        expect(geometry.cardTextOverflow, `${id}: policy name or summary horizontal clip`).toEqual(
          [],
        );
        expect(
          geometry.detail.scrollWidth,
          `${id}: detail horizontal overflow`,
        ).toBeLessThanOrEqual(geometry.detail.clientWidth + 1);
        expect(geometry.detail.right, `${id}: detail right`).toBeLessThanOrEqual(
          geometry.panel.right + 1,
        );
        expect(geometry.detail.bottom, `${id}: detail bottom`).toBeLessThanOrEqual(
          geometry.panel.bottom + 1,
        );
        if (geometry.grid.scrollHeight > geometry.grid.clientHeight + 1)
          expect(geometry.grid.overflowY, `${id}: card list can scroll`).toMatch(/auto|scroll/);
        if (geometry.detail.scrollHeight > geometry.detail.clientHeight + 1)
          expect(geometry.detail.overflowY, `${id}: detail can scroll`).toMatch(/auto|scroll/);
      }
      await writeFile(
        testInfo.outputPath(`policy-responsive-${scale}.json`),
        JSON.stringify(measurements, null, 2),
      );
      if (scale === 0.8 || scale === 1 || scale === 1.5)
        await page.screenshot({ path: testInfo.outputPath(`policy-responsive-${scale}.png`) });

      const first = cards.first().getByRole('button', { name: /查看.+詳情/ });
      let firstReached = false;
      const focusTrail: string[] = [];
      for (let press = 0; press < 100 && !firstReached; press++) {
        await page.keyboard.press('Shift+Tab');
        focusTrail.push(
          await page.evaluate(() => {
            const node = document.activeElement;
            return `${node?.tagName ?? 'none'}:${node?.getAttribute('aria-label') ?? ''}:${node?.textContent?.trim().slice(0, 40) ?? ''}`;
          }),
        );
        firstReached = await first.evaluate((node) => document.activeElement === node);
      }
      await writeFile(
        testInfo.outputPath(`policy-focus-${scale}.json`),
        JSON.stringify(focusTrail),
      );
      expect(firstReached, `uiScale ${scale}: reverse Tab reaches a policy detail control`).toBe(
        true,
      );
      await page.keyboard.press('Enter');
      await expect(detail.getByRole('heading', { name: '樂市樂座詳情' })).toBeVisible();

      let closeReached = false;
      for (let press = 0; press < 100 && !closeReached; press++) {
        await page.keyboard.press('Shift+Tab');
        closeReached = await close.evaluate((node) => document.activeElement === node);
      }
      expect(closeReached, `uiScale ${scale}: reverse Tab reaches the panel close control`).toBe(
        true,
      );
      await page.keyboard.press('Enter');
      await expect(panel).toHaveCount(0);
    });
  }
});
