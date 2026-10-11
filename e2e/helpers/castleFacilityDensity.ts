import type { Locator, TestInfo } from '@playwright/test';
import { expect } from '../fixtures';

export async function checkCastleFacilityDensity(panel: Locator, info: TestInfo) {
  const section = panel
    .getByRole('heading', { name: '城下施設（slot 6）', exact: true })
    .locator('..');
  const grid = section.locator(':scope > div');
  const slots = grid.locator(':scope > button');
  await expect(slots).toHaveCount(6);
  const policy = panel.getByRole('heading', { name: '徵兵方針', exact: true }).locator('..');
  const measurement = await grid.evaluate((node) => {
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const pane = node.closest('[role="tabpanel"]')!;
    const scroll = node.closest('[data-testid="castle-panel"]')!.querySelector(':scope > section')!;
    return {
      grid: rect(node),
      pane: rect(pane),
      scroll: rect(scroll),
      scrollTop: scroll.scrollTop,
      slots: [...node.querySelectorAll(':scope > button')].map((button) => ({
        ...rect(button),
        name: button.textContent,
        font: parseFloat(getComputedStyle(button).fontSize),
        statuses: [...button.querySelectorAll('small')].map((small) => ({
          font: parseFloat(getComputedStyle(small).fontSize),
          ...rect(small),
        })),
      })),
    };
  });
  const policyBox = await policy.boundingBox();
  expect(policyBox).not.toBeNull();
  await info.attach('castle-facility-density', {
    body: JSON.stringify({ ...measurement, policy: policyBox }),
    contentType: 'application/json',
  });
  // Six ordinary domestic slots must not consume the first viewport at maximum UI scale.
  expect(measurement.grid.height).toBeLessThanOrEqual(192);
  expect(measurement.scrollTop).toBe(0);
  expect(measurement.grid.left).toBeGreaterThanOrEqual(measurement.pane.left);
  expect(measurement.grid.right).toBeLessThanOrEqual(measurement.pane.right);
  expect(policyBox!.y + policyBox!.height).toBeLessThanOrEqual(measurement.scroll.bottom);
  expect(new Set(measurement.slots.map((slot) => slot.left)).size).toBe(3);
  expect(new Set(measurement.slots.map((slot) => slot.top)).size).toBe(2);
  for (const slot of measurement.slots) {
    expect(slot.width).toBeGreaterThanOrEqual(32);
    expect(slot.height).toBeGreaterThanOrEqual(32);
    expect(slot.font).toBeGreaterThanOrEqual(12);
    expect(slot.top).toBeGreaterThanOrEqual(measurement.grid.top);
    expect(slot.bottom).toBeLessThanOrEqual(measurement.grid.bottom);
    for (const status of slot.statuses) {
      expect(status.font).toBeGreaterThanOrEqual(12);
      expect(status.left).toBeGreaterThanOrEqual(slot.left);
      expect(status.right).toBeLessThanOrEqual(slot.right);
    }
  }
}
