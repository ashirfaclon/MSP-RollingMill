import { test as base, expect, type Page } from '@playwright/test';

const SHOTS = 'test-results/screenshots';

/** Every test fails on a console error or an uncaught page error. */
const test = base.extend<{ page: Page }>({
  page: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await provide(page);
    expect(errors, 'console errors').toEqual([]);
  },
});

test('root redirects to HSM Visualization and shows every KPI from the comp', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/hsm\/visualization$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Rolling Mill\s*\/\s*Visualization/);

  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  const card = (name: string) => strip.getByRole('article', { name, exact: true });
  await expect(card('Production')).toContainText('342.0');
  await expect(card('Production')).toContainText('95% plan · 15.83 TPH');
  await expect(card('Mass yield')).toContainText('96.6');
  await expect(card('Power consumption')).toContainText('30.78');
  await expect(card('Specific energy')).toContainText('90.0');
  await expect(card('Production without order')).toContainText('72.0');
  await expect(card('Production without order')).toContainText('21.1% of day output');
  await expect(card('Stock with order')).toContainText('420');
  await expect(card('Stock with order')).toContainText('66.7% of finished stock');
  await expect(card('Free stock')).toContainText('210');

  const main = page.getByRole('main');
  for (const text of [
    'Mill mimic', '282 billets', 'Production by shift', '118.0 MT', '120 MT target', '18.0 MT',
    'Order allocation', '270.0 MT', '630 MT', 'Material & operating balance', '354.0 MT', '13.06/h',
    'Finished stock by size', '190 MT', '130 MT',
  ]) {
    await expect(main.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await expect(main.getByText('Running', { exact: true })).toHaveCount(3);

  await page.screenshot({ path: `${SHOTS}/hsm-visualization-dark.png`, fullPage: true });
});

test('sidebar switches screens and keeps the mill', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const nav = page.getByRole('navigation', { name: 'Dashboard screens' });
  await expect(nav.getByRole('link', { name: /Visualization/ })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: /Condition Analytics/ }).click();
  await expect(page).toHaveURL(/\/hsm\/condition-analytics$/);
  await expect(page.getByTestId('screen-placeholder')).toHaveText('HSM Condition Analytics dashboard is coming soon.');
  await expect(nav.getByRole('link', { name: /Condition Analytics/ })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: /Asset Health/ }).click();
  await expect(page).toHaveURL(/\/hsm\/asset-health$/);
  await expect(page.getByTestId('screen-placeholder')).toHaveText('HSM Asset Health dashboard is coming soon.');
  await page.screenshot({ path: `${SHOTS}/hsm-asset-health-placeholder.png` });
});

test('mill picker switches mill, keeps the screen, and drives by keyboard', async ({ page }) => {
  await page.goto('/hsm/asset-health');
  const trigger = page.getByRole('button', { name: /^Rolling mill:/ });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  const list = page.getByRole('listbox', { name: 'Rolling mill' });
  await expect(list.getByRole('option')).toHaveText(['HSM', 'LSM', 'RMD', 'RMS']);
  await expect(list.getByRole('option', { name: 'HSM' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: `${SHOTS}/mill-picker-open.png`, clip: { x: 1100, y: 0, width: 500, height: 260 } });

  await list.getByRole('option', { name: 'LSM' }).click();
  await expect(page).toHaveURL(/\/lsm\/asset-health$/);
  await expect(list).toBeHidden();
  await expect(page.getByTestId('screen-placeholder')).toHaveText('LSM Asset Health dashboard is coming soon.');

  await page.getByRole('navigation', { name: 'Dashboard screens' }).getByRole('link', { name: /Visualization/ }).click();
  await expect(page).toHaveURL(/\/lsm\/visualization$/);
  await expect(page.getByTestId('screen-placeholder')).toHaveText('LSM Visualization dashboard is coming soon.');

  // Keyboard: open with ArrowDown, move down twice from LSM to RMS, choose with Enter.
  await page.getByRole('button', { name: /^Rolling mill:/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/rms\/visualization$/);
  await expect(page.locator('.tb-mark--mill')).toHaveText('RMS');

  // Escape closes without changing mill; outside click closes too.
  await page.getByRole('button', { name: /^Rolling mill:/ }).click();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: /^Rolling mill:/ }).click();
  await page.mouse.click(700, 500);
  await expect(list).toBeHidden();
  await expect(page).toHaveURL(/\/rms\/visualization$/);

  await page.getByRole('button', { name: /^Rolling mill:/ }).click();
  await list.getByRole('option', { name: 'HSM' }).click();
  await expect(page.getByRole('region', { name: 'Headline KPIs' })).toBeVisible();
});

test('sidebar collapses to an icon rail and stays collapsed after reload', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const sidebar = page.locator('aside.sb');
  const toggle = page.getByRole('button', { name: 'Collapse sidebar' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const wide = (await sidebar.boundingBox())!.width;
  expect(wide).toBeGreaterThan(200);

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(70);
  // Labels hide, links stay reachable by name.
  await expect(page.getByRole('link', { name: 'Asset Health' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/hsm-visualization-sidebar-collapsed.png` });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
  expect((await sidebar.boundingBox())!.width).toBeLessThan(70);

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'expanded');
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(200);
});

test('light theme applies, persists across reload, and switches back', async ({ page }) => {
  await page.goto('/hsm/visualization');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(223, 230, 240)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: `${SHOTS}/hsm-visualization-light.png`, fullPage: true });

  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('duration picker applies a preset and a custom range', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const trigger = page.getByRole('button', { name: /Duration/ });
  await expect(trigger).toContainText('Today');

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/duration-picker.png` });

  await dialog.getByRole('button', { name: 'Previous 7 Days' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toContainText('Previous 7 Days');

  await trigger.click();
  await dialog.getByLabel('Start Date').fill('2026-09-16');
  await dialog.getByLabel('Start Time').fill('00:00');
  await dialog.getByLabel('End Date').fill('2026-09-17');
  await dialog.getByLabel('End Time').fill('00:00');
  await expect(dialog.getByRole('button', { name: 'Custom' })).toHaveClass(/on/);
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(trigger).toContainText('2026-09-16 → 2026-09-17');

  await page.reload();
  await expect(trigger).toContainText('2026-09-16 → 2026-09-17');

  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('unknown mill or screen is a 404', async ({ page }) => {
  const res = await page.request.get('/xyz/visualization');
  expect(res.status()).toBe(404);
  const res2 = await page.request.get('/hsm/overview');
  expect(res2.status()).toBe(404);
});

test.describe('narrow viewports', () => {
  test('laptop 1280 and phone 390 lay out without horizontal scroll', async ({ page }) => {
    for (const [w, h, name] of [[1280, 800, 'laptop-1280'], [390, 844, 'phone-390']] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/hsm/visualization');
      await expect(page.getByRole('region', { name: 'Headline KPIs' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/hsm-visualization-${name}.png`, fullPage: true });
    }
  });
});
