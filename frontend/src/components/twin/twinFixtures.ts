/**
 * Scenario fixtures (mill-mimic-improvement-spec §6): static historian payloads with the live
 * ones' shape, each a situation the drawing must get right. Built for a clock — `NOW` (29 Oct
 * 2026, 15:30 IST) for the unit tests and the fixtures page, the real time for the Playwright
 * tests, which serve them in place of the live routes to a page judging by its own clock.
 */
import type { HsmLive, RmdLive, RmdMillSpeedReport, RmdStationNow, StandNow } from '@/services/hsmApi';

/** 29 Oct 2026, 15:30 IST. */
export const NOW = Date.parse('2026-10-29T10:00:00.000Z');

export function hsmFixtures(now: number) {
  const AT = new Date(now - 20_000).toISOString();
  /** A reading from twenty minutes ago: past the 15 min a station stays fresh. */
  const STALE_AT = new Date(now - 20 * 60_000).toISOString();
  const dayStart = (daysAgo: number) => { const d = new Date(now); d.setUTCHours(2, 30, 0, 0); if (d.getTime() > now) d.setUTCDate(d.getUTCDate() - 1); d.setUTCDate(d.getUTCDate() - daysAgo); return d.toISOString(); };

  const stand = (group: StandNow['group'], n: number, on: boolean | null, a: number | null, rpm: number | null, at: string | null = AT): StandNow => ({
    id: `${group === 'roughing' ? 'RM' : 'FM'}_0${n}`, group, on, currentA: a, rpm, forceT: a === null ? null : a / 2, at: on === null ? null : at, fresh: on !== null,
  });
  const groups = (stands: StandNow[]): HsmLive['groups'] => (['roughing', 'finishing'] as const).map((id) => {
    const mine = stands.filter((s) => s.group === id);
    const on = mine.filter((s) => s.on).length;
    const reporting = mine.filter((s) => s.on !== null).length;
    const state = !reporting ? 'no-data' : on === mine.length ? 'all-on' : on ? 'partial' : 'all-off';
    return { id, label: id === 'roughing' ? 'Roughing group' : 'Finishing group', total: mine.length, on, reporting, state, stateLabel: !reporting ? 'No live data' : `${on} of ${mine.length} on` };
  });
  const live = (stands: StandNow[], patch: Partial<HsmLive> = {}): HsmLive => ({
    connection: 'up', message: '', now: new Date(now).toISOString(), plantDay: '', plantDayStart: dayStart(0),
    billetsToday: 412, millSpeed: 0.92, lastReadingAt: AT, fresh: true, stands, groups: groups(stands), ...patch,
  });
  const ROLLING: StandNow[] = [
    stand('roughing', 1, true, 820, 410), stand('roughing', 2, true, 910, 455), stand('roughing', 3, true, 760, 480),
    stand('roughing', 4, false, 0, 0), stand('roughing', 5, true, 690, 520),
    stand('finishing', 1, true, 1120, 610), stand('finishing', 2, true, 1210, 700), stand('finishing', 3, true, 1050, 780),
    stand('finishing', 4, true, 980, 860), stand('finishing', 5, true, 900, 930), stand('finishing', 6, null, null, null),
  ];
  return {
    /** The mill rolling, RM4 stopped while its group rolls, FM6 unreported. */
    rolling: live(ROLLING),
    /** Every reading NA: no animation, one empty-state line, not one per machine. */
    allNull: live(ROLLING.map((s) => ({ ...s, on: null, currentA: null, rpm: null, forceT: null, at: null, fresh: false })), { billetsToday: null, millSpeed: null, lastReadingAt: null, fresh: false }),
    /** Everything stopped: grey, hollow lamps, nothing moves — not a fault. */
    allStopped: live(ROLLING.map((s) => ({ ...s, on: false, currentA: 0, rpm: 0, forceT: 0 })), { millSpeed: 0.1 }),
    /** One machine per section: the layout must hold. */
    singleStand: live([stand('roughing', 1, true, 820, 410), stand('finishing', 1, true, 1120, 610)]),
    /** FM3's feed frozen twenty minutes ago: only FM3 greys out, its run stops. */
    oneStale: live(ROLLING.map((s) => (s.id === 'FM_03' ? { ...s, at: STALE_AT } : s))),
    /** A count that started yesterday: the period label must carry the date. */
    previousDayPeriod: live(ROLLING, { plantDayStart: dayStart(1) }),
  };
}

export function rmdFixtures(now: number) {
  const AT = new Date(now - 20_000).toISOString();
  const STALE_AT = new Date(now - 20 * 60_000).toISOString();
  const dayStart = () => { const d = new Date(now); d.setUTCHours(3, 30, 0, 0); if (d.getTime() > now) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString(); };

  const st = (id: string, zone: RmdStationNow['zone'], line: 1 | 2, label: string, on: boolean | null, a: number | null, at: string | null = AT): RmdStationNow =>
    ({ id, zone, line, label, on, currentA: a, at: on === null ? null : at, fresh: on !== null });
  const zones = (stations: RmdStationNow[]): RmdLive['zones'] => (['route', 'finishing'] as const).map((id) => {
    const mine = stations.filter((s) => s.zone === id);
    const on = mine.filter((s) => s.on).length;
    const reporting = mine.filter((s) => s.on !== null).length;
    const state = !reporting ? 'no-data' : on === mine.length ? 'all-on' : on ? 'partial' : 'all-off';
    return { id, label: id === 'route' ? 'Route / diverter' : 'Finishing group', total: mine.length, on, reporting, state, stateLabel: !reporting ? 'No live data' : `${on} of ${mine.length} on` };
  });
  const live = (stations: RmdStationNow[], patch: Partial<RmdLive> = {}): RmdLive => ({
    connection: 'up', message: '', now: new Date(now).toISOString(), plantDay: '', plantDayStart: dayStart(),
    billetsToday: 377, lastReadingAt: AT, fresh: true, stations, zones: zones(stations), ...patch,
  });
  const L1_ROUTE = (on: (n: number) => boolean | null, a: (n: number) => number | null) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => st(`L1_S${n}`, 'route', 1, `S${n}`, on(n), a(n)));
  const L2_ROUTE = (on: boolean | null, a: (n: number) => number | null) => [1, 2, 3, 4, 5, 6].map((n) => st(`L2_S${n}`, 'route', 2, `S${n}`, on, a(n)));
  const L1_FIN = (on: boolean | null, a: number[]) => [
    st('L1_FS', 'finishing', 1, 'FS', on, a[0]), st('L1_PRI', 'finishing', 1, 'PRI', on, a[1]), st('L1_PR2', 'finishing', 1, 'PR2', on, a[2]),
    st('L1_TB1', 'finishing', 1, 'TB1', on, a[3]), st('L1_TB2', 'finishing', 1, 'TB2', on, a[4]),
  ];
  const L2_FIN = (on: boolean | null, a: number[]) => [
    st('L2_CS_On_Off', 'finishing', 2, 'CS', on, a[0]), st('L2_Pinch_Roll_Pre_On_Off', 'finishing', 2, 'PR pre', on, a[1]),
    st('L2_Pinch_Roll_Post_On_Off', 'finishing', 2, 'PR post', on, a[2]), st('L2_Tail_Breaker_01_On_Off', 'finishing', 2, 'TB 1', on, a[3]),
    st('L2_Tail_Breaker_02_On_Off', 'finishing', 2, 'TB 2', on, a[4]),
  ];
  const speed = (mill1: number | null, mill2: number | null): RmdMillSpeedReport['latest'] => ({ mill1, mill2, at: AT });
  const off5 = [0, 0, 0, 0, 0];

  const out: Record<string, { live: RmdLive; mps: RmdMillSpeedReport['latest'] }> = {
    /** Line 1 rolling with S5 stopped and TB2 unreported; line 2 idle. */
    rolling: {
      live: live([...L1_ROUTE((n) => n !== 5, (n) => (n === 5 ? 0 : 180 + n * 22)), ...L2_ROUTE(false, () => 0), ...L1_FIN(true, [64, 41, 38, 52, 0]).map((s, i) => (i === 4 ? { ...s, on: null, currentA: null, at: null, fresh: false } : s)), ...L2_FIN(false, off5)]),
      mps: speed(14.2, 0),
    },
    /**
     * The 01:38 case (spec C1): line 1's stands off while its finishing runs, line 2's stands
     * running while its finishing is off. No crossover is mapped, so the active path stops at
     * line 2's S6 and line 1's finishing machines are running with no feed path — the banner.
     */
    liveCrossover: {
      live: live([...L1_ROUTE(() => false, () => 0), ...L2_ROUTE(true, (n) => 17 + n * 2), ...L1_FIN(true, [-4, 2, 7, 7, 14]), ...L2_FIN(false, off5)]),
      mps: speed(5.1, 18.4),
    },
    /** Finishing running with no feed path on its own line: the amber banner. */
    routeInconsistent: {
      live: live([...L1_ROUTE(() => false, () => 0), ...L2_ROUTE(false, () => 0), ...L1_FIN(true, [60, 40, 38, 50, 48]), ...L2_FIN(false, off5)]),
      mps: speed(4.8, 0),
    },
    /** FS at −4 A: never a plain green number. */
    negativeCurrent: {
      live: live([...L1_ROUTE(() => true, (n) => 180 + n * 22), ...L2_ROUTE(false, () => 0), ...L1_FIN(true, [-4, 41, 38, 52, 49]), ...L2_FIN(false, off5)]),
      mps: speed(14.2, 0),
    },
    /** Line 2's S3 frozen twenty minutes ago. */
    oneStale: {
      live: live([...L1_ROUTE(() => false, () => 0), ...L2_ROUTE(true, (n) => 17 + n * 2).map((s) => (s.id === 'L2_S3' ? { ...s, at: STALE_AT } : s)), ...L1_FIN(false, off5), ...L2_FIN(true, [55, 40, 38, 50, 48])]),
      mps: speed(0, 18.4),
    },
    allStopped: {
      live: live([...L1_ROUTE(() => false, () => 0), ...L2_ROUTE(false, () => 0), ...L1_FIN(false, off5), ...L2_FIN(false, off5)]),
      mps: speed(0, 0),
    },
    allNull: {
      live: live([...L1_ROUTE(() => null, () => null), ...L2_ROUTE(null, () => null), ...L1_FIN(null, off5).map((s) => ({ ...s, currentA: null })), ...L2_FIN(null, off5).map((s) => ({ ...s, currentA: null }))], { billetsToday: null, lastReadingAt: null, fresh: false }),
      mps: speed(null, null),
    },
  };
  return out;
}

/** The fixtures at the fixed clock: the unit tests and the fixtures page. */
export const HSM_FIXTURES = hsmFixtures(NOW);
export const RMD_FIXTURES = rmdFixtures(NOW);
export type HsmFixtureId = keyof ReturnType<typeof hsmFixtures>;
export type RmdFixtureId = keyof ReturnType<typeof rmdFixtures>;
