/**
 * POST one message to one receiver (docs/SMS-ALERTS.md §7.1): JSON, X-Alert-Token when a secret is set,
 * 10 s timeout, any non-2xx a failure (retried by the outbox).
 *
 * The rehearsal copy: for an n8n URL with /webhook/ in it, the same body also goes to its /webhook-test/
 * sibling, so with "Listen for test event" open in the n8n editor the workflow can be rehearsed on live
 * alerts. It 404s whenever the editor is not listening, so its result is logged and never decides delivery.
 */
const TIMEOUT_MS = 10_000;

export type PostResult = { ok: true; status: number } | { ok: false; status: number | null; error: string };

export async function postJson(url: string, body: unknown, secret: string | null, timeoutMs = TIMEOUT_MS): Promise<PostResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Alert-Token': secret } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Drain the body so the connection is released.
    await res.text().catch(() => '');
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? (e.name === 'TimeoutError' ? 'timed out' : e.message) : String(e) };
  }
}

/** The /webhook-test/ sibling of an n8n production URL; null when the URL is not one. */
export function testSiblingOf(url: string): string | null {
  return url.includes('/webhook/') ? url.replace('/webhook/', '/webhook-test/') : null;
}

/** The rehearsal URLs: the explicit list when given, else each receiver's sibling. */
export function rehearsalUrls(urls: string[], explicit: string[], on: boolean): string[] {
  if (!on) return [];
  if (explicit.length) return explicit;
  return urls.map(testSiblingOf).filter((u): u is string => u !== null);
}

/** Where a URL is shown in logs and on the health page: the host and the path's first part, never a token in the query. */
export function urlLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.split('/').slice(0, 3).join('/')}…`;
  } catch {
    return 'an invalid URL';
  }
}
