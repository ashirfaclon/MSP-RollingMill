/**
 * RMS production (the user, 25 Nov 2026): Production · Actual (PRODUCTION_MT) with its defective part and share under it
 * (DEFECTIVE_CUTMT1/2 + ROLLING_DEFECT_MT1/2); beside it Production · Prime (PRIME_MT1/2) with its share of the actual;
 * then Rolling in casting / delivery (the ERP's on-line
 * rolling %), Prime yield (prime ÷ billet input). Nine cards: five across (output, yields, stock), then four (rolling %,
 * energy) — two full rows at every period and width; the drill-downs have each per day.
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

test('RMS: actual production with its prime and defective parts, from the ERP log sheet', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/rms/visualization');
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  const card = strip.getByRole('button', { name: 'Production · Actual', exact: true });
  const prime = strip.getByRole('button', { name: 'Production · Prime', exact: true });
  // 24 Nov 2026 as the ERP holds it: 269.59 actual = 230.60 prime + 38.99 defective.
  await period(page, '2026-11-24', '2026-11-24');
  await expect(card.locator('.rm-card-value')).toContainText('269.59', { timeout: 60_000 });
  await expect(card.locator('.rm-card-note')).toHaveText(/^Defective 38\.99 MT · 14\.46 %$/);   // 38.99 ÷ 269.59
  await expect(prime.locator('.rm-card-value')).toContainText('230.6');
  await expect(prime.locator('.rm-card-note')).toHaveText(/^85\.54 % of actual$/);
  // 22 Nov 2026 as the ERP holds it: ROLLING_PERCENATGE_CASTING 95.116, ROLLING_PERCENTAGE_DELIVERY 97.015.
  await period(page, '2026-11-22', '2026-11-22');
  await expect(strip.getByRole('button', { name: 'Rolling in casting', exact: true }).locator('.rm-card-value')).toContainText('95.12', { timeout: 60_000 });
  await expect(strip.getByRole('button', { name: 'Rolling in delivery', exact: true }).locator('.rm-card-value')).toContainText('97.02');
  await expect(strip.locator('.rm-card-label-text')).toHaveText([/^Production · Actual/, /^Production · Prime/, /^Mass yield/, /^Prime yield/, /^Finished stock/, /^Rolling in casting/, /^Rolling in delivery/, /^Power consumption/, /^Specific energy/]);
  // Prime yield 22 Nov: 328.12 ÷ 360.10 = 91.12 % (mass yield on the actual, 92.57 %).
  await expect(strip.getByRole('button', { name: 'Prime yield', exact: true }).locator('.rm-card-value')).toContainText('91.1');
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 1000 });
    for (const [from, to] of [['2026-11-24', '2026-11-24'], ['2026-11-01', '2026-11-24'], ['2026-01-01', '2026-11-24']]) {
      await period(page, from, to);
      await expect(strip.locator('.rm-card-value', { hasText: 'Loading' })).toHaveCount(0, { timeout: 60_000 });
      await expect(strip.locator('.rm-card')).toHaveCount(9);
      const rows = new Set(await strip.locator('.rm-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top / 10)))).size;
      expect(rows, `${w} ${from}: two rows`).toBe(2);
      // Both rows full: the first five end where the last four end.
      const rights = await strip.locator('.rm-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
      expect(Math.abs(rights[4] - rights[8]), `${w} ${from}: rows end together`).toBeLessThan(2);
      // Nothing wider than its card: the figure, and the prime · defective line under it.
      const spill = await strip.locator('.rm-card, .rm-card-note').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent?.slice(0, 40)));
      expect(spill, `${w} ${from}`).toEqual([]);
      // Every figure and its unit end inside their card.
      const out = await strip.locator('.rm-card').evaluateAll((els) => els.flatMap((e) => {
        const edge = e.getBoundingClientRect().right - 6;
        return [...e.querySelectorAll('.rm-card-unit, .rm-card-defect')].filter((x) => x.getBoundingClientRect().right > edge).map((x) => `${e.textContent?.slice(0, 20)} ${x.className}`);
      }));
      expect(out, `${w} ${from}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await strip.screenshot({ path: `${SHOTS}/rms-production-parts-${w}.png` });
  }
  await card.click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('table', { name: 'Production by period' }).locator('thead')).toContainText('Defective (MT)');
  await page.keyboard.press('Escape');
  await strip.getByRole('button', { name: 'Rolling in delivery', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('table', { name: 'Rolling in casting and delivery by period' })).toBeVisible();
  expect(errors).toEqual([]);
});
