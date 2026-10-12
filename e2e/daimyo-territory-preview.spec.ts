import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

interface CastleFixture {
  id: string;
  ownerClanId: string;
}
interface DistrictFixture {
  castleId: string;
  pos: { x: number; y: number };
}

async function setScale(page: Page, scale: number): Promise<void> {
  await page.getByTestId('title-settings').click();
  const slider = page.getByRole('dialog').getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press('Home');
  for (let index = 0; index < Math.round((scale - 0.8) / 0.05); index += 1)
    await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await page.getByRole('dialog').getByRole('button', { name: '返回', exact: true }).click();
}

const scales = Array.from({ length: 15 }, (_, index) => Number((0.8 + index * 0.05).toFixed(2)));

for (const scale of scales) {
  test(`real territory preview selects by pointer and roster keyboard at scale ${scale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?debug=1&seed=42');
    await setScale(page, scale);
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    const screen = page.getByTestId('screen-daimyo-select');
    const map = screen.getByRole('img', { name: /點選地圖領地/ });
    await expect(map).toBeVisible();
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(Math.abs(mapBox!.width - mapBox!.height), 'undistorted map').toBeLessThanOrEqual(1);
    expect(mapBox!.width, 'usable atlas area').toBeGreaterThanOrEqual(180);
    expect(mapBox!.x).toBeGreaterThanOrEqual(0);
    expect(mapBox!.y).toBeGreaterThanOrEqual(0);
    expect(mapBox!.x + mapBox!.width).toBeLessThanOrEqual(1280);
    expect(mapBox!.y + mapBox!.height).toBeLessThanOrEqual(720);
    const roster = screen.locator('[data-testid="clan-pick-clan.oda"]').locator('..');
    const rosterOverflow = await roster.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(rosterOverflow.scrollWidth, 'roster has no horizontal clipping').toBeLessThanOrEqual(
      rosterOverflow.clientWidth + 1,
    );
    await expect(screen.getByText('推薦新手')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath(`territory-${scale}-initial.png`) });

    const castles = JSON.parse(
      await readFile('src/data/scenarios/s1560/castles.json', 'utf8'),
    ) as CastleFixture[];
    const districts = JSON.parse(
      await readFile('src/data/scenarios/s1560/districts.json', 'utf8'),
    ) as DistrictFixture[];
    const castleOwner = new Map(castles.map((castle) => [castle.id, castle.ownerClanId]));
    const imagawaDistricts = districts.filter(
      (district) => castleOwner.get(district.castleId) === 'clan.imagawa',
    );
    expect(imagawaDistricts.length).toBeGreaterThan(0);
    for (const district of imagawaDistricts) {
      await page.mouse.click(
        mapBox!.x + (district.pos.x / 4096) * mapBox!.width,
        mapBox!.y + (district.pos.y / 4096) * mapBox!.height,
      );
      if (
        (await page.getByTestId('clan-pick-clan.imagawa').getAttribute('aria-pressed')) === 'true'
      )
        break;
    }
    await expect(page.getByTestId('clan-pick-clan.imagawa')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(screen.locator('figure figcaption')).toContainText('今川');
    const highlighted = await map.evaluate((canvas) => {
      const pixels = (canvas as HTMLCanvasElement)
        .getContext('2d')!
        .getImageData(0, 0, 1024, 1024).data;
      let count = 0;
      for (let offset = 0; offset < pixels.length; offset += 4)
        if (pixels[offset] === 178 && pixels[offset + 1] === 58 && pixels[offset + 2] === 40)
          count += 1;
      return count;
    });
    expect(highlighted, 'selected outline visible in raster').toBeGreaterThan(200);
    await page.screenshot({ path: info.outputPath(`territory-${scale}-imagawa.png`) });
    await page.mouse.click(mapBox!.x + 1, mapBox!.y + 1); // sea is not a selectable clan
    await expect(page.getByTestId('clan-pick-clan.imagawa')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const oda = page.getByTestId('clan-pick-clan.oda');
    await oda.focus();
    await oda.press('Enter');
    await expect(oda).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('clan-pick-clan.imagawa')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(screen.locator('figure figcaption')).toContainText('織田');
    await page.getByTestId('daimyo-next').click();
    await page.getByTestId('difficulty-back').click();
    await expect(oda).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.locator('figure figcaption')).toContainText('織田');
    await page.screenshot({ path: info.outputPath(`territory-${scale}-oda-return.png`) });
  });
}
