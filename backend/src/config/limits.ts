/**
 * The limits every screen judges a reading by, and alerts will raise on — the shipped DEFAULTS
 * (the user, 19 Nov 2026; SETTINGS_AND_ALERTS_REPLICATION.md §3). Each says where its figure came
 * from: the plant's own (`plant`), or a standard placeholder the plant replaces from the Settings
 * screen once live (`placeholder`, the user: "a reference until they fill their own"). A limit the
 * plant must give and no standard covers ships empty (`none`): no limit, no colour, no alert.
 *
 * The values in use are these defaults overlaid with the edits saved from the Settings screen
 * (modules/settings). This file is never rewritten at run time; to change a default for good,
 * edit it here in a commit with its basis.
 *
 * A limit is a band: a minimum, a maximum or both (never a tolerance around a target — §3.2).
 * Placeholders sit above every reading the plant filed in the 400 days to 19 Nov 2026, so normal
 * running is inside them.
 */
export type LimitMill = 'hsm' | 'rmd' | 'lsm' | 'rms';
export const LIMIT_MILLS: LimitMill[] = ['hsm', 'rmd', 'lsm', 'rms'];

export type LimitGroup = 'Temperatures' | 'Oil' | 'Motors' | 'Vibration' | 'Chemistry' | 'Daily production';
export const LIMIT_GROUPS: LimitGroup[] = ['Temperatures', 'Oil', 'Motors', 'Vibration', 'Chemistry', 'Daily production'];

export type LimitApproval = 'plant' | 'placeholder' | 'none';

export interface LimitDef {
  /** Unique within its mill; what saved edits and alerts key on. */
  id: string;
  group: LimitGroup;
  label: string;
  unit: string;
  /** Where the reading it judges comes from. */
  reading: string;
  min: number | null;
  max: number | null;
  approval: LimitApproval;
  /** Where the default figure comes from, in one sentence. */
  basis: string;
  /** What an edit may be — outside this is a typing slip, refused. */
  range: readonly [number, number];
  /** Decimals an edit is kept to. */
  dp: number;
}

const BEARING_75 = 'Standard placeholder: common practice for gearbox and flywheel bearings in a hot plant (Raigarh summers above 45 °C); the plant\'s readings run 30–65 °C.';
const VIBRATION = (reading: string): LimitDef => ({
  id: 'vibration', group: 'Vibration', label: 'Vibration (MID, any direction)', unit: 'mm/s', reading,
  min: null, max: 4.5, approval: 'placeholder',
  basis: 'Standard placeholder: ISO 20816-3, the zone B/C boundary (group 2, flexible foundation) — the zones the dashboard already draws.',
  range: [0.1, 50], dp: 1,
});
const DAILY = (rate: string): LimitDef[] => [
  { id: 'mass-yield', group: 'Daily production', label: 'Mass yield', unit: '%', reading: 'ERP log sheet, per day', min: null, max: null, approval: 'none',
    basis: 'No standard fits one mill\'s product mix — the plant sets it. (The CA inputs\' standard yield is a target, not an alert limit.)', range: [50, 100], dp: 1 },
  { id: 'running-rate', group: 'Daily production', label: 'Running rate', unit: 'MT/h', reading: rate, min: null, max: null, approval: 'none',
    basis: 'No standard fits one mill — the plant sets it. (The CA inputs\' benchmark rate is a target, not an alert limit.)', range: [1, 500], dp: 1 },
  { id: 'specific-energy', group: 'Daily production', label: 'Specific energy', unit: 'kWh/MT', reading: 'Power form ÷ ERP production, per day', min: null, max: null, approval: 'none',
    basis: 'No standard fits one mill — the plant sets it. (The CA inputs\' benchmark is a target, not an alert limit.)', range: [1, 1000], dp: 1 },
];

export const LIMIT_DEFAULTS: Record<LimitMill, readonly LimitDef[]> = {
  hsm: [
    { id: 'motor-bearing-temp', group: 'Temperatures', label: 'DC motor bearings (DE / NDE)', unit: '°C', reading: 'Electrical HSM → Mill Load Log Sheet',
      min: null, max: 80, approval: 'placeholder',
      basis: 'Standard placeholder: common practice for motor bearing housings in a hot plant.', range: [0, 200], dp: 0 },
    { id: 'motor-loading', group: 'Motors', label: 'Motor loading (load ÷ rated current)', unit: '%', reading: 'Electrical HSM → Mill Load Log Sheet',
      min: null, max: 100, approval: 'placeholder',
      basis: 'Standard placeholder: the motor\'s continuous rating; IEC 60034-1 allows 1.5 × rated current for about 60 s only.', range: [1, 300], dp: 0 },
    VIBRATION('MID Logbook → Vibration Reading'),
    ...DAILY('ERP production ÷ historian running hours, per day'),
  ],
  rmd: [
    { id: 'bearing-temp', group: 'Temperatures', label: 'Bearings (reduction / pinion gear)', unit: '°C', reading: 'TMT Mechanical → Mill Bearing Temperature',
      min: 45, max: 65, approval: 'plant', basis: 'The plant\'s limit, 16 Oct 2026.', range: [0, 200], dp: 0 },
    { id: 'flywheel-temp', group: 'Temperatures', label: 'Flywheel bearings', unit: '°C', reading: 'TMT Mechanical → Mill Bearing Temperature',
      min: 45, max: 80, approval: 'plant', basis: 'The plant\'s limit, 16 Oct 2026.', range: [0, 200], dp: 0 },
    { id: 'oil-tank-temp', group: 'Oil', label: 'Oil tank temperature', unit: '°C', reading: 'TMT Mechanical → Oil Tank Temperature',
      min: 45, max: 65, approval: 'plant', basis: 'The plant\'s limit, 16 Oct 2026.', range: [0, 200], dp: 0 },
    { id: 'oil-tank-level', group: 'Oil', label: 'Oil tank level (of capacity)', unit: '% full', reading: 'TMT Mechanical → Oil Tank Level, with each tank\'s size',
      min: 25, max: null, approval: 'placeholder',
      basis: 'Standard placeholder: no standard covers it; the tanks normally run 33–47 % full.', range: [1, 100], dp: 0 },
    VIBRATION('MID Logbook → Vibration Reading'),
    { id: 'chem-c', group: 'Chemistry', label: 'Carbon (C)', unit: '%', reading: 'SMS → CCM Lolipop Sample (RMD)', min: null, max: 0.25, approval: 'placeholder',
      basis: 'Standard placeholder: IS 1786, Fe 500D.', range: [0.001, 1], dp: 3 },
    { id: 'chem-s', group: 'Chemistry', label: 'Sulphur (S)', unit: '%', reading: 'SMS → CCM Lolipop Sample (RMD)', min: null, max: 0.04, approval: 'placeholder',
      basis: 'Standard placeholder: IS 1786, Fe 500D.', range: [0.001, 1], dp: 3 },
    { id: 'chem-p', group: 'Chemistry', label: 'Phosphorus (P)', unit: '%', reading: 'SMS → CCM Lolipop Sample (RMD)', min: null, max: 0.04, approval: 'placeholder',
      basis: 'Standard placeholder: IS 1786, Fe 500D.', range: [0.001, 1], dp: 3 },
    { id: 'chem-sp', group: 'Chemistry', label: 'Sulphur + phosphorus (S + P)', unit: '%', reading: 'SMS → CCM Lolipop Sample (RMD)', min: null, max: 0.075, approval: 'placeholder',
      basis: 'Standard placeholder: IS 1786, Fe 500D.', range: [0.001, 1], dp: 3 },
    ...DAILY('Billet input ÷ adjusted running hours (ERP), per day'),
  ],
  lsm: [
    { id: 'gearbox-bearing-temp', group: 'Temperatures', label: 'Reduction and pinion gearbox bearings', unit: '°C', reading: 'LSM Mechanical → Drive Temp',
      min: null, max: 75, approval: 'placeholder', basis: BEARING_75, range: [0, 200], dp: 0 },
    { id: 'flywheel-temp', group: 'Temperatures', label: 'Flywheel bearings', unit: '°C', reading: 'LSM Mechanical → Drive Temp',
      min: null, max: 75, approval: 'placeholder', basis: BEARING_75, range: [0, 200], dp: 0 },
    { id: 'oil-level', group: 'Oil', label: 'Gearbox oil level', unit: 'in', reading: 'LSM Mechanical → Drive Temp',
      min: 6, max: null, approval: 'placeholder',
      basis: 'Standard placeholder: no standard covers it and the tank sizes are not known; the drives normally read 6.5–11 in.', range: [0.5, 100], dp: 1 },
    { id: 'oil-pressure', group: 'Oil', label: 'Gearbox oil pressure', unit: 'kg/cm²', reading: 'LSM Mechanical → Drive Temp',
      min: 2.5, max: null, approval: 'placeholder',
      basis: 'Standard placeholder: common practice — alarm well below the normal pressure (the drives normally read 3.5–5 kg/cm²).', range: [0.1, 50], dp: 1 },
    { id: 'motor-current', group: 'Motors', label: 'Motor current (any pass)', unit: 'A', reading: 'LSM Electrical Logbook → Mill Load Log Sheet',
      min: null, max: null, approval: 'none',
      basis: 'Needs the LSM motors\' rated currents from the plant (readings go up to about 3,200 A).', range: [1, 20_000], dp: 0 },
    VIBRATION('MID Logbook → Vibration Reading'),
    ...DAILY('ERP production ÷ Production Sheet running hours, per day'),
  ],
  rms: [
    { id: 'gearbox-bearing-temp', group: 'Temperatures', label: 'Reduction gearbox and pinion bearings', unit: '°C', reading: 'RMS Mechanical → Drive Temp',
      min: null, max: 75, approval: 'placeholder', basis: BEARING_75, range: [0, 200], dp: 0 },
    { id: 'flywheel-temp', group: 'Temperatures', label: 'Flywheel bearings', unit: '°C', reading: 'RMS Mechanical → Drive Temp',
      min: null, max: 75, approval: 'placeholder', basis: BEARING_75, range: [0, 200], dp: 0 },
    { id: 'oil-temp', group: 'Oil', label: 'Gearbox oil temperature', unit: '°C', reading: 'RMS Mechanical → Drive Temp',
      min: null, max: 70, approval: 'placeholder',
      basis: 'Standard placeholder: common practice for gear oil in industrial gearboxes; the drives normally read 40–51 °C.', range: [0, 200], dp: 0 },
    { id: 'oil-pressure', group: 'Oil', label: 'Gearbox oil pressure (as filled)', unit: 'kg/cm²', reading: 'RMS Mechanical → Drive Temp',
      min: 0.4, max: null, approval: 'placeholder',
      basis: 'Standard placeholder, to confirm: the form\'s field is "oil pressure level" — the plant to confirm it is a pressure and its unit. Drive 01 always reads 0.5–0.6, the others 1.4–3: set below all of them until the plant says whether Drive 01 is normal.', range: [0.1, 50], dp: 1 },
    VIBRATION('MID Logbook → Vibration Reading'),
    ...DAILY('ERP production ÷ Production Sheet running hours, per day'),
  ],
};

/** One mill's default, or undefined for an id the mill does not have. */
export const limitDef = (mill: LimitMill, id: string) => LIMIT_DEFAULTS[mill].find((d) => d.id === id);
