import { test, expect } from './fixtures';
import { checkSharedPanelFrame } from './helpers/sharedPanelFrame';
import { checkCastleFacilityDensity } from './helpers/castleFacilityDensity';

for (const scale of [0.8, 1, 1.5]) {
  test(`shared command frames preserve actual panel and dialog controls at scale ${scale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?debug=1&seed=15600519');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await page.getByTestId('newgame-start').click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    const before = await page.evaluate(() => ({
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    }));
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
    await page.evaluate(() => document.fonts.ready);
    await checkSharedPanelFrame(dialog, 'dialog', info, 'settings-frame');
    const close = dialog.locator(':scope > header > button');
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '回到遊戲', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('rail-domestic').scrollIntoViewIfNeeded();
    await page.getByTestId('rail-domestic').click();
    const panel = page.getByTestId('castle-panel').locator(':scope > section');
    await checkSharedPanelFrame(panel, 'panel', info, 'castle-panel-frame');
    await checkCastleFacilityDensity(panel, info);
    await page.screenshot({ path: info.outputPath('shared-command-frames.png') });
    const vacant = panel.getByRole('button', { name: /空位/ }).first();
    await vacant.focus();
    await expect(vacant).toBeFocused();
    await page.keyboard.press('Space');
    await expect(panel.getByRole('heading', { name: '建造選單', exact: true })).toBeVisible();
    const panelClose = panel.locator(':scope > header > button');
    await panelClose.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('castle-panel')).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        state: JSON.stringify(window.__tenka.debug.getState()),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
      })),
    ).toEqual(before);
  });
}
