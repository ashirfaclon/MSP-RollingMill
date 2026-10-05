import { loadEnv } from '@/server/env';
import { fetchLogbookWindow, probeLogbook } from '@/server/logbook/client';
import { handle } from '@/server/http';

/**
 * Logbook session status; once this mill's forms are mapped, also entry counts per form
 * over the last `?days=N` (default 1, max 31).
 */
export function GET(req: Request) {
  return handle('logbook_status_failed', async () => {
    const env = loadEnv();
    const session = await probeLogbook(env);
    if (session.connection !== 'up' || !session.insightMapped) return { session, forms: null };
    const days = Math.min(31, Math.max(1, Number(new URL(req.url).searchParams.get('days') ?? 1) || 1));
    const now = Date.now();
    const win = await fetchLogbookWindow(now - days * 86_400_000, now, now, env);
    return { session, forms: { connection: win.connection, message: win.message, days, counts: win.formCounts } };
  });
}
