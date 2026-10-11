import type { Locator, TestInfo } from '@playwright/test';
import { expect } from '../fixtures';

export async function checkSharedPanelFrame(
  root: Locator,
  kind: 'panel' | 'dialog',
  info: TestInfo,
  name: string,
  dismissible = true,
) {
  await expect(root).toBeVisible();
  const header = root.locator(':scope > header');
  const title = header.locator(kind === 'panel' ? ':scope > span' : ':scope > h2');
  await expect(title).toBeVisible();
  const measurement = await header.evaluate((node) => {
    const title = node.querySelector(':scope > h2, :scope > span')!;
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
    const style = getComputedStyle(node);
    return {
      header: rect(node),
      title: rect(title),
      titleFont: parseFloat(getComputedStyle(title).fontSize),
      background: style.backgroundColor,
      command: style.getPropertyValue('--surface-command').trim(),
      foreground: getComputedStyle(title).color,
      close: [...node.querySelectorAll(':scope > button')].map(rect),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const rgb = (color: string) =>
    color.startsWith('#')
      ? [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
      : color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
  const luminance = (color: string) =>
    rgb(color).reduce((sum, value, index) => {
      const channel = value / 255;
      const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
    }, 0);
  expect(rgb(measurement.background)).toEqual(rgb(measurement.command));
  const light = luminance(measurement.foreground),
    dark = luminance(measurement.background);
  const contrast = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  expect(measurement.titleFont).toBeGreaterThanOrEqual(16);
  for (const edge of ['left', 'top'] as const)
    expect(measurement.title[edge]).toBeGreaterThanOrEqual(measurement.header[edge]);
  for (const edge of ['right', 'bottom'] as const)
    expect(measurement.title[edge]).toBeLessThanOrEqual(measurement.header[edge]);
  expect(measurement.header.left).toBeGreaterThanOrEqual(0);
  expect(measurement.header.top).toBeGreaterThanOrEqual(0);
  expect(measurement.header.right).toBeLessThanOrEqual(measurement.viewport.width);
  expect(measurement.header.bottom).toBeLessThanOrEqual(measurement.viewport.height);
  expect(measurement.close).toHaveLength(dismissible ? 1 : 0);
  for (const close of measurement.close) {
    expect(close.width).toBeGreaterThanOrEqual(32);
    expect(close.height).toBeGreaterThanOrEqual(32);
    expect(close.left).toBeGreaterThanOrEqual(measurement.title.right);
    expect(close.right).toBeLessThanOrEqual(measurement.header.right);
    expect(close.bottom).toBeLessThanOrEqual(measurement.header.bottom);
  }
  await info.attach(name, {
    body: JSON.stringify({ ...measurement, contrast }),
    contentType: 'application/json',
  });
}
