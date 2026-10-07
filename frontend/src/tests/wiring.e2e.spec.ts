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
  // Today: the by-products are not in the ERP yet, so the yield waits for them — stated, not guessed.
  await expect(yieldCard).toContainText('Awaits ERP losses');

  await pickWeek(page);
  // One yield: Influx net output 1,096.25 (counter 1,141.08 − by-products 44.83) ÷ Influx input 1,138.38 = 96.30 %.
  await expect(yieldCard.locator('.rm-card-value')).toContainText('96.3');
  await expect(yieldCard.locator('.rm-card-note')).toHaveText('');   // all 7 days have losses booked
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
  await expect(panel.getByRole('button', { name: /^Billet input/ })).toContainText('1,121.3 MT');
  await expect(panel.getByRole('button', { name: /^Yield/ })).toContainText('96.0%');
  await expect(panel.getByRole('button', { name: /^Finished/ })).toContainText('1,076.5 MT');
  await expect(panel.getByRole('button', { name: /^Mass difference/ })).toContainText('44.8 MT · 4.0% of input');
  await expect(panel.getByRole('button', { name: /^Billets/ })).toContainText('1,496 in · 1,481 coils out');
  const losses = panel.getByRole('group', { name: 'Losses' });
  for (const [k, v] of [['Burning loss', '14.8 MT 1.3%'], ['End cut', '19.1 MT 1.7%'], ['Miss-roll', '10.9 MT 1.0%'], ['Reject', '0.0 MT 0.0%']]) {
    await expect(losses.getByRole('button', { name: new RegExp(`^${k}`) })).toContainText(v);
  }
  await expect(panel.getByText('Balances ✓')).toBeVisible();
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

test('log-sheet drawer: yield, mass balance and quality views, each with chart, legend and checks', async ({ page }) => {
  await pickWeek(page);
  await page.getByRole('button', { name: 'Mass yield', exact: true }).click();
  // One drawer; its title follows the view, so find it by role and check the name.
  const drawer = page.getByRole('dialog');
  await expect(drawer).toHaveAccessibleName('Mass yield · Influx');
  await expect(drawer.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');

  await drawer.getByRole('button', { name: /Duration filter/ }).click();
  const table = drawer.getByRole('table', { name: 'Mass yield by period' });
  for (const v of ['1,138.38', '1,141.08', '− 44.83', '1,096.25', '96.30', '96.00']) {
    await expect(table.locator('tfoot')).toContainText(v);
  }
  // The four by-products taken off, each from ERP stores: 14.84 + 19.07 + 10.92 + 0 = 44.83.
  const bp = drawer.getByRole('table', { name: 'By-products by period' }).locator('tfoot');
  for (const v of ['14.84', '19.07', '10.92', '0.00', '44.83']) await expect(bp).toContainText(v);
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

test('finished stock by size: the ERP stock ledger per size, and its drawers', async ({ page }) => {
  await pickWeek(page);
  const panel = page.locator('section.panel', { hasText: 'Finished stock by size' });
  const first = panel.locator('.rm-size--button').first();
  await expect(first).toContainText('358–360 × 2.80');
  await expect(first).toContainText('103.5 MT');
  // Counted to the period end; no opening stock in the ERP, so it is the change since go-live.
  await expect(panel.locator('.panel-sub')).toHaveText('ERP · at end of 28 Sep · since 30 Nov ’25');
  // No order link in the ERP: every bar is free stock, and the legend keeps both series.
  await expect(first).toHaveAttribute('aria-label', '358–360 × 2.80 mm: with order 0.0 MT, free stock 103.5 MT');
  await expect(panel.getByText('With order')).toBeVisible();
  // 45 sizes in stock, drawn to one scale; the 25 below zero are counted, not drawn.
  await expect(panel.locator('.rm-size--button')).toHaveCount(45);
  const bars = await panel.locator('.rm-size-stack > i:nth-child(2)').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().width / e.parentElement!.getBoundingClientRect().width));
  expect(bars[0]).toBeCloseTo(1, 2);
  expect(bars[1]).toBeCloseTo(59.4 / 103.5, 1);
  await expect(panel.getByRole('button', { name: '45 sizes in stock · 498.8 MT · 25 below zero (-361.5 MT) · net 137.3 MT' })).toBeVisible();
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

  // A row opens the stock drawer, on the size table.
  await first.click();
  const stock = page.getByRole('dialog', { name: 'Finished stock · ERP' });
  await expect(stock.getByRole('table', { name: 'Finished stock by size' }).getByRole('row', { name: /^358–360 × 2\.80/ }).first()).toBeVisible();
  await stock.getByRole('button', { name: 'Close Finished stock · ERP' }).click();
  // Produced & dispatched per size moved to its own drawer, opened from the footer.
  await panel.getByRole('button', { name: 'Produced & dispatched by size' }).click();
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
  await expect(block).toContainText('no 26-27 opening stock in ERP');
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

test('running rate: Influx production ÷ running hours from billets, ERP rate beside it', async ({ page }) => {
  await pickWeek(page);
  // 22–28 Sep: 1,141.08 MT over 52.12 running hours = 21.89 TPH.
  const btn = page.getByRole('button', { name: /Running rate/ });
  await expect(btn).toContainText('21.89 TPH');
  await btn.click();
  const drawer = page.getByRole('dialog', { name: 'Running rate · calculated' });
  const table = drawer.getByRole('table', { name: 'Running rate by period' });
  await expect(table.locator('tfoot')).toContainText('1,141.08');
  await expect(table.locator('tfoot')).toContainText('52.12');
  await expect(table.locator('tfoot')).toContainText('21.89');
  await expect(table.locator('tbody tr')).toHaveCount(7);
  await expect(drawer.getByRole('table', { name: 'Mill runs' }).locator('tbody tr')).toHaveCount(43);
  const src = drawer.getByRole('table', { name: 'Data source' });
  for (const t of ['Dicharged_Billet', 'Total_Production_Ton', 'NET_RUNNING_HRS', 'DELAY_HRS', 'PROD_RATE_ON_RUNNING_HRS']) await expect(src).toContainText(t);
  await page.waitForTimeout(700);
  await drawer.screenshot({ path: `${SHOTS}/drill-running-rate.png` });
});
