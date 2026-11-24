/** Guarding the historian (the user, 25 Nov 2026): identical queries shared, at most 4 at a time, fail fast while it is down. */
import { beforeEach, describe, expect, test } from 'vitest';
import type { QueryApi } from '@influxdata/influxdb-client';
import { HistorianUnavailable, collect, resetInfluxGuards } from '../../src/integrations/influx';

/** A fake query API: counts calls and in-flight queries; each query answers when released (or fails). */
function fakeApi(fail = false) {
  const state = { calls: 0, running: 0, maxRunning: 0, release: [] as (() => void)[] };
  const api = {
    queryRows(_flux: string, o: { next: (row: string[], meta: { toObject: (r: string[]) => unknown }) => void; error: (e: Error) => void; complete: () => void }) {
      state.calls += 1; state.running += 1; state.maxRunning = Math.max(state.maxRunning, state.running);
      state.release.push(() => {
        state.running -= 1;
        if (fail) o.error(new Error('connect ETIMEDOUT'));
        else { o.next(['1'], { toObject: (r) => ({ v: r[0] }) }); o.complete(); }
      });
    },
  } as unknown as QueryApi;
  return { api, state, releaseAll: () => { while (state.release.length) state.release.shift()!(); } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => resetInfluxGuards());

describe('the historian guard', () => {
  test('five screens asking the same thing make one query and share its answer', async () => {
    const f = fakeApi();
    const ps = Array.from({ length: 5 }, () => collect(f.api, 'same query'));
    await tick(); f.releaseAll();
    const answers = await Promise.all(ps);
    expect(f.state.calls).toBe(1);
    expect(answers.every((a) => a.length === 1)).toBe(true);
  });

  test('at most 4 different queries run at once; the rest wait their turn', async () => {
    const f = fakeApi();
    const ps = Array.from({ length: 10 }, (_, i) => collect(f.api, `query ${i}`));
    await tick();
    expect(f.state.running).toBe(4);
    while (f.state.calls < 10 || f.state.release.length) { f.releaseAll(); await tick(); }
    await Promise.all(ps);
    expect(f.state.maxRunning).toBe(4);
    expect(f.state.calls).toBe(10);
  });

  test('after 3 failures in a row it is left alone: the next query fails at once, without asking', async () => {
    const f = fakeApi(true);
    for (let i = 0; i < 3; i += 1) {
      const p = collect(f.api, `failing ${i}`);
      await tick(); f.releaseAll();
      await expect(p).rejects.toThrow('ETIMEDOUT');
    }
    await expect(collect(f.api, 'one more')).rejects.toBeInstanceOf(HistorianUnavailable);
    expect(f.state.calls).toBe(3);
  });
});
