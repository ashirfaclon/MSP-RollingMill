/**
 * The logbook forms the dashboard uses as its store (the user, 29 Oct 2026): every field of the
 * dashboard's popups is a column of its form; entries come only from the dashboard (the forms are
 * closed in the Forms UI). Ids and field keys exactly as the logbook app defines them
 * (forms.generated.ts, msp-steel-logbook); all in the logbook insight (IOSENSE_HSM_INSIGHT_ID).
 */
export type ConfigMill = 'hsm' | 'rmd' | 'lsm' | 'rms';
export const CONFIG_MILLS: ConfigMill[] = ['hsm', 'rmd', 'lsm', 'rms'];

export const PLAN_FORM: Record<ConfigMill, string> = {
  hsm: 'production-plan__hsm-rolling-plan', rmd: 'production-plan__rmd-rolling-plan',
  lsm: 'production-plan__lsm-rolling-plan', rms: 'production-plan__rms-rolling-plan',
};
export const CA_FORM: Record<ConfigMill, string> = {
  hsm: 'ca-inputs__hsm-ca-inputs', rmd: 'ca-inputs__rmd-ca-inputs',
  lsm: 'ca-inputs__lsm-ca-inputs', rms: 'ca-inputs__rms-ca-inputs',
};
export const VARIANCE_FORM = 'hsm-checklists__production-variance-checklist';
export const SETUP_FORM = 'hsm-checklists__shift-setup-checklist';
/** Read only — MID fills them. */
export const MID_VIBRATION_FORM = 'mid-logbook__vibration-reading';
export const MID_TEMPERATURE_FORM = 'mid-logbook__temperature-reading';

/** A form's tag (what entries carry and reads filter on): its id with "/" for "__". */
export const tagOf = (formId: string) => formId.replace('__', '/');

/** Production plan columns, one entry per date. */
export const PLAN_KEYS = {
  month: 'month', monthPlan: 'month-plan-mt', workingDays: 'working-days', date: 'date', shutdown: 'shutdown',
  day: 'day-mt', night: 'night-mt', dayTotal: 'day-total-mt',
  monthDay: 'month-day-total-mt', monthNight: 'month-night-total-mt', monthTotal: 'month-total-mt',
} as const;

/** CA inputs columns, one entry per month: the popup's field key → the form's key. */
export const CA_KEYS = {
  benchmarkRateTph: 'benchmark-running-rate-mt-h',
  benchmarkKwhPerMt: 'benchmark-specific-energy-kwh-mt',
  standardYieldPct: 'standard-mass-yield',
  tariffActual: 'electricity-tariff-actual-kwh',
  tariffStandard: 'electricity-tariff-standard-kwh',
  otherConversionActualRs: 'other-conversion-cost-actual-month',
  otherConversionStandard: 'other-conversion-cost-standard-mt',
  netMaterialPerMt: 'net-material-value-mt',
  contributionPerMt: 'incremental-contribution-mt',
} as const;
export type CaKey = keyof typeof CA_KEYS;

/** HSM checklists: the form keys are the labels themselves. */
export const VARIANCE_KEYS = {
  date: 'Date', influx: 'Production (Influx / HMI)', erp: 'Production (ERP)', variance: 'Variance (Influx − ERP)',
  variancePct: 'Variance %', missRoll: 'Miss roll', finishEndcut: 'Finish end cut', millScale: 'Mill scale', endCut: 'End cut',
} as const;
const R = ['R1', 'R2', 'R3', 'R4', 'R5'];
const F = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
/** Every column of the shift setup checklist, in the form's order. */
export const SETUP_KEYS: string[] = [
  'Date', 'Shift', 'Shift in-charge', 'Employee ID', 'Manpower availability',
  ...R.map((s) => `RM guide setting ${s}`), ...F.map((s) => `FM guide setting ${s}`),
  'Vertical edger gap V1', 'Vertical edger gap V2', 'Vertical pinch roll gap',
  ...R.map((s) => `Roll type ${s}`), ...[...R, ...F].map((s) => `Work roll dia ${s}`), 'Remark',
];
/** Setup columns that hold text or a choice (the rest are numbers). */
export const SETUP_TEXT = new Set(['Date', 'Shift', 'Shift in-charge', 'Employee ID', 'Remark', ...R.map((s) => `Roll type ${s}`)]);

/**
 * Equipment settings (the user, 31 Oct 2026): an edit made on the dashboard to a default of
 * config/equipment.ts — one entry per motor / tank, the latest wins (Equipment Settings Form Spec).
 */
export const HSM_MOTOR_FORM = 'equipment-settings__hsm-motor-ratings';
export const RMD_TANK_FORM = 'equipment-settings__rmd-oil-tanks';
export const MOTOR_KEYS = { stand: 'stand', ratedCurrentA: 'rated-current-a' } as const;
export const TANK_KEYS = { tank: 'tank', name: 'tank-name', lengthM: 'length-m', widthM: 'width-m', depthM: 'depth-m', capacityL: 'capacity-l' } as const;
export const RMD_TEMP_LIMIT_FORM = 'equipment-settings__rmd-temperature-limits';
export const TEMP_LIMIT_KEYS = { limit: 'limit', name: 'limit-name', minC: 'min-c', maxC: 'max-c' } as const;
