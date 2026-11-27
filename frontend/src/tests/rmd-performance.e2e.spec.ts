/**
 * RMD: the Zoho TMT KPIs the plant asked for (21 Nov 2026) — Rolling in casting, Rolling in delivery and
 * Plant efficiency — the plant's formula (26 Nov 2026), per rolling, each card opening the day-by-day drill-down.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SHOTS = 'test-results/screenshots';
const live = existsSync(path.resolve(process.cwd(), '../backend/.env'));

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
test.skip(!live, 'needs backend/.env (ERP cache)');

test('RMD: rolling in casting, rolling in delivery and plant efficiency, per rolling, with their days', async ({ page }) => {
  await page.goto('/rmd/visualization');
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  // Both (the default): no rolling in casting / delivery (the user, 27 Nov 2026) — ten cards, two rows of five.
  await expect(strip.locator('.rm-card-value', { hasText: 'Loading' })).toHaveCount(0, { timeout: 60_000 });
  await expect(strip.getByRole('button', { name: /^Rolling in (casting|delivery)/ })).toHaveCount(0);
  await expect(strip.locator('.rm-card')).toHaveCount(10);
  const bothTops = await strip.locator('.rm-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top / 10)));
  expect(new Set(bothTops).size).toBe(2);
  expect(bothTops.filter((t) => t === bothTops[0]).length).toBe(5);
  await strip.screenshot({ path: `${SHOTS}/rmd-both-cards.png` });
  const both = await strip.getByRole('button', { name: /^Plant efficiency/ }).innerText();
  const rolling = page.getByRole('button', { name: /^Rolling:/ });
  await rolling.click();
  await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name: 'Online' }).click();
  const cards = ['Rolling in casting', 'Rolling in delivery', 'Plant efficiency'];
  for (const c of cards) {
    await expect(strip.getByRole('button', { name: new RegExp(`^${c}`) })).not.toContainText('Loading', { timeout: 60_000 });
    await expect(strip.getByRole('button', { name: new RegExp(`^${c}`) })).toContainText(/\d+(\.\d+)?\s*%|NA|Prime \+ SL\s*\d/);
  }
  await page.screenshot({ path: `${SHOTS}/rmd-performance-cards.png` });

  await expect(strip.locator('.rm-card')).toHaveCount(12);
  // Online and Offline: each its own figures.
  await expect(rolling).toHaveAccessibleName('Rolling: Online');
  await rolling.click();
  await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name: 'Offline' }).click();
  await expect(rolling).toHaveAccessibleName('Rolling: Offline');
  await page.locator('.topbar').screenshot({ path: `${SHOTS}/rmd-rolling-dropdown.png` });
  await expect(strip.getByRole('button', { name: /^Plant efficiency/ })).not.toHaveText(both);
  // No Rolling in casting under Offline (the user, 25 Nov 2026); with Breakdown, two rows of six.
  await expect(strip.getByRole('button', { name: /^Rolling in casting/ })).toHaveCount(0);
  await expect(strip.getByRole('button', { name: /^Rolling in delivery/ })).toBeVisible();
  for (const name of ['Mill MPS', 'Coal consumption', 'Breakdown']) await expect(strip.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(strip.locator('.rm-card')).toHaveCount(12);
  // Rows by top edge, within a few pixels (a flip card sits 1 px off).
  const rows = new Set(await strip.locator('.rm-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top / 10)))).size;
  expect(rows).toBe(2);
  await strip.screenshot({ path: `${SHOTS}/rmd-offline-cards.png` });
  await rolling.click();
  await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name: 'Online' }).click();

  await strip.getByRole('button', { name: /^Rolling in casting/ }).click();
  const drill = page.getByRole('dialog', { name: /Rolling in casting and delivery/ });
  await expect(drill.getByRole('table', { name: 'Rolling performance by period' })).toBeVisible();
  await expect(drill.getByText('ROLLING_IN_TOTAL_PERCENTAGE', { exact: false }).first()).toBeVisible();
  await page.waitForTimeout(1500);   // the bars grow in
  await drill.screenshot({ path: `${SHOTS}/rmd-performance-drill.png` });
});

test('RMD plant efficiency: availability = actual hours ÷ available hours, the same on Online, Offline and Both (the user, 27 Nov 2026)', async ({ page }) => {
  test.setTimeout(240_000);
  const period = async (from: string, to: string) => {
    await page.getByRole('button', { name: /Duration/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Select period' });
    await dialog.getByLabel('Start Date').fill(from);
    await dialog.getByLabel('End Date').fill(to);
    await dialog.getByRole('button', { name: 'Apply' }).click();
  };
  const num = (v: number | null) => (v === null ? 'NA' : String(v));
  await page.goto('/rmd/visualization');
  const card = page.getByRole('region', { name: 'Headline KPIs' }).getByRole('button', { name: /^Plant efficiency/ });
  for (const [from, to] of [['2026-11-25', '2026-11-25'], ['2026-11-01', '2026-11-26']]) {
    await period(from, to);
    for (const [rolling, mode] of [['Online', 'online'], ['Offline', 'offline'], ['Both', 'all']] as const) {
      const api = await (await page.request.get(`http://localhost:8521/api/rmd/production?from=${from}&to=${to}&grain=day&mode=${mode}`)).json();
      const t = api.totals as { plantEfficiencyPct: number | null; primeEfficiencyPct: number | null; availabilityPct: number | null; effRunningHrs: number | null; availableHrs: number | null };
      if (t.effRunningHrs !== null && t.availableHrs) {
        expect(t.availabilityPct, `${rolling} ${from}`).toBeCloseTo((t.effRunningHrs / t.availableHrs) * 100, 0);
      }
      await page.getByRole('button', { name: /^Rolling:/ }).click();
      await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name: rolling }).click();
      await expect(card.locator('.rm-card-pair')).toHaveText(new RegExp(`Prime \\+ SL\\s*${num(t.plantEfficiencyPct).replace('.', '\\.')}\\s*Prime\\s*${num(t.primeEfficiencyPct).replace('.', '\\.')}`), { timeout: 60_000 });
      await card.click();
      const d = page.getByRole('dialog', { name: /Plant efficiency/ });
      const table = d.getByRole('table', { name: 'Plant efficiency by period' });
      await expect(table.locator('thead')).toContainText('Actual hours (h)');
      await expect(table.locator('thead')).toContainText('Available hours (h)');
      await expect(table.locator('thead')).not.toContainText('Breakdown');
      await expect(table.locator('tfoot')).toContainText(num(t.availabilityPct));
      await expect(d.getByRole('region', { name: 'Formula' })).toContainText('Availability = Actual hours ÷ Available hours × 100');
      await expect(d.getByRole('region', { name: 'Data source' })).toContainText('AVAILABLE_HOURS');
      await expect(d.getByRole('region', { name: 'Data source' })).not.toContainText('MILL_BKDN');
      await page.waitForTimeout(600);
      await d.screenshot({ path: `${SHOTS}/rmd-efficiency-${mode}-${from === to ? 'day' : 'month'}.png` });
      await d.getByRole('button', { name: 'Close' }).click();
    }
  }
});

test('RMD Breakdown: the sheet\'s seven items added, hours; opens each on its own like Finished stock (the user, 25 Nov 2026)', async ({ page }) => {
  await page.goto('/rmd/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-10-01');
  await dialog.getByLabel('End Date').fill('2026-10-31');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  // October, both rollings, as the ERP holds it: electrical 20 + process 30 + single stand 65 minutes = 1.92 h.
  const card = strip.getByRole('button', { name: 'Breakdown', exact: true });
  await expect(card.locator('.rm-card-value')).toHaveText(/^1\.92\s*h$/, { timeout: 60_000 });
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    const rows = new Set(await strip.locator('.rm-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top / 10)))).size;
    expect(rows, `${w}: two rows`).toBe(2);
    // Both: ten cards, two rows of five — no rolling % under Both (the user, 27 Nov 2026).
    await expect(strip.locator('.rm-card')).toHaveCount(10);
  }
  await card.click();
  const d = page.getByRole('dialog', { name: 'Breakdown' });
  const body = d.getByRole('table', { name: 'Breakdown by cause' }).locator('tbody tr');
  await expect(body).toHaveCount(7);
  await expect(body.first()).toContainText('Mill single stand');   // largest first
  await expect(d.getByRole('table', { name: 'Breakdown by cause' }).locator('tfoot')).toContainText('1.92');
  await d.screenshot({ path: `${SHOTS}/rmd-breakdown-drill.png` });
});

test('RMD balance strip: Billets in, CCM bypass (not under Offline), RMD bypass, Short length — each opens its days (the user, 25 Nov 2026)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const tiles = page.getByRole('group', { name: 'Billets and operating figures' }).locator('.rm-mb-stat');
  const pick = async (preset: string) => {
    const dialog = page.getByRole('dialog', { name: 'Select period' });
    await page.getByRole('button', { name: /Duration/ }).click();
    await dialog.getByRole('button', { name: preset, exact: true }).click();
    if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Apply' }).click();
  };
  const rolling = async (name: string) => {
    await page.getByRole('button', { name: /^Rolling:/ }).click();
    await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name }).click();
  };
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto('/rmd/visualization');
    for (const preset of ['Today', 'Yesterday', 'Current Month', 'Current Year']) {
      await pick(preset);
      await expect(tiles).toHaveText([/^Billets in/, /^CCM bypass/, /^RMD bypass/, /^Short length/]);
      const tops = new Set(await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))));
      expect(tops.size, `${w} ${preset}: one row`).toBe(1);
      const spill = await tiles.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
      expect(spill, `${w} ${preset}`).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole('group', { name: 'Billets and operating figures' }).screenshot({ path: `${SHOTS}/rmd-balance-strip-${w}.png` });
  }
  await rolling('Offline');
  await expect(tiles).toHaveText([/^Billets in/, /^RMD bypass/, /^Short length/]);
  await rolling('Both');
  // 1–24 Nov, both rollings, as the ERP holds it.
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-11-01');
  await dialog.getByLabel('End Date').fill('2026-11-24');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(tiles).toHaveText([/^Billets in/, /^CCM bypass\s*359\.54/, /^RMD bypass\s*128\.36/, /^Short length\s*128\.89/], { timeout: 60_000 });
  await tiles.filter({ hasText: 'Short length' }).click();
  const d = page.getByRole('dialog', { name: /Short length/ });
  await expect(d.getByRole('table', { name: 'Short length by period' }).locator('tfoot')).toContainText('128.89');
  await d.screenshot({ path: `${SHOTS}/rmd-short-length-drill.png` });
  expect(errors).toEqual([]);
});

test('RMD TPH is the ERP\'s delivery rate, exactly as filed — Visualization and Condition Analytics (the user, 25 Nov 2026)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const period = async (from: string, to: string) => {
    await page.getByRole('button', { name: /Duration/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Select period' });
    await dialog.getByLabel('Start Date').fill(from);
    await dialog.getByLabel('End Date').fill(to);
    await dialog.getByRole('button', { name: 'Apply' }).click();
  };
  const online = async () => {
    await page.getByRole('button', { name: /^Rolling:/ }).click();
    await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name: 'Online' }).click();
  };
  await page.goto('/rmd/visualization');
  await online();
  const foot = page.getByRole('button', { name: /^TPH · delivery rate/ });
  // 7 Nov 2026 Online as the ERP holds it (260 running hours filed): 1.13 TPH — shown as it is, so it gets fixed.
  await period('2026-11-07', '2026-11-07');
  await expect(foot).toContainText('1.13 TPH', { timeout: 60_000 });
  await period('2026-11-24', '2026-11-24');
  await expect(foot).toContainText('24.9 TPH', { timeout: 30_000 });
  await period('2026-11-01', '2026-11-24');
  await expect(foot).toContainText('12.85 TPH', { timeout: 30_000 });
  await foot.click();
  const d = page.getByRole('dialog', { name: /TPH · delivery rate/ });
  await expect(d.getByRole('table', { name: 'TPH by period' }).locator('tfoot')).toContainText('12.85');
  await d.screenshot({ path: `${SHOTS}/rmd-tph-drill.png` });
  await page.keyboard.press('Escape');
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await foot.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  }
  // Both: no TPH (the user, 27 Nov 2026) — the plan panel keeps three equal figures, no empty fourth.
  await page.getByRole('button', { name: /^Rolling:/ }).click();
  await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name: 'Both' }).click();
  await expect(foot).toHaveCount(0, { timeout: 30_000 });
  const stats = page.locator('.rm-pvp-stats').first();
  await expect(stats.locator('> *')).toHaveCount(3);
  const widths = await stats.locator('> *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(3);
  await online();
  await page.goto('/rmd/condition-analytics');
  await expect(page.getByRole('button', { name: /^Actual rate/ }).locator('.rm-card-value')).toHaveText(/^12\.85/, { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('RMD Billets in says it is from Influx (the plant counters), not the ERP — and when Influx is not answering (the user, 26 Nov 2026)', async ({ page }) => {
  await page.goto('/rmd/visualization');
  const tile = page.getByRole('group', { name: 'Billets and operating figures' }).locator('.rm-mb-stat').first();
  await expect(tile).toContainText(/Billets in([\d,]+pcs|NA)/, { timeout: 60_000 });
  await expect(tile).toHaveAttribute('title', /Influx/);
  const api = await page.request.get('http://localhost:8521/api/rmd/billets?from=2026-11-25&to=2026-11-25&grain=day');
  const down = (await api.json()).influx.connection === 'down';
  if (down) await expect(tile).toContainText('Influx not answering');
  else await expect(tile).not.toContainText('Influx not answering');
  await tile.screenshot({ path: `${SHOTS}/rmd-billets-tile.png` });

  // Opens the Influx billet infeed — its Data source names Influx and the tag, not the ERP log sheet.
  await tile.click();
  const d = page.getByRole('dialog', { name: /Billet infeed · Influx/ });
  await expect(d.getByRole('table', { name: 'Billets in by period' })).toBeVisible({ timeout: 60_000 });
  const src = d.getByRole('region', { name: 'Data source' }).or(d.locator('section[aria-label="Data source"]'));
  await expect(src).toContainText('Influx');
  await expect(src).toContainText('BILLET_COUNT');
  await expect(src).not.toContainText('ERP');
  if (down) await expect(d.getByRole('status').filter({ hasText: 'not answering' })).toContainText('ERP figures are not affected');
  await d.screenshot({ path: `${SHOTS}/rmd-billets-drill.png` });
});
