import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import { TOKENS_NUM } from '../src/ui/styles/tokens';

test('geographic hierarchy retains real role text, pixel-lock and campaign state in dense national views', async ({
  page,
}, info) => {
  const baseline = process.env.GEOGRAPHY_LABEL_BASELINE === '1';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=15600519');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getMapDiagnostics().ready))
    .toBe(true);
  const initial = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  const roles = new Set<string>();
  for (const [region, worldX, worldY] of [
    ['mino', 1940, 2890],
    ['kiso', 2173.5, 2772],
  ] as const) {
    for (const preset of ['overview', 'operational', 'close'] as const) {
      await page.evaluate((p) => window.__tenka.debug.setMapCameraPreset(p), preset);
      const mini = page.getByTestId('minimap-frame');
      const box = (await mini.boundingBox())!;
      await mini.click({
        position: { x: (worldX / 4096) * box.width, y: (worldY / 4096) * box.height },
      });
      if (preset !== 'close') {
        await page.mouse.move(640, 360);
        for (let step = 0; step < (preset === 'overview' ? 18 : 11); step++)
          await page.mouse.wheel(0, 120);
      }
      let prior = '',
        stable = 0;
      await expect
        .poll(async () => {
          const value = await page.evaluate(() =>
            JSON.stringify(
              window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points,
            ),
          );
          stable = value === prior ? stable + 1 : 0;
          prior = value;
          return stable;
        })
        .toBeGreaterThanOrEqual(3);
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
      const data = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
      expect(data.lodStage).toBe({ overview: 'far', operational: 'mid', close: 'near' }[preset]);
      // The unchanged LOD policy hides all geography at mid; castles remain primary.
      if (preset === 'operational') expect(data.geographicLabelLayout.labels).toHaveLength(0);
      else expect(data.geographicLabelLayout.labels.length).toBeGreaterThan(0);
      const eligible = data.geographicLabelLayout.labels.filter(
        (label) =>
          label.rect.x >= 80 &&
          label.rect.y >= 110 &&
          label.rect.x + label.rect.width < 1000 &&
          label.rect.y + label.rect.height < 690,
      );
      if (preset !== 'operational') expect(eligible.length).toBeGreaterThan(0);
      for (const label of eligible) {
        roles.add(label.kind);
        expect(label.text.length).toBeGreaterThan(0);
        expect(Math.hypot(label.offset.x, label.offset.y)).toBeLessThanOrEqual(48 + 1e-6);
        if (!baseline) {
          expect(label.paint.fontSizeCss).toBeCloseTo(label.kind === 'province' ? 18 : 12, 6);
          expect(label.paint.alpha).toBe(1);
          expect(label.paint.fill).toBe(
            label.kind === 'province' ? TOKENS_NUM.ink700 : TOKENS_NUM.ink900,
          );
          expect(label.paint.stroke).toMatchObject({
            color: label.kind === 'district' ? TOKENS_NUM.washi200 : TOKENS_NUM.washi300,
            width: 1.5,
          });
        }
      }
      const idle = await page.evaluate(async () => {
        await window.__tenka.debug.waitMapIdle(3);
        return window.__tenka.debug.getMapDiagnostics();
      });
      expect(idle.resources).toEqual(data.resources);
      expect(idle.geographicLabelLayout).toEqual(data.geographicLabelLayout);
      const core = await page.evaluate(() => ({
        state: JSON.stringify(window.__tenka.debug.getState()),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
      }));
      expect(core).toEqual(initial);
      writeFileSync(
        info.outputPath(`geography-${region}-${preset}.json`),
        JSON.stringify({ baseline, region, preset, core, data }, null, 2),
      );
      await page.screenshot({ path: info.outputPath(`geography-${region}-${preset}.png`) });
    }
  }
  expect(roles.has('district')).toBe(true);
  expect(roles.has('road')).toBe(true);
  expect(roles.has('province')).toBe(true);
  expect(errors).toEqual([]);
});
