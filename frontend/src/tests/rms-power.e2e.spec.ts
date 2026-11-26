/**
 * RMS power (the user, 26 Nov 2026), from the RMS Daily Power Consumption Record as updated: Power consumption is RMS's
 * own power, Specific energy is over prime production, Power factor is its own card — ten cards, two rows of five. The
 * drill-down has three views: Power sharing, VCB-1 vs VCB-2, Power factor.
 *
 * Test 1 reads the real logbook: to 22 Nov 2026 only the old form exists (VCB-1 only, no sharing).
 * Test 2 checks the layout of the new form's figures before the plant has filed any: the API reply is replaced, in this
 * test only, by a year of large made-up figures — nothing of it exists in the app.
 */
import { test, expect, type Page } from '@playwright/test';
const SHOTS = 'test-results/screenshots';

const period = async (page: Page, from: string, to: string) => {
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill(from);
  await dialog.getByLabel('End Date').fill(to);
  await dialog.getByRole('button', { name: 'Apply' }).click();
};

test('RMS power on the real logbook: old-form days are the VCB-1 reading; specific energy on prime; power factor', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/rms/visualization');
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  await period(page, '2026-11-01', '2026-11-22');
  // 1–22 Nov: Σ VCB-1 actual kWh of the 13 entries = 200,212 kWh; kVAh 218,314 → 0.917.
  const power = strip.getByRole('button', { name: 'Power consumption', exact: true });
  await expect(power.locator('.rm-card-value')).toContainText('200.21', { timeout: 60_000 });
  await expect(power.locator('.rm-card-note')).toHaveText('VCB-1 reading · not shared out');
  const pf = strip.getByRole('button', { name: 'Power factor', exact: true });
  await expect(pf.locator('.rm-card-value')).toContainText('0.92');
  await expect(pf.locator('.rm-card-note')).toHaveText('VCB-1: 0.92 · VCB-2: —');
  // Specific energy: the days with both power and prime — 179,581 kWh ÷ 4,504.06 MT prime = 39.87.
  const se = strip.getByRole('button', { name: 'Specific energy', exact: true });
  await expect(se.locator('.rm-card-value')).toContainText('39.87');
  await expect(se.locator('.rm-card-note')).toHaveText('per MT of prime');

  await power.click();
  const d = page.getByRole('dialog', { name: 'Power · logbook' });
  await expect(d.getByRole('table', { name: 'Power sharing by period' }).locator('tfoot td')).toHaveText(['Total', '2,00,212', '—', '—', '—', '—', '—']);
  await expect(d).toContainText('sharing was not recorded');
  await d.getByRole('group', { name: 'Power view' }).getByRole('button', { name: 'VCB-1 vs VCB-2' }).click();
  await expect(d.getByRole('table', { name: 'VCB-1 and VCB-2 by period' }).locator('tfoot td')).toHaveText(['Total', '2,00,212', '—', '2,00,212', '2,18,314', '—']);
  await d.getByRole('group', { name: 'Power view' }).getByRole('button', { name: 'Power factor' }).click();
  await expect(d.getByRole('table', { name: 'Power factor by period' }).locator('tfoot td').last()).toHaveText('0.92');
  await expect(d.getByRole('region', { name: 'Formula' })).toHaveText(/Power factor = kWh ÷ kVAh/);
  await page.waitForTimeout(1000);
  await d.screenshot({ path: `${SHOTS}/rms-power-factor-real.png` });
  await d.getByRole('button', { name: 'Close' }).click();

  await se.click();
  const sd = page.getByRole('dialog', { name: /Specific energy/ });
  await expect(sd.getByRole('table', { name: 'Specific energy by period' }).locator('thead')).toContainText('Prime production (MT)');
  await expect(sd.getByRole('table', { name: 'Specific energy by period' }).locator('tfoot td')).toHaveText(['Total', '1,79,581', '4,504.06', '39.87']);
  await expect(sd.getByRole('region', { name: 'Formula' })).toHaveText(/RMS power \(kWh\) ÷ Prime production \(MT\)/);
  expect(errors).toEqual([]);
});

/** A year of the new form, large figures: 300 days, both meters, the three shares. */
function fixture(from: string, to: string) {
  const days: Record<string, unknown>[] = [];
  const sum = { vcb1Kwh: 0, vcb2Kwh: 0, vcb1Kvah: 0, vcb2Kvah: 0, totalKwh: 0, hsmShareKwh: 0, crusherKwh: 0, colonyKwh: 0, rmsKwh: 0 };
  let prod = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`), i = 0; t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000, i += 1) {
    const s = { vcb1Kwh: 212_345.5 + i * 37, vcb2Kwh: 148_210.25 + i * 11, vcb1Kvah: 229_800 + i * 37, vcb2Kvah: 156_900 + i * 11, hsmShareKwh: 61_250.5, crusherKwh: 9_120.75, colonyKwh: 4_310.25 };
    const totalKwh = s.vcb1Kwh + s.vcb2Kwh;
    const rmsKwh = totalKwh - s.hsmShareKwh - s.crusherKwh - s.colonyKwh;
    const productionMt = 480.55 + (i % 7) * 12;
    (Object.keys(s) as (keyof typeof s)[]).forEach((k) => { sum[k] += s[k]; });
    sum.totalKwh += totalKwh; sum.rmsKwh += rmsKwh; prod += productionMt;
    days.push({
      date: new Date(t).toISOString().slice(0, 10), kwh: rmsKwh, entries: 1, byEquipment: {}, productionMt, kwhPerMt: rmsKwh / productionMt,
      rms: { ...s, totalKwh, rmsKwh, meterOnlyKwh: null, pf1: s.vcb1Kwh / s.vcb1Kvah, pf2: s.vcb2Kwh / s.vcb2Kvah, pf: totalKwh / (s.vcb1Kvah + s.vcb2Kvah) },
    });
  }
  return {
    from, to, form: 'rms-electrical-logbook/daily-power-consumption-record', basis: 'prime',
    logbook: { connection: 'up', message: 'Logbook connected', readSince: null }, equipment: [], days, entries: [], lastDate: to,
    totals: {
      kwh: sum.rmsKwh, entries: days.length, byEquipment: {}, productionMt: prod, kwhPerMt: sum.rmsKwh / prod, pairedKwh: sum.rmsKwh,
      rms: { ...sum, meterOnlyKwh: null, pf1: sum.vcb1Kwh / sum.vcb1Kvah, pf2: sum.vcb2Kwh / sum.vcb2Kvah, pf: sum.totalKwh / (sum.vcb1Kvah + sum.vcb2Kvah) },
    },
  };
}

test('RMS power, the new form at a day and at a year: ten cards in two rows, nothing spills; the three drill-down views', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/api/rms/power**', async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({ json: fixture(u.searchParams.get('from')!, u.searchParams.get('to')!) });
  });
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto('/rms/visualization');
    for (const [from, to] of [['2026-11-24', '2026-11-24'], ['2026-11-01', '2026-11-24'], ['2026-01-01', '2026-11-24']]) {
      await period(page, from, to);
      await expect(strip.locator('.rm-card-value', { hasText: 'Loading' })).toHaveCount(0, { timeout: 60_000 });
      await expect(strip.getByRole('button', { name: 'Power consumption', exact: true }).locator('.rm-card-note')).toHaveText(/^\d+(\.\d+)? % of total drawn$/);
      await expect(strip.locator('.rm-card')).toHaveCount(10);
      const tops = await strip.locator('.rm-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top / 10)));
      expect(new Set(tops).size, `${w} ${from}: two rows`).toBe(2);
      expect(tops.filter((t) => t === tops[0]).length, `${w} ${from}: five a row`).toBe(5);
      const spill = await strip.locator('.rm-card, .rm-card-note').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent?.slice(0, 50)));
      expect(spill, `${w} ${from}`).toEqual([]);
      const out = await strip.locator('.rm-card').evaluateAll((els) => els.flatMap((e) => {
        const edge = e.getBoundingClientRect().right - 6;
        return [...e.querySelectorAll('.rm-card-unit, .rm-card-note > *')].filter((x) => x.getBoundingClientRect().right > edge).map((x) => `${e.textContent?.slice(0, 30)}`);
      }));
      expect(out, `${w} ${from}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await strip.screenshot({ path: `${SHOTS}/rms-power-strip-year-${w}.png` });

    // The drill-down at a year, by month: the three views.
    await strip.getByRole('button', { name: 'Power consumption', exact: true }).click();
    const d = page.getByRole('dialog', { name: 'Power · logbook' });
    await d.getByRole('button', { name: 'Monthly' }).click();
    const views = d.getByRole('group', { name: 'Power view' });
    await expect(d.getByRole('table', { name: 'Power sharing by period' }).locator('thead th')).toHaveText(['Period', 'Total drawn (kWh)', 'HSM share', 'Crusher', 'Colony', 'RMS power (kWh)', 'RMS share']);
    await expect(d.locator('.pd-stats')).toContainText('RMS power');
    await page.waitForTimeout(1000);
    await d.screenshot({ path: `${SHOTS}/rms-power-sharing-${w}.png` });
    await views.getByRole('button', { name: 'VCB-1 vs VCB-2' }).click();
    await expect(d.getByRole('table', { name: 'VCB-1 and VCB-2 by period' })).toBeVisible();
    await page.waitForTimeout(1000);
    await d.screenshot({ path: `${SHOTS}/rms-power-meters-${w}.png` });
    await views.getByRole('button', { name: 'Power factor' }).click();
    await expect(d.getByRole('table', { name: 'Power factor by period' }).locator('tfoot td').last()).toHaveText('0.93');
    await page.waitForTimeout(1000);
    await d.screenshot({ path: `${SHOTS}/rms-power-pf-${w}.png` });
    // Nothing in the drawer's head or controls spills.
    const spill = await d.locator('.pd-controls, .pd-stats > div').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent?.slice(0, 40)));
    expect(spill, `${w} drawer`).toEqual([]);
    await d.getByRole('button', { name: 'Close' }).click();

    // The Power factor card opens the same drawer on its own view.
    await strip.getByRole('button', { name: 'Power factor', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Power · logbook' }).getByRole('table', { name: 'Power factor by period' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Power · logbook' }).getByRole('button', { name: 'Close' }).click();
  }
});
