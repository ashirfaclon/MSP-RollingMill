/**
 * RMS on-line rolling % against the plant's casting sheet (the user, 26 Nov 2026 — "Casting Sheet November 26.xls",
 * Production_Report): a day and a period are both Σ billet input ÷ Σ delivery / Σ cast × 100, so 1–25 Nov is the sheet's
 * Total row (95.68 / 93.07), not an average of the daily %.
 */
import { test, expect, type Page } from '@playwright/test';
const SHOTS = 'test-results/screenshots';

const period = async (page: Page, from: string, to: string) => {
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill(from);
  await dialog.getByLabel('End Date').fill(to);
  await dialog.getByRole('button', { name: 'Apply' }).click();
};

test('RMS rolling in casting / delivery: 1–25 Nov and a two-entry day as the casting sheet', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/rms/visualization');
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  const casting = strip.getByRole('button', { name: 'Rolling in casting', exact: true }).locator('.rm-card-value');
  const delivery = strip.getByRole('button', { name: 'Rolling in delivery', exact: true }).locator('.rm-card-value');
  await period(page, '2026-11-01', '2026-11-25');
  await expect(casting).toContainText('93.07', { timeout: 60_000 });
  await expect(delivery).toContainText('95.68');
  await strip.screenshot({ path: `${SHOTS}/rms-rolling-1-25-nov.png` });

  await strip.getByRole('button', { name: 'Rolling in casting', exact: true }).click();
  const d = page.getByRole('dialog', { name: /Rolling in casting and delivery/ });
  const foot = d.getByRole('table', { name: 'Rolling in casting and delivery by period' }).locator('tfoot td');
  // Period, Cast, Delivery, Billet input, casting %, delivery % — the sheet's K34, P34, U34, AE34, AD34.
  await expect(foot).toHaveText([/^Total/, '11,940.73', '11,614.68', '11,113.1', '93.07 %', '95.68 %']);
  await expect(d.getByRole('region', { name: 'Formula' })).toContainText('Rolling in delivery = Σ Billet input ÷ Σ Delivery × 100');
  await page.waitForTimeout(1000);
  await d.screenshot({ path: `${SHOTS}/rms-rolling-drill.png` });
  await d.getByRole('button', { name: 'Close' }).click();

  // 11 Nov: two ERP entries — the sheet's row 13 (94.06 / 92.17), not the average of the two entries' %.
  await period(page, '2026-11-11', '2026-11-11');
  await expect(casting).toContainText('92.17', { timeout: 60_000 });
  await expect(delivery).toContainText('94.06');
});
