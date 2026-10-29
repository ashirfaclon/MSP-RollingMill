/** sharedFresh: one call per key per freshness window, shared by concurrent callers; a failure is not kept. */
import { beforeEach, describe, expect, test } from 'vitest';
import { clearSharedFresh, sharedFresh } from '../../src/shared/shared-fresh';

describe('sharedFresh', () => {
  beforeEach(() => clearSharedFresh());
  test('concurrent and repeated callers within the window share one call', async () => {
    let calls = 0;
    const fn = async () => { calls += 1; return calls; };
    const [a, b] = await Promise.all([sharedFresh('k', 5000, fn, 1000), sharedFresh('k', 5000, fn, 1001)]);
    expect([a, b]).toEqual([1, 1]);
    expect(await sharedFresh('k', 5000, fn, 5999)).toBe(1);
    expect(await sharedFresh('k', 5000, fn, 6000)).toBe(2);
    expect(calls).toBe(2);
  });
  test('a failed call is dropped so the next caller tries again', async () => {
    let calls = 0;
    const fn = async () => { calls += 1; if (calls === 1) throw new Error('down'); return calls; };
    await expect(sharedFresh('k', 5000, fn, 1000)).rejects.toThrow('down');
    expect(await sharedFresh('k', 5000, fn, 1001)).toBe(2);
  });
});
