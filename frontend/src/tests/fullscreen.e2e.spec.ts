/** Full screen from the top bar (the user, 21 Nov 2026): the last control on the right; on, then off again. */
import { test, expect } from '@playwright/test';

test('the top bar\'s full-screen button fills the screen and leaves it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/rmd/visualization');
  const right = page.locator('.tb-right');
  const btn = right.getByRole('button', { name: 'Full screen' });
  await expect(btn).toBeVisible();
  // The last control of the bar.
  await expect(right.locator(':scope > *').last()).toHaveAttribute('aria-label', 'Full screen');
  await page.locator('.topbar').screenshot({ path: 'test-results/screenshots/fullscreen-topbar.png' });

  await btn.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  const exit = right.getByRole('button', { name: 'Exit full screen' });
  await expect(exit).toHaveAttribute('aria-pressed', 'true');
  await exit.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(right.getByRole('button', { name: 'Full screen' })).toBeVisible();
  expect(errors).toEqual([]);
});
