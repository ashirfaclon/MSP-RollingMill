/** RMD billets per plant day from a resetting counter's increases. */
import { describe, expect, test } from 'vitest';
import { billetsPerDay } from '../../src/modules/rmd/billets.service';

const at = (iso: string) => Date.parse(iso);

describe('RMD billets per day (08:00 IST → 08:00 IST: shifts 08–20 and 20–08)', () => {
  // RMD day 8 Oct = 8 Oct 08:00 IST (02:30 UTC) → 9 Oct 08:00 IST.
  const dates = ['2026-10-07', '2026-10-08', '2026-10-09'];
  const inc = [
    { t: at('2026-10-08T02:20:00Z'), v: 1 },   // 07:50 IST on 8 Oct → still 7 Oct
    { t: at('2026-10-08T02:40:00Z'), v: 1 },   // 08:10 IST → 8 Oct
    { t: at('2026-10-08T12:00:00Z'), v: 2 },   // 8 Oct
    { t: at('2026-10-09T02:29:00Z'), v: 1 },   // 07:59 IST on 9 Oct → still 8 Oct
  ];

  test('each increase counts on the RMD day it fell in (08:00 IST boundary, not HSM 06:00)', () => {
    const m = billetsPerDay(dates, inc, at('2026-10-07T20:00:00Z'), at('2026-10-09T03:00:00Z'), at('2026-10-09T04:00:00Z'));
    expect(m.get('2026-10-07')).toBe(1);
    expect(m.get('2026-10-08')).toBe(4);
    expect(m.get('2026-10-09')).toBe(0);   // read, nothing counted yet
  });

  test('a day the counter had no reading for, or still to come, is null — not 0', () => {
    const m = billetsPerDay(dates, inc, at('2026-10-08T02:35:00Z'), at('2026-10-08T23:00:00Z'), at('2026-10-08T23:30:00Z'));
    expect(m.get('2026-10-07')).toBeNull();
    expect(m.get('2026-10-09')).toBeNull();
  });
});

import { runsOf } from '../../src/modules/hsm/running-rate.service';
import { rmdRate } from '../../src/modules/rmd/running-rate.service';

describe('RMD running hours and rate', () => {
  test('a run is cut at 08:00 IST for RMD (06:00 stays the HSM default)', () => {
    // Billets every 5 min from 07:50 to 08:10 IST on 8 Oct (02:20–02:40 UTC).
    const ticks = [0, 5, 10, 15, 20].map((m) => ({ t: at('2026-10-08T02:20:00Z') + m * 60_000, v: 1 }));
    const rmd = runsOf(ticks, 10 * 60_000, 8);
    expect(rmd.map((r) => r.date)).toEqual(['2026-10-07', '2026-10-08']);
    expect((rmd[0].end - rmd[0].start) / 60_000).toBe(10);   // 07:50 → 08:00
    expect(runsOf(ticks).map((r) => r.date)).toEqual(['2026-10-08']);   // HSM: all after 06:00
  });

  test('the rate needs production: none (ERP on hold) → null, never a guess', () => {
    expect(rmdRate(null, 14.32)).toBeNull();
    expect(rmdRate(300, 0)).toBeNull();
    expect(rmdRate(300, 12)).toBe(25);
  });
});
