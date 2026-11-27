/**
 * Per-mill access on screen (the user, 27 Nov 2026). The session's answer is stood in for (the real one comes from the
 * person's IOsense role; the backend side is covered in backend/test/routes/api.test.ts): an RMD user lands on RMD,
 * sees only RMD in the mill menu, and a link to another mill takes them to RMD; no mill → the "No access" screen.
 */
import { test, expect, type Page } from '@playwright/test';
const SHOTS = 'test-results/screenshots';

const asRole = (page: Page, body: object, status = 200) =>
  page.route('**/api/auth/session', (route) => route.fulfill({ status, json: body }));

test('an RMD user: lands on RMD, only RMD in the menu, another mill\'s link goes to RMD', async ({ page }) => {
  await asRole(page, { authenticated: true, authRequired: true, user: { userId: 'u', organisation: 'o' }, expiresAt: null,
    access: { mills: ['rmd'], email: 'manager_qc_rm_tmt@msprgh.mspsteel.com' } });
  await page.goto('/');
  await expect(page).toHaveURL(/\/rmd\/visualization/, { timeout: 60_000 });
  // One mill: a plain label, no dropdown (the user, 27 Nov 2026).
  await expect(page.getByLabel('Rolling mill: RMD')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Rolling mill:/ })).toHaveCount(0);
  await page.goto('/hsm/asset-health');
  await expect(page).toHaveURL(/\/rmd\/asset-health/, { timeout: 30_000 });
  await page.locator('.topbar').screenshot({ path: `${SHOTS}/access-rmd-topbar.png` });
});

test('no mill in the role: the "No access" screen', async ({ page }) => {
  await asRole(page, { error: 'no_mill_access', message: 'No mill is assigned to your IOsense role — contact your admin.' }, 403);
  await page.goto('/hsm/visualization');
  await expect(page.locator('.auth-card')).toContainText('No access');
  await expect(page.locator('.auth-card')).toContainText('No mill is assigned to your IOsense role — contact your admin.');
  await page.screenshot({ path: `${SHOTS}/access-no-mill.png` });
});
