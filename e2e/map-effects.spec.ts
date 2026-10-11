import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function diagnostics(page: Page) {
  return page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
}
async function setEffects(page: Page, enabled: boolean) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('switch', { name: '地圖特效', exact: true }).setChecked(enabled);
  await expect.poll(async () => (await diagnostics(page)).effects.motionBlocked).toBe(!enabled);
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function waitForBurst(page: Page) {
  await expect
    .poll(async () => (await diagnostics(page)).effects.activeParticles, {
      intervals: [50, 50, 100],
      timeout: 5000,
    })
    .toBeGreaterThan(0);
  const observed = (await diagnostics(page)).effects;
  expect(observed.activeParticles).toBeLessThanOrEqual(128);
  expect(observed.activeParticles).toBeLessThanOrEqual(
    8 * (observed.assaultEmitters + observed.fieldContacts),
  );
  return observed;
}

test('live assault siege effects respect OS/settings, clear without backlog and remount one bounded pool', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => {
      try {
        await page.evaluate(() => window.__tenka.debug.waitMapIdle());
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);
  await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('operational'));
  const core = await page.evaluate(() => window.__tenka.debug.getState());
  const assaultCount = Object.values(core.sieges).filter(
    (siege) => siege.mode === 'assault',
  ).length;
  expect(assaultCount).toBeGreaterThan(0);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const initial = await diagnostics(page);
  expect(initial.effects).toEqual({
    fieldContacts: 0,
    assaultEmitters: assaultCount,
    activeParticles: 0,
    particleCapacity: 128,
    motionBlocked: true,
  });
  expect(initial.layers.effects!.visibleDrawables).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('static-siege-initial-reduce.png') });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
  const live = await waitForBurst(page);
  expect(live.motionBlocked).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('live-assault-siege.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await diagnostics(page)).effects).toEqual(initial.effects);
  await page.waitForTimeout(1300); // Longer than the assault cadence, not merely one particle lifetime.
  expect((await diagnostics(page)).effects.activeParticles).toBe(0);
  expect((await diagnostics(page)).layers.effects!.visibleDrawables).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(core);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await waitForBurst(page);
  await setEffects(page, false);
  await expect.poll(async () => (await diagnostics(page)).effects.activeParticles).toBe(0);
  await page.waitForTimeout(1500);
  expect((await diagnostics(page)).effects).toEqual(initial.effects);
  expect((await diagnostics(page)).layers.effects!.visibleDrawables).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('static-siege-effects-disabled.png') });
  await setEffects(page, true);
  const restored = await waitForBurst(page);
  expect(restored.assaultEmitters).toBe(assaultCount);
  expect(restored.particleCapacity).toBe(128);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(core);

  // Remount in reduced mode: zero particles must survive, while one new scene pool remains bounded.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await diagnostics(page)).effects.activeParticles).toBe(0);
  const resources = (await diagnostics(page)).resources;
  for (let index = 0; index < 3; index++) {
    await page.evaluate(() => window.__tenka.debug.remountMap());
    const remounted = await diagnostics(page);
    expect(remounted.ready).toBe(true);
    expect(remounted.resources).toEqual(resources);
    expect(remounted.effects).toEqual(initial.effects);
    expect(remounted.layers.effects!.visibleDrawables).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(core);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await waitForBurst(page);
  await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('operational'));
  await page.screenshot({ path: testInfo.outputPath('remounted-live-assault-siege.png') });
  await testInfo.attach('map-effects-diagnostics', {
    body: JSON.stringify({ initial, live, restored, final: await diagnostics(page) }),
    contentType: 'application/json',
  });
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(core);
  // This fixture covers a real assault siege. It contains no field contact; those remain unit-integrated.
});
