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
const live = existsSync(path.resolve(process.cwd(), '.env.local')) && existsSync(path.resolve(process.cwd(), 'data/erp-hsm-production.json'));

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
test.skip(!live, 'needs .env.local and a synced ERP cache');

/** Pick 22 → 28 Sep 2026 in the Duration filter. */
async function pickCustom(page: Page) {
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  // Plant dates 22 → 28 Sep = 22 Sep 06:00 → 29 Sep 06:00.
  await dialog.getByLabel('Start Date').fill('2026-09-22');
  await dialog.getByLabel('End Date').fill('2026-09-28');
  await dialog.getByRole('button', { name: 'Apply' }).click();
}

test('the Production card shows the Influx counter total for the Duration filter period', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const card = page.getByRole('button', { name: 'Production', exact: true });
  // Default period is Today — live from the counter, counting up since 06:00.
  await expect(card).toContainText(/\d[\d,]*\.\d/);
  await expect(card).toContainText('Influx');

  await pickCustom(page);
  // 22–28 Sep, counter reset events less noise: 216.80 + 155.00 + 174.05 + 116.57 + 131.95 + 181.34 + 165.37 = 1,141.08
  await expect(card).toContainText('1,141.1');
  await expect(card).toContainText('Influx · 7 days');
  await card.screenshot({ path: `${SHOTS}/production-card.png` });
});

test('clicking the card opens the ERP-vs-Influx drawer on 21 Sep → today, daily', async ({ page }) => {
  await page.goto('/hsm/visualization');
  await pickCustom(page);
  const card = page.getByRole('button', { name: 'Production', exact: true });
  await card.click();

  const drawer = page.getByRole('dialog', { name: 'Production · ERP vs Influx' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: /21 Sep → today/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(drawer.getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true');

  const table = drawer.getByRole('table', { name: 'Production by period' });
  const row = (label: string) => table.getByRole('row', { name: new RegExp(`^${label}\\b`) });
  await expect(row('22 Sep')).toContainText('202.40');
  await expect(row('22 Sep')).toContainText('216.80');
  await expect(row('22 Sep')).toContainText('14.40');
  await expect(row('28 Sep')).toContainText('152.21');
  await expect(row('28 Sep')).toContainText('165.37');
  // 21 Sep: the counter only started at 12:47 — no variance for a part day.
  await expect(row('21 Sep')).toContainText('180.68');
  await expect(row('21 Sep').locator('td').nth(3)).toHaveText('—');

  await expect(drawer.locator('.pd-chart .highcharts-series-group path.highcharts-graph')).toHaveCount(3);

  // Reset events: 25 Sep is three events (3.24 + 1.62 + 114.95); the first is 4 noise ticks (no
  // billet behind them, 3.24 removed), so the day counts 1.62 + 114.95 = 116.57.
  const events = drawer.getByRole('table', { name: 'Counter reset events' });
  const d25 = events.getByRole('row', { name: /^25 Sep · plant day total, 3 events/ });
  await expect(d25).toContainText('116.57');
  await expect(events.locator('tbody')).toContainText('− 3.24');
  for (const v of ['170.81', '174.05', '3.24', '1.62', '114.95']) await expect(events.locator('tbody')).toContainText(v);
  await page.waitForTimeout(800);   // let the lines finish drawing in
  await drawer.screenshot({ path: `${SHOTS}/production-drawer-daily.png` });
  await drawer.locator('.pd-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await drawer.screenshot({ path: `${SHOTS}/production-drawer-daily-table.png` });
  await drawer.locator('.pd-body').evaluate((el) => { el.scrollTop = 0; });

  // Legend: hide Influx, then show it again.
  const influx = drawer.getByRole('button', { name: /Influx · Total_Production_Ton/ });
  await influx.click();
  await expect(influx).toHaveAttribute('aria-pressed', 'false');
  await expect(drawer.locator('.pd-chart .highcharts-series-group > .highcharts-series-1:not(.highcharts-markers)')).toHaveAttribute('visibility', 'hidden');
  await influx.click();
  await expect(influx).toHaveAttribute('aria-pressed', 'true');

  // Weekly: the week of 21 Sep compares 6 full days (21 Sep is a part day).
  await drawer.getByRole('button', { name: 'Weekly' }).click();
  await expect(row('Week of 21 Sep')).toContainText('6/7');
  await drawer.getByRole('button', { name: 'Monthly' }).click();
  await expect(row('Sep 2026')).toBeVisible();

  // The Duration filter's own period: 22–28 Sep.
  await drawer.getByRole('button', { name: 'Daily' }).click();
  await drawer.getByRole('button', { name: /Duration filter/ }).click();
  await expect(table.locator('tfoot')).toContainText('1,076.51');
  await expect(table.locator('tfoot')).toContainText('7/7');

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
