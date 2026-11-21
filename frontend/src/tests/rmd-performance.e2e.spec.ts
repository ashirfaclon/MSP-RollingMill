/**
 * RMD: the Zoho TMT KPIs the plant asked for (21 Nov 2026) — Rolling in casting, Rolling in delivery and
 * Plant efficiency — from the ERP log sheet, per rolling, each card opening the day-by-day drill-down.
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
  const cards = ['Rolling in casting', 'Rolling in delivery', 'Plant efficiency'];
  for (const c of cards) {
    await expect(strip.getByRole('button', { name: new RegExp(`^${c}`) })).not.toContainText('Loading', { timeout: 60_000 });
    await expect(strip.getByRole('button', { name: new RegExp(`^${c}`) })).toContainText(/\d+(\.\d)?%|NA/);
  }
  await page.screenshot({ path: `${SHOTS}/rmd-performance-cards.png` });

  // Online and Offline: each its own figures.
  const both = await strip.getByRole('button', { name: /^Plant efficiency/ }).innerText();
  await page.getByRole('group', { name: 'Rolling' }).getByRole('button', { name: 'Offline' }).click();
  await expect(strip.getByRole('button', { name: /^Plant efficiency/ })).not.toHaveText(both);
  await page.getByRole('group', { name: 'Rolling' }).getByRole('button', { name: 'Both' }).click();

  await strip.getByRole('button', { name: /^Rolling in casting/ }).click();
  const drill = page.getByRole('dialog', { name: /Rolling in casting, delivery and plant efficiency/ });
  await expect(drill.getByRole('table', { name: 'Rolling performance by period' })).toBeVisible();
  await expect(drill.getByText('ROLLING_IN_TOTAL_PERCENTAGE', { exact: false }).first()).toBeVisible();
  await page.waitForTimeout(1500);   // the bars grow in
  await drill.screenshot({ path: `${SHOTS}/rmd-performance-drill.png` });
});
