import { completeNewGameWizard } from './new-game-wizard';
import { test, expect } from './fixtures';

test('production excludes the DEV gallery and renders actual clan crests with bounded short names', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const route of ['components', 'battle-layout']) {
    await page.goto(`/#/dev/${route}`);
    await expect(page.getByTestId('screen-title')).toBeVisible();
    await expect(page.getByTestId('component-gallery')).toHaveCount(0);
    await expect(page.getByTestId('battle-layout-gallery')).toHaveCount(0);
  }
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.ashikaga').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  const crest = page.locator('nav [data-kamon-shape="ring"]');
  await expect(crest).toHaveCount(1);
  await expect(crest).toHaveAttribute('width', '64');
  const name = page.locator('nav span[title="足利將軍家"]');
  await expect(name).toHaveText('足利');
  const geometry = await name.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    parentHeight: element.parentElement?.getBoundingClientRect().height,
    whiteSpace: getComputedStyle(element).whiteSpace,
    fontSize: parseFloat(getComputedStyle(element).fontSize),
  }));
  expect(geometry).toEqual({ height: 16, parentHeight: 72, whiteSpace: 'nowrap', fontSize: 12 });
  const crestBox = await crest.boundingBox();
  expect(crestBox?.width).toBe(32);
  expect(crestBox?.height).toBe(32);
  await page.evaluate(() => document.fonts.ready);
  const path = info.outputPath('clan-crest-hud-1280.png');
  await page.screenshot({ path });
  await info.attach('clan-crest-hud', { path, contentType: 'image/png' });
});
