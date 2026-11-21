/**
 * The Alerts page and the Settings screen's Alerts tab (the user, 19 Nov 2026), end to end against the
 * running app and the real IOsense forms. Saves nothing: a save is shared by every deployment, so it is
 * checked by the backend's tests and by hand.
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

test.describe.configure({ timeout: 180_000 });
test.skip(!live, 'needs backend/.env (IOsense)');

test('every mill has an Alerts page in the sidebar; the period controls are hidden on it', async ({ page }) => {
  await page.goto('/lsm/asset-health');
  await page.getByRole('navigation', { name: 'Dashboard screens' }).getByRole('link', { name: /Alerts/ }).click();
  await expect(page).toHaveURL(/\/lsm\/alerts$/);
  await expect(page.getByRole('heading', { name: /Alerts/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Rolling:/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset the filters' })).toHaveCount(0);
});

test('RMD: the limits crossed and the data checks, from the real forms', async ({ page }) => {
  await page.goto('/rmd/alerts');
  await expect(page.getByRole('note')).toContainText('No messages are sent yet');
  const counts = page.getByRole('region', { name: 'Alert counts' });
  await expect(counts.getByRole('article', { name: 'Critical' })).not.toContainText('Loading', { timeout: 120_000 });
  // Every crossed row names its limit; every data check says what happened.
  const crossed = page.getByRole('table', { name: 'Limits crossed' });
  const checks = page.getByRole('table', { name: 'Data checks' });
  await expect(crossed.or(page.getByText('Nothing past its limit'))).toBeVisible();
  await expect(checks.or(page.getByText('Every form is filled'))).toBeVisible();
  if (await crossed.isVisible()) {
    for (const row of await crossed.locator('tbody tr').all()) await expect(row.locator('td').nth(4)).toHaveText(/max|min|–/);
  }
  await page.screenshot({ path: `${SHOTS}/alerts-rmd.png`, fullPage: true });
});

test('a row\'s Settings opens the Alerts tab at that alert; an edit shows as not saved and Cancel drops it', async ({ page }) => {
  await page.goto('/rms/alerts');
  const checks = page.getByRole('table', { name: 'Data checks' });
  await expect(checks.or(page.getByText('Every form is filled'))).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: `${SHOTS}/alerts-rms.png`, fullPage: true });

  // From the top bar on this page, Settings opens at the Alerts tab.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'RMS · Settings' });
  await expect(drawer.getByRole('tab', { name: 'Alerts' })).toHaveAttribute('aria-selected', 'true');
  const limits = drawer.getByRole('table', { name: 'Limits alerts' });
  await expect(limits).toBeVisible();
  // A blank box shows what it inherits.
  const fly = drawer.locator('[id="al-limit:flywheel-temp"]');
  await expect(fly).toContainText('Limit max 75 °C');
  await expect(fly.getByLabel('Flywheel bearings: Readings in a row')).toHaveAttribute('placeholder', '1');
  await expect(drawer.locator('[id="al-limit:motor-current"]')).toHaveCount(0);
  await drawer.screenshot({ path: `${SHOTS}/alerts-settings-rms.png` });

  await fly.getByLabel('Flywheel bearings: Readings in a row').fill('2');
  await expect(fly.getByText('Changed — not saved')).toBeVisible();
  await expect(drawer.getByText('1 change not saved')).toBeVisible();
  // The Limits tab keeps its own draft; the other tab shows how many are waiting.
  await drawer.getByRole('tab', { name: 'Limits' }).click();
  await expect(drawer.getByRole('tab', { name: 'Alerts · 1' })).toBeVisible();
  await expect(drawer.getByRole('table', { name: 'Temperatures limits' })).toBeVisible();
  await drawer.getByRole('tab', { name: /Alerts/ }).click();
  await drawer.getByRole('button', { name: 'Cancel' }).click();
  await expect(fly.getByLabel('Flywheel bearings: Readings in a row')).toHaveValue('');
  await drawer.getByRole('button', { name: 'Close RMS · Settings' }).click();

  // A data check's own Settings link: opens at that rule.
  await checks.getByRole('button', { name: /^Settings for / }).first().click();
  await expect(page.getByRole('dialog', { name: 'RMS · Settings' }).locator('tr.set-focus')).toHaveCount(1);
});

test('a limit without a value says it can\'t raise, and links to Limits', async ({ page }) => {
  await page.goto('/lsm/alerts');
  await expect(page.getByText(/no limit yet and can't raise/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'LSM · Settings' });
  const cur = drawer.locator('[id="al-limit:motor-current"]');
  await expect(cur).toContainText('No limit yet');
  await cur.getByRole('button', { name: 'Set a limit' }).click();
  await expect(drawer.getByRole('tab', { name: 'Limits' })).toHaveAttribute('aria-selected', 'true');
  await expect(drawer.locator('#set-motor-current')).toHaveClass(/set-focus/);
});
