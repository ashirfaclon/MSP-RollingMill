/** GET /api/hsm/running-rate — production ÷ running hours. */
import type { Grain } from './common';

export interface RateDay {
  date: string;
  /** Hours of the plant day elapsed (24 for a finished day). */
  elapsedH: number;
  /** Running hours from the billet counter; null when the counter had no readings. */
  runH: number | null;
  runs: number;
  /** Production card figure (Influx, MT); null when the counter had no data. */
  influxMt: number | null;
  rateTph: number | null;
  erpMt: number | null;
  erpRunH: number | null;
  erpDelayH: number | null;
  erpRateTph: number | null;
}

export interface RatePeriod extends Omit<RateDay, 'date'> {
  key: string; label: string; fromDate: string; toDate: string; days: number;
}

export interface RunningRateReport {
  from: string;
  to: string;
  grain: Grain;
  gapMinutes: number;
  influx: { connection: 'up' | 'down'; message: string };
  erp: { syncedAt: string | null; lastDate: string | null };
  days: RateDay[];
  rows: RatePeriod[];
  totals: RatePeriod;
  runs: { date: string; start: string; end: string; hours: number; billets: number }[];
}
