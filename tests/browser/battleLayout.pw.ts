import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../e2e/fixtures';

async function hitProof(control: Locator) {
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [
      { name: 'center', x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 },
      { name: 'top-left', x: box.left + 2, y: box.top + 2 },
      { name: 'top-right', x: box.right - 2, y: box.top + 2 },
      { name: 'bottom-left', x: box.left + 2, y: box.bottom - 2 },
      { name: 'bottom-right', x: box.right - 2, y: box.bottom - 2 },
    ].map((point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        ...point,
        owned: hit === element || (hit !== null && element.contains(hit)),
        hit: hit?.getAttribute('data-testid') ?? hit?.tagName ?? null,
      };
    });
  });
}

async function inspectControls(page: Page, frame: Locator) {
  const controls = frame.locator('[data-testid^="battle-jin-"], [data-testid^="battle-unit-"]');
  const evidence = [];
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
    const bounds = await frame.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
    expect(box!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
    const hits = await hitProof(control);
    const id = await control.getAttribute('data-testid');
    evidence.push({ id, box, hits });
    expect(
      hits.every((point) => point.owned),
      JSON.stringify({ id, hits }),
    ).toBe(true);
  }
  const friendly = frame.locator('[data-testid^="battle-unit-"][data-side="attacker"]');
  for (const control of await friendly.all()) {
    const id = (await control.getAttribute('data-testid'))!.slice('battle-unit-'.length);
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('battle-layout-action')).toHaveAttribute('data-kind', 'select');
    await expect(page.getByTestId('battle-layout-action')).toHaveAttribute('data-id', id);
  }
  for (const control of await frame
    .locator('[data-testid^="battle-unit-"][data-side="defender"]')
    .all()) {
    const id = (await control.getAttribute('data-testid'))!.slice('battle-unit-'.length);
    await control.click();
    await expect(page.getByTestId('battle-layout-action')).toHaveAttribute('data-kind', 'enemy');
    await expect(page.getByTestId('battle-layout-action')).toHaveAttribute('data-id', id);
  }
  const node = frame.locator('[data-testid^="battle-jin-"]:enabled').first();
  const id = (await node.getAttribute('data-testid'))!.slice('battle-jin-'.length);
  await node.click();
  await expect(page.getByTestId('battle-layout-action')).toHaveAttribute('data-kind', 'node');
  await expect(page.getByTestId('battle-layout-action')).toHaveAttribute('data-id', id);
  return evidence;
}

test('dense presentation fixtures have independently reachable native targets at every scale', async ({
  page,
}, info) => {
  // These are explicitly synthetic presentation fixtures, not core-valid battles or gameplay proof.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/dev/battle-layout');
  const frame = page.getByTestId('battle-layout-frame');
  await expect(frame).toBeVisible();
  await page.getByTestId('battle-layout-size-min').click();
  const raw = [];
  for (const scenario of ['dense8', 'full12', 'crossing8']) {
    await page.getByTestId(`battle-layout-${scenario}`).click();
    for (const scale of [0.8, 1, 1.5]) {
      await page.getByTestId(`battle-layout-scale-${scale}`).click();
      await expect(frame.locator('[data-testid^="battle-unit-"]')).toHaveCount(
        scenario === 'full12' ? 12 : 8,
      );
      await expect(frame.locator('canvas')).toHaveCount(1);
      await frame.scrollIntoViewIfNeeded();
      const box = (await frame.boundingBox())!;
      expect(box.width).toBeCloseTo(678, 0);
      expect(box.height).toBeCloseTo(444, 0);
      raw.push({ scenario, scale, evidence: await inspectControls(page, frame) });
      const screenshotPath = info.outputPath(`${scenario}-${scale}.png`);
      await frame.screenshot({ path: screenshotPath });
      await info.attach(`${scenario}-${scale}`, { path: screenshotPath, contentType: 'image/png' });
    }
  }
  const evidencePath = info.outputPath('dense-hit-test-evidence.json');
  await writeFile(evidencePath, JSON.stringify(raw, null, 2));
  await info.attach('dense-hit-test-evidence', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
import { writeFile } from 'node:fs/promises';
