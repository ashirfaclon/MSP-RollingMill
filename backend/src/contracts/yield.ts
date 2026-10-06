/** GET /api/hsm/yield — mass yield, ERP log sheet beside the historian. */
import type { ByProducts, ErpMeta, Grain } from './common';

export interface YieldPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  erpDays: number;
  erpInputMt: number | null;
  erpOutputMt: number | null;
  erpYieldPct: number | null;
  /** Days with any historian reading (today counts, still running). */
  influxDays: number;
  influxFullDays: number;
  influxInputT: number | null;
  influxOutputT: number | null;
  influxYieldPct: number | null;
  billets: number | null;
  coils: number | null;
  /**
   * Net: counter output less the four by-products (mill scale, strip end cut, miss-roll
   * strip, strip finish end cut), over the counter days whose by-products are booked —
   * `netDays` of them. netYieldPct = netOutputT ÷ the input of those same days.
   */
  netDays: number;
  byProducts: ByProducts | null;
  netInputT: number | null;
  /** Counter output over those same days, before the by-products come off. */
  netCounterT: number | null;
  netOutputT: number | null;
  netYieldPct: number | null;
}

export interface YieldComparison {
  from: string;
  to: string;
  grain: Grain;
  erp: ErpMeta;
  influx: { connection: 'up' | 'down'; message: string; unweighedBillets: number };
  /** Billet-size events in the window, oldest first. */
  sizeEvents: {
    start: string; end: string | null;
    lengthM: number; breadthMm: number; heightMm: number;
    /** t per billet. */
    weightT: number;
    /** Billets discharged inside the window while this size was set, and their tonnes. */
    billets: number; inputT: number;
  }[];
  /** g/cm³ used for the input. */
  densityGcm3: number;
  /** Latest date with a by-product booked in ERP stores. */
  byProductsLastDate: string | null;
  rows: YieldPeriod[];
  totals: YieldPeriod;
}
