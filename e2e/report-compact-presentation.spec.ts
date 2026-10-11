import { test, expect } from './fixtures';

for (const scale of [0.8, 1, 1.5]) {
  test(`compact native reports preserve readable content and archive controls at scale ${scale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '設定', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
    if (scale === 1.5) await slider.press('End');
    else {
      await slider.press('Home');
      if (scale === 1) for (let index = 0; index < 4; index++) await slider.press('ArrowRight');
    }
    await expect(slider).toHaveValue(String(scale));
    await dialog.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    const before = await page.evaluate(() => ({
      core: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    }));
    const list = page.getByTestId('report-toast-list');
    await expect(list).toBeVisible();
    const titles = await list.locator('strong').allTextContents();
    expect(titles.length).toBeGreaterThan(0);
    const seals = list.locator('[data-category]');
    expect(
      await page.evaluate(() => window.__tenka.debug.getState().reports.map((r) => r.event.type)),
    ).toContain('siege.started');
    await expect(seals).toHaveCount(titles.length);
    for (const seal of await seals.all()) {
      await expect(seal).toHaveAttribute('data-category', 'military');
      await expect(seal).toHaveAttribute('aria-hidden', 'true');
      await expect(seal.locator('svg path')).toHaveAttribute(
        'd',
        'M5 19l10-10m-7 6l-3 3 1 1 3-3M14 4l6-1-1 6-3 3-5-5z',
      );
    }
    const observations = await list.evaluate((root) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        rem,
        cards: [...root.children].map((node) => {
          const card = node as HTMLElement;
          const box = card.getBoundingClientRect();
          const texts = [...card.querySelectorAll<HTMLElement>('strong, p, time')].map((text) => {
            const range = document.createRange();
            range.selectNodeContents(text);
            return {
              text: text.textContent,
              font: parseFloat(getComputedStyle(text).fontSize),
              rects: [...range.getClientRects()].map((rect) => ({
                width: rect.width,
                height: rect.height,
                contained:
                  rect.left >= box.left &&
                  rect.right <= box.right &&
                  rect.top >= box.top &&
                  rect.bottom <= box.bottom,
              })),
            };
          });
          return {
            height: box.height,
            bodyless: card.querySelector('p') === null,
            width: box.width,
            overflow: card.scrollWidth > card.clientWidth,
            texts,
            close: [...card.querySelectorAll('button')].map((button) => {
              const rect = button.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            }),
          };
        }),
      };
    });
    await info.attach('native-report-density', {
      body: JSON.stringify({ scale, titles, observations }),
      contentType: 'application/json',
    });
    expect(observations.cards.some((card) => card.bodyless)).toBe(true);
    for (const card of observations.cards) {
      if (card.bodyless)
        expect(card.height).toBeLessThanOrEqual(Math.max(56, observations.rem * 3.5));
      expect(card.overflow).toBe(false);
      for (const text of card.texts) {
        expect(text.font).toBeGreaterThanOrEqual(12);
        expect(text.rects.length).toBeGreaterThan(0);
        for (const rect of text.rects) {
          expect(rect.width).toBeGreaterThan(0);
          expect(rect.height).toBeGreaterThan(0);
          expect(rect.contained, text.text ?? '').toBe(true);
        }
      }
      for (const close of card.close) {
        expect(close.width).toBeGreaterThanOrEqual(32);
        expect(close.height).toBeGreaterThanOrEqual(32);
      }
    }
    await page.screenshot({ path: info.outputPath(`compact-reports-${scale}.png`) });
    const archive = page.getByTestId('reports-open');
    await archive.focus();
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(page.getByTestId('reports-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeVisible();
    expect(await list.locator('strong').allTextContents()).toEqual(titles);
    expect(
      await page.evaluate(() => ({
        core: JSON.stringify(window.__tenka.debug.getState()),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
      })),
    ).toEqual(before);
  });
}
