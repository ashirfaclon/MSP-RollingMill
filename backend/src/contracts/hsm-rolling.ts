/** GET /api/hsm/rolling — the plant's management KPIs from the HSM Production Log Sheet (ERP), per date / week / month. */
import type { Grain } from './common';
import type { RmdMode } from './rmd';

export interface HsmRollingPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Days with at least one entry of the chosen rolling. */
  entryDays: number;
  /** TOTAL_CAST_QTY, DELIVERY_QTY, INPUT_MT, PRODUCTION_MT, PRIME_MT — Σ over the chosen rolling's entries; null with none. */
  castMt: number | null;
  deliveryMt: number | null;
  inputMt: number | null;
  productionMt: number | null;
  primeMt: number | null;
  /** Online entries only, whatever the rolling chosen: Σ INPUT_MT ÷ Σ TOTAL_CAST_QTY × 100. */
  rollingInCastingPct: number | null;
  /** Online entries only: Σ INPUT_MT ÷ Σ DELIVERY_QTY × 100. */
  rollingInDeliveryPct: number | null;
  /** Offline (cold rolling) entries only: Σ POWER_CONSUMPTION_IN_KWH. */
  coldPowerKwh: number | null;
  /** Offline entries only: Σ POWER_CONSUMPTION_IN_KWH ÷ Σ PRODUCTION_MT. */
  coldPowerKwhPerMt: number | null;
  /** The strip size(s) rolled by the chosen rolling, from the finished receipts tied to its entries, largest first. */
  sections?: { label: string; mt: number }[];
}

export interface HsmRollingReport {
  from: string;
  to: string;
  grain: Grain;
  mode: RmdMode;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  rows: HsmRollingPeriod[];
  totals: HsmRollingPeriod;
}
