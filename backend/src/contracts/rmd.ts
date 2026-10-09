/** GET /api/rmd/billets — billets into the RMD mill, per line, from the Influx counters. */
import type { Grain } from './common';

export interface RmdBilletDay {
  date: string;
  /** Billets on line 1 (M1) / line 2 (M2) in the plant day; null when the counter had no reading. */
  m1: number | null;
  m2: number | null;
  /** m1 + m2; null when neither counted. */
  totalPcs: number | null;
}

export interface RmdBilletPeriod extends Omit<RmdBilletDay, 'date'> {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
}

export interface RmdBilletsReport {
  from: string;
  to: string;
  grain: Grain;
  influx: { connection: 'up' | 'down'; message: string };
  days: RmdBilletDay[];
  rows: RmdBilletPeriod[];
  totals: RmdBilletPeriod;
}

/** GET /api/rmd/live — the mill flow now: billets today and each running-status point. */
export type RmdZoneId = 'route' | 'finishing';

export interface RmdStationNow {
  id: string;
  zone: RmdZoneId;
  line: 1 | 2;
  label: string;
  /** Running (status 1); null when there is no reading in the last 15 min. */
  on: boolean | null;
  at: string | null;
  fresh: boolean;
}

export interface RmdZoneNow {
  id: RmdZoneId;
  label: string;
  total: number;
  on: number;
  reporting: number;
  state: 'all-on' | 'partial' | 'all-off' | 'no-data';
  stateLabel: string;
}

export interface RmdLive {
  connection: 'up' | 'down';
  message: string;
  now: string;
  /** The RMD day running now (08:00 → 08:00 IST) and its start. */
  plantDay: string;
  plantDayStart: string;
  /** Billets since the RMD day started, M1 + M2 (sum of counter increases). */
  billetsToday: number | null;
  lastReadingAt: string | null;
  fresh: boolean;
  stations: RmdStationNow[];
  zones: RmdZoneNow[];
}

/** GET /api/rmd/stations — each point's running share per interval over the last hours. */
export interface RmdStationTrend {
  connection: 'up' | 'down';
  message: string;
  zone: RmdZoneId;
  from: string;
  to: string;
  bucketSeconds: number;
  /** Per point: [interval start ms, % of the interval running | null]. */
  series: { id: string; line: 1 | 2; label: string; points: [number, number | null][] }[];
}

/** GET /api/rmd/running-rate — production ÷ running hours, per RMD day / week / month. */
export interface RmdRatePeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Hours the mill was running: billets (either line) no more than 10 min apart. */
  runH: number | null;
  /** RMD production, MT — not wired yet (ERP on hold): null. */
  productionMt: number | null;
  /** productionMt ÷ runH; null until production is wired. */
  rateTph: number | null;
}

export interface RmdRunningRateReport {
  from: string;
  to: string;
  grain: Grain;
  gapMinutes: number;
  influx: { connection: 'up' | 'down'; message: string };
  rows: RmdRatePeriod[];
  totals: RmdRatePeriod;
}
