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
const live = existsSync(path.resolve(process.cwd(), '.env.local')) && existsSync(path.resolve(process.cwd(), 'data/erp-hsm-commercial.json'));

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
  // Today is never in the ERP yet — stated, not zero; Influx is live.
  await expect(yieldCard).toContainText('ERP not entered');
  await expect(yieldCard).toContainText('Influx live');

  await pickWeek(page);
  // Both yields side by side: ERP 1,076.51 ÷ 1,121.34 = 96.00 %; Influx 1,141.08 ÷ 1,138.38 = 100.24 % (output less noise; input per billet-size event at 7.832 g/cm³).
  await expect(yieldCard.locator('.rm-card-pair-item').nth(0)).toContainText('96.0');
  await expect(yieldCard.locator('.rm-card-pair-item').nth(0)).toContainText('ERP');
  await expect(yieldCard.locator('.rm-card-pair-item').nth(1)).toContainText('100.2');
  await expect(yieldCard.locator('.rm-card-pair-item').nth(1)).toContainText('Influx');
  // Finished exit = the Production card's Influx figure: Σ Total_Production_Ton increases, 22–28 Sep.
  const exit = page.getByRole('button', { name: /Finished exit/ });
  await expect(exit).toContainText('1,141.1 MT');
  // No order link in the ERP: all production is "without order" — same figure as the Production card.
  await expect(page.getByRole('article', { name: 'Production without order', exact: true })).toContainText('1,141.1');
  const split = page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').first();
  await expect(split.locator('.rm-alloc-total')).toHaveText('1,141.1 MT');
  await expect(split).toContainText('Without order1,141.1 MT');
  await expect(split).toContainText('Against order0.0 MT');
  await expect(exit).toContainText(/Influx/i);

  const panel = page.locator('section.panel', { hasText: 'Material & operating balance' });
  await expect(panel.getByRole('button', { name: /^Billet input/ })).toContainText('1,121.3 MT');
  await expect(panel.getByRole('button', { name: /^Finished/ })).toContainText('1,076.5 MT');
  await expect(panel.getByRole('button', { name: /^Mass difference/ })).toContainText('44.8 MT');
  await expect(panel.getByRole('button', { name: /^Billets/ })).toContainText('1,496');
  const ops = panel.getByRole('group', { name: 'Yield and losses' });
  for (const [k, v] of [['Yield', '96.0%'], ['Burning loss', '14.8 MT'], ['End cut', '19.1 MT'], ['Miss-roll', '10.9 MT'], ['Reject', '0.0 MT']]) {
    await expect(ops.getByRole('button', { name: new RegExp(`^${k}`) })).toContainText(v);
  }
  await expect(panel.getByText('Balances ✓')).toBeVisible();
  await page.locator('.rm-strip').screenshot({ path: `${SHOTS}/wired-kpi-strip.png` });
  await panel.screenshot({ path: `${SHOTS}/wired-material-balance.png` });
});

test('log-sheet drawer: yield, mass balance and quality views, each with chart, legend and checks', async ({ page }) => {
  await pickWeek(page);
  await page.getByRole('button', { name: 'Mass yield', exact: true }).click();
  // One drawer; its title follows the view, so find it by role and check the name.
  const drawer = page.getByRole('dialog');
  await expect(drawer).toHaveAccessibleName('Mass yield · ERP vs Influx');
  await expect(drawer.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');

  await drawer.getByRole('button', { name: /Duration filter/ }).click();
  const table = drawer.getByRole('table', { name: /by period/ });
  for (const v of ['1,121.34', '1,076.51', '96.00', '1,138.38', '1,141.08', '100.24', '1,491']) {
    await expect(table.locator('tfoot')).toContainText(v);
  }
  await expect(drawer.locator('.pd-chart .highcharts-plot-line-label')).toContainText('100 %');
  // The billet-size events behind the Influx input: the week 22 Sep 06:00 → 29 Sep 06:00
  // holds the 160×160 → 275×125 change on 23 Sep 06:16:28 and the change back at 28 Sep 09:16:10.
  const events = drawer.getByRole('table', { name: 'Billet size events' });
  await expect(events.getByRole('row', { name: /^23 Sept?, 06:16:28/ })).toBeVisible();
  await expect(events.getByRole('row', { name: /^28 Sept?, 09:16:10/ })).toBeVisible();
  await expect(events.locator('tbody')).toContainText('0.8077');   // 3 × 0.275 × 0.125 × 7.832
  await expect(events.locator('tfoot')).toContainText('1,491');
  await expect(events.locator('tfoot')).toContainText('1,138.38');

  // Interactive legend: hide the Influx yield line and bring it back.
  const yieldBtn = drawer.getByRole('button', { name: /^Influx yield/ });
  await yieldBtn.click();
  await expect(yieldBtn).toHaveAttribute('aria-pressed', 'false');
  await yieldBtn.click();
  await expect(yieldBtn).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-yield.png` });

  await drawer.getByRole('button', { name: 'Mass balance' }).click();
  await expect(drawer).toHaveAccessibleName('Mass balance · ERP log sheet');
  await expect(drawer.locator('.pd-chart .highcharts-series-group .highcharts-column-series').first()).toBeVisible();
  const foot = drawer.locator('table tfoot');
  for (const v of ['14.84', '19.07', '10.92', '0.00']) await expect(foot).toContainText(v);
  await expect(foot.locator('.pd-check--ok')).toHaveText('✓');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-balance.png` });

  await drawer.getByRole('button', { name: 'Quality & stores' }).click();
  await expect(drawer).toHaveAccessibleName('Quality split · ERP log sheet');
  await expect(foot).toContainText('1,069.55');   // prime
  await expect(foot).toContainText('6.96');       // rolling defect
  await expect(foot.locator('.pd-check--ok')).toHaveCount(2);   // split ✓, stores ✓
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-quality.png` });

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('billets drawer: ERP input pieces against the Dicharged_Billet counter', async ({ page }) => {
  await pickWeek(page);
  await page.locator('section.panel', { hasText: 'Material & operating balance' }).getByRole('button', { name: /^Billets/ }).click();
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
  const drawer = page.getByRole('dialog', { name: 'Mill stands · live' });
  await expect(drawer.getByRole('button', { name: 'Finishing FM 1–6' })).toHaveAttribute('aria-pressed', 'true');
  await expect(drawer.getByRole('table', { name: 'Stand readings now' }).locator('tbody tr')).toHaveCount(6);
  await expect(drawer.getByRole('button', { name: /FM 01 · Motor_Curren1/ })).toBeVisible();
  await drawer.getByRole('button', { name: 'Roughing RM 1–5' }).click();
  await expect(drawer.getByRole('table', { name: 'Stand readings now' }).locator('tbody tr')).toHaveCount(5);
  await expect(drawer.getByRole('button', { name: /RM 05 · Motor_Curren5/ })).toBeVisible();
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-stands.png` });
});

test('production & dispatch by size, and its drawer', async ({ page }) => {
  await pickWeek(page);
  const panel = page.locator('section.panel', { hasText: 'Production & dispatch by size' });
  const first = panel.locator('.rm-size--button').first();
  await expect(first).toContainText('358–360 × 2.50');
  await expect(first).toContainText('254.1');
  // The panel names the actual dates, and each figure its meaning.
  await expect(panel.locator('.panel-sub')).toHaveText('ERP · 22 Sep – 28 Sep');
  await expect(first.locator('.rm-size-val-row').nth(0)).toHaveText(/Produced\s*254\.1/);
  await expect(first.locator('.rm-size-val-row').nth(1)).toHaveText(/Dispatched\s*177\.8/);
  // Every size is listed (22 in this week); the list scrolls inside the panel instead of
  // hiding sizes or stretching the row past the balance panel beside it.
  await expect(panel.locator('.rm-size--button')).toHaveCount(22);
  await expect(panel.getByRole('button', { name: /^22 sizes/ })).toBeVisible();
  const balance = page.locator('section.panel', { hasText: 'Material & operating balance' });
  const [hSizes, hBalance] = await Promise.all([panel.evaluate((e) => e.getBoundingClientRect().height), balance.evaluate((e) => e.getBoundingClientRect().height)]);
  expect(Math.abs(hSizes - hBalance)).toBeLessThan(2);
  const scroller = panel.locator('.rm-sizes-scroll');
  expect(await scroller.evaluate((e) => e.scrollHeight > e.clientHeight && e.scrollWidth <= e.clientWidth)).toBe(true);
  await panel.screenshot({ path: `${SHOTS}/wired-sizes-panel.png` });
  await scroller.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await panel.screenshot({ path: `${SHOTS}/wired-sizes-panel-scrolled.png` });
  await first.click();
  const drawer = page.getByRole('dialog', { name: 'Production & dispatch by size' });
  await expect(drawer.getByRole('button', { name: /Duration filter/ })).toHaveAttribute('aria-pressed', 'true');
  const row = drawer.getByRole('table', { name: 'Production and dispatch by size' }).getByRole('row', { name: /^358–360 × 2\.50\b/ });
  await expect(row).toContainText('254.07');
  await expect(drawer.getByRole('table', { name: 'Production and dispatch by size' }).locator('tfoot')).toContainText('1,076.51');
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-sizes.png` });
});

test('open orders: the book today, and orders placed per period', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const btn = page.getByRole('button', { name: /Open orders/ });
  await expect(btn).toContainText(/\d[\d,]* MT · \d+ lines/);
  await btn.click();
  const drawer = page.getByRole('dialog', { name: 'Sales orders · strip' });
  await expect(drawer.getByRole('table', { name: 'Open order lines' }).locator('tbody tr').first()).toBeVisible();
  await expect(drawer.getByRole('list', { name: 'Pending by order age' }).locator('li')).toHaveCount(4);
  await drawer.getByRole('button', { name: 'Weekly' }).click();
  await expect(drawer.getByRole('table', { name: 'Orders placed by period' }).getByRole('row', { name: /^Week of/ }).first()).toBeVisible();
  // Every figure names its ERP table and field.
  const src = drawer.getByRole('table', { name: 'ERP data source' });
  for (const t of ['ORDER_BODY', 'QTYORDER', 'QTYEXECUTED', 'QTYCANCELLED', 'DUEDATE', 'ACC_MAST.ACC_NAME']) await expect(src).toContainText(t);
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-orders.png` });
});

test('finished stock: ERP stock ledger to the period end, opening missing stated, drawer by size', async ({ page }) => {
  await pickWeek(page);
  const block = page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').nth(1);
  // 30 Nov 2025 → 28 Sep: no 26-27 opening in the ERP, so the change since go-live is shown, and said so.
  await expect(block).toContainText(/-?\d[\d,]*\.\d MT/);
  await expect(block).toContainText('opening stock for 26-27 not in the ERP yet');
  await block.getByRole('button', { name: /Finished stock/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Finished stock · ERP' });
  await expect(drawer.getByRole('note')).toContainText('no opening stock for 26-27');
  const types = drawer.getByRole('table', { name: 'Stock movements by type' });
  for (const t of ['PROD', 'SALE']) await expect(types.locator('tbody')).toContainText(t);
  await expect(types.locator('tfoot')).toContainText('0.00 +');
  await expect(drawer.getByRole('table', { name: 'Finished stock by size' }).locator('tbody tr').first()).toBeVisible();
  const src = drawer.getByRole('table', { name: 'ERP data source' });
  for (const t of ['ITEMTRAN_BODY', 'QTYRECD', 'QTYISSUED', 'FGYRDP', 'ITEMOPBAL_MAST', 'YROPQTY']) await expect(src).toContainText(t);
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-stock.png` });
});
