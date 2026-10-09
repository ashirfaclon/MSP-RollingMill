/**
 * Wired KPIs and their drill-downs, end to end against the running app and the real ERP
 * cache / historian. Skips itself on a machine without the plant connections.
 *
 * Reference figures for 22–28 Sep 2026 were recomputed by hand from the synced ERP rows
 * (strip mill S1 log sheet): input 1,121.34 MT, production 1,076.51 MT, difference 44.83,
 * yield 96.00 %, billets 1,496, burning loss 14.84, end cut 19.07, miss-roll 10.92,
 * reject 0; 22 Sep billets 303 (ERP) / 302 (counter); size 358–360 × 2.50 produced 254.07.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SHOTS = 'test-results/screenshots';
/** The backend holds the plant connections and the ERP cache. */
const live = existsSync(path.resolve(process.cwd(), '../backend/.env')) && existsSync(path.resolve(process.cwd(), '../backend/data/erp-hsm-commercial.json'));

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

async function pickWeek(page: Page) {
  await page.goto('/hsm/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  // Plant dates 22 → 28 Sep = 22 Sep 06:00 → 29 Sep 06:00.
  await dialog.getByLabel('Start Date').fill('2026-09-22');
  await dialog.getByLabel('End Date').fill('2026-09-28');
  await dialog.getByRole('button', { name: 'Apply' }).click();
}

test('mass yield card and the material balance show the ERP log sheet for the period', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const yieldCard = page.getByRole('button', { name: 'Mass yield', exact: true });
  // Today: the ERP is entered 1–2 days late — stated, not guessed.
  await expect(yieldCard.locator('.rm-card-pair-item').nth(0)).toContainText('ERP');
  await expect(yieldCard.locator('.rm-card-pair-item').nth(1)).toContainText('Influx');
  await expect(yieldCard.locator('.rm-card-note')).toContainText('ERP');

  await pickWeek(page);
  // Before rejection, both sides. ERP: PRODUCTION_MT 1,076.51 ÷ INPUT_MT 1,121.34 = 96.00 %.
  await expect(yieldCard.locator('.rm-card-pair-item').nth(0)).toContainText('96.0');
  // Influx: net output 1,096.25 (counter 1,141.08 − by-products 44.83) ÷ input 1,138.38 = 96.30 %.
  await expect(yieldCard.locator('.rm-card-pair-item').nth(1)).toContainText('96.3');
  // ERP entered and losses booked for all 7 days: the note is Influx − ERP, 96.30 − 96.00.
  await expect(yieldCard.locator('.rm-card-note')).toHaveText('Delta 0.3 %');
  // Finished exit = the Production card's Influx figure: Σ Total_Production_Ton increases, 22–28 Sep.
  const exit = page.getByRole('button', { name: /Finished exit/ });
  await expect(exit).toContainText('1,141.1 MT');
  // No order link in the ERP: all production is Made To Stock — same figure as the Production card.
  await expect(page.getByRole('article', { name: 'Made To Stock', exact: true })).toContainText('1,141.1');
  const split = page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').first();
  await expect(split.locator('.rm-alloc-total')).toHaveText('1,141.1 MT');
  await expect(split).toContainText('Made To Stock1,141.1 MT');
  await expect(split).toContainText('Made To Order0.0 MT');

  const panel = page.locator('section.panel', { hasText: 'Material & operating balance' });
  // One click target for the whole balance; the figures inside are plain text.
  const mb = panel.getByRole('button', { name: 'Material balance, per day' });
  await expect(panel.getByRole('button')).toHaveCount(1);
  await expect(mb).toContainText('Billet input1,121.3 MT');
  await expect(mb).toContainText('Yield96.0%');
  await expect(mb).toContainText('Finished 1,076.5 MT');
  await expect(mb).toContainText('Mass difference 44.8 MT · 4.0% of input');
  await expect(mb).toContainText('1,496 in · 1,481 coils out');
  const losses = panel.locator('.rm-mb-legend');
  for (const [k, v] of [['Burning loss', '14.8 MT 1.3%'], ['End cut', '19.1 MT 1.7%'], ['Miss-roll', '10.9 MT 1.0%'], ['Reject', '0.0 MT 0.0%']]) {
    await expect(losses.locator('.rm-mb-link', { hasText: new RegExp(`^${k}`) })).toContainText(v);
  }
  await expect(panel.locator('.chip')).toHaveCount(0);   // no "Balances" chip
  // The bars are the balance drawn to scale: finished is 96.0 % of the input bar, and the
  // loss bar is the 4.0 % difference opened out — 14.8 + 19.1 + 10.9 + 0 = 44.8, so it fills.
  const widths = (sel: string) => panel.locator(sel).evaluateAll((els) => {
    const track = els[0].parentElement!.getBoundingClientRect().width;
    return els.map((e) => Math.round((e.getBoundingClientRect().width / track) * 1000) / 10);
  });
  const input = await widths('.rm-mb-bar--input .rm-mb-seg');
  expect(input[0]).toBeGreaterThan(95); expect(input[0]).toBeLessThan(97);
  expect(input[1]).toBeGreaterThan(3); expect(input[1]).toBeLessThan(5);
  const loss = await widths('.rm-mb-bar--loss .rm-mb-seg');
  expect(loss.length).toBe(4);                                       // nothing unaccounted on a balanced week
  expect(loss.reduce((a, b) => a + b, 0)).toBeGreaterThan(98);
  expect(Math.max(...loss)).toBe(loss[1]);                           // end cut is the biggest loss this week
  await expect(panel.getByRole('img', { name: /^Billet input 1,121\.3 MT: finished 1,076\.5 MT \(96\.0% yield\)/ })).toBeVisible();
  await page.locator('.rm-strip').screenshot({ path: `${SHOTS}/wired-kpi-strip.png` });
  await panel.screenshot({ path: `${SHOTS}/wired-material-balance.png` });
});

test('mass yield drawer: ERP and Influx on the dashboard period — totals, two lines, one table, source and formula', async ({ page }) => {
  await pickWeek(page);
  await page.getByRole('button', { name: 'Mass yield', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Mass yield · ERP vs Influx' });
  await expect(drawer).toBeVisible();
  // The dashboard's period, no other to choose from.
  await expect(drawer.getByRole('group', { name: 'Period' })).toHaveCount(0);

  // ERP 1,076.51 ÷ 1,121.34 = 96.00 %; Influx (1,141.08 − 44.83) ÷ 1,138.38 = 96.30 %; delta 0.30.
  const stats = drawer.locator('.pd-stats');
  for (const v of ['96.00', '96.30', '0.30']) await expect(stats).toContainText(v);
  const table = drawer.getByRole('table', { name: 'Mass yield by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'ERP (%)', 'Influx (%)', 'Delta (%)']);
  await expect(table.locator('tbody tr')).toHaveCount(7);
  for (const v of ['96.00', '96.30', '0.30']) await expect(table.locator('tfoot')).toContainText(v);
  // Two lines; the by-product and billet-size tables are gone.
  await expect(drawer.locator('.pd-chart .highcharts-series-group path.highcharts-graph')).toHaveCount(2);
  await expect(drawer.getByRole('table', { name: 'By-products by period' })).toHaveCount(0);
  await expect(drawer.getByRole('table', { name: 'Billet size events' })).toHaveCount(0);

  const source = drawer.getByRole('region', { name: 'Data source' });
  await expect(source).toContainText("ATTR_CODE = 'PRODUCTION_MT', 'INPUT_MT'");
  await expect(source).toContainText('Dicharged_Billet');
  await expect(source).toContainText('PROD_TRAN');
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('ERP yield = PRODUCTION_MT ÷ INPUT_MT × 100');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-yield.png` });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('material balance drawer: input, finished and the four losses per day, from one click', async ({ page }) => {
  await pickWeek(page);
  await page.getByRole('button', { name: 'Material balance, per day' }).click();
  const drawer = page.getByRole('dialog', { name: 'Material balance · ERP log sheet' });
  await expect(drawer).toBeVisible();
  // The dashboard's period, no other to choose from, and no view switch.
  await expect(drawer.getByRole('group', { name: 'Period' })).toHaveCount(0);
  await expect(drawer.getByRole('group', { name: 'View' })).toHaveCount(0);
  const stats = drawer.locator('.pd-stats');
  for (const v of ['1,121.3', '1,076.5', '44.8', '4.0% of input']) await expect(stats).toContainText(v);
  const table = drawer.getByRole('table', { name: 'Material balance by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'Input', 'Finished', 'Burning loss', 'End cut', 'Miss-roll', 'Reject', 'Unaccounted']);
  await expect(table.locator('tbody tr')).toHaveCount(7);
  // 14.8 + 19.1 + 10.9 + 0 = 44.8: the losses explain the difference, nothing unaccounted.
  for (const v of ['14.8', '19.1', '10.9', '0.0']) await expect(table.locator('tfoot')).toContainText(v);
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('Unaccounted = Mass difference − Losses');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-balance.png` });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('billets drawer: ERP input pieces against the Dicharged_Billet counter', async ({ page }) => {
  await pickWeek(page);
  // From the mill flow's billet infeed (the material balance no longer has its own door).
  await page.getByRole('button', { name: /^Billet infeed/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Billets · ERP vs Influx' });
  await expect(drawer).toBeVisible();
  const row = drawer.getByRole('table', { name: 'Billets by period' }).getByRole('row', { name: /^22 Sep\b/ });
  await expect(row).toContainText('303');
  await expect(row).toContainText('302');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-billets.png` });
});

test('mill mimic is live: billets today, stand groups, and the stands drawer', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const mimic = page.locator('section.panel', { hasText: 'Mill mimic' });
  await expect(mimic.getByRole('button', { name: /Billet infeed/ })).toContainText(/\d+ billets|NA/);
  await expect(mimic.getByText('Intermediate group')).toHaveCount(0);
  await expect(mimic.locator('.rm-dot')).toHaveCount(11);   // RM 1–5 + FM 1–6
  await mimic.screenshot({ path: `${SHOTS}/wired-mimic.png` });

  await mimic.getByRole('button', { name: /Finishing group/ }).click();
  // Opens on the group clicked, with no group switch inside.
  const drawer = page.getByRole('dialog', { name: 'Finishing group · FM 1–6' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Stand group' })).toHaveCount(0);
  await expect(drawer.getByRole('table', { name: 'Stand readings now' }).locator('tbody tr')).toHaveCount(6);
  // One line per stand, named plainly; no mill-speed line; no billets or speed stats.
  await expect(drawer.getByRole('group', { name: 'Show or hide series' }).getByRole('button')).toHaveText(['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6']);
  await expect(drawer.locator('.pd-stats')).not.toContainText('Billets today');
  await expect(drawer.locator('.pd-stats')).not.toContainText('Mill speed');
  await expect(drawer.getByRole('region', { name: 'Data source' })).toContainText("Unit = 'Finishing Mill'");
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-stands.png` });
  await page.keyboard.press('Escape');
  await mimic.getByRole('button', { name: /Roughing group/ }).click();
  const rough = page.getByRole('dialog', { name: 'Roughing group · RM 1–5' });
  await expect(rough.getByRole('table', { name: 'Stand readings now' }).locator('tbody tr')).toHaveCount(5);
  await expect(rough.getByRole('region', { name: 'Data source' })).toContainText('Motor_Curren5');
});

test('finished stock by size: the ERP stock ledger per size — a plain view, no drill-down', async ({ page }) => {
  await pickWeek(page);
  const panel = page.locator('section.panel', { hasText: 'Finished stock by size' });
  const first = panel.locator('.rm-size--stock').first();
  await expect(first).toContainText('358–360 × 2.80');
  await expect(first).toContainText('103.5 MT');
  // Counted to the period end; no opening stock in the ERP, so it is the change since go-live.
  await expect(panel.locator('.panel-sub')).toHaveText('ERP · at end of 28 Sep · since 30 Nov ’25');
  await expect(panel.getByText('With order')).toHaveCount(0);   // no series chips
  // Prime strip by default: 30 sizes in stock, drawn to one scale; the 25 below zero are counted, not drawn.
  const tabs = panel.getByRole('group', { name: 'Stock grade' });
  await expect(tabs.getByRole('button', { name: 'Prime · 30' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.rm-size--stock')).toHaveCount(30);
  const bars = await panel.locator('.rm-size-stack > i:nth-child(2)').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().width / e.parentElement!.getBoundingClientRect().width));
  expect(bars[0]).toBeCloseTo(1, 2);
  expect(bars[1]).toBeCloseTo(59.4 / 103.5, 1);
  await expect(panel.locator('.rm-sizes-foot')).toHaveCount(0);   // no summary line
  // Defective strip on its own tab: 15 sizes, 18.2 MT. Prime 119.1 + defective 18.2 = 137.3, the Free stock card.
  await tabs.getByRole('button', { name: 'Defective · 15' }).click();
  await expect(panel.locator('.rm-size--stock')).toHaveCount(15);
  await expect(panel.locator('.rm-size--stock').first()).toContainText('358–360 × 2.20');
  await tabs.getByRole('button', { name: 'Prime · 30' }).click();
  // Agrees with the Free stock card and the Order allocation block.
  await expect(page.getByRole('button', { name: 'Free stock', exact: true })).toContainText('137.3');
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').nth(1)).toContainText('137.3 MT');
  // The list scrolls inside the panel instead of stretching the row past the balance panel beside it.
  const balance = page.locator('section.panel', { hasText: 'Material & operating balance' });
  const [hSizes, hBalance] = await Promise.all([panel.evaluate((e) => e.getBoundingClientRect().height), balance.evaluate((e) => e.getBoundingClientRect().height)]);
  expect(Math.abs(hSizes - hBalance)).toBeLessThan(2);
  const scroller = panel.locator('.rm-sizes-scroll');
  expect(await scroller.evaluate((e) => e.scrollHeight > e.clientHeight && e.scrollWidth <= e.clientWidth)).toBe(true);
  await panel.screenshot({ path: `${SHOTS}/wired-stock-by-size.png` });

  // No drill-down: the only buttons are the two grade tabs.
  await expect(panel.getByRole('button')).toHaveCount(2);
});

test('order allocation: no open-orders chip', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const panel = page.locator('section.panel', { hasText: 'Order allocation' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: /Open orders/ })).toHaveCount(0);
});

test('finished stock: ERP stock ledger to the period end — one drawer, from Free stock and from Order allocation', async ({ page }) => {
  await pickWeek(page);
  const block = page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').nth(1);
  // Only the title and the total, no note.
  await expect(block).toHaveText(/^Finished stock-?\d[\d,]*\.\d MT$/);
  const total = (await block.locator('.rm-alloc-total').innerText()).replace(' MT', '');
  // Free stock and the Order allocation block open the same drawer, on the same figure.
  for (const open of [
    () => page.getByRole('button', { name: 'Free stock', exact: true }).click(),
    () => block.getByRole('button', { name: /Finished stock/ }).click(),
  ]) {
    await open();
    const d = page.getByRole('dialog', { name: 'Finished stock · ERP' });
    await expect(d.locator('.pd-stats')).toContainText(total);
    await d.getByRole('button', { name: 'Close Finished stock · ERP' }).click();
    await expect(d).toBeHidden();
  }
  await block.getByRole('button', { name: /Finished stock/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Finished stock · ERP' });
  // The dashboard's 7 days, by day; stock is the balance at the end of each.
  await expect(drawer.getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true');
  const table = drawer.getByRole('table', { name: 'Finished stock by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'Received (MT)', 'Issued (MT)', 'Stock at end (MT)']);
  await expect(table.locator('tbody tr')).toHaveCount(7);
  await expect(table.locator('tbody tr').last().locator('td').last()).toHaveText(total);
  // The old tables are gone.
  for (const n of ['Stock movements by type', 'Finished stock by size', 'ERP data source']) await expect(drawer.getByRole('table', { name: n })).toHaveCount(0);
  const src = drawer.getByRole('region', { name: 'Data source' });
  for (const t of ['ITEMTRAN_BODY', 'QTYRECD', 'QTYISSUED', 'FGYRDP', 'ITEMOPBAL_MAST', 'YROPQTY']) await expect(src).toContainText(t);
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('Stock = opening + received − issued');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-stock.png` });
});

test('running rate: Influx production ÷ running hours from billets, ERP rate beside it', async ({ page }) => {
  await pickWeek(page);
  // 22–28 Sep: 1,141.08 MT over 52.12 running hours = 21.89 TPH.
  const btn = page.getByRole('button', { name: /Running rate/ });
  await expect(btn).toContainText('21.89 TPH');
  await btn.click();
  const drawer = page.getByRole('dialog', { name: 'Running rate · ERP vs Influx' });
  await expect(drawer.getByRole('group', { name: 'Period' })).toHaveCount(0);
  const table = drawer.getByRole('table', { name: 'Running rate by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'ERP (TPH)', 'Influx (TPH)', 'Delta (TPH)']);
  await expect(table.locator('tfoot')).toContainText('21.89');
  await expect(table.locator('tbody tr')).toHaveCount(7);
  // The runs list and the extra ERP columns are gone.
  await expect(drawer.getByRole('table', { name: 'Mill runs' })).toHaveCount(0);
  await expect(drawer.locator('.pd-stats')).toContainText('Delta');
  const src = drawer.getByRole('region', { name: 'Data source' });
  for (const t of ['Dicharged_Billet', 'Total_Production_Ton', 'NET_RUNNING_HRS']) await expect(src).toContainText(t);
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('ERP rate = PRODUCTION_MT ÷ NET_RUNNING_HRS');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-running-rate.png` });
});

test('power consumption: the logbook form summed by the date entered, entry by entry in the drawer', async ({ page }) => {
  await pickWeek(page);
  // 22–28 Sep: Σ POWER_CONSUMED of all 62 entries of "Electrical HSM → Power Consumption" = 174,916.99 kWh.
  const card = page.getByRole('button', { name: 'Power consumption', exact: true });
  await expect(card.locator('.rm-card-value')).toContainText('174.92', { timeout: 60_000 });
  // Specific energy = 174,916.99 kWh ÷ 1,141.08 MT (the Production card's Total) = 153.29 kWh/MT.
  await expect(page.getByRole('button', { name: 'Specific energy', exact: true }).locator('.rm-card-value')).toContainText('153.3');
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Power consumption · logbook' });
  // Seven days: grouped by day.
  await expect(drawer.getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true');
  const byDate = drawer.getByRole('table', { name: 'Power by period' });
  await expect(byDate.locator('thead th')).toHaveText(['Period', 'BILLET HEATER VCB-03', 'FINISHING VCB-02', 'ROUGHING VCB-01', 'Total (kWh)']);
  await expect(byDate.getByRole('row', { name: /^22 Sep/ })).toContainText('11,981.7');
  await expect(byDate.locator('tfoot')).toContainText('1,74,917.0');
  // Total and one figure per meter; specific energy lives in its own drawer.
  await expect(drawer.locator('.pd-stats')).toContainText('1,74,917.0');
  await expect(drawer.locator('.pd-stats')).not.toContainText('Specific energy');
  // One stacked column per meter.
  await expect(drawer.getByRole('group', { name: 'Show or hide series' }).getByRole('button')).toHaveText(['BILLET HEATER VCB-03', 'FINISHING VCB-02', 'ROUGHING VCB-01']);
  // Weekly (weeks start Monday): 22–27 Sep and 28 Sep — 1,74,917.0 − 28,298.0 = 1,46,619.0, then 28,298.0.
  await drawer.getByRole('button', { name: 'Weekly' }).click();
  await expect(byDate.locator('tbody tr')).toHaveCount(2);
  await expect(byDate.locator('tbody tr').nth(0)).toContainText('Week of 21 Sep');
  await expect(byDate.locator('tbody tr').nth(0)).toContainText('1,46,619.0');
  await expect(byDate.locator('tbody tr').nth(1)).toContainText('28,298.0');
  // Entries as filled, one date at a time — latest first; 23 Sep is short one reading (8 of 9).
  const entries = drawer.getByRole('table', { name: 'Logbook power entries' });
  await expect(drawer.locator('.pd-entries-date')).toHaveText('28 Sep · 9');
  await expect(entries.locator('tbody tr')).toHaveCount(9);
  for (let i = 0; i < 5; i++) await drawer.getByRole('button', { name: 'Earlier date' }).click();
  await expect(drawer.locator('.pd-entries-date')).toHaveText('23 Sep · 8');
  await expect(entries.locator('tbody tr')).toHaveCount(8);
  await expect(drawer.getByRole('region', { name: 'Data source' })).toContainText('POWER_CONSUMED');
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('Power (MWh) = Power (kWh) ÷ 1000');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-power.png` });
  await page.keyboard.press('Escape');

  // Specific energy opens its own drawer: power ÷ Influx production.
  await page.getByRole('button', { name: 'Specific energy', exact: true }).click();
  const se = page.getByRole('dialog', { name: 'Specific energy · power ÷ production' });
  await expect(se.locator('.pd-stats')).toContainText('153.3');
  // One line: no legend to toggle.
  await expect(se.getByRole('group', { name: 'Show or hide series' })).toHaveCount(0);
  await expect(se.getByRole('table', { name: 'Specific energy by period' }).locator('tfoot')).toContainText('1,141.1');
  await expect(se.getByRole('region', { name: 'Formula' })).toContainText('Specific energy = Power (kWh) ÷ Influx production (MT)');
  await page.waitForTimeout(700);
  await se.screenshot({ path: `${SHOTS}/drill-specific-energy.png` });
});

test('production by shift: targets from the rolling plan as filled, plan gap over the planned days', async ({ page }) => {
  await page.goto('/hsm/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const panel = page.locator('.rm-flip-face--front section.panel');
  // Plan for 1–6 Oct (7–8 Oct have none): 1,203 MT, all written as Day shift.
  await expect(panel.locator('.chip')).toHaveText('Plan 1,203 MT');
  await expect(panel.locator('.panel-sub')).toHaveText('Plan covers 6 of 8 days · gap over those');
  // Output: the Production card's 1–8 Oct figure split by where the counter ticked — mostly at night.
  await expect(panel.locator('.rm-shift-val')).toHaveText(['329.2 MT / 1,203', '1,143.3 MT / 0']);
  // Gap = 1,203 − production on 1–6 Oct (1,163.31) = 39.69 → 39.7 MT short.
  await expect(panel).toContainText('39.7 MT');
  // Compliance over the planned days: Day 323.2 ÷ 1,203 = 26.9 %; Night has a 0 target → NA.
  await expect(panel.locator('.rm-shift-comp')).toHaveText(['26.9%', 'NA']);
  await panel.screenshot({ path: `${SHOTS}/wired-shift-plan.png` });

  // The toggle turns the card over to the whole day: one bar, 1,163.31 ÷ 1,203 = 96.7 %.
  const flip = page.locator('.rm-flip');
  await panel.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'Whole day' }).click();
  await expect(flip).toHaveClass(/is-flipped/);
  await expect(page.locator('.rm-flip-face--front')).toHaveAttribute('aria-hidden', 'true');
  const back = page.locator('.rm-flip-face--back section.panel');
  await expect(back.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'Whole day' })).toHaveAttribute('aria-pressed', 'true');
  await expect(back.locator('.rm-shift-name')).toHaveText(['Total']);
  await expect(back.locator('.rm-shift-val')).toHaveText(['1,472.5 MT']);
  await expect(back.locator('.rm-shift-comp')).toHaveText(['96.7%']);
  await page.waitForTimeout(700);   // the turn
  await back.screenshot({ path: `${SHOTS}/wired-shift-whole-day.png` });
  // The drill-down follows the view: whole day, with compliance per day.
  await back.getByRole('button', { name: 'Whole-day production, plan vs actual per day' }).click();
  const dd = page.getByRole('dialog', { name: 'Production · whole day · plan vs actual' });
  await expect(dd).toBeVisible();
  const dt = dd.getByRole('table', { name: 'Whole-day production by period' });
  await expect(dt.locator('thead th')).toHaveText(['Period', 'Output', 'Target', 'Compliance', 'Plan gap']);
  // 1 Oct: 134.4 of 203 → 66.2 %, gap 68.6.
  const d1 = dt.getByRole('row', { name: /^1 Oct/ });
  for (const v of ['134.4', '203.0', '66.2%', '68.6']) await expect(d1).toContainText(v);
  // 7–8 Oct have no plan: target —, compliance NA.
  await expect(dt.getByRole('row', { name: /^8 Oct/ })).toContainText('NA');
  for (const v of ['1,472.5', '1,203.0', '96.7%', '39.7']) await expect(dt.locator('tfoot')).toContainText(v);
  await expect(dd.getByRole('region', { name: 'Formula' })).toContainText('Compliance = production ÷ plan × 100');
  await page.waitForTimeout(700);
  await dd.screenshot({ path: `${SHOTS}/drill-shift-whole-day.png` });
  await page.keyboard.press('Escape');
  await expect(dd).toBeHidden();
  // And back again.
  await back.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'By shift' }).click();
  await expect(flip).not.toHaveClass(/is-flipped/);
});

test('production by shift: the bars open plan vs actual per shift, per day', async ({ page }) => {
  await page.goto('/hsm/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-06');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'Production by shift, plan vs actual per day' }).click();
  const drawer = page.getByRole('dialog', { name: 'Production by shift · plan vs actual' });
  await expect(drawer).toBeVisible();
  const table = drawer.getByRole('table', { name: 'Production by shift by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'Day output', 'Day target', 'Night output', 'Night target', 'Plan gap']);
  await expect(table.locator('tbody tr')).toHaveCount(6);
  // 1 Oct: plan 203 MT, all on Day; production 134.4 → gap 68.6.
  const oct1 = table.getByRole('row', { name: /^1 Oct/ });
  await expect(oct1).toContainText('203.0');
  await expect(oct1).toContainText('68.6');
  // Plan 1,203 over 1–6 Oct.
  await expect(table.locator('tfoot')).toContainText('1,203.0');
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('Plan gap = plan − production');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-shift-plan.png` });
  await page.keyboard.press('Escape');
  // Plan gap opens the same drawer.
  await page.getByRole('button', { name: /^Plan gap/ }).click();
  await expect(drawer).toBeVisible();
});
