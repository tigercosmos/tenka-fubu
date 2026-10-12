import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const minimum = { width: 1280, height: 720 };

async function bootBattle(page: Page): Promise<void> {
  await page.setViewportSize(minimum);
  await page.goto('/?debug=1');
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  await expect(page.getByTestId('screen-battle')).toBeVisible();
  await expect(page.getByTestId('battle-canvas').locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('viewport-too-small')).toHaveCount(0);
}

async function setScale(page: Page, index: number): Promise<number> {
  const scale = Number((0.8 + index * 0.05).toFixed(2));
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: '系統選單', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '設定', exact: true }).click();
  const settings = page.getByRole('dialog').last();
  const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press('Home');
  for (let step = 0; step < index; step += 1) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await menu.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return scale;
}

async function physicalBox(page: Page, testId: string, scroll = false): Promise<void> {
  const control = page.getByTestId(testId);
  if (scroll) await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box, testId).not.toBeNull();
  expect(box!.width, testId).toBeGreaterThanOrEqual(32);
  expect(box!.height, testId).toBeGreaterThanOrEqual(32);
  expect(box!.x, testId).toBeGreaterThanOrEqual(-1);
  expect(box!.y, testId).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, testId).toBeLessThanOrEqual(minimum.width + 1);
  expect(box!.y + box!.height, testId).toBeLessThanOrEqual(minimum.height + 1);
}

for (let index = 0; index < 15; index += 1) {
  const expectedScale = Number((0.8 + index * 0.05).toFixed(2));
  test(`real battle controls fit 1280x720 at UI scale ${expectedScale}`, async ({ page }, info) => {
    await bootBattle(page);
    const initial = await page.evaluate(() => window.__tenka.debug.getState());
    const scale = await setScale(page, index);
    expect(scale).toBe(expectedScale);
    const screen = page.getByTestId('screen-battle');
    const geometry = await screen.evaluate((element) => {
      const header = element.querySelector('header')!;
      const title = header.querySelector('h1')!;
      const titleRange = document.createRange();
      titleRange.selectNodeContents(title);
      const footer = element.querySelector('footer')!;
      const field = element.querySelector('[data-testid="battlefield"]')!;
      const bounds = (node: { getBoundingClientRect(): DOMRect }) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return {
        scale: getComputedStyle(document.documentElement).fontSize,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        screen: bounds(element),
        header: bounds(header),
        title: {
          ...bounds(title),
          scrollWidth: title.scrollWidth,
          clientWidth: title.clientWidth,
          scrollHeight: title.scrollHeight,
          clientHeight: title.clientHeight,
          text: bounds(titleRange),
          overflowX: getComputedStyle(title).overflowX,
          overflowY: getComputedStyle(title).overflowY,
        },
        footer: bounds(footer),
        field: bounds(field),
        headerButtons: [...header.querySelectorAll('button')].map((button) => ({
          name: button.getAttribute('aria-label') ?? button.textContent,
          ...bounds(button),
        })),
        tacticButtons: [...footer.querySelectorAll('button')].map((button) => ({
          name: button.textContent,
          ...bounds(button),
        })),
      };
    });
    expect(Number.parseFloat(geometry.scale)).toBeCloseTo(16 * scale, 1);
    expect(geometry.documentWidth).toBeLessThanOrEqual(minimum.width + 1);
    expect(geometry.bodyWidth).toBeLessThanOrEqual(minimum.width + 1);
    expect(geometry.screen.width).toBeLessThanOrEqual(minimum.width + 1);
    expect(geometry.field.width).toBeGreaterThan(0);
    expect(geometry.field.height).toBeGreaterThan(0);
    await info.attach('battle-control-geometry', {
      body: JSON.stringify(geometry),
      contentType: 'application/json',
    });
    if (index === 14)
      await info.attach('battle-high-scale-view', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    expect(geometry.title.scrollWidth).toBeLessThanOrEqual(geometry.title.clientWidth + 1);
    expect(geometry.title.overflowY).toBe('visible');
    expect(geometry.title.text.y).toBeGreaterThanOrEqual(geometry.header.y - 1);
    expect(geometry.title.text.y + geometry.title.text.height).toBeLessThanOrEqual(
      geometry.header.y + geometry.header.height + 1,
    );
    expect(geometry.title.text.x + geometry.title.text.width).toBeLessThanOrEqual(
      geometry.headerButtons[0]!.x,
    );
    for (const button of geometry.headerButtons) {
      expect(button.width, button.name ?? '').toBeGreaterThanOrEqual(32);
      expect(button.height, button.name ?? '').toBeGreaterThanOrEqual(32);
      expect(button.x, button.name ?? '').toBeGreaterThanOrEqual(-1);
      expect(button.x + button.width, button.name ?? '').toBeLessThanOrEqual(minimum.width + 1);
      expect(button.y, button.name ?? '').toBeGreaterThanOrEqual(-1);
      expect(button.y + button.height, button.name ?? '').toBeLessThanOrEqual(minimum.height + 1);
    }
    const battle = Object.values(initial.battles)[0]!;
    const playerSide =
      initial.meta.playerClanId === battle.attackerClanId ? 'attacker' : 'defender';
    for (const jin of battle.jins) await physicalBox(page, `battle-jin-${jin.id}`);
    for (const unit of battle.units.filter((candidate) => !candidate.exited))
      await physicalBox(page, `battle-unit-${unit.id}`);
    for (const unit of battle.units.filter(
      (candidate) => candidate.side === playerSide && !candidate.exited,
    ))
      await physicalBox(page, `battle-unit-card-${unit.id}`, true);
    for (const button of await screen.locator('footer button').all()) {
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(32);
      expect(box!.height).toBeGreaterThanOrEqual(32);
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(minimum.width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(minimum.height + 1);
    }
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(initial);
  });
}

test('battle native controls keep Space while local speed keys and Escape use battle ownership', async ({
  page,
}) => {
  await bootBattle(page);
  await setScale(page, 14);
  const screen = page.getByTestId('screen-battle');
  const initial = await page.evaluate(() => window.__tenka.debug.getState());
  const battle = Object.values(initial.battles)[0]!;
  const side = initial.meta.playerClanId === battle.attackerClanId ? 'attacker' : 'defender';
  const units = battle.units.filter((unit) => unit.side === side && !unit.exited);
  expect(units.length).toBeGreaterThan(1);
  const secondCard = screen.getByTestId(`battle-unit-card-${units[1]!.id}`);
  await secondCard.focus();
  await page.keyboard.press('Space');
  await expect(secondCard).toHaveAttribute('aria-pressed', 'true');
  const pause = screen.getByRole('button', { name: '暫停', exact: true });
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(initial);

  const x2 = screen.getByRole('button', { name: '二倍速', exact: true });
  await x2.focus();
  await page.keyboard.press('Space');
  await expect(x2).toHaveAttribute('aria-pressed', 'true');
  await pause.click();
  await screen.getByTestId('battle-log').focus();
  await page.keyboard.press('Space');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: '系統選單', exact: true });
  await expect(menu).toBeVisible();
  for (const name of ['存檔', '讀檔'])
    await expect(menu.getByRole('button', { name, exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const day = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  for (const [key, name] of [
    ['1', '一倍速'],
    ['2', '二倍速'],
    ['3', '五倍速'],
  ] as const) {
    await page.keyboard.press(key);
    await expect(screen.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Space');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
  }
  expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(day);
});
