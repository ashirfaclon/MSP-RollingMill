/**
 * HSM Asset Health's Bearing temp and Oil temp (the user, 25 Nov 2026), from HSM Mechanical → Bearing Temperature
 * Details: six cards in one row at every period and width; the hottest gearbox bearing / lubrication tank of the
 * drive group, where it is, coloured against the form's own T < 65 °C; each opens its drill-down. The filled case
 * is answered here in the form's shape (the form holds only a test entry so far) — it never reaches the dashboard.
 */
import { test, expect, type Page } from '@playwright/test';
const S = 'test-results/screenshots';

const round = (date: string, time: string, over: Record<string, number | null> = {}) => {
  const v = (k: string, d: number) => (k in over ? over[k] : d);
  const units = [['RM 1', 'roughing', 41, 39], ['RM 2', 'roughing', 44, 40], ['RM 3', 'roughing', 45, 42], ['RM 4', 'roughing', 47, 43],
    ['VE 1 · N-OS', 'roughing', 38, 37], ['VE 1 · OS', 'roughing', 39, 36], ['RM 5', 'roughing', 50, 46],
    ['FM 1', 'finishing', 52, 48], ['FM 2', 'finishing', 53, 49], ['FM 3', 'finishing', 55, 50], ['FM 4', 'finishing', 56, 51], ['FM 5', 'finishing', 58, 52], ['FM 6', 'finishing', 61, 57]] as const;
  return {
    date, time, shift: 'Day', section: '190 MM',
    bearings: units.map(([unit, group, d, n]) => ({ unit, group, dC: v(`${unit} d`, d), ndC: v(`${unit} nd`, n) })),
    tanks: [[1, 'R1 & R2', 'roughing', 44], [2, 'R3, R4 & R5', 'roughing', 46], [3, 'F1, F2 & F3', 'finishing', 49], [4, 'F4, F5 & F6', 'finishing', 51]]
      .map(([tank, stands, group, t]) => ({ tank, stands, group, tempC: v(`tank ${tank}`, t as number) })),
  };
};
const report = () => {
  const entries = [round('2026-11-24', '09:00:00'), round('2026-11-24', '15:00:00', { 'FM 6 d': 68, 'RM 5 d': 52, 'tank 4': 66, 'tank 2': 47 })];
  const latestBearings = entries[1].bearings.map((b) => ({ ...b, date: '2026-11-24', time: '15:00:00', shift: 'Day', section: '190 MM' }));
  const latestTanks = entries[1].tanks.map((t) => ({ ...t, date: '2026-11-24', time: '15:00:00', shift: 'Day', section: '190 MM' }));
  return { from: '2026-11-24', to: '2026-11-24', form: 'hsm-mechanical/bearing-temperature-details', logbook: { connection: 'up', message: 'ok' }, latestBearings, latestTanks, entries, lastDate: '2026-11-24' };
};
const cardsOf = (page: Page) => page.getByRole('region', { name: 'Condition KPIs' });
const group = async (page: Page, name: string) => {
  await page.locator('.topbar').getByRole('button', { name: /^Drive group: / }).click();
  await page.getByRole('listbox', { name: 'Drive group' }).getByRole('option', { name }).click();
};

test('real form: empty (only a test entry), six cards in one row across periods and widths', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto('/hsm/asset-health');
    for (const preset of ['Today', 'Yesterday', 'Current Month', 'Current Year']) {
      await page.getByRole('button', { name: /Duration/ }).click();
      await page.getByRole('dialog', { name: 'Select period' }).getByRole('button', { name: preset, exact: true }).click();
      const apply = page.getByRole('dialog', { name: 'Select period' }).getByRole('button', { name: 'Apply' });
      if (await apply.isVisible().catch(() => false)) await apply.click();
      const cards = cardsOf(page);
      await expect(cards.locator('.rm-card-label:not([aria-hidden="true"] *)')).toHaveText([/^Vibration RMS/, /^Bearing temp/, /^Motor temp/, /^Motor current/, /^Oil temp/, /^Run hours/]);
      // Only a test entry so far, left out: no entries yet.
      for (const name of ['Bearing temp', 'Oil temp']) await expect(cards.locator('.rm-card', { hasText: name })).toContainText('No entries recorded yet', { timeout: 60_000 });
      const tops = await cards.locator('.rm-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size, `${w} ${preset} one row`).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `${S}/hsm-gear-real-${w}-${preset.replace(' ', '')}.png` });
    }
  }
  expect(errors).toEqual([]);
});

test('filled (mocked from the form\'s shape): hottest, where, colour, groups, drill-downs', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/api/hsm/bearing-temp?**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(report()) }));
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto('/hsm/asset-health');
  const cards = cardsOf(page);
  const bearing = cards.locator('.rm-card', { hasText: 'Bearing temp' });
  const oil = cards.locator('.rm-card', { hasText: 'Oil temp' });
  // Finishing (the default): FM 6 D side 68 (over 65), tank 4 66.
  await expect(bearing.locator('.rm-card-value')).toHaveText(/^68\s*°C$/);
  await expect(bearing).toContainText('FM 6 · D side');
  await expect(oil.locator('.rm-card-value')).toHaveText(/^66\s*°C$/);
  await expect(oil).toContainText('Tank 4 · F4, F5 & F6');
  await expect(bearing.locator('.rm-card-value')).toHaveClass(/v-warn/);   // 68 > 65
  await page.screenshot({ path: `${S}/hsm-gear-mock-finishing.png` });
  await group(page, 'Roughing');
  await expect(bearing.locator('.rm-card-value')).toHaveText(/^52\s*°C$/);
  await expect(bearing).toContainText('RM 5 · D side');
  await expect(oil.locator('.rm-card-value')).toHaveText(/^47\s*°C$/);
  await expect(bearing.locator('.rm-card-value')).toHaveClass(/v-ok/);
  await group(page, 'All');
  await expect(bearing.locator('.rm-card-value')).toHaveText(/^68\s*°C$/);
  await bearing.click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('table', { name: 'Bearing temperatures per stand' }).locator('tbody tr')).toHaveCount(13);
  await expect(d.getByText(/T < 65|max 65/).first()).toBeVisible();
  await d.screenshot({ path: `${S}/hsm-gear-bearing-drill.png` });
  await page.keyboard.press('Escape');
  await oil.click();
  const o = page.getByRole('dialog');
  await expect(o.getByRole('table', { name: 'Oil temperature per lubrication tank' }).locator('tbody tr')).toHaveCount(4);
  await page.waitForTimeout(2500);
  await o.screenshot({ path: `${S}/hsm-gear-oil-drill.png` });
  await page.keyboard.press('Escape');
  await group(page, 'Finishing');
  await page.waitForTimeout(2500);
  await expect(page.locator('.ah-trends .ah-trend').nth(1)).toContainText('Bearing temp · °C');
  await page.locator('.ah-trends').screenshot({ path: `${S}/hsm-gear-trends.png` });
});
