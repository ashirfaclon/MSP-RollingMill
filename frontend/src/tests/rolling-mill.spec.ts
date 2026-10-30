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
  // Power is live from the logbook (a button that opens its entries).
  await expect(strip.getByRole('button', { name: 'Power consumption', exact: true })).toBeVisible();
  // Descriptive sub-texts are gone: cards with nothing to flag carry no note.
  await expect(strip.getByRole('button', { name: 'Specific energy', exact: true })).toBeVisible();
  // No order / stock split on any mill (the user, 27 Oct 2026): four cards.
  await expect(strip.locator('.rm-card-label')).toHaveText([/^Production/, /^Mass yield/, /^Power consumption/, /^Specific energy/]);
  await expect(card('Stock with order')).toHaveCount(0);
  for (const sample of ['30.78', '90.0', '72.0', '420', '210', '342.0']) await expect(strip).not.toContainText(sample);
  await expect(page.locator('.rm-pending')).toHaveCount(0);

  const main = page.getByRole('main');
  for (const text of [
    'Mill mimic', 'Production by shift', 'Order allocation', 'Finished stock', 'Material & operating balance',
    'Finished stock by size',
  ]) {
    await expect(main.getByText(text, { exact: false }).first()).toBeVisible();
  }
  // Shift output is live (production split by shift); the order split has no source: 0.
  const shifts = page.locator('.rm-flip-face--front section.panel');
  await expect(shifts.locator('.rm-shift-name')).toHaveText(['Day', 'Night']);
  await expect(shifts.locator('.rm-shift-val')).toHaveText([/^\d[\d,]*\.\d MT/, /^\d[\d,]*\.\d MT/]);   // live, split by shift
  await expect(shifts.getByRole('button', { name: /Running rate/ })).toContainText(/\d+\.\d{2} TPH|NA/);
  const split = page.locator('section.panel', { hasText: 'Order allocation' }).locator('.rm-alloc-block').first();
  await expect(split).not.toContainText('Made To');
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
  await expect(nav.getByRole('link')).toHaveText([/Visualization/, /Asset Health/, /Condition Analytics/]);
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

test('the sidebar: every mill has Visualization, Asset Health and Condition Analytics', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const nav = page.getByRole('navigation', { name: 'Dashboard screens' });
  await expect(nav.getByRole('link')).toHaveText([/Visualization/, /Asset Health/, /Condition Analytics/]);
  await expect(nav.getByRole('link', { name: /Visualization/ })).toHaveAttribute('aria-current', 'page');
  await page.goto('/rmd/visualization');
  await expect(nav.getByRole('link')).toHaveText([/Visualization/, /Asset Health/, /Condition Analytics/]);
  await page.goto('/lsm/visualization');
  await expect(nav.getByRole('link')).toHaveText([/Visualization/, /Asset Health/, /Condition Analytics/]);
  await page.goto('/rms/visualization');
  await expect(nav.getByRole('link')).toHaveText([/Visualization/, /Asset Health/, /Condition Analytics/]);
  for (const there of ['/lsm/condition-analytics', '/rms/condition-analytics', '/rms/asset-health']) {
    expect((await page.request.get(there)).status()).toBe(200);
  }
});

test('HSM asset health: the mock-up layout, only the HSM sheet\'s sources; the header selects the drive group', async ({ page }) => {
  await page.goto('/hsm/asset-health');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Rolling Mill\s*\/\s*Asset Health/);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText('HSM · Finishing drive group');
  const cards = main.getByRole('region', { name: 'Condition KPIs' });
  await expect(cards.locator('.rm-card-label:not([aria-hidden="true"] *)')).toHaveText([/^Vibration RMS/, /^Bearing temp/, /^Motor current/, /^Gearbox oil/, /^Run hours/]);   // no PM items on HSM
  // As the HSM sheet: bearing temp and motor current from the Mill Load Log Sheet (NA until real
  // entries), run hours from the ERP; the rest NA.
  for (const i of [3]) await expect(cards.locator('.rm-card-value:not([aria-hidden="true"] *)').nth(i)).toHaveText(/^NA/);
  await expect(cards.locator('.rm-card-value:not([aria-hidden="true"] *)').nth(1)).toHaveText(/^(NA|\d[\d,]*)°C$/);
  await expect(cards.locator('.rm-card-value:not([aria-hidden="true"] *)').nth(2)).toHaveText(/^(NA|\d[\d,]*)%$/);
  await expect(cards.locator('.rm-card-value:not([aria-hidden="true"] *)').nth(4)).toHaveText(/^(NA|\d[\d,]*\.\d)h$/);
  for (const t of ['Condition trends', 'Remarks']) {
    await expect(main.locator('section.panel', { hasText: t }).first()).toBeVisible();
  }
  // No PM items on HSM (the user, 29 Oct 2026): no ERP PM panel, no Next PM / Open work orders.
  await expect(main.locator('section.panel', { hasText: 'ERP PM & work-order history' })).toHaveCount(0);
  await expect(main.locator('.ah-fact dt')).toHaveText(['Last inspection']);
  // No mill mimic on Asset Health (the user, 30 Oct 2026): it lives on Visualization.
  await expect(main.locator('section.panel', { hasText: 'Grouped asset mimic' })).toHaveCount(0);
  await expect(main.getByRole('list', { name: 'Drive groups' })).toHaveCount(0);
  const groups = main.getByRole('group', { name: 'Drive group' });
  await expect(groups.getByRole('button')).toHaveText(['Roughing', 'Finishing', 'Auxiliary']);
  await groups.getByRole('button', { name: 'Roughing' }).click();
  await expect(main.getByRole('heading', { level: 2 })).toHaveText('HSM · Roughing drive group');
  await expect(groups.getByRole('button', { name: 'Roughing' })).toHaveAttribute('aria-pressed', 'true');
  // Status from the RM drives' On_Off: the live state, or "No live data" — never NA.
  await expect(main.locator('.ah-status')).toHaveText(/^(All (stands )?on|All (stands )?off|\d+ of \d+ on|No live data)$/, { timeout: 60_000 });
  // Auxiliary: MID's pumps (PUMP-04 / 07 / 08 / 12), highest 4.1 mm/s on 21 Apr 2026.
  await groups.getByRole('button', { name: 'Auxiliary' }).click();
  await expect(main.getByRole('heading', { level: 2 })).toHaveText('HSM · Auxiliary · pumps');
  await expect(main.locator('.ah-status')).toHaveCount(0);   // the pumps have no PLC signal: no status
  await expect(cards.getByRole('button', { name: 'Vibration RMS', exact: true }).locator('.rm-card-value')).toHaveText(/^\d+\.\d\s*mm\/s$/, { timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/hsm-asset-health.png`, fullPage: true });
  // Switching mill keeps the screen: every mill has Asset Health.
  const trigger = page.getByRole('button', { name: /^Rolling mill:/ });
  const list = page.getByRole('listbox', { name: 'Rolling mill' });
  await expect(async () => { await trigger.click(); await expect(list).toBeVisible({ timeout: 1000 }); }).toPass({ timeout: 15_000 });
  await list.getByRole('option', { name: 'RMS' }).click();
  await expect(page).toHaveURL(/\/rms\/asset-health$/);
});

test('mill picker offers HSM, RMD, LSM and RMS, switches mill, keeps the screen, and drives by keyboard', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const trigger = page.getByRole('button', { name: /^Rolling mill:/ });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  const list = page.getByRole('listbox', { name: 'Rolling mill' });
  // The server-rendered button is visible a few hundred ms before the page is interactive;
  // a click in that gap is lost, so retry the first one until the list opens.
  await expect(async () => {
    await trigger.click();
    await expect(list).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(list.getByRole('option')).toHaveText(['HSM', 'RMD', 'LSM', 'RMS']);
  await expect(list.getByRole('option', { name: 'HSM' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: `${SHOTS}/mill-picker-open.png`, clip: { x: 1100, y: 0, width: 500, height: 260 } });

  await list.getByRole('option', { name: 'RMD' }).click();
  await expect(page).toHaveURL(/\/rmd\/visualization$/);
  await expect(list).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Rolling Mill\s*\/\s*Visualization/);
  await expect(page.locator('.tb-mark--mill')).toHaveText('RMD');

  // Keyboard: open with ArrowDown, move up from RMD to HSM, choose with Enter.
  await page.getByRole('button', { name: /^Rolling mill:/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/hsm\/visualization$/);
  await expect(page.locator('.tb-mark--mill')).toHaveText('HSM');

  // Escape closes without changing mill; outside click closes too.
  await page.getByRole('button', { name: /^Rolling mill:/ }).click();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: /^Rolling mill:/ }).click();
  await page.mouse.click(700, 500);
  await expect(list).toBeHidden();
  await expect(page).toHaveURL(/\/hsm\/visualization$/);
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
  await expect(page.getByRole('link', { name: 'Visualization' })).toBeVisible();
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

test('duration picker: dates only, each a 08:00 → 08:00 plant day, cycle shown', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const trigger = page.getByRole('button', { name: /Duration/ });
  // The default is the previous plant day (the user, 30 Oct 2026).
  await expect(trigger).toContainText('Yesterday');
  // Its cycle sits beside the preset name.
  await expect(trigger).toContainText(/\d{1,2} \w{3} 08:00 IST → \d{1,2} \w{3} 08:00 IST/);

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

  // One date = that date 08:00 → the next date 08:00.
  await trigger.click();
  await dialog.getByLabel('Start Date').fill('2026-09-24');
  await dialog.getByLabel('End Date').fill('2026-09-24');
  await expect(dialog.getByRole('button', { name: 'Custom' })).toHaveClass(/on/);
  await expect(dialog.locator('.dr-f-cycle').nth(0)).toHaveText('from 08:00 IST');
  await expect(dialog.locator('.dr-f-cycle').nth(1)).toHaveText('to 25 Sep 08:00 IST');
  await expect(dialog.getByRole('status')).toContainText('24 Sep 08:00 IST → 25 Sep 08:00 IST · 1 plant day');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(trigger).toContainText('24 Sep 08:00 IST → 25 Sep 08:00 IST');

  // A range: 16 → 17 Sep = 16 Sep 08:00 IST → 18 Sep 08:00 IST, two plant days; survives a reload.
  await trigger.click();
  await dialog.getByLabel('Start Date').fill('2026-09-16');
  await dialog.getByLabel('End Date').fill('2026-09-17');
  await expect(dialog.getByRole('status')).toContainText('16 Sep 08:00 IST → 18 Sep 08:00 IST · 2 plant days');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(trigger).toContainText('16 Sep 08:00 IST → 18 Sep 08:00 IST');
  await page.reload();
  await expect(trigger).toContainText('16 Sep 08:00 IST → 18 Sep 08:00 IST');

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

test('RMD visualization: the HSM layout; wired where sourced, NA everywhere else — no sample figures', async ({ page }) => {
  await page.goto('/rmd/visualization');
  await expect(page.locator('.tb-mark--mill')).toHaveText('RMD');
  // Nothing on the RMD screen is sample data any more, so there is no illustrative banner.
  await expect(page.getByText('Illustrative data')).toHaveCount(0);
  const strip = page.getByRole('region', { name: 'Headline KPIs' });
  // Production as two cards (Production · Prime + SL, Production · Prime), then HSM's next three, then Mill MPS and
  // chemical composition; no Made To Stock / Stock with order / Free stock.
  await expect(strip.locator('.rm-card-label')).toHaveText(['Production · Prime + SL', 'Production · Prime', 'Mass yield', 'Power consumption', 'Specific energy', 'Mill 1 MPS', 'Mill 2 MPS', /^Chemical composition/]);
  // Wired: production and mass yield (ERP), power (forms), specific energy (power ÷ ERP production), Mill MPS (Influx) and
  // chemical composition (SMS form) open their drawers.
  for (const name of ['Production · Prime + SL', 'Production · Prime', 'Mass yield', 'Power consumption', 'Specific energy', 'Mill 1 MPS', 'Mill 2 MPS', 'Chemical composition']) await expect(strip.getByRole('button', { name, exact: true })).toBeVisible();
  // No coverage notes on the ERP cards: blank, or "No entries recorded yet" until yesterday's log sheet is in.
  await expect(strip.getByRole('button', { name: 'Mass yield', exact: true }).locator('.rm-card-note')).toHaveText(/^(No entries recorded yet)?$/);
  // Mill flow, live: infeed, the two status zones and the exit (ERP production); no roughing group.
  const mimic = page.locator('section.panel', { hasText: 'Mill mimic' }).getByRole('img', { name: /^RMD mill:/ });
  await expect(mimic.locator('.mx-group')).toHaveText([/^Line 1 · Route \/ diverter · \d+ of 8 on$/, /^Line 1 · Finishing · \d+ of 5 on$/, /^Line 2 · Route \/ diverter · \d+ of 6 on$/, /^Line 2 · Finishing · \d+ of 5 on$/], { timeout: 60_000 });
  await expect(mimic.locator('.mx-node', { hasText: 'Billet infeed' })).toContainText(/SINCE (\d+ \w+ )?09:00 IST/);
  await expect(mimic.locator('.mx-node', { hasText: 'Finished exit' })).toBeVisible();
  await expect(mimic.locator('image.mx-sprite--dark[href^="/twin/stand"]')).toHaveCount(14);   // L1 S1–S8 + L2 S1–S6
  await expect(mimic.locator('.mx-lamp')).toHaveCount(24);   // + 5 finishing machines per line
  // No output per shift in the ERP: the whole day only — no By shift view, no switch (the user, 28 Oct 2026).
  const shifts = page.locator('section.panel', { hasText: 'Production · whole day' });
  await expect(shifts.getByRole('group', { name: 'Shift view' })).toHaveCount(0);
  await expect(shifts.locator('.rm-shift-name')).toHaveText(['Total']);
  await expect(shifts.locator('.panel-sub')).toHaveText('09:00 IST → 09:00 IST');
  await expect(shifts.locator('.rm-shift-val')).toHaveText([/^(NA|[\d,]+\.\d MT)/]);
  await expect(shifts.locator('.chip')).toHaveText(/^Plan \d/);
  await expect(shifts.locator('.rm-foot')).toContainText(/Running rate\s*NA/);
  // Order allocation: production from the ERP log sheet, finished stock from the item ledger; no MTO / MTS split.
  const alloc = page.locator('section.panel', { hasText: 'Order allocation' });
  await expect(alloc.locator('.rm-alloc-total')).toHaveText([/MT$|^NA$/, /\d MT$/]);
  await expect(alloc).not.toContainText('Made To');
  // Material balance: only the billet count is live; billet input (MT), finished, yield, mass difference NA.
  const balance = page.locator('section.panel', { hasText: 'Material & operating balance' });
  await expect(balance.locator('.rm-mb-figure-v')).toHaveText(['NA', 'NA']);
  await expect(balance).toContainText('Mass difference NA');
  await expect(balance.locator('.rmd-mb-pieces')).toContainText(/\d+ in|NA/);
  // Finished stock by size: the ERP item ledger (FGYRDP), one row per bar size.
  await expect(page.locator('section.panel', { hasText: 'Finished stock by size' }).locator('.rm-size-name').first()).toHaveText(/^\d+ mm$/);   // highest stock first (the user, 30 Oct 2026)
  await page.screenshot({ path: `${SHOTS}/rmd-visualization.png`, fullPage: true });
});

for (const mill of ['lsm', 'rms'] as const) {
  test(`${mill.toUpperCase()} visualization: the same screen as HSM / RMD, every figure NA until its source is confirmed`, async ({ page }) => {
    await page.goto(`/${mill}/visualization`);
    await expect(page.locator('.tb-mark--mill')).toHaveText(mill.toUpperCase());
    // Each mill's own day and shifts (plant, 12 Oct 2026): LSM 09:00, RMS 09:30.
    const start = mill === 'lsm' ? '09:00' : '09:30';
    const mid = mill === 'lsm' ? '21:00' : '21:30';
    await expect(page.getByRole('button', { name: /Duration/ })).toContainText(new RegExp(`${start} IST → \\d{1,2} \\w{3} ${start} IST`));
    // By shift when the period has output per shift; else the whole day only (today: the ERP comes a day late).
    const shiftPanel = page.locator('section.panel', { hasText: /Production (by shift|· whole day)/ }).first();
    await expect(shiftPanel.locator('.panel-sub')).toHaveText(new RegExp(`^(Day ${start}–${mid} IST · Night ${mid}–${start} IST|${start} IST → ${start} IST)$`));
    const strip = page.getByRole('region', { name: 'Headline KPIs' });
    await expect(strip.locator('.rm-card-label')).toHaveText([/^Production/, /^Mass yield/, /^Power consumption/, /^Specific energy/]);
    // LSM: Production is wired (ERP log sheet FA-LP-P) and opens its drawer; Today's entry comes a day late, so NA.
    // Everything else NA, and nothing else opens.
    await expect(strip.locator('.rm-card-value').nth(0)).toHaveText(mill === 'lsm' ? /^(NA|[\d,]+\.\d)/ : /^NA/);
    // Power and specific energy: each mill's Daily Power Consumption Record holds only a test entry so far — NA.
    for (const i of [2, 3]) await expect(strip.locator('.rm-card-value').nth(i)).toHaveText(/^NA/);
    await expect(strip.getByRole('button')).toHaveCount(4);   // Production, Mass yield, Power consumption, Specific energy
    // No mill mimic on LSM or RMS.
    await expect(page.getByRole('img', { name: /^(HSM|RMD) mill:/ })).toHaveCount(0);
    await expect(page.locator('section.panel', { hasText: 'Mill mimic' })).toHaveCount(0);
    for (const title of [/Production (by shift|· whole day)/, 'Order allocation', 'Material & operating balance', 'Finished stock by size']) {
      await expect(page.locator('section.panel', { hasText: title }).first()).toBeVisible();
    }
    // No sample figures anywhere.
    await expect(page.getByText('Illustrative data')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/${mill}-visualization.png`, fullPage: true });
  });
}
