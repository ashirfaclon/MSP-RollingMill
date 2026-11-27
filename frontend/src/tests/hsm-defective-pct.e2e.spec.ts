/**
 * HSM Defective with its % (the user, 27 Nov 2026): the balance strip's Defective tile shows the MT and, beside it at the
 * same size, its % of production — Σ ROLLING_DEFECT_MT ÷ Σ PRODUCTION_MT × 100, the ERP's own ROLLING_DEFECT_PERCENTAGE rule
 * (82 of 88 entries with a defect), tonnes first over a period. The drill-down has the % as a stat, a column and a
 * formula line.
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
const rolling = async (page: Page, name: string) => {
  await page.getByRole('button', { name: /^Rolling:/ }).click();
  await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name }).click();
};

test('HSM Defective: MT with its % of production, on the tile and in the drill-down', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/hsm/visualization');
  const strip = page.getByRole('group', { name: 'Billets and operating figures' });
  const tile = strip.locator('.rm-mb-stat', { hasText: 'Defective' });

  // 26 Oct 2026 as the ERP holds it: 12.31 MT on 154.64 MT production (Both) = 7.96 %; Online 12.31 ÷ 148.49 = 8.29 %.
  await period(page, '2026-10-26', '2026-10-26');
  await expect(tile).toContainText(/Defective\s*12\.31\s*MT/, { timeout: 60_000 });
  await expect(tile.locator('.rm-mb-stat-v')).toHaveText(/^12\.31\s*MT\s*·\s*7\.96\s*%$/);
  await rolling(page, 'Online');
  await expect(tile.locator('.rm-mb-stat-v')).toHaveText(/·\s*8\.29\s*%$/, { timeout: 60_000 });
  await rolling(page, 'Both');

  await tile.click();
  const d = page.getByRole('dialog', { name: /Defective · ERP log sheet/ });
  await expect(d.locator('.pd-stats')).toContainText('Defective %');
  await expect(d.getByRole('table', { name: 'Defective by period' }).locator('thead')).toContainText('Defective (%)');
  await expect(d.getByRole('table', { name: 'Defective by period' }).locator('tfoot')).toContainText('7.96');
  await expect(d.getByRole('region', { name: 'Formula' })).toContainText('Defective % = Σ ROLLING_DEFECT_MT ÷ Σ PRODUCTION_MT × 100');
  await page.waitForTimeout(800);
  await d.screenshot({ path: `${SHOTS}/hsm-defective-drill.png` });
  await d.getByRole('button', { name: 'Close' }).click();

  // A month: tonnes first — Oct 2026, 33.46 ÷ 5,228.99 = 0.64 %.
  await period(page, '2026-10-01', '2026-10-31');
  await expect(tile.locator('.rm-mb-stat-v')).toHaveText(/·\s*0\.64\s*%$/, { timeout: 60_000 });

  // Day → year, both widths: the strip stays one row and nothing spills.
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    for (const [from, to] of [['2026-11-26', '2026-11-26'], ['2026-11-01', '2026-11-26'], ['2026-01-01', '2026-11-26']]) {
      await period(page, from, to);
      // Real figures, not the loading placeholders.
      await expect(strip.locator('[role="status"][aria-label="Loading"]')).toHaveCount(0, { timeout: 90_000 });
      await expect(tile).toContainText(/\d\s*MT|NA/);
      const tiles = strip.locator('.rm-mb-stat');
      const tops = new Set(await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))));
      expect(tops.size, `${w} ${from}: one row`).toBe(1);
      const spill = await tiles.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
      expect(spill, `${w} ${from}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await strip.screenshot({ path: `${SHOTS}/hsm-defective-strip-${w}.png` });
  }
  expect(errors).toEqual([]);
});
