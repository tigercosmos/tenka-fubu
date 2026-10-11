import { test, expect } from './fixtures';

test('closed context is excluded from native sequential focus while open controls remain reachable', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug=visual-map');
  const strategy = page.getByTestId('screen-strategy');
  await expect(strategy).toBeVisible();
  await page.evaluate(() => window.__tenka.debug.waitMapIdle());
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const context = strategy.locator(':scope > div[aria-hidden]');
  if ((await context.getAttribute('aria-hidden')) === 'false') {
    await context.locator('header button').click();
  }
  await expect(context).toHaveAttribute('aria-hidden', 'true');
  await page.getByTestId('hud-resources').locator('[tabindex="0"]').first().click();
  const trace = [];
  for (let index = 0; index < 60; index++) {
    await page.keyboard.press('Shift+Tab');
    trace.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active?.tagName,
          label: active?.getAttribute('aria-label'),
          hiddenContext: Boolean(
            active?.closest('[data-testid="screen-strategy"] > div[aria-hidden="true"]'),
          ),
        };
      }),
    );
  }
  await info.attach('closed-context-focus', {
    body: JSON.stringify(trace),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('closed-context.png') });
  expect(trace.filter((entry) => entry.hiddenContext)).toEqual([]);
  expect(await context.evaluate((element) => (element as HTMLElement).inert)).toBe(true);

  await page.getByTestId('rail-home').click();
  await expect(context).toHaveAttribute('aria-hidden', 'false');
  expect(await context.evaluate((element) => (element as HTMLElement).inert)).toBe(false);
  const close = context.locator('header button');
  await close.click();
  await expect(context).toHaveAttribute('aria-hidden', 'true');
  await page.getByTestId('rail-home').click();
  await expect(context).toHaveAttribute('aria-hidden', 'false');
  // Native pointer acquisition followed by native sequential navigation, not DOM focus setters.
  const facts = context.locator('[tabindex="0"]');
  await facts.click();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(facts).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(context.locator('button:focus')).toHaveCount(1);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  expect(errors).toEqual([]);
});
