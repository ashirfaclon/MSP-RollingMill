/**
 * HSM Visualization, Both (the user, 25 Nov 2026): Mill power and Hot billet (heater) from Electrical HSM → Billet
 * Heater Performance & Mill Power, beside Specific energy — fourteen cards, two rows of seven, at every period and
 * width; not under Online or Offline. The filled case is answered here in the form's shape (the form holds only a
 * test entry so far) — it never reaches the dashboard.
 */
import { test, expect, type Page } from '@playwright/test';
const S = 'test-results/screenshots';

const period = (key: string, label: string, hot: number | null, mt: number | null, kwh: number | null, days = 1, entryDays = 1) => ({
  key, label, fromDate: key, toDate: key, days, entryDays,
  hotBilletMt: hot, hotBilletKwh: hot && hot * 80, hotBilletKwhPerMt: hot && 80,
  coldBilletMt: hot && 40, coldBilletKwh: hot && 4800, coldBilletKwhPerMt: hot && 120,
  millPowerMt: mt, millPowerKwh: kwh, millPowerKwhPerMt: mt && kwh ? Math.round((kwh / mt) * 100) / 100 : null,
});
const filled = (url: string) => {
  const from = new URL(url).searchParams.get('from')!;
  const to = new URL(url).searchParams.get('to')!;
  const rows = [period(`${from}-a`, 'Day 1', 300, 350, 35_000), period(`${to}-b`, 'Day 2', 100, 150, 18_000)];
  return { from, to, grain: 'day', form: 'electrical-hsm/billet-heater-performance-mill-power', logbook: { connection: 'up', message: 'ok' },
    rows, totals: { ...period('total', 'Total', 400, 500, 53_000, 2, 2), fromDate: from, toDate: to }, lastDate: to };
};
const pick = async (page: Page, preset: string) => {
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: /Duration/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: preset, exact: true }).click();
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Duration/ })).toContainText(preset);
};
const rolling = async (page: Page, name: string) => {
  await page.locator('.topbar').getByRole('button', { name: /^Rolling: / }).click();
  await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name }).click();
};
const labels = (page: Page) => page.getByRole('region', { name: 'Headline KPIs' }).locator('.rm-card-label:not([aria-hidden="true"] *)');

test('Both: two rows of seven with Mill power and Hot billet (heater) beside Specific energy; every period and width', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto('/hsm/visualization');
    for (const preset of ['Today', 'Yesterday', 'Current Month', 'Current Year']) {
      await pick(page, preset);
      const strip = page.getByRole('region', { name: 'Headline KPIs' });
      await expect(labels(page).nth(4)).toHaveText(/^Mill power/);
      await expect(labels(page).nth(5)).toHaveText(/^Hot billet \(heater\)/);
      await expect(labels(page).nth(3)).toHaveText(/^Specific energy/);
      await expect(strip.locator('.rm-card')).toHaveCount(14);
      // Only a test entry so far, left out.
      for (const name of ['Mill power', 'Hot billet (heater)']) await expect(strip.locator('.rm-card', { hasText: name })).toContainText('No entries recorded yet', { timeout: 60_000 });
      await expect(strip.locator('.rm-card-value', { hasText: 'Loading' })).toHaveCount(0, { timeout: 60_000 });
      const tops = await strip.locator('.rm-card').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
      expect(tops.length, `${w} ${preset}: two rows`).toBe(2);
      // Nothing spills out of a card.
      const spill = await strip.locator('.rm-card').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent?.slice(0, 30)));
      expect(spill, `${w} ${preset}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await strip.screenshot({ path: `${S}/hsm-heater-${w}-${preset.replace(' ', '')}.png` });
    }
  }
  // Not under Online or Offline.
  for (const r of ['Online', 'Offline']) {
    await rolling(page, r);
    await expect(labels(page).first()).toBeVisible();
    await expect(labels(page).filter({ hasText: /^(Mill power|Hot billet)/ })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('filled (answered in the form\'s shape): figures and both drill-downs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/api/hsm/heater-power?**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(filled(r.request().url())) }));
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto('/hsm/visualization');
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  const mill = strip.locator('.rm-card', { hasText: 'Mill power' });
  const hot = strip.locator('.rm-card', { hasText: 'Hot billet (heater)' });
  await expect(mill.locator('.rm-card-value')).toHaveText(/^106(\.0)?\s*kWh\/MT$/);   // 53 000 ÷ 500
  await expect(hot.locator('.rm-card-value')).toHaveText(/^400(\.0)?\s*MT$/);
  await strip.screenshot({ path: `${S}/hsm-heater-filled.png` });
  await mill.click();
  const d = page.getByRole('dialog', { name: 'Mill power' });
  await expect(d.getByRole('table', { name: /Mill power by period/ }).locator('tfoot')).toContainText('106');
  await d.screenshot({ path: `${S}/hsm-heater-mill-drill.png` });
  await page.keyboard.press('Escape');
  await hot.click();
  const h = page.getByRole('dialog', { name: /Hot billet production/ });
  await expect(h.getByRole('table', { name: /Hot billet production/ }).locator('tbody tr')).toHaveCount(2);
  await page.waitForTimeout(1500);
  await h.screenshot({ path: `${S}/hsm-heater-hot-drill.png` });
  expect(errors).toEqual([]);
});
