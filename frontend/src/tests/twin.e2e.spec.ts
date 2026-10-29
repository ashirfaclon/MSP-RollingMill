/**
 * The process twins (components/twin): the mill drawn as a machine on one straight pass line,
 * every machine a baked sprite with its name above, reading and reference bar below and a
 * shaped lamp in its corner; the hot steel moving only along the active path. The live shape
 * is checked against the real historian; every state is checked against the scenario fixtures
 * (twinFixtures.ts), served in place of the live routes — nothing is written anywhere.
 */
import { expect, test, type Page } from '@playwright/test';
import { hsmFixtures, rmdFixtures, type HsmFixtureId, type RmdFixtureId } from '../components/twin/twinFixtures';

/** Served to a page that judges by the real clock, so the fixtures are stamped now. */
const HSM_FIXTURES = hsmFixtures(Date.now());
const RMD_FIXTURES = rmdFixtures(Date.now());

const SHOTS = 'test-results/screenshots';
const panelOf = (page: Page) => page.getByRole('main').locator('section.panel', { hasText: 'Mill mimic' });

const serveHsm = (page: Page, id: HsmFixtureId) => page.route('**/api/hsm/live', (r) => r.fulfill({ json: HSM_FIXTURES[id] }));
const serveRmd = async (page: Page, id: RmdFixtureId) => {
  const f = RMD_FIXTURES[id];
  await page.route('**/api/rmd/live', (r) => r.fulfill({ json: f.live }));
  await page.route('**/api/rmd/mill-speed?*', (r) => r.fulfill({ json: { from: '2026-10-29', to: '2026-10-29', historian: { connection: 'up', message: '' }, latest: f.mps, trend: [], bucketMinutes: 15 } }));
};

test('HSM mill mimic is the process twin: table, RM1–RM5, FM1–FM6, coil on one pass line; a stand opens its group', async ({ page }) => {
  await page.goto('/hsm/visualization');
  const panel = panelOf(page);
  const twin = panel.getByRole('img', { name: /^HSM mill/ });
  await expect(twin).toBeVisible({ timeout: 60_000 });
  await expect(twin.locator('.mx-name')).toHaveText(['Billet infeed', 'RM1', 'RM2', 'RM3', 'RM4', 'RM5', 'FM1', 'FM2', 'FM3', 'FM4', 'FM5', 'FM6', 'Finished exit']);
  await expect(twin.locator('.mx-pipe')).toHaveCount(12);
  await expect(twin.locator('.mx-lamp')).toHaveCount(11);
  await expect(twin.locator('.mx-group')).toHaveText([/^Roughing · \d of 5 on$/, /^Finishing · \d of 6 on$/]);
  // One straight pass line: every run between stands is a single horizontal segment.
  for (const d of await twin.locator('.mx-pipe[data-k^="r:RM_"] .mx-pipe-line, .mx-pipe[data-k^="r:FM_0"] .mx-pipe-line').evaluateAll((els) => els.map((e) => e.getAttribute('d')))) {
    expect(d).toMatch(/^M[\d.]+ [\d.]+ H[\d.]+$/);
  }
  await expect(twin.locator('.mx-sprite--light').first()).toBeHidden();
  await page.waitForTimeout(800);
  await panel.screenshot({ path: `${SHOTS}/hsm-twin.png` });
  // Clicking a stand selects it (ring) and opens its group's drill-down; Escape closes the drawer and clears the selection (spec C4).
  await twin.locator('.mx-node', { hasText: 'FM2' }).click();
  await expect(page.getByRole('dialog', { name: /Finishing/ })).toBeVisible();
  await expect(twin.locator('.mx-select')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Clear selection' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Finishing/ })).toBeHidden();
  await expect(twin.locator('.mx-select')).toHaveCount(0);
  await twin.locator('.mx-node', { hasText: 'Finished exit' }).click();
  await expect(page.getByRole('dialog', { name: /Production/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('HSM rolling (fixture): hot bars and moving runs along the active path only; RM4 stopped mid-line = fault, downstream unfed → banner; FM6 unknown', async ({ page }) => {
  await serveHsm(page, 'rolling');
  await page.goto('/hsm/visualization');
  const panel = panelOf(page);
  const twin = panel.getByRole('img', { name: /^HSM mill/ });
  await expect(twin.locator('.mx-group')).toHaveText(['Roughing · 4 of 5 on', 'Finishing · 5 of 6 on'], { timeout: 60_000 });
  await expect(panel.locator('.panel-sub')).toHaveText('9 of 11 stands on');
  await expect(twin.locator('image.mx-sprite--dark[href="/twin/stand-hot-dark.png"]')).toHaveCount(9);
  await expect(twin.locator('.mx-lamp--running')).toHaveCount(9);
  // The active path stops at RM3: RM4 is not running, so nothing past it is fed — three moving runs, and the banner.
  await expect(twin.locator('.mx-pipe--active')).toHaveCount(3);
  await expect(twin.locator('.mx-pipe-flow')).toHaveCount(3);
  await expect(twin.locator('.mx-banner')).toHaveText('Route inconsistent: RM5, FM1, FM2, FM3, FM4, FM5 running with no feed path.');
  const rm4 = twin.locator('.mx-node', { hasText: 'RM4' });
  await expect(rm4.locator('image.mx-sprite--dark')).toHaveClass(/is-fault/);
  await expect(rm4.locator('.mx-lamp')).toHaveClass(/mx-lamp--fault/);
  await expect(rm4.locator('.mx-lamp rect')).toHaveCount(1);     // the fault shape: a square
  await expect(rm4.locator('.mx-read')).toHaveText('Off');
  const fm6 = twin.locator('.mx-node', { hasText: 'FM6' });
  await expect(fm6.locator('.mx-lamp')).toHaveClass(/mx-lamp--unknown/);
  await expect(fm6.locator('.mx-read')).toHaveText('NA');
  // Readings with their reference bars: RM2 carries the section's highest current, so its bar is full.
  await expect(twin.locator('.mx-node', { hasText: 'RM2' }).locator('.mx-read')).toContainText('910');
  const bars = twin.locator('.mx-node', { hasText: 'RM2' }).locator('.mx-bar-fill');
  await expect(bars).toHaveCount(1);
  expect(await bars.getAttribute('width')).toBe('40');
  await expect(twin.locator('.mx-node', { hasText: 'Billet infeed' }).locator('.mx-read')).toContainText('412');
  await expect(twin.locator('.mx-node', { hasText: 'Billet infeed' }).locator('.mx-sub').first()).toHaveText(/^SINCE (\d+ \w+ )?08:00 IST$/);
  await expect(panel.locator('.chip')).toHaveText(/^Live · \d\d:\d\d IST$/);
  await page.waitForTimeout(800);
  await panel.screenshot({ path: `${SHOTS}/hsm-twin-rolling.png` });
  // Hovering traces the whole path: everything on it lit, the rest dimmed.
  await twin.locator('.mx-node', { hasText: 'RM2' }).hover();
  await expect(panel.locator('.mx-host')).toHaveClass(/is-sel/);
  await expect(twin.locator('.mx-node.is-on')).toHaveCount(13);   // the whole line, infeed and exit included
  await panel.screenshot({ path: `${SHOTS}/hsm-twin-trace.png` });
});

test('HSM one stale stand (fixture): only FM3 greys out, with its age; its run holds still; the pill counts it and lists it', async ({ page }) => {
  await serveHsm(page, 'oneStale');
  await page.goto('/hsm/visualization');
  const panel = panelOf(page);
  const twin = panel.getByRole('img', { name: /^HSM mill/ });
  const fm3 = twin.locator('.mx-node', { hasText: 'FM3' });
  await expect(fm3.locator('.mx-read')).toHaveClass(/mx-read--stale/, { timeout: 60_000 });
  await expect(fm3.locator('.mx-read')).toContainText('1,050');
  await expect(fm3.locator('.mx-read-age')).toHaveText(' · 20m');
  await expect(fm3.locator('.mx-lamp')).toHaveClass(/mx-lamp--unknown/);
  await expect(twin.locator('.mx-node', { hasText: 'FM2' }).locator('.mx-read')).not.toHaveClass(/mx-read--stale/);
  await expect(twin.locator('.mx-pipe[data-k="r:FM_03>FM_04"] .mx-pipe-flow')).toHaveCount(0);
  await expect(panel.locator('.chip')).toHaveText('Live · 1 stale');
  await panel.locator('.chip').click();
  await expect(panel.getByRole('dialog', { name: 'Signals not good' })).toContainText('FM3');
});

test('RMD mill mimic is the process twin: one infeed, two rows in the dashboard\'s order, one exit; a station opens its zone', async ({ page }) => {
  await page.goto('/rmd/visualization');
  const panel = panelOf(page);
  const twin = panel.getByRole('img', { name: /^RMD mill/ });
  await expect(twin).toBeVisible({ timeout: 60_000 });
  await expect(twin.locator('.mx-name')).toHaveText([
    'Billet infeed',
    'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'FS', 'PRI', 'PR2', 'TB1', 'TB2',
    'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'CS', 'PR pre', 'PR post', 'TB 1', 'TB 2',
    'Finished exit',
  ]);
  await expect(twin.locator('.mx-pipe')).toHaveCount(14 + 12);
  await expect(twin.locator('.mx-lamp')).toHaveCount(24);
  for (const [name, n] of [['stand', 14], ['shear', 2], ['pinch', 4], ['tb', 4], ['table', 1], ['bundle', 1]] as const) {
    await expect(twin.locator(`image.mx-sprite--dark[href="/twin/${name}-dark.png"], image.mx-sprite--dark[href="/twin/${name}-hot-dark.png"]`)).toHaveCount(n);
  }
  await expect(twin.locator('.mx-group')).toHaveCount(4);
  await page.waitForTimeout(800);
  await panel.screenshot({ path: `${SHOTS}/rmd-twin.png` });
  await twin.locator('.mx-node', { hasText: 'PR pre' }).click();
  await expect(page.getByRole('dialog', { name: /Finishing/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('RMD the 01:38 case (fixture): line 2 stands carry the steel, line 1 finishing runs with no feed path → banner; FS at −4 A is doubtful, never green', async ({ page }) => {
  await serveRmd(page, 'liveCrossover');
  await page.goto('/rmd/visualization');
  const panel = panelOf(page);
  const twin = panel.getByRole('img', { name: /^RMD mill/ });
  await expect(twin.locator('.mx-banner')).toHaveText('Route inconsistent: FS, PRI, PR2, TB1, TB2 running with no feed path.', { timeout: 60_000 });
  await expect(twin.locator('.mx-group')).toHaveText(['Line 1 · Route / diverter · 0 of 8 on', 'Line 1 · Finishing · 5 of 5 on', 'Line 2 · Route / diverter · 6 of 6 on', 'Line 2 · Finishing · 0 of 5 on']);
  // Six moving runs: the fork into line 2's S1 and S1 → … → S6; the run on to CS is idle.
  await expect(twin.locator('.mx-pipe--active')).toHaveCount(6);
  await expect(twin.locator('.mx-pipe[data-k="r:L2_S6>L2_CS_On_Off"]')).toHaveClass(/mx-pipe--idle/);
  const fs = twin.locator('.mx-node', { hasText: 'FS' });
  await expect(fs.locator('.mx-read')).toHaveText(/^-4 \? A$/);
  await expect(fs.locator('.mx-read')).toHaveClass(/mx-read--suspect/);
  await expect(fs.locator('.mx-lamp')).toHaveClass(/mx-lamp--warning/);
  await expect(fs.locator('.mx-bar')).toHaveCount(0);
  await expect(twin.locator('.mx-sub', { hasText: /^LINE 2 SPEED/ })).toHaveText('LINE 2 SPEED 18.4 M/S');
  await expect(panel.locator('.chip')).toHaveText('Live · 1 doubtful');
  // Selecting PRI lights its whole path: infeed … FS, PRI, PR2, TB1, TB2 … exit — not line 2.
  await twin.locator('.mx-node', { hasText: 'PRI' }).click();
  await expect(twin.locator('.mx-select')).toHaveCount(1);
  await expect(twin.locator('.mx-node.is-on')).toHaveCount(2 + 13);
  await expect(twin.locator('.mx-node', { hasText: 'PR post' })).toHaveClass(/is-off/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await panel.screenshot({ path: `${SHOTS}/rmd-twin-crossover.png` });
});

const CASES: { mill: 'hsm' | 'rmd'; id: string }[] = [
  ...Object.keys(HSM_FIXTURES).map((id) => ({ mill: 'hsm' as const, id })),
  ...Object.keys(RMD_FIXTURES).map((id) => ({ mill: 'rmd' as const, id })),
];
for (const c of CASES) test(`fixture ${c.mill}/${c.id} draws with no two labels touching at 1100, 1440 and 1920 px, in both themes`, async ({ page }) => {
  test.setTimeout(150_000);
  {
    for (const width of [1100, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/twin/fixtures?mill=${c.mill}&id=${c.id}`);
      const twin = page.getByRole('img', { name: /mill:/ });
      await expect(twin).toBeVisible({ timeout: 30_000 });
      const boxes = await twin.locator('text').evaluateAll((els) => els.map((e) => {
        const r = (e as SVGGraphicsElement).getBoundingClientRect();
        return { t: e.textContent ?? '', x: r.left, y: r.top, w: r.width, h: r.height };
      }));
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]; const b = boxes[j];
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(hit, `${c.mill}/${c.id} @${width}: "${a.t}" overlaps "${b.t}"`).toBe(false);
        }
      }
      if (width === 1440) {
        await page.locator('section.panel').screenshot({ path: `${SHOTS}/fixture-${c.mill}-${c.id}.png` });
        // The light theme, the way the app keeps it: the stored selection, read on load.
        await page.evaluate(() => localStorage.setItem('msp.rollingmill.globalSel.v1', JSON.stringify({ theme: 'light' })));
        await page.reload();
        await expect(page.getByRole('img', { name: /mill:/ }).locator('.mx-sprite--light').first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('img', { name: /mill:/ }).locator('.mx-sprite--dark').first()).toBeHidden();
        await page.waitForTimeout(300);
        await page.locator('section.panel').screenshot({ path: `${SHOTS}/fixture-${c.mill}-${c.id}-light.png` });
        await page.evaluate(() => localStorage.setItem('msp.rollingmill.globalSel.v1', JSON.stringify({ theme: 'dark' })));
      }
    }
  }
});

test('allNull shows one empty-state line and nothing animates; under reduced motion nothing moves', async ({ page }) => {
  await page.goto('/twin/fixtures?mill=hsm&id=allNull');
  const twin = page.getByRole('img', { name: /mill:/ });
  await expect(twin.locator('text', { hasText: 'NO LIVE DATA FROM THE HISTORIAN' })).toHaveCount(1);
  await expect(twin.locator('.mx-pipe-flow')).toHaveCount(0);
  // Reduced motion: the rolling fixture keeps its weight but nothing animates.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/twin/fixtures?mill=hsm&id=rolling');
  await expect(page.getByRole('img', { name: /mill:/ }).locator('.mx-pipe-flow').first()).toBeAttached();
  const animated = await page.locator('.mx-pipe-flow').evaluateAll((els) => els.filter((e) => getComputedStyle(e).animationName !== 'none').length);
  expect(animated).toBe(0);
});
