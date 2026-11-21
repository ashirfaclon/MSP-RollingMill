/**
 * The top bar's controls (the user, 21 Nov 2026): Mill, Rolling and the drive group are dropdowns, all in
 * one row with Duration, Reset, Settings, theme and full screen — none on a line of their own.
 */
import { test, expect, type Page } from '@playwright/test';

const SHOTS = 'test-results/screenshots';
/** The vertical middle of each top-bar control: one row means they all match. */
const rowOf = (page: Page) => page.locator('.tb-right').evaluate((el) =>
  [...el.querySelectorAll(':scope > *, .tb-slot > *')]
    .filter((c) => !c.classList.contains('tb-slot') && (c as HTMLElement).offsetParent !== null)
    .map((c) => { const r = c.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));

test('RMD Asset Health: Mill, Rolling and Group are dropdowns in one row with the rest', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/rmd/asset-health');
  const bar = page.locator('.topbar');
  for (const name of [/^Rolling mill: RMD$/, /^Rolling: /, /^Drive group: /]) await expect(bar.getByRole('button', { name })).toBeVisible();
  await expect(bar.getByRole('group', { name: 'Drive group' })).toHaveCount(0);
  await expect(bar.getByRole('group', { name: 'Rolling' })).toHaveCount(0);
  const mids = await rowOf(page);
  expect(new Set(mids).size, `one row: ${mids.join(', ')}`).toBe(1);
  // On a full-HD screen the title and the controls share one row; narrower, the controls move under the
  // title together, still one row.
  await page.setViewportSize({ width: 1920, height: 1000 });
  const brand = await page.locator('.tb-brand').boundingBox();
  const right = await page.locator('.tb-right').boundingBox();
  expect(Math.abs((brand!.y + brand!.height / 2) - (right!.y + right!.height / 2))).toBeLessThan(3);
  await bar.screenshot({ path: `${SHOTS}/topbar-rmd-asset-1920.png` });
  await page.setViewportSize({ width: 1600, height: 900 });
  expect(new Set(await rowOf(page)).size).toBe(1);
  await bar.screenshot({ path: `${SHOTS}/topbar-rmd-asset-1600.png` });

  // The drive group switches the page: Roughing has no motor current card (the user, 30 Oct 2026).
  const cards = page.getByRole('main').getByRole('region', { name: 'Condition KPIs' });
  const group = bar.getByRole('button', { name: /^Drive group: / });
  await group.click();
  await page.getByRole('listbox', { name: 'Drive group' }).getByRole('option', { name: 'Roughing' }).click();
  await expect(group).toHaveAccessibleName('Drive group: Roughing');
  await expect(cards.getByRole('button', { name: 'Motor current', exact: true })).toHaveCount(0);
  await expect(cards.getByRole('button', { name: 'Bearing temp', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('HSM Asset Health: the Group dropdown in the same row', async ({ page }) => {
  await page.goto('/hsm/asset-health');
  await expect(page.locator('.topbar').getByRole('button', { name: /^Drive group: / })).toBeVisible();
  expect(new Set(await rowOf(page)).size).toBe(1);
  await page.locator('.topbar').screenshot({ path: `${SHOTS}/topbar-hsm-asset.png` });
});
