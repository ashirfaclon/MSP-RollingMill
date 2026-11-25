/**
 * RMD Asset Health, several bearings per gearbox (the plant's sheet, 25 Nov 2026): the Condition trends chart keeps a
 * bar per bearing, grouped by gearbox and numbered B1, B2 … under the axis; the Bearing temp drill-down draws a stand
 * with many bearings as one small chart per part under one legend.
 */
import { test, expect } from '@playwright/test';
const SHOTS = 'test-results/screenshots';

test('Condition trends: a bar per bearing, numbered per gearbox; the drill-down splits a stand by part', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1100 });
    await page.goto('/rmd/asset-health');
    await page.getByRole('button', { name: /Duration/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Select period' });
    // 24 Nov 2026: the plant's first entries with the added bearings.
    await dialog.getByLabel('Start Date').fill('2026-11-24');
    await dialog.getByLabel('End Date').fill('2026-11-24');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    const svg = page.locator('.brb-scroll svg');
    await expect(svg).toBeVisible({ timeout: 60_000 });
    const n = await svg.evaluate((el) => ({ bars: el.querySelectorAll('.brb-bar').length, numbers: el.querySelectorAll('.brb-brg').length, width: Math.round(el.getBoundingClientRect().width) }));
    console.log(w, JSON.stringify(n));
    // Every bearing its own bar; the gearboxes with several are numbered under the axis.
    expect(n.bars).toBeGreaterThan(74);   // 74 was every stand's bearing 1 only
    await expect(svg.locator('.brb-brg', { hasText: 'B5' })).toHaveCount(1);   // the intermill's reduction gear
    await expect(svg.locator('title', { hasText: /^Intermill · Reduction gear B4 NDE/ })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.ah-trends .ah-trend').last().screenshot({ path: `${SHOTS}/rmd-bearing-bars-${w}.png` });
  }
  // Drill-down: the intermill as one small chart per part, one legend.
  await page.getByRole('region', { name: 'Condition KPIs' }).getByRole('button', { name: /^Bearing temp/ }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('group', { name: 'Unit' }).getByRole('button', { name: 'Intermill', exact: true }).click();
  await expect(d.locator('.ah-part')).toHaveCount(3);   // flywheel, reduction gear, pinion gear (set 2 has no real entry yet)
  await expect(d.locator('.ah-part-legend')).toContainText('Bearing 5');
  await d.locator('.ah-part-head', { hasText: 'Reduction gear' }).click();
  await expect(d.locator('.ah-part--wide')).toHaveCount(1);
  await d.locator('.ah-trend').last().screenshot({ path: `${SHOTS}/rmd-bearing-trend-parts.png` });
  expect(errors).toEqual([]);
});
