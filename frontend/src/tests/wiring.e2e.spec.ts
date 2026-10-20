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
  // Today: the ERP is entered 1–2 days late — no note about it.
  await expect(yieldCard.locator('.rm-card-pair-item').nth(0)).toContainText('ERP');
  await expect(yieldCard.locator('.rm-card-pair-item').nth(1)).toContainText('Influx');
  await expect(yieldCard.locator('.rm-card-note')).toHaveText('');

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
  for (const [k, v] of [['Burning loss', '14.8 MT 1.3%'], ['End cut', '19.1 MT 1.7%'], ['Miss-roll', '10.9 MT 1.0%']]) {
    await expect(losses.locator('.rm-mb-link', { hasText: new RegExp(`^${k}`) })).toContainText(v);
  }
  // Reject is 0 for the period, so it isn't listed at all.
  await expect(losses.locator('.rm-mb-link')).toHaveCount(3);
  await expect(losses).not.toContainText('Reject');
  await expect(panel.locator('.chip')).toHaveCount(0);   // no "Balances" chip
  // The bars are the balance drawn to scale: finished is 96.0 % of the input bar, and the
  // loss bar is the 4.0 % difference opened out — 14.8 + 19.1 + 10.9 = 44.8, so it fills.
  const widths = (sel: string) => panel.locator(sel).evaluateAll((els) => {
    const track = els[0].parentElement!.getBoundingClientRect().width;
    return els.map((e) => Math.round((e.getBoundingClientRect().width / track) * 1000) / 10);
  });
  const input = await widths('.rm-mb-bar--input .rm-mb-seg');
  expect(input[0]).toBeGreaterThan(95); expect(input[0]).toBeLessThan(97);
  expect(input[1]).toBeGreaterThan(3); expect(input[1]).toBeLessThan(5);
  const loss = await widths('.rm-mb-bar--loss .rm-mb-seg');
  expect(loss.length).toBe(3);                                       // reject 0 → no segment; nothing unaccounted
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

test('finished stock by size: the plant\'s stock query per size — a plain view, no drill-down', async ({ page }) => {
  await pickWeek(page);
  const panel = page.locator('section.panel', { hasText: 'Finished stock by size' });
  const first = panel.locator('.rm-size--stock').first();
  await expect(first).toContainText('358–360 × 2.80');
  await expect(first).toContainText('113.8 MT');
  // Counted to the period end over the whole ledger (it carries the opening): true stock, no "since" caveat.
  await expect(panel.locator('.panel-sub')).toHaveText('ERP · at end of 28 Sep');
  await expect(panel.getByText('With order')).toHaveCount(0);   // no series chips
  // Prime strip by default: 49 sizes in stock, drawn to one scale; none below zero.
  const tabs = panel.getByRole('group', { name: 'Stock grade' });
  await expect(tabs.getByRole('button', { name: 'Prime · 49' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.rm-size--stock')).toHaveCount(49);
  const bars = await panel.locator('.rm-size-stack > i:nth-child(2)').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().width / e.parentElement!.getBoundingClientRect().width));
  expect(bars[0]).toBeCloseTo(1, 2);
  expect(bars[1]).toBeCloseTo(76.2 / 113.8, 1);
  await expect(panel.locator('.rm-sizes-foot')).toHaveCount(0);   // no summary line
  // Defective strip on its own tab: 17 sizes, 48.1 MT. Prime 749.4 + defective 48.1 = 797.5, the Free stock card.
  await tabs.getByRole('button', { name: 'Defective · 17' }).click();
  await expect(panel.locator('.rm-size--stock')).toHaveCount(17);
  await expect(panel.locator('.rm-size--stock').first()).toContainText('358–360');
  await tabs.getByRole('button', { name: 'Prime · 49' }).click();
  // Agrees with the Free stock card and the Order allocation block.
  await expect(page.getByRole('button', { name: 'Free stock', exact: true })).toContainText('797.5');
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').nth(1)).toContainText('797.5 MT');
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
  // The title and the total, no note; then the split as the cards have it: with order 0, all of it free.
  await expect(block).toHaveText(/^Finished stock-?\d[\d,]*\.\d MTStock with order\s*0\.0 MTFree stock\s*-?\d[\d,]*\.\d MT$/);
  const total = (await block.locator('.rm-alloc-total').innerText()).replace(' MT', '');
  await expect(block.locator('.rm-legend')).toContainText(new RegExp(`Free stock\\s*${total.replace(/[.,]/g, '\\$&')} MT`));
  // The bar, like Production's: all of it free.
  await expect(block.getByRole('img', { name: /^Finished stock .* with order 0\.0 MT, free / })).toBeVisible();
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
  for (const t of ['ITEMTRAN_BODY', 'QTYRECD', 'QTYISSUED', "DIV_CODE = 'S1'", "ITEM_NATURE = 'FG'", 'STOR1P', 'Z8']) await expect(src).toContainText(t);
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('Stock = Σ QTYRECD − Σ QTYISSUED of every ledger entry');
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('first entry (1 Apr 2025)');
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
  // Plan for 1–8 Oct: 1,592 MT, all written as Day shift. Every day is planned, so no coverage note.
  await expect(panel.locator('.chip')).toHaveText('Plan 1,592 MT');
  await expect(panel.locator('.panel-sub')).toHaveCount(0);
  // Output: the Production card's 1–8 Oct figure split by where the counter ticked — mostly at night.
  await expect(panel.locator('.rm-shift-val')).toHaveText(['329.2 MT / 1,592', '1,143.3 MT / 0']);
  // Gap = production on 1–8 Oct (1,472.47) − 1,592 = −119.53: 119.5 MT short — shown without a sign.
  await expect(panel).toContainText('119.5 MT');
  await expect(panel).not.toContainText('-119.5');
  // Compliance over the planned days: Day 329.2 ÷ 1,592 = 20.7 %; Night has a 0 target → NA.
  await expect(panel.locator('.rm-shift-comp')).toHaveText(['20.7%', 'NA']);
  await panel.screenshot({ path: `${SHOTS}/wired-shift-plan.png` });

  // The toggle turns the card over to the whole day: one bar, 1,472.47 ÷ 1,592 = 92.5 %.
  const flip = page.locator('.rm-flip');
  await panel.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'Whole day' }).click();
  await expect(flip).toHaveClass(/is-flipped/);
  await expect(page.locator('.rm-flip-face--front')).toHaveAttribute('aria-hidden', 'true');
  const back = page.locator('.rm-flip-face--back section.panel');
  await expect(back.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'Whole day' })).toHaveAttribute('aria-pressed', 'true');
  await expect(back.locator('.rm-shift-name')).toHaveText(['Total']);
  await expect(back.locator('.rm-shift-val')).toHaveText(['1,472.5 MT']);
  await expect(back.locator('.rm-shift-comp')).toHaveText(['92.5%']);
  await page.waitForTimeout(700);   // the turn
  await back.screenshot({ path: `${SHOTS}/wired-shift-whole-day.png` });
  // The drill-down follows the view: whole day, with compliance per day.
  await back.getByRole('button', { name: 'Whole-day production, plan vs actual per day' }).click();
  const dd = page.getByRole('dialog', { name: 'Production · whole day · plan vs actual' });
  await expect(dd).toBeVisible();
  const dt = dd.getByRole('table', { name: 'Whole-day production by period' });
  await expect(dt.locator('thead th')).toHaveText(['Period', 'Output', 'Target', 'Compliance', 'Plan gap']);
  // 1 Oct: 134.4 of 140 → 96.0 %, gap −5.6.
  const d1 = dt.getByRole('row', { name: /^1 Oct/ });
  for (const v of ['134.4', '140.0', '96.0%', '5.6']) await expect(d1).toContainText(v);
  await expect(d1).not.toContainText('-5.6');
  // 8 Oct: 203.3 of 184 → 110.5 %.
  const d8 = dt.getByRole('row', { name: /^8 Oct/ });
  for (const v of ['203.3', '184.0', '110.5%']) await expect(d8).toContainText(v);
  for (const v of ['1,472.5', '1,592.0', '92.5%', '119.5']) await expect(dt.locator('tfoot')).toContainText(v);
  await expect(dt.locator('tfoot')).not.toContainText('-119.5');
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
  // 1 Oct: plan 140 MT, all on Day; production 134.4 → gap −5.6.
  const oct1 = table.getByRole('row', { name: /^1 Oct/ });
  await expect(oct1).toContainText('140.0');
  await expect(oct1).toContainText('5.6');
  await expect(oct1).not.toContainText('-5.6');
  // Plan 1,224 over 1–6 Oct.
  await expect(table.locator('tfoot')).toContainText('1,224.0');
  await expect(drawer.getByRole('region', { name: 'Formula' })).toContainText('Plan gap = production − plan');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-shift-plan.png` });
  await page.keyboard.press('Escape');
  // Plan gap opens the same drawer.
  await page.getByRole('button', { name: /^Plan gap/ }).click();
  await expect(drawer).toBeVisible();
});

test('RMD: mass yield from the ERP log sheet (Prime + SL ÷ INPUT_MT); billets in from Influx; power from the VCB forms', async ({ page }) => {
  await page.goto('/rmd/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  // RMD's day is 08:00 → 08:00 IST (shifts 08–20, 20–08) — the filter says so.
  await expect(page.getByRole('button', { name: /Duration/ })).toContainText('1 Oct 08:00 IST → 9 Oct 08:00 IST');
  // Mass yield, 1–8 Oct: Σ PRODUCT_PRIME_SLENGTH_MT 1,689.86 ÷ Σ INPUT_MT 1,752.03 = 96.45 %.
  const yieldCard = page.getByRole('button', { name: 'Mass yield', exact: true });
  await expect(yieldCard.locator('.rm-card-value')).toContainText('96.5');
  await expect(yieldCard.locator('.rm-card-note')).toHaveText('');
  await yieldCard.click();
  const y = page.getByRole('dialog', { name: 'Mass yield · ERP log sheet' });
  for (const v of ['96.45', '1,752.03', '1,689.86']) await expect(y.locator('.pd-stats')).toContainText(v);
  const table = y.getByRole('table', { name: 'Mass yield by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'Billet input (MT)', 'Prime + SL (MT)', 'Mass yield (%)']);
  await expect(table.locator('tbody tr')).toHaveCount(8);
  // 7 Oct: 200.12 ÷ 209.76 = 95.40 %.
  for (const v of ['209.76', '200.12', '95.40']) await expect(table.getByRole('row', { name: /^7 Oct/ })).toContainText(v);
  await expect(y.getByRole('region', { name: 'Data source' })).toContainText("USER_CODE = 'FA-SKJ'");
  await expect(y.getByRole('region', { name: 'Formula' })).toContainText('Mass yield = PRODUCT_PRIME_SLENGTH_MT ÷ INPUT_MT × 100');
  await expect(y.locator('.highcharts-legend')).toHaveCount(0);   // one series, no legend
  await page.waitForTimeout(700);
  await y.screenshot({ path: `${SHOTS}/rmd-drill-yield.png` });
  await page.keyboard.press('Escape');
  // BILLET_COUNT increases per RMD day: M1 3,173 + M2 3,021 = 6,194 over 1–8 Oct — the material balance's billets.
  await expect(page.locator('section.panel', { hasText: 'Material & operating balance' }).locator('.rmd-mb-pieces')).toContainText('6,194 in');

  // Power: only the 16 Sep readings exist so far — VCB 1 18,022.3 + VCB 2 8,506.7 + VCB 3 4,441.6.
  await page.getByRole('button', { name: /Duration/ }).click();
  await dialog.getByLabel('Start Date').fill('2026-09-14');
  await dialog.getByLabel('End Date').fill('2026-09-20');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const power = page.getByRole('button', { name: 'Power consumption', exact: true });
  await expect(power.locator('.rm-card-value')).toContainText('30.97', { timeout: 60_000 });
  await power.click();
  const p = page.getByRole('dialog', { name: 'Power consumption · logbook' });
  await expect(p.getByRole('table', { name: 'Power by period' }).locator('thead th')).toHaveText(['Period', 'VCB 1', 'VCB 2', 'VCB 3', 'Total (kWh)']);
  await expect(p.getByRole('region', { name: 'Data source' })).toContainText('Power Reading VCB 1, VCB 2, VCB 3');
  // No logbook shift on the dashboard (a "General" shift would only confuse).
  await expect(p.getByRole('table', { name: 'Logbook power entries' }).locator('thead th')).toHaveText(['Meter', 'Previous reading', 'Present reading', 'Power consumed (kWh)']);
  await page.waitForTimeout(700);
  await p.screenshot({ path: `${SHOTS}/rmd-drill-power.png` });
});

test('RMD mill flow: route / diverter and finishing open their points, live, with source and formula', async ({ page }) => {
  await page.goto('/rmd/visualization');
  const mimic = page.getByRole('list', { name: 'Mill process flow' });
  await mimic.getByRole('button', { name: /Route \/ diverter/ }).click();
  const route = page.getByRole('dialog', { name: 'Route / diverter · L1 S1–S8, L2 S1–S6' });
  await expect(route.getByRole('table', { name: 'Running status now' }).locator('tbody tr')).toHaveCount(14);
  await expect(route.getByRole('region', { name: 'Data source' })).toContainText("Unit = 'CR Mill1/2'");
  await expect(route.getByRole('region', { name: 'Formula' })).toContainText('On = latest status 1, read in the last 15 min');
  await page.waitForTimeout(700);
  await route.screenshot({ path: `${SHOTS}/rmd-drill-route.png` });
  await page.keyboard.press('Escape');

  await mimic.getByRole('button', { name: /Finishing group/ }).click();
  const fin = page.getByRole('dialog', { name: 'Finishing group · line 1 and line 2' });
  const rows = fin.getByRole('table', { name: 'Running status now' }).locator('tbody tr');
  await expect(rows).toHaveCount(10);
  await expect(fin.getByRole('region', { name: 'Data source' })).toContainText("Unit = 'Line-2', Group = 'General'");
  await page.keyboard.press('Escape');

  // Billet infeed opens billets in per line (no yield in this view).
  await mimic.getByRole('button', { name: /Billet infeed/ }).click();
  const inf = page.getByRole('dialog', { name: 'Billet infeed · Influx' });
  await expect(inf.locator('.pd-stats')).not.toContainText('Mass yield');
  await expect(inf.getByRole('table', { name: 'Billets in by period' })).toBeVisible();
  await expect(inf.getByRole('region', { name: 'Data source' })).toContainText("_measurement = 'TMT-RMD'");
});

test('RMD: production and losses from the ERP log sheet (FA-SKJ), and what they feed', async ({ page }) => {
  await page.goto('/rmd/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  // The two daily declarations as two cards, no delta:
  // Σ PRODUCT_PRIME_SLENGTH_MT, 1–8 Oct = 1,689.86 MT (7 Oct: 96.34 + 103.78 = 200.12);
  // Σ FINISH_PRODUCT_PRIME_MT, 1–8 Oct = 1,668.19 MT (7 Oct: 95.41 + 101.43 = 196.84).
  const card = page.getByRole('button', { name: 'Production · Prime + SL', exact: true });
  const prime = page.getByRole('button', { name: 'Production · Prime', exact: true });
  await expect(card.locator('.rm-card-value')).toContainText('1,689.9');
  await expect(prime.locator('.rm-card-value')).toContainText('1,668.2');
  await page.locator('.rm-strip').screenshot({ path: `${SHOTS}/rmd-production-card.png` });
  // Everything else stays on PRODUCT_PRIME_SLENGTH_MT.
  await expect(page.getByRole('list', { name: 'Mill process flow' }).getByRole('button', { name: /Finished exit/ })).toContainText('1,689.9 MT');
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-total').first()).toHaveText('1,689.9 MT');
  // Running rate now calculates: production ÷ running hours.
  await expect(page.locator('.rm-flip-face--front .rm-foot')).toContainText(/Running rate\s*\d+\.\d{2} TPH/);

  await card.click();
  const prod = page.getByRole('dialog', { name: 'Production · ERP log sheet' });
  const table = prod.getByRole('table', { name: 'Production by period' });
  await expect(table.locator('thead th')).toHaveText(['Period', 'Prime + SL (MT)', 'Prime (MT)']);
  for (const v of ['200.12', '196.84']) await expect(table.getByRole('row', { name: /^7 Oct/ })).toContainText(v);
  for (const v of ['1,689.86', '1,668.19']) await expect(table.locator('tfoot')).toContainText(v);
  await expect(prod.getByRole('region', { name: 'Formula' })).toContainText('Prime = Σ FINISH_PRODUCT_PRIME_MT');
  await page.waitForTimeout(700);
  await prod.screenshot({ path: `${SHOTS}/rmd-production-drawer.png` });
  await expect(prod.getByRole('region', { name: 'Data source' })).toContainText("USER_CODE = 'FA-SKJ'");
  await page.keyboard.press('Escape');

  // Material balance: billet input (INPUT_MT) 1,752.03 − finished 1,689.86 = mass difference 62.17 = the four losses.
  const balance = page.locator('section.panel', { hasText: 'Material & operating balance' });
  await expect(balance).toContainText('Billet input1,752.0 MT');
  await expect(balance).toContainText('Yield96.5%');
  await expect(balance).toContainText('Finished 1,689.9 MT');
  await expect(balance).toContainText('Mass difference 62.2 MT');
  await balance.screenshot({ path: `${SHOTS}/rmd-material-balance.png` });
  await expect(balance.locator('.rm-mb-legend')).toContainText('Chip off');
  await page.getByRole('button', { name: 'Material balance, per day' }).click();
  const bal = page.getByRole('dialog', { name: 'Material balance · ERP log sheet' });
  const bt = bal.getByRole('table', { name: 'Material balance by period' });
  // 7 Oct: input 209.76 − finished 200.12 = burning loss 3.27 + end cut 4.25 + miss-roll 1.12 + chip off 1 = 9.64 MT.
  for (const v of ['209.76', '200.12', '3.27', '4.25', '1.12', '9.64']) await expect(bt.getByRole('row', { name: /^7 Oct/ })).toContainText(v);
  for (const v of ['1,752.03', '62.17']) await expect(bal.locator('.pd-stats')).toContainText(v);
  await expect(bt.locator('tfoot')).toContainText('62.17');
  await expect(bal.getByRole('region', { name: 'Formula' })).toContainText('Losses = BLOSS_MT + ENDCUT_MT + MISROLL_MT + CHIP_OFF_MT');
  await expect(bal.getByRole('region', { name: 'Formula' })).toContainText('Mass difference = INPUT_MT − PRODUCT_PRIME_SLENGTH_MT');
  await page.waitForTimeout(700);
  await bal.screenshot({ path: `${SHOTS}/rmd-drill-balance.png` });
});

test('RMD: finished stock by size from the ERP item ledger (FGYRDP), and a size opens its SKUs', async ({ page }) => {
  await page.goto('/rmd/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  // Stock at the end of 8 Oct: Σ QTYRECD − Σ QTYISSUED in FGYRDP since the 2023 opening, every SKU of a size summed.
  // No 'Other' row and no miss-roll bars (the plant, 16 Oct 2026).
  const panel = page.locator('section.panel', { hasText: 'Finished stock by size' });
  await expect(panel.locator('.rm-size-name')).toHaveText(['8 mm', '10 mm', '12 mm', '16 mm', '20 mm', '25 mm', '32 mm']);
  await expect(panel.locator('.rm-size-total').first()).toHaveText('288.9 MT');
  await expect(panel.locator('.rm-size-total').nth(2)).toHaveText('793.0 MT');
  // No with-order / free split, no MTO / MTS anywhere on RMD.
  await expect(panel.locator('.rm-size-stack > i')).toHaveCount(7);
  await panel.screenshot({ path: `${SHOTS}/rmd-stock-by-size.png` });

  // Order allocation's Finished stock is the same stock, all rows: 2,689.0 MT at the end of 8 Oct.
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-total').nth(1)).toHaveText('2,689.0 MT');

  // 8 mm opens its SKUs: Premium 151.11 + 550 D 86.46 + SL 42.22 + M.Bundle 6.92 + U-bend 2.18 = 288.89.
  await panel.getByRole('button', { name: /^8 mm:/ }).click();
  const d = page.getByRole('dialog', { name: '8 mm · finished stock by SKU' });
  const t = d.getByRole('table', { name: '8 mm stock by SKU' });
  await expect(t.locator('thead th')).toHaveText(['SKU', 'Item code', 'Stock (MT)']);
  await expect(t.locator('tbody tr')).toHaveCount(5);
  await expect(t.locator('tbody tr').first()).toContainText('MS PREMIUM TMT BARS 8 MM');
  await expect(t.locator('tbody tr').first()).toContainText('151.11');
  await expect(t.getByRole('row', { name: /MISS ROLL/ })).toHaveCount(0);
  await expect(t.locator('tfoot')).toContainText('288.89');
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText("GODOWN_CODE = 'FGYRDP'");
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText('ITEMTRAN_BODY');
  await expect(d.getByRole('region', { name: 'Formula' })).toContainText('Stock = Σ QTYRECD − Σ QTYISSUED');
  await page.waitForTimeout(700);
  await d.screenshot({ path: `${SHOTS}/rmd-stock-size-drill.png` });
  await page.keyboard.press('Escape');

  // Every sized, non-miss-roll SKU of the plant's list in stock is on the dashboard: 32 at the end of 8 Oct
  // (a 0 isn't shown), and no miss roll anywhere.
  let skus = 0;
  for (const label of ['8 mm', '10 mm', '12 mm', '16 mm', '20 mm', '25 mm', '32 mm']) {
    await panel.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
    const dd = page.getByRole('dialog', { name: `${label} · finished stock by SKU` });
    const rows = dd.getByRole('table', { name: `${label} stock by SKU` }).locator('tbody tr');
    skus += await rows.count();
    await expect(rows.filter({ hasText: /\b0\.00$/ })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'MISS ROLL' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dd).toBeHidden();
  }
  expect(skus).toBe(32);
});

test('RMD: production by shift — the FY plan (Prime + SL) per day and shift, against ERP Prime + SL', async ({ page }) => {
  await page.goto('/rmd/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  // Oct plan 8,220.638 MT ÷ 31 calendar days (shutdown dates not given) = 265.18 a day → 1–8 Oct 2,121.4 MT, 1,060.7 a shift.
  const panel = page.locator('.rm-flip-face--front section.panel');
  await expect(panel.locator('.chip')).toHaveText('Plan 2,121 MT');
  await expect(panel.locator('.rm-shift-name')).toHaveText(['Day', 'Night']);
  await expect(panel.locator('.rm-shift-val')).toHaveText(['NA', 'NA']);   // output per shift is not in the ERP
  await expect(panel.locator('.rm-shift-target-label')).toContainText('1,061 MT target');
  // Plan gap over the days with both: 1,689.86 − 2,121.44 = −431.58: short, shown without a sign.
  await expect(panel).toContainText('431.6 MT');
  await expect(panel).not.toContainText('-431.6');
  await panel.screenshot({ path: `${SHOTS}/rmd-shift-plan.png` });

  // Whole day: ERP Prime + SL 1,689.86 ÷ 2,121.44 = 79.7 %.
  await panel.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'Whole day' }).click();
  const back = page.locator('.rm-flip-face--back section.panel');
  await expect(back.locator('.rm-shift-val')).toHaveText(['1,689.9 MT']);
  await expect(back.locator('.rm-shift-comp')).toHaveText(['79.7%']);
  await page.waitForTimeout(700);
  await back.screenshot({ path: `${SHOTS}/rmd-shift-whole-day.png` });

  await back.getByRole('button', { name: 'Whole-day production, plan vs actual per day' }).click();
  const dd = page.getByRole('dialog', { name: 'Production · whole day · plan vs actual' });
  const dt = dd.getByRole('table', { name: 'Whole-day production by period' });
  await expect(dt.locator('thead th')).toHaveText(['Period', 'Prime + SL', 'Target', 'Compliance', 'Plan gap']);
  // 7 Oct: 200.12 of 265.18 → 75.5 %, gap −65.1.
  for (const v of ['200.1', '265.2', '75.5%', '65.1']) await expect(dt.getByRole('row', { name: /^7 Oct/ })).toContainText(v);
  for (const v of ['1,689.9', '2,121.4', '79.7%', '431.6']) await expect(dt.locator('tfoot')).toContainText(v);
  await expect(dd.getByRole('region', { name: 'Data source' })).toContainText('RMD Month Wise production plan FY 26-27');
  await expect(dd.getByRole('region', { name: 'Formula' })).toContainText('month plan ÷ calendar days');
  await page.waitForTimeout(700);
  await dd.screenshot({ path: `${SHOTS}/rmd-drill-plan-day.png` });
  await page.keyboard.press('Escape');
  await back.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'By shift' }).click();

  // By shift: the targets, half the day each; output per shift NA.
  await panel.getByRole('button', { name: 'Production by shift, plan vs actual per day' }).click();
  const ds = page.getByRole('dialog', { name: 'Production by shift · plan' });
  const st = ds.getByRole('table', { name: 'Production by shift by period' });
  await expect(st.locator('thead th')).toHaveText(['Period', 'Day output', 'Day target', 'Night output', 'Night target']);
  await expect(st.getByRole('row', { name: /^1 Oct/ })).toContainText('132.6');
  await expect(st.locator('tfoot')).toContainText('1,060.7');
  await page.waitForTimeout(700);
  await ds.screenshot({ path: `${SHOTS}/rmd-drill-plan-shift.png` });
});

test('LSM: production and losses from the ERP log sheet (FA-LP-P), as the plant gave the codes', async ({ page }) => {
  await page.goto('/lsm/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  // Σ PRODUTION_MT, 1–8 Oct = 2,106.12 MT (each entry counted once — the ERP repeats some).
  const card = page.getByRole('button', { name: 'Production', exact: true });
  await expect(card.locator('.rm-card-value')).toContainText('2,106.1');
  await expect(card.locator('.rm-card-note')).toHaveText('');
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-total').first()).toHaveText('2,106.1 MT');

  // Mass yield: PRODUTION_MT 2,106.12 ÷ INPUT_MT 2,226.89 = 94.58 %.
  await expect(page.getByRole('button', { name: 'Mass yield', exact: true }).locator('.rm-card-value')).toContainText('94.6');
  // Material balance: input 2,226.9, finished 2,106.1, difference 120.8; cold is 0 so it isn't shown.
  const balance = page.locator('section.panel', { hasText: 'Material & operating balance' });
  await expect(balance).toContainText('Billet input2,226.9 MT');
  await expect(balance).toContainText('Yield94.6%');
  await expect(balance).toContainText('Finished 2,106.1 MT');
  await expect(balance).toContainText('Mass difference 120.8 MT');
  // Billets in: Σ INPUT_PCS, 1–8 Oct = 8,429.
  await expect(balance.locator('.rmd-mb-pieces')).toContainText('8,429 in');
  // The six losses add up to the mass difference: 24.6 + 68.5 + 9.1 + 5.3 + 13.2 = 120.8.
  await expect(balance.locator('.rm-mb-link')).toHaveText([/^Burning loss 24\.6 MT/, /^End cut 68\.5 MT/, /^Miss-roll 9\.1 MT/, /^Reject 5\.3 MT/, /^Short length 13\.2 MT/]);
  await balance.screenshot({ path: `${SHOTS}/lsm-material-balance.png` });

  await card.click();
  const prod = page.getByRole('dialog', { name: 'Production · ERP log sheet' });
  await expect(prod.getByRole('table', { name: 'Production by period' }).locator('tfoot')).toContainText('2,106.12');
  await expect(prod.getByRole('region', { name: 'Data source' })).toContainText("USER_CODE = 'FA-LP-P'");
  await expect(prod.getByRole('region', { name: 'Formula' })).toContainText('PRODUTION_MT');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Material balance, per day' }).click();
  const bal = page.getByRole('dialog', { name: 'Material balance · ERP log sheet' });
  const bt = bal.getByRole('table', { name: 'Material balance by period' });
  await expect(bt.locator('thead th')).toHaveText(['Period', 'Billets (pcs)', 'Billet input', 'Finished', 'Burning loss', 'End cut', 'Miss-roll', 'Reject', 'Short length', 'Losses']);
  await expect(bt.locator('tfoot')).toContainText('2,226.89');
  await expect(bt.locator('tfoot')).toContainText('120.77');
  await page.waitForTimeout(700);
  await bal.screenshot({ path: `${SHOTS}/lsm-drill-balance.png` });
});

test('RMD: running rate opens its drill-down — Prime + SL ÷ running hours from the billet counters', async ({ page }) => {
  await page.goto('/rmd/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const foot = page.locator('.rm-flip-face--front .rm-foot').getByRole('button', { name: /Running rate/ });
  await expect(foot).toContainText(/\d+\.\d{2} TPH/);
  const shown = (await foot.locator('.rm-foot-v').innerText()).replace(' TPH', '');
  await foot.click();
  const d = page.getByRole('dialog', { name: 'Running rate' });
  const t = d.getByRole('table', { name: 'Running rate by period' });
  await expect(t.locator('thead th')).toHaveText(['Period', 'Prime + SL (MT)', 'Running hours', 'Rate (TPH)']);
  await expect(t.locator('tbody tr')).toHaveCount(8);
  await expect(t.locator('tfoot')).toContainText('1,689.86');
  await expect(t.locator('tfoot')).toContainText(shown);
  await expect(d.getByRole('region', { name: 'Formula' })).toContainText('10 min or less apart');
  await page.waitForTimeout(700);
  await d.screenshot({ path: `${SHOTS}/rmd-drill-running-rate.png` });
});

test('HSM asset health: electrical faults from the logbook — MTTR per group, the latest fault, and the list', async ({ page }) => {
  await page.goto('/hsm/asset-health');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-09-01');
  await dialog.getByLabel('End Date').fill('2026-10-12');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const main = page.getByRole('main');
  // Finishing (selected by default): 17 faults naming F stands (or "finishing mill"), MTTR from their durations.
  const pm = main.locator('section.panel', { hasText: 'ERP PM & work-order history' });
  // The first logbook read pages back a few weeks: allow it time.
  await expect(pm.getByRole('button', { name: /MTTR/ })).toContainText(/\d+\.\d min/, { timeout: 90_000 });
  await expect(main.locator('section.panel', { hasText: 'Diagnosis & process impact' })).toContainText('F4&F6 DUMP');
  await pm.getByRole('button', { name: /MTTR/ }).click();
  const d = page.getByRole('dialog', { name: 'Finishing · electrical faults' });
  const t = d.getByRole('table', { name: 'Electrical faults' });
  await expect(t.locator('thead th')).toHaveText(['Date', 'Shift', 'Stands', 'Minutes', 'Fault details']);
  await expect(t.locator('tbody tr').first()).toContainText('F4, F6');
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText('Electrical HSM → Electrical Delays');
  await page.waitForTimeout(700);
  await d.screenshot({ path: `${SHOTS}/hsm-asset-faults.png` });
  await page.keyboard.press('Escape');
  // Roughing: R-stand faults (R5 on 14 Sep, R1 on 28 Sep …).
  await main.getByRole('button', { name: /Roughing group/ }).click();
  await expect(main.locator('section.panel', { hasText: 'Diagnosis & process impact' })).toContainText('R1 DRIVE TRIPPED');
  await page.screenshot({ path: `${SHOTS}/hsm-asset-health-wired.png`, fullPage: true });
});

test('LSM: finished stock by section, as the ERP Stock Sheet Engine for division LS', async ({ page }) => {
  await page.goto('/lsm/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-12');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const panel = page.locator('section.panel', { hasText: 'Finished stock by size' });
  // Every finished item under LS: the plant's 19 sections first, in their names and order, then the rest.
  // At the end of 12 Oct (a closed day): A 50×50×6 627.32, MC 75×40 642.34, Round 40 128.42.
  // (13 Oct was checked against the ERP's Stock Sheet Engine: 5,759.51 vs 5,759.49 MT with billets.)
  await expect(panel.locator('.rm-size-name')).toHaveCount(24);
  await expect(panel.locator('.rm-size-name').first()).toHaveText('A 50×50×6');
  await expect(panel.locator('.rm-size-name').nth(18)).toHaveText('MB 125×70');
  await expect(panel.locator('.rm-size-name').last()).toHaveText('Round 40');
  await expect(panel.locator('.rm-size', { hasText: 'Round 40' })).toContainText('128.4 MT');
  await expect(panel.locator('.rm-size', { hasText: 'A 50×50×6' })).toContainText('627.3 MT');
  await expect(panel.locator('.rm-size', { hasText: 'MC 75×40' })).toContainText('642.3 MT');
  await panel.screenshot({ path: `${SHOTS}/lsm-stock-by-section.png` });
  // Order allocation's Finished stock is the total (billets left out).
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-total').nth(1)).toHaveText('5,821.3 MT');
  // MC 75×40 opens its lengths and defective item.
  await panel.getByRole('button', { name: /^MC 75×40:/ }).click();
  const d = page.getByRole('dialog', { name: 'MC 75×40 · finished stock by SKU' });
  const t = d.getByRole('table', { name: 'MC 75×40 stock by SKU' });
  await expect(t.locator('tbody tr')).toHaveCount(4);
  await expect(t.locator('tbody tr').first()).toContainText('MS Channel 75X40 6 mtr');
  await expect(t.locator('tbody tr').first()).toContainText('315.86');
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText("DIV_CODE = 'LS'");
  await page.waitForTimeout(700);
  await d.screenshot({ path: `${SHOTS}/lsm-stock-section-drill.png` });
});

test('RMS: finished stock by section, by the ERP stock rule for division RS', async ({ page }) => {
  await page.goto('/rms/visualization');
  const panel = page.locator('section.panel', { hasText: 'Finished stock by size' });
  // Angles → channels → beams → H beams, by size; MC 200 is the largest (6 m 512.6 + 12 m + …).
  await expect(panel.locator('.rm-size-name').first()).toHaveText(/^A 130×130×/);
  await expect(panel.locator('.rm-size-name')).toContainText(['MC 200']);
  await expect(panel.locator('.rm-size', { hasText: 'MC 200' })).toContainText(/\d MT$/);
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-total').nth(1)).toHaveText(/^[\d,]+\.\d MT$/);
  await panel.getByRole('button', { name: /^MC 200:/ }).click();
  const d = page.getByRole('dialog', { name: 'MC 200 · finished stock by SKU' });
  await expect(d.getByRole('table', { name: 'MC 200 stock by SKU' })).toContainText('MS CHANNEL 200 MM 6 mtr');
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText("DIV_CODE = 'RS'");
  await page.keyboard.press('Escape');
  await panel.screenshot({ path: `${SHOTS}/rms-stock-by-section.png` });
});

test('RMS: production from the ERP log sheet (division RS, series L5P) — a day entered twice counts once', async ({ page }) => {
  await page.goto('/rms/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-12');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  // Σ PRODUCTION_MT 1–12 Oct, 1 / 3 / 10 Oct once each = the finished goods the ERP received: 6,244.75 MT.
  const card = page.getByRole('button', { name: 'Production', exact: true });
  await expect(card.locator('.rm-card-value')).toContainText('6,244.8');
  await expect(page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-total').first()).toHaveText('6,244.8 MT');
  // Billets in: Σ INPUT_PCS (repeated entries once).
  const balance = page.locator('section.panel', { hasText: 'Material & operating balance' });
  await expect(balance.locator('.rmd-mb-pieces')).toContainText(/[\d,]+ in/);
  // Billet input Σ (INPUT_MT1 + INPUT_MT2) 6,648.09; mass yield 6,244.75 ÷ 6,648.09 = 93.9 %; mass difference 403.3.
  await expect(page.getByRole('button', { name: 'Mass yield', exact: true }).locator('.rm-card-value')).toContainText('93.9');
  await expect(balance.locator('.rm-mb-figure-v')).toHaveText(['6,648.1 MT', '93.9%']);
  await expect(balance).toContainText('Finished 6,244.8 MT');
  await expect(balance).toContainText('Mass difference 403.3 MT');
  // The mass difference opened out: burning 99.47 + end cut 258.44 + miss-roll 22.36 + reject 23.07 = 403.34; cold 0 — not shown.
  await expect(balance.locator('.rm-mb-legend .rm-mb-link')).toHaveText([
    'Burning loss 99.5 MT', 'End cut 258.4 MT', 'Miss-roll 22.4 MT', 'Reject 23.1 MT',
  ]);
  await expect(balance.locator('.rm-mb-bar--loss .rm-mb-seg')).toHaveCount(4);
  await balance.screenshot({ path: `${SHOTS}/rms-material-balance.png` });
  await card.click();
  const d = page.getByRole('dialog', { name: 'Production · ERP log sheet' });
  const t = d.getByRole('table', { name: 'Production by period' });
  for (const v of ['627.37', '577.45', '92.0%', '49.92']) await expect(t.getByRole('row', { name: /^1 Oct/ })).toContainText(v);
  await expect(t.getByRole('row', { name: /^4 Oct/ })).toContainText('568.45');
  await expect(t.locator('thead th')).toHaveText(['Period', 'Billets in (pcs)', 'Billet input (MT)', 'Production (MT)', 'Mass yield', 'Mass difference (MT)']);
  for (const v of ['6,648.09', '6,244.75', '93.9%', '403.34']) await expect(t.locator('tfoot')).toContainText(v);
  await expect(d.getByRole('region', { name: 'Formula' })).toContainText('Billet input = Σ (INPUT_MT1 + INPUT_MT2)');
  const lt = d.getByRole('table', { name: 'Losses by period' });
  await expect(lt.locator('thead th')).toHaveText(['Period', 'Burning loss', 'End cut', 'Miss-roll', 'Cold', 'Reject', 'Losses (MT)']);
  for (const v of ['12.55', '29.80', '1.75', '5.82', '49.92']) await expect(lt.getByRole('row', { name: /^1 Oct/ })).toContainText(v);
  await expect(lt.locator('tfoot')).toContainText('403.34');
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText("DIV_CODE = 'RS', TNATURE = 'PRLOG', SERIES = 'L5P'");
  await page.waitForTimeout(700);
  await d.screenshot({ path: `${SHOTS}/rms-drill-production.png` });
});

test('RMD asset health: route drive group by default; motor current live, run hours from ACTUAL_RUNNING_HRS, bearing and oil from the forms with the plant limits', async ({ page }) => {
  await page.goto('/rmd/asset-health');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText('RMD · Route drive group');
  const cards = main.getByRole('region', { name: 'Condition KPIs' });
  await expect(cards.locator('.rm-card-label')).toHaveText([/^Vibration RMS/, /^Bearing temp/, /^Motor current/, /^Alignment/, /^Gearbox oil/, /^VFD trips/, /^Run hours/, /^PM on time/]);
  // Run hours: Σ ACTUAL_RUNNING_HRS 1–8 Oct = 87.75 h.
  await expect(cards.locator('.rm-card-value').nth(6)).toHaveText(/^87\.8h$/);
  // Motor current: live; NA while no route drive runs.
  await expect(cards.locator('.rm-card-value').nth(2)).toHaveText(/^(NA|\d[\d,]*)A$/);
  // Bearing temp and gearbox oil from the mechanical forms: a reading, or NA without entries.
  await expect(cards.locator('.rm-card-value').nth(1)).toHaveText(/^(NA|\d+)°C$/);
  await expect(cards.locator('.rm-card-value').nth(4)).toHaveText(/^(NA|[\d,]+)L$/);
  // Bearing drawer: each reading against the plant's limits (bearings 45–65 °C, flywheel 45–80 °C).
  const bearingCard = cards.getByRole('button', { name: /Bearing temp/ });
  if (await bearingCard.count()) {
    await bearingCard.click();
    const d = page.getByRole('dialog', { name: 'Route · bearing temperature' });
    const t = d.getByRole('table', { name: 'Bearing temperatures' });
    await expect(t.locator('thead th')).toHaveText(['Equipment', 'Point', '°C', 'Limits', 'Date']);
    await expect(t.locator('tbody tr').first().locator('td').nth(3)).toHaveText(/^45–(65|80)$/);
    await expect(d).toContainText('bearings 45–65 °C, flywheel 45–80 °C');
    await page.waitForTimeout(700);
    await d.screenshot({ path: `${SHOTS}/rmd-asset-bearing-limits.png` });
    await d.getByRole('button', { name: /Close/ }).click();
  }
  const mimic = main.getByRole('list', { name: 'Drive groups' });
  await expect(mimic.locator('.rm-zone-title')).toHaveText(['Billet infeed', 'Roughing group', 'Route / diverter', 'Finishing group', 'Finished exit']);
  await expect(mimic.getByRole('button', { name: /Route \/ diverter/ }).locator('.rm-zone-value')).toHaveText(/^(NA|\d+ of 14 on)$/);
  await mimic.getByRole('button', { name: /Roughing group/ }).click();
  await expect(main.getByRole('heading', { level: 2 })).toHaveText('RMD · Roughing drive group');
  await page.screenshot({ path: `${SHOTS}/rmd-asset-health.png`, fullPage: true });
});

test('LSM: production by shift — the October plan (8,750 MT) per day and shift; output per shift = ERP day split by the form\'s prime pieces', async ({ page }) => {
  await page.goto('/lsm/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  // 8,750 MT ÷ 31 days = 282.26 a day → 1–8 Oct 2,258.1 MT, 1,129.0 a shift (Day 09–21, Night 21–09).
  const panel = page.locator('.rm-flip-face--front section.panel');
  await expect(panel.locator('.chip')).toHaveText('Plan 2,258 MT');
  await expect(panel.locator('.panel-sub')).toHaveText('Day 09:00–21:00 IST · Night 21:00–09:00 IST');
  // Output per shift: each date's PRODUTION_MT split by the LSM Production Sheet's Day / Night prime pieces
  // (1 Oct: 302.96 → Day 203.26, Night 99.70); 1–8 Oct Day 1,115.2 (98.8 %), Night 991.0 (87.8 %).
  await expect(panel.locator('.rm-shift-val')).toHaveText(['1,115.2 MT', '991.0 MT']);
  await expect(panel.locator('.rm-shift-comp')).toHaveText(['98.8%', '87.8%']);
  await expect(panel.locator('.rm-shift-target-label')).toContainText('1,129 MT target');
  // Plan gap: 2,106.12 − 2,258.08 = −151.96: short, shown without a sign.
  await expect(panel).toContainText('152.0 MT');
  await expect(panel).not.toContainText('-152.0');
  await panel.screenshot({ path: `${SHOTS}/lsm-shift-plan.png` });

  // Whole day: PRODUTION_MT 2,106.12 ÷ 2,258.08 = 93.3 %.
  await panel.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'Whole day' }).click();
  const back = page.locator('.rm-flip-face--back section.panel');
  await expect(back.locator('.rm-shift-val')).toHaveText(['2,106.1 MT']);
  await expect(back.locator('.rm-shift-comp')).toHaveText(['93.3%']);

  await back.getByRole('button', { name: 'Whole-day production, plan vs actual per day' }).click();
  const dd = page.getByRole('dialog', { name: 'Production · whole day · plan vs actual' });
  const dt = dd.getByRole('table', { name: 'Whole-day production by period' });
  await expect(dt.locator('thead th')).toHaveText(['Period', 'Production', 'Target', 'Compliance', 'Plan gap']);
  // 7 Oct: 359.61 of 282.26 → 127.4 %, gap +77.4.
  for (const v of ['359.6', '282.3', '127.4%', '+77.4']) await expect(dt.getByRole('row', { name: /^7 Oct/ })).toContainText(v);
  for (const v of ['2,106.1', '2,258.1', '93.3%', '152.0']) await expect(dt.locator('tfoot')).toContainText(v);
  await expect(dd.getByRole('region', { name: 'Data source' })).toContainText('PRODUCTION PLAN FOR LSM Oct-2026');
  await expect(dd.getByRole('region', { name: 'Data source' })).toContainText("USER_CODE = 'FA-LP-P'");
  await expect(dd.getByRole('region', { name: 'Formula' })).toContainText('Compliance = PRODUTION_MT ÷ plan × 100');
  await page.waitForTimeout(700);
  await dd.screenshot({ path: `${SHOTS}/lsm-drill-plan-day.png` });
  await page.keyboard.press('Escape');
  await back.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'By shift' }).click();

  // By shift: each shift's output beside its target, per day.
  await panel.getByRole('button', { name: 'Production by shift, plan vs actual per day' }).click();
  const ds = page.getByRole('dialog', { name: 'Production by shift · plan' });
  const st = ds.getByRole('table', { name: 'Production by shift by period' });
  await expect(st.locator('thead th')).toHaveText(['Period', 'Day output', 'Day target', 'Night output', 'Night target']);
  for (const v of ['203.3', '141.1', '99.7']) await expect(st.getByRole('row', { name: /^1 Oct/ })).toContainText(v);
  for (const v of ['1,115.2', '1,129.0', '991.0']) await expect(st.locator('tfoot')).toContainText(v);
  await expect(ds.getByRole('region', { name: 'Data source' })).toContainText('LSM Production Sheet');
  await expect(ds.getByRole('region', { name: 'Formula' })).toContainText('Day output = PRODUTION_MT × Day prime pcs ÷ (Day + Night prime pcs)');
  await page.waitForTimeout(700);
  await ds.screenshot({ path: `${SHOTS}/lsm-drill-plan-shift.png` });
});

test('RMS: production by shift — the monthly plan (Oct 13,499 MT) per day and shift, against ERP PRODUCTION_MT', async ({ page }) => {
  await page.goto('/rms/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-12');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  // 13,499 MT ÷ 31 days (the shutdown day is not dated) = 435.45 a day → 1–12 Oct 5,225.4 MT, 2,612.8 a shift.
  const panel = page.locator('.rm-flip-face--front section.panel');
  await expect(panel.locator('.chip')).toHaveText('Plan 5,225 MT');
  await expect(panel.locator('.panel-sub')).toHaveText('Day 09:30–21:30 IST · Night 21:30–09:30 IST');
  // Ahead of plan: 6,244.75 − 5,225.4 → plan gap +1,019.4.
  await expect(panel).toContainText('+1,019.4 MT');

  // Whole day: PRODUCTION_MT 6,244.75 ÷ 5,225.4 = 119.5 %.
  await panel.getByRole('group', { name: 'Shift view' }).getByRole('button', { name: 'Whole day' }).click();
  const back = page.locator('.rm-flip-face--back section.panel');
  await expect(back.locator('.rm-shift-val')).toHaveText(['6,244.8 MT']);
  await expect(back.locator('.rm-shift-comp')).toHaveText(['119.5%']);
  await page.waitForTimeout(700);
  await back.screenshot({ path: `${SHOTS}/rms-shift-whole-day.png` });

  await back.getByRole('button', { name: 'Whole-day production, plan vs actual per day' }).click();
  const dd = page.getByRole('dialog', { name: 'Production · whole day · plan vs actual' });
  const dt = dd.getByRole('table', { name: 'Whole-day production by period' });
  await expect(dt.locator('thead th')).toHaveText(['Period', 'Production', 'Target', 'Compliance', 'Plan gap']);
  for (const v of ['577.5', '435.5', '132.6%']) await expect(dt.getByRole('row', { name: /^1 Oct/ })).toContainText(v);
  for (const v of ['6,244.8', '5,225.4', '119.5%']) await expect(dt.locator('tfoot')).toContainText(v);
  await expect(dd.getByRole('region', { name: 'Data source' })).toContainText('RMS_Production_Plan');
  await expect(dd.getByRole('region', { name: 'Data source' })).toContainText("DIV_CODE = 'RS'");
  await expect(dd.getByRole('region', { name: 'Formula' })).toContainText('Compliance = PRODUCTION_MT ÷ plan × 100');
  await page.waitForTimeout(700);
  await dd.screenshot({ path: `${SHOTS}/rms-drill-plan-day.png` });
});

for (const c of [
  // LSM 9–13 Oct: 1,505.73 MT ÷ 65.96 h of runs = 22.83 TPH; 9 Oct 319.47 ÷ 14.58 h = 21.91.
  { mill: 'lsm', from: '2026-10-09', to: '2026-10-13', rate: '22.83', first: ['9 Oct', '319.47', '14.6', '21.91'], foot: ['1,505.73', '66.0', '22.83'], form: 'LSM Production Sheet' },
  // RMS 1–12 Oct: the days with both (4 Oct has no runs) 5,676.30 MT ÷ 143.63 h = 39.52 TPH; 1 Oct 577.45 ÷ 14.08 h = 41.01.
  { mill: 'rms', from: '2026-10-01', to: '2026-10-12', rate: '39.52', first: ['1 Oct', '577.45', '14.1', '41.01'], foot: ['6,244.75', '143.6', '39.52'], form: 'RMS Production Sheet' },
] as const) {
  test(`${c.mill.toUpperCase()}: running rate = ERP production ÷ running hours calculated from the Production Sheet's runs`, async ({ page }) => {
    await page.goto(`/${c.mill}/visualization`);
    await page.getByRole('button', { name: /Duration/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Select period' });
    await dialog.getByLabel('Start Date').fill(c.from);
    await dialog.getByLabel('End Date').fill(c.to);
    await dialog.getByRole('button', { name: 'Apply' }).click();
    const foot = page.locator('.rm-flip-face--front').getByRole('button', { name: /Running rate/ });
    await expect(foot).toContainText(`${c.rate} TPH`);
    await foot.click();
    const d = page.getByRole('dialog', { name: 'Running rate' });
    const t = d.getByRole('table', { name: 'Running rate by period' });
    await expect(t.locator('thead th')).toHaveText(['Period', 'Production (MT)', 'Running hours', 'Rate (TPH)']);
    for (const v of c.first.slice(1)) await expect(t.getByRole('row', { name: new RegExp(`^${c.first[0]}`) })).toContainText(v);
    for (const v of c.foot) await expect(t.locator('tfoot')).toContainText(v);
    await expect(d.getByRole('region', { name: 'Data source' })).toContainText(c.form);
    await expect(d.getByRole('region', { name: 'Formula' })).toContainText('overlapping runs counted once');
    await page.waitForTimeout(700);
    await d.screenshot({ path: `${SHOTS}/${c.mill}-drill-running-rate.png` });
  });
}

test('RMD: Order allocation\'s Finished stock is the total only — no Stock with order / Free stock line', async ({ page }) => {
  await page.goto('/rmd/visualization');
  const block = page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block', { hasText: 'Finished stock' });
  await expect(block.locator('.rm-alloc-total')).toHaveText(/^(NA|[\d,]+\.\d MT)$/);
  await expect(block.locator('.rm-legend')).toHaveCount(0);
  await expect(block).not.toContainText('Free stock');
});

for (const mill of ['hsm', 'lsm', 'rms'] as const) {
  test(`${mill.toUpperCase()}: Order allocation's Finished stock shows Stock with order and Free stock, as the cards`, async ({ page }) => {
    await page.goto(`/${mill}/visualization`);
    const alloc = page.locator('section.panel', { hasText: 'Order allocation' });
    const legend = alloc.locator('.rm-alloc-block', { hasText: 'Finished stock' }).locator('.rm-legend');
    await expect(legend).toHaveText(/Stock with order\s*0\.0 MT\s*Free stock\s*-?[\d,]+\.\d MT/);
    await alloc.screenshot({ path: `${SHOTS}/${mill}-order-allocation.png` });
  });
}

for (const c of [
  { mill: 'lsm', prod: '2,106.1' },   // 1–8 Oct PRODUTION_MT 2,106.12
  { mill: 'rms', prod: '4,114.3' },   // 1–8 Oct PRODUCTION_MT 4,114.29
] as const) test(`${c.mill.toUpperCase()}: order split as HSM — Made To Stock = production, Stock with order 0, Free stock = all finished stock`, async ({ page }) => {
  await page.goto(`/${c.mill}/visualization`);
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  // All of the period's production is Made To Stock.
  await expect(strip.locator('.rm-card', { hasText: 'Made To Stock' }).locator('.rm-card-value')).toContainText(c.prod);
  await expect(strip.locator('.rm-card', { hasText: 'Stock with order' }).locator('.rm-card-value')).toHaveText(/^0\s*MT$/);
  const alloc = page.locator('section.panel', { hasText: 'Order allocation' });
  const prod = alloc.locator('.rm-alloc-block').nth(0);
  await expect(prod.locator('.rm-legend')).toHaveText(new RegExp(`Made To Order\\s*0\\.0 MT\\s*Made To Stock\\s*${c.prod.replace(/[.,]/g, '\\$&')} MT`));
  await expect(prod.getByRole('img', { name: new RegExp(`made to order 0\\.0 MT, made to stock ${c.prod.replace(/[.,]/g, '\\$&')} MT`) })).toBeVisible();
  // Finished stock: the Free stock card, the Order allocation total and its free part are one figure.
  const stock = alloc.locator('.rm-alloc-block').nth(1);
  const total = (await stock.locator('.rm-alloc-total').innerText()).replace(' MT', '');
  await expect(strip.locator('.rm-card', { hasText: 'Free stock' }).locator('.rm-card-value')).toContainText(total);
  await expect(stock.locator('.rm-legend')).toHaveText(new RegExp(`Stock with order\\s*0\\.0 MT\\s*Free stock\\s*${total.replace(/[.,]/g, '\\$&')} MT`));
  await expect(stock.getByRole('img', { name: /with order 0\.0 MT, free / })).toBeVisible();
  await alloc.screenshot({ path: `${SHOTS}/${c.mill}-order-allocation-split.png` });
});

test('RMD asset health: motor current and run hours open their drill-downs with a trend', async ({ page }) => {
  await page.goto('/rmd/asset-health');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-16');
  await dialog.getByLabel('End Date').fill('2026-10-16');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const cards = page.getByRole('main').getByRole('region', { name: 'Condition KPIs' });

  // Motor current (route group): every drive, its current while running (status 1); stopped drives have none.
  await cards.getByRole('button', { name: 'Motor current', exact: true }).click();
  const dc = page.getByRole('dialog', { name: 'Route · motor current' });
  const tc = dc.getByRole('table', { name: 'Motor current per drive' });
  await expect(tc.locator('thead th')).toHaveText(['Line', 'Drive', 'Now', 'Current now (A)', 'Average while running (A)']);
  await expect(tc.locator('tbody tr')).toHaveCount(14, { timeout: 90_000 });
  // 16 Oct: L1 S2 ran at 143.88 A on average; L1 S5 did not run (its ~35 A at status 0 is not counted).
  await expect(tc.getByRole('row', { name: /^Line 1 S2 / })).toContainText('144');
  await expect(tc.getByRole('row', { name: /^Line 1 S5 / }).locator('td').last()).toHaveText('—');
  await expect(dc.getByRole('img', { name: /Motor current per drive while running/ })).toBeVisible();
  await expect(dc.getByRole('region', { name: 'Formula' })).toContainText('running status is 1');
  await page.waitForTimeout(700);
  await dc.screenshot({ path: `${SHOTS}/rmd-asset-current.png` });
  await page.keyboard.press('Escape');

  // Run hours: ERP ACTUAL_RUNNING_HRS per day.
  await page.getByRole('button', { name: /Duration/ }).click();
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await cards.getByRole('button', { name: 'Run hours', exact: true }).click();
  const dr = page.getByRole('dialog', { name: 'Run hours' });
  const tr = dr.getByRole('table', { name: 'Run hours by period' });
  await expect(tr.locator('thead th')).toHaveText(['Period', 'Run hours', 'Days entered']);
  await expect(tr.getByRole('row', { name: /^1 Oct/ })).toContainText('7.4');
  await expect(tr.locator('tfoot')).toContainText('87.8');
  await expect(dr.getByRole('region', { name: 'Data source' })).toContainText('ACTUAL_RUNNING_HRS');
  await page.waitForTimeout(700);
  await dr.screenshot({ path: `${SHOTS}/rmd-asset-run-hours.png` });
});

test('RMD asset health: gearbox oil in litres — level × the tank\'s inside length × width', async ({ page }) => {
  await page.goto('/rmd/asset-health');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-09-01');
  await dialog.getByLabel('End Date').fill('2026-09-30');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const cards = page.getByRole('main').getByRole('region', { name: 'Condition KPIs' });
  // 14 Sep, route tanks: OC stand 3–4 at 13.5 in = 13.5 × 0.0254 × 1.26 × 0.85 m = 367 L of 932 — the lowest against its capacity.
  const card = cards.getByRole('button', { name: 'Gearbox oil', exact: true });
  await expect(card.locator('.rm-card-value')).toHaveText(/^367\s*L$/, { timeout: 90_000 });
  await card.click();
  const d = page.getByRole('dialog', { name: 'Route · gearbox oil' });
  const t = d.getByRole('table', { name: 'Oil tank level' });
  await expect(t.locator('thead th')).toHaveText(['Tank', 'Level (in)', 'Oil (L)', 'Capacity (L)', 'Full', 'Date']);
  for (const v of ['13.5', '367', '932', '39%']) await expect(t.getByRole('row', { name: /^OC stand 3–4/ })).toContainText(v);
  // Intermill: 16 in → 513 L of 1,275.
  for (const v of ['16.0', '513', '1,275']) await expect(t.getByRole('row', { name: /^Intermill/ })).toContainText(v);
  await expect(d.getByRole('region', { name: 'Formula' })).toContainText('Oil (L) = level (inches) × 0.0254 × inside length × inside width');
  await page.waitForTimeout(700);
  await d.screenshot({ path: `${SHOTS}/rmd-asset-oil-litres.png` });
});
