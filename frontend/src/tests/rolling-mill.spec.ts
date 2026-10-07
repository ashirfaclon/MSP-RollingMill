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
  // Production and Mass yield are live (production / wiring e2e specs).
  await expect(strip.getByRole('button', { name: 'Production', exact: true })).toBeVisible();
  await expect(strip.getByRole('button', { name: 'Mass yield', exact: true })).toBeVisible();
  // No live source yet: these show 0, not sample figures, and are not faded.
  await expect(card('Power consumption')).toContainText('0.00');
  await expect(card('Specific energy')).toContainText('0.0');
  // Descriptive sub-texts are gone: cards with nothing to flag carry no note.
  for (const name of ['Power consumption', 'Specific energy', 'Stock with order', 'Free stock']) {
    await expect(card(name).locator('.rm-card-note')).toHaveText('');
  }
  for (const sample of ['30.78', '90.0', '72.0', '420', '210', '342.0']) await expect(strip).not.toContainText(sample);
  await expect(page.locator('.rm-pending')).toHaveCount(0);

  const main = page.getByRole('main');
  for (const text of [
    'Mill mimic', 'Production by shift', 'Order allocation', 'Finished stock', 'Material & operating balance',
    'Production & dispatch by size',
  ]) {
    await expect(main.getByText(text, { exact: false }).first()).toBeVisible();
  }
  // Shift output and the order split have no live source: 0. Running rate is calculated live.
  const shifts = page.locator('section.panel', { hasText: 'Production by shift' });
  await expect(shifts.locator('.rm-shift-name')).toHaveText(['Day', 'Night']);
  await expect(shifts.locator('.rm-shift-val')).toHaveText(['0.0 MT', '0.0 MT']);
  await expect(shifts.getByRole('button', { name: /Running rate/ })).toContainText(/\d+\.\d{2} TPH|NA/);
  const split = page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').first();
  await expect(split).toContainText('Made To Order0.0 MT');
  // Live panels: the mimic has infeed, the two stand groups that exist, and the exit.
  for (const zone of [/Billet infeed/, /Roughing group/, /Finishing group/, /Finished exit/]) {
    await expect(main.getByRole('button', { name: zone })).toBeVisible();
  }
  // Material flow lives on the Data Model screen, not here.
  await expect(main.getByText('Material flow', { exact: true })).toHaveCount(0);

  await page.screenshot({ path: `${SHOTS}/hsm-visualization-dark.png`, fullPage: true });
});

test('the Data Model tab is hidden from the sidebar for now', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const nav = page.getByRole('navigation', { name: 'Dashboard screens' });
  await expect(nav.getByRole('link')).toHaveText([/Visualization/, /Condition Analytics/, /Asset Health/]);
  await expect(nav.getByRole('link', { name: /Data Model/ })).toHaveCount(0);
});

test('data model screen (direct link) lays out every ledger and all checks pass', async ({ page }) => {
  await page.goto('/hsm/data-model');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Rolling Mill\s*\/\s*Data Model/);

  const main = page.getByRole('main');
  const shifts = main.getByRole('table', { name: 'Shift ledger' });
  await expect(shifts.getByRole('row', { name: /^Night shift / })).toContainText('170.0');
  await expect(shifts.getByRole('row', { name: /^Night shift / })).toContainText('11.0 h');
  await expect(shifts.getByRole('row', { name: /^Day shift / })).toContainText('10.6 h');
  await expect(shifts.getByRole('row', { name: /^Day (?!shift)/ })).toContainText('21.6 h');   // the day-total row, not the Day shift

  await expect(main.getByRole('table', { name: 'Stops' }).getByRole('row')).toHaveCount(6);
  await expect(main).toContainText('Running = drive power above 600 kW');

  const stock = main.getByRole('table', { name: 'Stock ledger by size' });
  await expect(stock.getByRole('row', { name: /^8 mm/ })).toContainText('130');
  await expect(stock.getByRole('row', { name: /^Total / })).toContainText('420');

  const orders = main.getByRole('table', { name: 'Orders' });
  await expect(orders.getByRole('row', { name: /SO-2611/ })).toContainText('500');

  const checks = main.getByRole('table', { name: 'Balance checks' });
  const n = await checks.getByRole('row').count() - 1;
  await expect(main.getByText(`${n} of ${n} pass`)).toBeVisible();
  await expect(checks.getByLabel('Does not balance')).toHaveCount(0);

  await page.screenshot({ path: `${SHOTS}/hsm-data-model.png`, fullPage: true });
  // The page scrolls inside <main>, so capture the lower rows panel by panel.
  const panel = (title: string) =>
    main.locator('section.panel', { has: page.locator('.panel-title', { hasText: new RegExp(`^${title}$`) }) });
  for (const [title, file] of [['Shifts', 'dm-shifts'], ['Stock ledger', 'dm-stock'], ['Orders', 'dm-orders'], ['Balance checks', 'dm-checks']]) {
    await panel(title).screenshot({ path: `${SHOTS}/${file}.png` });
  }
});

test('material flow shows every stage, exit and bucket, and the balance closes', async ({ page }) => {
  await page.goto('/hsm/data-model');
  const panel = page.locator('section.panel', { has: page.locator('.panel-title', { hasText: /^Material flow$/ }) });
  await expect(panel.getByText('Balance closes')).toBeVisible();

  const group = (name: string) => panel.getByRole('group', { name, exact: true });
  await expect(group('Billets fed')).toContainText('354.0 MT');
  await expect(group('Billets fed')).toContainText('282 billets');
  await expect(group('Inline reject')).toContainText('3.8 MT');
  await expect(group('Inline reject')).toContainText('3 billets');
  await expect(group('Inline reject')).toContainText('Cobble');
  await expect(group('Rolled')).toContainText('350.2 MT');
  await expect(group('Rolled')).toContainText('279 billets');
  await expect(group('Process loss')).toContainText('8.2 MT');
  await expect(group('Production output')).toContainText('342.0 MT');
  await expect(group('QC rejected')).toContainText('4.0 MT');
  await expect(group('QC rejected')).toContainText('To remelt');
  await expect(group('On hold')).toContainText('8.0 MT');
  await expect(group('QC accepted')).toContainText('330.0 MT');
  await expect(group('Production output')).toContainText('270.0 MT with order');
  await expect(group('Warehouse · with order')).toContainText('262.0 MT');
  await expect(group('Warehouse · free')).toContainText('68.0 MT');

  const split = panel.getByRole('region', { name: 'Where the billets went' });
  await expect(split.getByRole('img')).toBeVisible();
  await expect(split).toContainText('Warehouse · with order262.0 MT · 74.0%');
  await expect(split).toContainText('Process loss8.2 MT · 2.3%');
  await expect(panel).toContainText('Prime yield93.2%');

  await expect(group('Billets fed')).not.toContainText('of fed');
  await expect(group('Inline reject')).toContainText('1 billet · 1.3 MT');
  await panel.screenshot({ path: `${SHOTS}/material-flow.png` });

  await page.getByRole('button', { name: 'Light theme' }).click();
  await panel.screenshot({ path: `${SHOTS}/material-flow-light.png` });

  await page.setViewportSize({ width: 820, height: 1000 });
  await panel.screenshot({ path: `${SHOTS}/material-flow-narrow.png` });
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

  const list = page.getByRole('listbox', { name: 'Rolling mill' });
  // The server-rendered button is visible a few hundred ms before the page is interactive;
  // a click in that gap is lost, so retry the first one until the list opens.
  await expect(async () => {
    await trigger.click();
    await expect(list).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
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

  await page.getByRole('navigation', { name: 'Dashboard screens' }).getByRole('link', { name: /Asset Health/ }).click();
  await expect(page).toHaveURL(/\/lsm\/asset-health$/);
  await expect(page.getByTestId('screen-placeholder')).toHaveText('LSM Asset Health dashboard is coming soon.');
  await page.getByRole('navigation', { name: 'Dashboard screens' }).getByRole('link', { name: /Visualization/ }).click();
  await expect(page).toHaveURL(/\/lsm\/visualization$/);

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

test('duration picker: dates only, each a 06:00 → 06:00 plant day, cycle shown', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const trigger = page.getByRole('button', { name: /Duration/ });
  await expect(trigger).toContainText('Today');
  // The cycle of the running plant day sits beside the preset name.
  await expect(trigger).toContainText(/\d{1,2} \w{3} 06:00 → \d{1,2} \w{3} 06:00/);

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Select period' });
  await expect(dialog).toBeVisible();
  // No time of day to set — only dates.
  await expect(dialog.locator('input[type="time"]')).toHaveCount(0);
  await expect(dialog.getByLabel('Start Time')).toHaveCount(0);
  await expect(dialog.getByText('Current Shift')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/duration-picker.png` });

  await dialog.getByRole('button', { name: 'Previous 7 Days' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toContainText('Previous 7 Days');

  // One date = that date 06:00 → the next date 06:00.
  await trigger.click();
  await dialog.getByLabel('Start Date').fill('2026-09-24');
  await dialog.getByLabel('End Date').fill('2026-09-24');
  await expect(dialog.getByRole('button', { name: 'Custom' })).toHaveClass(/on/);
  await expect(dialog.locator('.dr-f-cycle').nth(0)).toHaveText('from 06:00');
  await expect(dialog.locator('.dr-f-cycle').nth(1)).toHaveText('to 25 Sep 06:00');
  await expect(dialog.getByRole('status')).toContainText('24 Sep 06:00 → 25 Sep 06:00 · 1 plant day');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(trigger).toContainText('24 Sep 06:00 → 25 Sep 06:00');

  // A range: 16 → 17 Sep = 16 Sep 06:00 → 18 Sep 06:00, two plant days; survives a reload.
  await trigger.click();
  await dialog.getByLabel('Start Date').fill('2026-09-16');
  await dialog.getByLabel('End Date').fill('2026-09-17');
  await expect(dialog.getByRole('status')).toContainText('16 Sep 06:00 → 18 Sep 06:00 · 2 plant days');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(trigger).toContainText('16 Sep 06:00 → 18 Sep 06:00');
  await page.reload();
  await expect(trigger).toContainText('16 Sep 06:00 → 18 Sep 06:00');

  // An end before the start cannot be applied.
  await trigger.click();
  await dialog.getByLabel('Start Date').fill('2026-09-18');
  await dialog.getByLabel('End Date').fill('2026-09-17');
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
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
