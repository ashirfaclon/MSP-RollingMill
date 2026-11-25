/**
 * RMS Finished stock by size, prime and defective (the user, 25 Nov 2026): as HSM's prime / subprime — one bar per
 * section with the defective part after the prime, and All / Prime / Defective tabs. RMD and LSM keep no tabs.
 */
import { test, expect } from '@playwright/test';
const SHOTS = 'test-results/screenshots';

test('RMS stock by size: All / Prime / Defective; RMD and LSM unchanged', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const panel = page.locator('section.panel', { hasText: 'Finished stock by size' });
  const total = () => panel.locator('.rm-sizes-total b').innerText().then((t) => Number(t.replace(/[^\d.]/g, '')));
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto('/rms/visualization');
    const tabs = panel.getByRole('group', { name: 'Stock grade' });
    await expect(tabs.getByRole('button')).toHaveText(['All', 'Prime', 'Defective'], { timeout: 60_000 });
    await expect(panel.locator('.rm-sizes-legend')).toContainText('Defective');
    const all = await total();
    await tabs.getByRole('button', { name: 'Prime' }).click();
    const prime = await total();
    await tabs.getByRole('button', { name: 'Defective' }).click();
    const defective = await total();
    console.log(w, { all, prime, defective });
    expect(defective).toBeGreaterThan(0);
    expect(Math.abs(prime + defective - all)).toBeLessThan(1);   // the grades add up to the ERP's total
    await expect(panel.locator('.rm-size--subprime').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.screenshot({ path: `${SHOTS}/rms-stock-defective-${w}.png` });
    await tabs.getByRole('button', { name: 'All' }).click();
    await panel.screenshot({ path: `${SHOTS}/rms-stock-all-${w}.png` });
  }
  // A section's drill-down marks each SKU's grade.
  await panel.locator('.rm-size').filter({ hasText: /^MC 300/ }).first().click();
  const d = page.getByRole('dialog');
  await expect(d.locator('thead')).toContainText('Grade');
  await expect(d.locator('tbody')).toContainText('Defective');
  await page.keyboard.press('Escape');
  for (const mill of ['rmd', 'lsm']) {
    await page.goto(`/${mill}/visualization`);
    await expect(panel.locator('.rm-size').first()).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByRole('group', { name: 'Stock grade' })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
