/**
 * GET /api/ca/:mill — Condition Analytics costing: the month's CA inputs (logbook CA Inputs form,
 * filled on the dashboard) with the mill's production, running hours, power and yield.
 */

/** The nine CA inputs, as the popup and the form hold them. */
export interface CaInputs {
  benchmarkRateTph: number;
  benchmarkKwhPerMt: number;
  standardYieldPct: number;
  tariffActual: number;
  tariffStandard: number;
  /** ₹ for the whole month. */
  otherConversionActualRs: number;
  otherConversionStandard: number;
  netMaterialPerMt: number;
  contributionPerMt: number;
}

/** What the mill's own sources give for the period (each null when its source has nothing). */
export interface CaActual {
  /** Production, MT — the mill's ERP log sheet (the measure of its Actual rate card). */
  mt: number | null;
  runH: number | null;
  rateTph: number | null;
  /** Power, kWh — the mill's power form. */
  kwh: number | null;
  /** kwh ÷ mt. */
  kwhPerMt: number | null;
  billetInputMt: number | null;
  /** Mass yield, % — the ERP log sheet. */
  yieldPct: number | null;
}

export interface CaKpis {
  /** max(0, benchmark rate − actual rate) × running hours, MT. */
  opportunityMt: number | null;
  /** Power ₹ (kWh × actual tariff) + other conversion ₹ (the month's, by the share of its days in the period). */
  conversionRs: number | null;
  conversionPerMt: number | null;
  /** benchmark kWh/MT × standard tariff + standard other conversion, ₹/MT. */
  standardPerMt: number | null;
  /** conversionPerMt − standardPerMt. */
  variancePerMt: number | null;
  /** The variance in ₹, three ways: tariff, energy use, other conversion (they add up to the total). */
  variance: { tariffRs: number; energyRs: number; otherRs: number; totalRs: number } | null;
  /** max(0, standard yield − actual yield) × billet input × net material, ₹. */
  yieldLossRs: number | null;
  /** opportunityMt × contribution, ₹. */
  marginRs: number | null;
  /** Other conversion actual ÷ production, ₹/MT. */
  otherActualPerMt: number | null;
}

export interface CaMonthPart {
  month: string;
  from: string;
  to: string;
  /** Days of the month in the period ÷ days of the month. */
  share: number;
  /** null: no CA inputs saved for the month. */
  inputs: CaInputs | null;
  actual: CaActual;
  kpis: CaKpis;
}

export interface CaReport {
  mill: string;
  from: string;
  to: string;
  /** One part per month of the period. */
  months: CaMonthPart[];
  /** Months of the period with no CA inputs saved (YYYY-MM). */
  missing: string[];
  /** The inputs over the period: a month's own; across months, weighted by days in the period. */
  inputs: CaInputs | null;
  actual: CaActual;
  /** Over the period: ₹ and MT added up across months; null when any month lacks what it needs. */
  kpis: CaKpis;
}
