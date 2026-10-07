/**
 * The IOsense sign-in gate, in the browser. The backend's answers on /api/auth/* (and one
 * data route) are stubbed here, so every path — no token, a fresh token, a used token, an
 * organisation without access, a session that ends — runs without IOsense. The backend's
 * own enforcement is tested in backend/test/routes/api.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';

const SESSION = 'session-abc';
const future = () => new Date(Date.now() + 12 * 3_600_000).toISOString();

const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** The dashboard is on screen (its KPI strip), or not at all. */
const dashboard = (page: Page) => page.locator('.rm-viz');

test('without a sign-in token the app does not open, and says how to get in', async ({ page }) => {
  await page.route('**/api/auth/session', (r) => r.fulfill(json(401, { error: 'unauthenticated', message: 'x' })));
  await page.goto('/hsm/visualization');
  await expect(page.getByRole('heading', { name: 'Open from IOsense' })).toBeVisible();
  await expect(page.getByText('This dashboard opens from IOsense')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to IOsense' })).toHaveAttribute('href', /iosense\.io/);
  await expect(dashboard(page)).toHaveCount(0);
});

test('an IOsense token from the portal signs in once, leaves the address bar, and rides on every API call', async ({ page }) => {
  let exchanged: unknown = null;
  await page.route('**/api/auth/sso', async (r) => {
    exchanged = r.request().postDataJSON();
    await r.fulfill(json(200, { sessionToken: SESSION, expiresAt: future(), user: { userId: 'u', organisation: 'o' } }));
  });
  const auth: string[] = [];
  page.on('request', (req) => { if (/\/api\/hsm\//.test(req.url())) auth.push(req.headers().authorization ?? ''); });

  await page.goto('/?token=one-time-123');   // how IOsense opens the app
  await expect(page).toHaveURL(/\/hsm\/visualization\/?$/);
  await expect(dashboard(page)).toBeVisible();
  expect(exchanged).toEqual({ token: 'one-time-123' });
  expect(page.url()).not.toContain('token');
  await expect.poll(() => auth.length).toBeGreaterThan(0);
  expect(auth.every((a) => a === `Bearer ${SESSION}`)).toBe(true);

  // A reload in the same tab keeps the session (no token needed again).
  await page.route('**/api/auth/session', (r) => r.fulfill(json(200, { authenticated: true, authRequired: true, user: { userId: 'u', organisation: 'o' }, expiresAt: future() })));
  await page.reload();
  await expect(dashboard(page)).toBeVisible();
});

test('a used or expired token is refused with its reason', async ({ page }) => {
  await page.route('**/api/auth/sso', (r) => r.fulfill(json(401, { error: 'sso_rejected', message: 'x' })));
  await page.goto('/hsm/visualization?token=already-used');
  await expect(page.getByText('The sign-in link has expired or was already used')).toBeVisible();
  await expect(dashboard(page)).toHaveCount(0);
  expect(page.url()).not.toContain('token');
});

test('an organisation without access is told so', async ({ page }) => {
  await page.route('**/api/auth/sso', (r) => r.fulfill(json(403, { error: 'forbidden_organisation', message: 'x' })));
  await page.goto('/hsm/visualization?token=t');
  await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
  await expect(dashboard(page)).toHaveCount(0);
});

test('when the session ends mid-use the dashboard closes', async ({ page }) => {
  await page.route('**/api/auth/sso', (r) => r.fulfill(json(200, { sessionToken: SESSION, expiresAt: future(), user: { userId: 'u', organisation: 'o' } })));
  await page.goto('/hsm/visualization?token=t');
  await expect(dashboard(page)).toBeVisible();
  await page.route('**/api/hsm/**', (r) => r.fulfill(json(401, { error: 'unauthenticated', message: 'x' })));
  await page.getByRole('button', { name: /Running rate/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Weekly' }).click();   // a fresh call — now answered 401
  await expect(page.getByText('Your session has ended')).toBeVisible();
  await expect(dashboard(page)).toHaveCount(0);
});
