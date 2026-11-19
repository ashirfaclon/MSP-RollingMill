/**
 * The Settings screen and the limits on Asset Health (the user, 19 Nov 2026), end to end against the
 * running app and the real IOsense settings store. Saves nothing: a save is shared by every
 * deployment, so it is checked by the backend's tests and by hand.
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
test.skip(!live, 'needs backend/.env (IOsense)');

test('LSM: Settings lists every limit with where it came from; a slip is refused before saving', async ({ page }) => {
  await page.goto('/lsm/asset-health');
  await page.getByRole('button', { name: 'Settings' }).click();
  const drawer = page.getByRole('dialog', { name: 'LSM · Settings' });
  await expect(drawer.getByRole('table', { name: 'Temperatures limits' })).toBeVisible();

  // The shipped placeholders, labelled as such, with their basis.
  const fly = drawer.locator('#set-flywheel-temp');
  await expect(fly.getByLabel(/Flywheel bearings maximum/)).toHaveValue('75');
  await expect(fly.getByText('Standard placeholder', { exact: true })).toBeVisible();
  await expect(drawer.locator('#set-motor-current').getByText('Not set — no alert')).toBeVisible();
  await expect(drawer.getByText(/Saved in IOsense|Defaults in use/)).toBeVisible();
  await drawer.screenshot({ path: `${SHOTS}/settings-lsm.png` });

  // An edit shows as not saved; a name is asked for; Cancel drops it.
  await fly.getByLabel(/Flywheel bearings maximum/).fill('70');
  await expect(fly.getByText('Changed — not saved')).toBeVisible();
  await expect(drawer.getByText('1 change not saved')).toBeVisible();
  await drawer.getByLabel('Your name').fill('');
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer.getByRole('status')).toHaveText(/Type your name/);
  await drawer.getByRole('button', { name: 'Cancel' }).click();
  await expect(fly.getByLabel(/Flywheel bearings maximum/)).toHaveValue('75');
  await expect(drawer.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('RMD: the plant\'s own limits, chemistry and the tank sizes in one place', async ({ page }) => {
  await page.goto('/rmd/asset-health');
  await page.getByRole('button', { name: 'Settings' }).click();
  const drawer = page.getByRole('dialog', { name: 'RMD · Settings' });
  const bearing = drawer.locator('#set-bearing-temp');
  await expect(bearing.getByLabel(/minimum/)).toHaveValue('45');
  await expect(bearing.getByLabel(/maximum/)).toHaveValue('65');
  await expect(bearing.getByText('Plant\'s limit', { exact: true })).toBeVisible();
  await expect(drawer.locator('#set-chem-sp').getByLabel(/maximum/)).toHaveValue('0.075');
  await expect(drawer.getByRole('table', { name: 'Oil tank size' })).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 1400 });
  await drawer.screenshot({ path: `${SHOTS}/settings-rmd.png` });
});

test('a drill-down shows the limits it colours by, and opens Settings at them', async ({ page }) => {
  await page.goto('/rms/asset-health');
  const strip = page.getByRole('region', { name: 'Condition KPIs' });
  await expect(strip.getByRole('button', { name: 'Bearing temp' })).not.toContainText('Loading');
  await strip.screenshot({ path: `${SHOTS}/settings-rms-cards.png` });
  await page.getByRole('button', { name: 'Bearing temp' }).click();
  const drill = page.getByRole('dialog', { name: 'Drive temperatures' });
  await expect(drill.getByText('Limits', { exact: true })).toBeVisible();
  await expect(drill.getByText(/max 75 °C/).first()).toBeVisible();
  await drill.screenshot({ path: `${SHOTS}/settings-rms-drill.png` });
  await drill.getByRole('button', { name: 'Edit in Settings' }).click();
  const drawer = page.getByRole('dialog', { name: 'RMS · Settings' });
  await expect(drawer.locator('#set-gearbox-bearing-temp')).toHaveClass(/set-focus/);
});
