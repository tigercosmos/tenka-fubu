import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

async function captureFocus(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const snapshot = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      activeElement: active?.outerHTML ?? null,
      activeTag: active?.tagName ?? null,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((dialog) => ({
        containsFocus: active !== null && dialog.contains(active),
        title: dialog.querySelector('h2')?.textContent,
      })),
    };
  });
  await testInfo.attach(name, {
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json',
  });
}

async function expectContainedFocus(dialog: Locator): Promise<void> {
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const active = document.activeElement;
        return active !== null && element.contains(active);
      }),
    )
    .toBe(true);
}

async function exerciseNativeTabCycle(page: Page, dialog: Locator): Promise<void> {
  const controls = await dialog
    .locator('button:enabled, input:enabled, select:enabled, textarea:enabled, a[href]')
    .count();
  // Traverse beyond both boundaries without manually repairing focus after child dismissal.
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < controls + 2; i += 1) {
      await page.keyboard.press(key);
      await expectContainedFocus(dialog);
    }
  }
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus)
    await captureFocus(page, testInfo, 'failure-active-element');
});

test('save child confirmations restore parent focus including a deleted disabled opener', async ({
  page,
}, testInfo) => {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '存檔', exact: true }).click();
  const panel = page.getByTestId('save-load-panel');
  const parent = page.getByRole('dialog').filter({ has: panel });
  const slot = page.getByTestId('save-slot-manual:1');
  const save = slot.getByRole('button', { name: '存檔', exact: true });
  const remove = slot.getByRole('button', { name: '刪除', exact: true });
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await save.click();
  await expect(slot).toContainText('織田');
  await expect(panel).toHaveAttribute('aria-busy', 'false');

  await save.click();
  await expect(page.getByRole('dialog').last()).toContainText('要覆蓋');
  await expect(
    page.getByRole('dialog').last().getByRole('button', { name: '取消', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(save).toBeFocused();
  await exerciseNativeTabCycle(page, parent);

  await remove.click();
  await expect(
    page.getByRole('dialog').last().getByRole('button', { name: '取消', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(remove).toBeFocused();
  await expect(slot).toContainText('織田');
  await exerciseNativeTabCycle(page, parent);

  await remove.click();
  await page.getByRole('dialog').last().getByRole('button', { name: '確定', exact: true }).click();
  await expect(slot).toContainText('（空）');
  await expect(remove).toBeDisabled();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await captureFocus(page, testInfo, 'after-confirmed-delete-active-element');
  await expectContainedFocus(parent);
  await expect(remove).not.toBeFocused();
  await exerciseNativeTabCycle(page, parent);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
});
