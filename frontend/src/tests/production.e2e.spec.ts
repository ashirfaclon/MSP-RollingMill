/**
 * Production card + ERP-vs-Influx drawer, end to end against the running app and the real
 * ERP cache / historian. Skips itself on a machine without the plant connections.
 *
 * Reference figures were verified by hand on 30 Sep 2026 for the Hot Strip Mill (ERP division
 * S1 log sheet vs PROD_TRAN; Influx counter increases per 06:00 plant day).
 */
import { test as base, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SHOTS = 'test-results/screenshots';
/** The backend holds the plant connections and the ERP cache. */
const live = existsSync(path.resolve(process.cwd(), '../backend/.env')) && existsSync(path.resolve(process.cwd(), '../backend/data/erp-hsm-production.json'));

const test = base.extend<{ page: Page }>({
  page: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await provide(page);
    expect(errors, 'console errors').toEqual([]);
  },
});

test.describe.configure({ timeout: 120_000 });
test.skip(!live, 'needs backend/.env and a synced ERP cache');

/** Pick 22 → 28 Sep 2026 in the Duration filter. */
async function pickCustom(page: Page) {
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  // Plant dates 22 → 28 Sep = 22 Sep 06:00 → 29 Sep 06:00.
  await dialog.getByLabel('Start Date').fill('2026-09-22');
  await dialog.getByLabel('End Date').fill('2026-09-28');
  await dialog.getByRole('button', { name: 'Apply' }).click();
}

test('the Production card shows ERP and Influx production for the Duration filter period', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const card = page.getByRole('button', { name: 'Production', exact: true });
  // Default period is Today — Influx is live; the ERP is entered 1–2 days late: no ERP entry yet, and the card says so.
  await expect(card.locator('.rm-card-pair-item').nth(0)).toContainText('ERP');
  await expect(card.locator('.rm-card-pair-item').nth(1)).toContainText('Influx');
  await expect(card.locator('.rm-card-pair-item').nth(1)).toContainText(/\d[\d,]*\.\d/);
  await expect(card.locator('.rm-card-note')).toHaveText('ERP · No entries recorded yet');

  await pickCustom(page);
  // 22–28 Sep. ERP log sheet PRODUCTION_MT: 1,076.51.
  await expect(card.locator('.rm-card-pair-item').nth(0)).toContainText('1,076.5');
  // Influx counter reset events less noise: 216.80 + 155.00 + 174.05 + 116.57 + 131.95 + 181.34 + 165.37 = 1,141.08
  await expect(card.locator('.rm-card-pair-item').nth(1)).toContainText('1,141.1');
  // The ERP covers every day of the period: the note gives Influx − ERP, 1,141.08 − 1,076.51 = 64.57.
  await expect(card.locator('.rm-card-note')).toHaveText('Delta 64.6 MT');
  await card.screenshot({ path: `${SHOTS}/production-card.png` });
});

test('clicking the card opens the ERP-vs-Influx drawer on the dashboard period — totals, two lines, one table', async ({ page }) => {
  await page.goto('/hsm/visualization');
  await pickCustom(page);
  const card = page.getByRole('button', { name: 'Production', exact: true });
  await card.click();

  const drawer = page.getByRole('dialog', { name: 'Production · ERP vs Influx' });
  await expect(drawer).toBeVisible();
  // The dashboard's period (22–28 Sep), with no second period to choose from.
  await expect(drawer.getByRole('group', { name: 'Period' })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true');

  // Three totals — the same figures as the card.
  await expect(drawer.locator('.pd-stats')).toContainText('1,076.51');
  await expect(drawer.locator('.pd-stats')).toContainText('1,141.08');
  await expect(drawer.locator('.pd-stats')).toContainText('Delta');
  await expect(drawer.getByText('Days compared')).toHaveCount(0);

  const table = drawer.getByRole('table', { name: 'Production by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'ERP (MT)', 'Influx (MT)', 'Delta (MT)']);
  const row = (label: string) => table.getByRole('row', { name: new RegExp(`^${label}\\b`) });
  await expect(row('22 Sep')).toContainText('202.40');
  await expect(row('22 Sep')).toContainText('216.80');
  await expect(row('22 Sep')).toContainText('14.40');
  await expect(row('28 Sep')).toContainText('152.21');
  await expect(row('28 Sep')).toContainText('165.37');
  await expect(table.locator('tbody tr')).toHaveCount(7);
  await expect(table.locator('tfoot')).toContainText('1,076.51');

  // Two lines only (ERP, Influx); no reset-events table.
  await expect(drawer.locator('.pd-chart .highcharts-series-group path.highcharts-graph')).toHaveCount(2);
  await expect(drawer.getByRole('table', { name: 'Counter reset events' })).toHaveCount(0);

  // Source as boxes: the ERP table + filter and the Influx tag + filter, then the formula.
  const source = drawer.getByRole('region', { name: 'Data source' });
  await expect(source).toContainText("ATTR_CODE = 'PRODUCTION_MT'");
  await expect(source).toContainText("SERIES = 'L6P'");
  await expect(source).toContainText('Total_Production_Ton');
  await expect(source).toContainText("Unit = 'Finishing Mill'");
  await expect(drawer.getByRole('region', { name: 'Formula' }).locator('.pd-src-line')).toHaveText(['Delta = Influx − ERP  (days with both)']);
  await page.waitForTimeout(800);   // let the lines finish drawing in
  await drawer.screenshot({ path: `${SHOTS}/production-drawer-daily.png` });

  // Legend: hide Influx — it leaves the chart AND the tooltip (and so does the delta) — then show it again.
  const influx = drawer.getByRole('button', { name: /^Influx/ });
  await influx.click();
  await expect(influx).toHaveAttribute('aria-pressed', 'false');
  const plot = await drawer.locator('.pd-chart .highcharts-plot-background').boundingBox();
  await page.mouse.move(plot!.x + 5, plot!.y + 5);
  await page.mouse.move(plot!.x + plot!.width / 2, plot!.y + plot!.height / 2, { steps: 10 });
  await page.waitForTimeout(300);
  const tip = page.locator('.highcharts-tooltip-container').last();
  await expect(tip).toContainText('ERP:');
  await expect(tip).not.toContainText('Influx:');
  await expect(tip).not.toContainText('Delta:');
  await influx.click();
  await expect(influx).toHaveAttribute('aria-pressed', 'true');

  // Weekly groups the same days.
  await drawer.getByRole('button', { name: 'Weekly' }).click();
  await expect(table.locator('tbody tr').first()).toContainText('Week of');

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(card).toBeFocused();
});

test('drawer in the light theme', async ({ page }) => {
  await page.goto('/hsm/visualization');
  await page.getByRole('button', { name: 'Light theme' }).click();
  await page.getByRole('button', { name: 'Production', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Production · ERP vs Influx' });
  await expect(drawer.getByRole('table', { name: 'Production by period' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Weekly' }).click();
  await page.waitForTimeout(800);
  await drawer.screenshot({ path: `${SHOTS}/production-drawer-light.png` });
});

test('reset puts the global filter back to Today', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const reset = page.getByRole('button', { name: 'Reset' });
  await expect(reset).toBeDisabled();
  await pickCustom(page);
  await expect(page.getByRole('button', { name: /Duration/ })).toContainText('22 Sep');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page.getByRole('button', { name: /Duration/ })).toContainText('Today');
  await expect(reset).toBeDisabled();
});
