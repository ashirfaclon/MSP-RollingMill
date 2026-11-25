/**
 * HSM Visualization: the plant's management KPIs from the ERP log sheet (HSM.xlsx, the user, 23 Nov 2026) —
 * cast, delivery, prime, rolling w.r.t. casting / delivery (Online only), cold power (Offline only) — by the
 * Rolling switch, against the running app and the real ERP sync. 1–18 Nov 2026, checked by hand on the ERP rows.
 */
import { test as base, expect, type Page } from '@playwright/test';

const SHOTS = 'test-results/screenshots';

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

test('HSM: six cards per row; Both shows the five headline cards and both sets, Online or Offline only that rolling\'s row', async ({ page }) => {
  await page.goto('/hsm/visualization');
  await page.getByRole('button', { name: /Duration/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await dialog.getByLabel('Start Date').fill('2026-11-01');
  await dialog.getByLabel('End Date').fill('2026-11-18');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  const labels = strip.locator('.rm-card-label-text');
  const value = (name: string) => strip.getByRole('button', { name, exact: true }).locator('.rm-card-value');
  const choose = async (option: string) => {
    await page.getByRole('button', { name: /^Rolling:/ }).click();
    await page.getByRole('listbox', { name: 'Rolling' }).getByRole('option', { name: option }).click();
  };
  const FIVE = [/^Production/, /^Mass yield/, /^Power consumption/, /^Specific energy/, /^Finished stock/];

  // Both: Online + Offline added; rolling % from the Online entries, cold power from the Offline ones. Twelve cards.
  // Cold power: kWh | kWh/MT in one card; Breakdown its own card, as on LSM (the user, 25 Nov 2026).
  await expect(labels).toHaveText([...FIVE, /^Cast qty/, /^Delivery/, /^Prime qty/, /^Rolling w\.r\.t\. casting/, /^Rolling w\.r\.t\. delivery/, /^Cold power/, /^Breakdown/]);
  for (const [name, v] of [['Cast qty', '3,253.86'], ['Delivery', '3,123.06'], ['Prime qty', '2,884.18'], ['Rolling w.r.t. casting', '92.3'], ['Rolling w.r.t. delivery', '96.2'], ['Cold power', '10,097'], ['Cold power', '668.68']]) {
    await expect(value(name)).toContainText(v);
  }
  // The bypasses are Online's: in the balance under Both and Online, not under Offline.
  const ops = page.getByRole('group', { name: 'Operating figures' });
  await expect(ops.getByRole('button')).toHaveText([/^Billets in/, /^Coils out/, /^Defective/, /^CCM bypass/, /^HSM bypass/]);
  await strip.screenshot({ path: `${SHOTS}/hsm-rolling-both.png` });

  // Online: its own row alone — production, cast, delivery, prime and the two rolling percentages (the user, 24 Nov 2026).
  await choose('Online');
  await expect(labels).toHaveText([/^Production/, /^Cast qty/, /^Delivery/, /^Prime qty/, /^Rolling w\.r\.t\. casting/, /^Rolling w\.r\.t\. delivery/, /^Breakdown/]);
  await expect(ops.getByRole('button')).toHaveText([/^Billets in/, /^Coils out/, /^Defective/, /^CCM bypass/, /^HSM bypass/]);
  await expect(strip.locator('.rm-card-value').nth(0)).toContainText('2,870.29');
  await expect(value('Cast qty')).toContainText('3,237.6');
  await expect(value('Rolling w.r.t. casting')).toContainText('92.3');
  await strip.screenshot({ path: `${SHOTS}/hsm-rolling-online.png` });

  // Offline: its own row alone — quantities and cold power; no rolling percentages (Offline's are never counted).
  await choose('Offline');
  await expect(labels).toHaveText([/^Production/, /^Cast qty/, /^Delivery/, /^Prime qty/, /^Cold power/, /^Breakdown/]);
  await expect(ops.getByRole('button')).toHaveText([/^Billets in/, /^Coils out/, /^Defective/]);
  // Breakdown opens its own drill-down.
  await strip.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Breakdown · ERP log sheet' }).getByRole('table', { name: 'Breakdown by period' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(strip.locator('.rm-card-value').nth(0)).toContainText('15.1');
  // The panels below stay as they are.
  await expect(page.locator('section.panel', { hasText: 'Production vs plan' })).toBeVisible();
  await expect(value('Cast qty')).toContainText('16.2');
  await expect(value('Cold power')).toContainText('10,097');
  await strip.screenshot({ path: `${SHOTS}/hsm-rolling-offline.png` });

  // The drill-down follows the Rolling.
  await value('Cast qty').click();
  const d = page.getByRole('dialog', { name: 'Cast, delivery and rolling · ERP log sheet' });
  const tb = d.getByRole('table', { name: 'Cast, delivery and rolling by period' });
  await expect(tb.locator('thead th')).toHaveText(['Period', 'Cast (MT)', 'Delivery (MT)', 'Billet input (MT)', 'Production (MT)', 'Prime (MT)', 'Cold power (kWh)', 'Cold power (kWh/MT)']);
  await expect(tb.locator('tfoot')).toContainText('16.23');
  await expect(d.getByRole('region', { name: 'Data source' })).toContainText('ST001 = Online, ST002 = Offline');
  await page.waitForTimeout(700);
  await d.screenshot({ path: `${SHOTS}/hsm-rolling-drill.png` });
  await page.keyboard.press('Escape');
  await choose('Both');
});
