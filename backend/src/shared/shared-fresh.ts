/**
 * One answer shared by every caller for a short while.
 *
 * The live routes are polled by every open dashboard every 10 s (the twins); without this,
 * twenty viewers would be twenty historian queries every 10 s for the same numbers. With it,
 * a request within `freshMs` of the last answer gets that answer, and concurrent requests
 * share one in-flight call — so a mill is read from the historian at most once per `freshMs`
 * however many screens are open. A failed call is not kept: the next request tries again.
 */
const cache = new Map<string, { at: number; p: Promise<unknown> }>();

export function sharedFresh<T>(key: string, freshMs: number, fn: () => Promise<T>, nowMs = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < freshMs) return hit.p as Promise<T>;
  const p = fn();
  cache.set(key, { at: nowMs, p });
  p.catch(() => { if (cache.get(key)?.p === p) cache.delete(key); });
  return p;
}

/** Tests only. */
export function clearSharedFresh() { cache.clear(); }
