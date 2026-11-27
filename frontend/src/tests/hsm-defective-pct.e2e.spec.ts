/**
 * HSM Defective, CCM bypass, HSM bypass with their % (the user, 27 Nov 2026): each tile shows the MT and, beside it at the
 * same size, the ERP's own % — ROLLING_DEFECT_PERCENTAGE, CCM_BYPASS_PERCENTAGE, HSM_BYPASS_PERCENTAGE, as filed; over
 * several entries each weighted by what it is a % of (PRODUCTION_MT; TOTAL_CAST_QTY). The drill-down has the % as a stat, a column and a
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

test('HSM Defective, CCM bypass, HSM bypass: MT with its %, on the tiles and in the drill-downs', async ({ page }) => {
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
  // CCM / HSM bypass with their % of the total cast (the ERP's CCM_BYPASS_PERCENTAGE / HSM_BYPASS_PERCENTAGE rule):
  // Both 0.81 and 4.79 of 166.18 MT cast = 0.49 % / 2.88 %.
  const ccm = strip.locator('.rm-mb-stat', { hasText: 'CCM bypass' }).locator('.rm-mb-stat-v');
  const hsm = strip.locator('.rm-mb-stat', { hasText: 'HSM bypass' }).locator('.rm-mb-stat-v');
  await expect(ccm).toHaveText(/^0\.81\s*MT\s*·\s*0\.49\s*%$/);
  await expect(hsm).toHaveText(/^4\.79\s*MT\s*·\s*2\.88\s*%$/);
  // Online: exactly the ERP's stored figures for the day — defective 8.29, CCM bypass 0.505, HSM bypass 3 (of 159.79 cast).
  await rolling(page, 'Online');
  await expect(tile.locator('.rm-mb-stat-v')).toHaveText(/·\s*8\.29\s*%$/, { timeout: 60_000 });
  await expect(ccm).toHaveText(/·\s*0\.51\s*%$/);
  await expect(hsm).toHaveText(/·\s*3\s*%$/);
  // Offline: its own entries only — Feb 2026, 15.51 MT defective at the ERP's 23.97 % (weighted by production); the
  // bypasses are Online figures and are not shown under Offline.
  await period(page, '2026-02-01', '2026-02-28');
  await rolling(page, 'Offline');
  await expect(tile.locator('.rm-mb-stat-v')).toHaveText(/^15\.51\s*MT\s*·\s*23\.97\s*%$/, { timeout: 60_000 });
  await expect(strip.locator('.rm-mb-stat', { hasText: 'bypass' })).toHaveCount(0);
  await rolling(page, 'Online');
  await expect(tile.locator('.rm-mb-stat-v')).toHaveText(/^23\.69\s*MT\s*·\s*1\.04\s*%$/, { timeout: 60_000 });
  await expect(hsm).toHaveText(/^299\.1\s*MT\s*·\s*10\.03\s*%$/);
  await period(page, '2026-10-26', '2026-10-26');
  await rolling(page, 'Both');

  await tile.click();
  const d = page.getByRole('dialog', { name: /Defective · ERP log sheet/ });
  await expect(d.locator('.pd-stats')).toContainText('Defective %');
  await expect(d.getByRole('table', { name: 'Defective by period' }).locator('thead')).toContainText('Defective (%)');
  await expect(d.getByRole('table', { name: 'Defective by period' }).locator('tfoot')).toContainText('7.96');
  await expect(d.getByRole('region', { name: 'Formula' })).toContainText("Defective % = the ERP's ROLLING_DEFECT_PERCENTAGE of each entry, as filed");
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText('ROLLING_DEFECT_PERCENTAGE');
  await page.waitForTimeout(800);
  await d.screenshot({ path: `${SHOTS}/hsm-defective-drill.png` });
  await d.getByRole('button', { name: 'Close' }).click();
  // CCM bypass drill-down: read against the total cast, with the % stat, column and formula.
  await strip.locator('.rm-mb-stat', { hasText: 'CCM bypass' }).click();
  const c = page.getByRole('dialog', { name: /CCM bypass · ERP log sheet/ });
  const ct = c.getByRole('table', { name: 'CCM bypass by period' });
  await expect(ct.locator('thead')).toHaveText(/CCM bypass \(MT\)\s*CCM bypass \(%\)\s*Total cast \(MT\)/);
  await expect(ct.locator('tfoot')).toContainText('0.49');
  await expect(c.getByRole('region', { name: 'Formula' })).toContainText("CCM bypass % = the ERP's CCM_BYPASS_PERCENTAGE of each entry, as filed");
  await expect(c.getByRole('region', { name: 'Formula' })).toContainText('Several entries: each % weighted by TOTAL_CAST_QTY');
  await page.waitForTimeout(800);
  await c.screenshot({ path: `${SHOTS}/hsm-ccm-bypass-drill.png` });
  await c.getByRole('button', { name: 'Close' }).click();

  // A month: the ERP's % of each entry weighted by its production — Oct 2026 = 0.65 %.
  await period(page, '2026-10-01', '2026-10-31');
  await expect(tile.locator('.rm-mb-stat-v')).toHaveText(/·\s*0\.65\s*%$/, { timeout: 60_000 });

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
