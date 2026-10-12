import { expect, type Page } from '@playwright/test';

/** Complete the real wizard after the caller selects its scenario and clan. */
export async function completeNewGameWizard(page: Page): Promise<void> {
  await expect(page.getByTestId('screen-daimyo-select')).toBeVisible();
  await page.getByTestId('daimyo-next').click();
  await expect(page.getByTestId('screen-difficulty-select')).toBeVisible();
  await expect(page.getByRole('radio', { name: '中級', exact: true })).toBeChecked();
  await page.getByTestId('difficulty-next').click();
  await expect(page.getByTestId('screen-seed-select')).toBeVisible();
  await expect(page.getByTestId('newgame-seed')).toHaveAttribute('aria-invalid', 'false');
  await page.getByTestId('newgame-start').click();
}
