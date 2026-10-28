/**
 * Condition Analytics inputs (the user, 28 Oct 2026): the targets and costs no system gives, typed in
 * once a month per mill — one target per month, not per size (the user). The same list is the form
 * spec (CA Inputs Form Spec.xlsx): each field a column of the logbook form the dashboard saves to.
 * HSM's costing sheet already gives its actual tariff, other conversion and material values, so HSM
 * asks only for the rest.
 */
export type CaMill = 'hsm' | 'rmd' | 'lsm' | 'rms';
export type CaGroup = 'Targets' | 'Costs';

export interface CaField {
  key: string;
  label: string;
  group: CaGroup;
  /** What the dashboard works out with it. */
  feeds: string;
  mills: CaMill[];
}

const ALL: CaMill[] = ['hsm', 'rmd', 'lsm', 'rms'];
const NOT_HSM: CaMill[] = ['rmd', 'lsm', 'rms'];

export const CA_FIELDS: CaField[] = [
  { key: 'benchmarkRateTph', label: 'Benchmark running rate (MT/h)', group: 'Targets', mills: ALL,
    feeds: 'Output opportunity, matched production rate' },
  { key: 'benchmarkKwhPerMt', label: 'Benchmark specific energy (kWh/MT)', group: 'Targets', mills: ALL,
    feeds: 'Matched energy per MT, standard conversion cost' },
  { key: 'standardYieldPct', label: 'Standard mass yield (%)', group: 'Targets', mills: ALL,
    feeds: 'Yield material loss and variance' },
  { key: 'tariffActual', label: 'Electricity tariff · actual (₹/kWh)', group: 'Costs', mills: NOT_HSM,
    feeds: 'Conversion cost, cost variance (tariff)' },
  { key: 'tariffStandard', label: 'Electricity tariff · standard (₹/kWh)', group: 'Costs', mills: ALL,
    feeds: 'Standard conversion cost, cost variance' },
  { key: 'otherConversionActualRs', label: 'Other conversion cost · actual, month (₹)', group: 'Costs', mills: NOT_HSM,
    feeds: 'Conversion cost (non-power)' },
  { key: 'otherConversionStandard', label: 'Other conversion cost · standard (₹/MT)', group: 'Costs', mills: ALL,
    feeds: 'Standard conversion cost, cost variance' },
  { key: 'netMaterialPerMt', label: 'Net material value (₹/MT)', group: 'Costs', mills: NOT_HSM,
    feeds: 'Yield material loss and variance' },
  { key: 'contributionPerMt', label: 'Incremental contribution (₹/MT)', group: 'Costs', mills: ALL,
    feeds: 'Output margin' },
];

export const caFieldsFor = (mill: CaMill) => CA_FIELDS.filter((f) => f.mills.includes(mill));
