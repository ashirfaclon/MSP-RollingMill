import { exchangeSsoToken } from '@/server/logbook/client';
import { HttpError, handle } from '@/server/http';

/**
 * Exchange the one-time SSO token from the app URL for a logbook session. The resulting
 * Bearer stays in server memory — it is never returned to the browser.
 */
export function POST(req: Request) {
  return handle('logbook_sso_failed', async () => {
    const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 4096) throw new HttpError(400, 'missing_token', 'An access token is required');
    const r = await exchangeSsoToken(token);
    if (!r.ok) throw new HttpError(401, 'sso_rejected', r.message);
    return { ok: true, message: r.message };
  });
}
