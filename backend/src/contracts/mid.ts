/** GET /api/mid/:mill — MID condition monitoring (the MID logbook forms), per visit. */

export type MidSection = 'roughing' | 'route' | 'finishing' | 'auxiliary';
export type MidStatus = 'Good' | 'Acceptable' | 'Un-acceptable';

/** Form 1 VIBRATION READING — one measuring point. */
export interface MidPoint {
  /** The report's part label ("MAIN MOTOR", "COOLING BLOWER-01"); null when the report gives none. */
  part: string | null;
  component: string;
  point: string;
  /** Velocity, mm/s RMS; null when not read (or not a number in the report). */
  horizontal: number | null;
  vertical: number | null;
  axial: number | null;
}

/** One machine at one visit: Form 2 MACHINE CONDITION and its Form 1 points. */
export interface MidMachine {
  machine: string;
  /** Section of the mill (plant-confirmed for RMD; RM / FM stands for HSM); null when not in one. */
  section: MidSection | null;
  status: MidStatus | null;
  diagnosis: string | null;
  /** The highest of H / V / A over its points, mm/s. */
  maxMmS: number | null;
  points: MidPoint[];
}

export interface MidVisit {
  date: string;
  machines: MidMachine[];
}

/** Form TEMPERATURE READING — one thermography reading of an equipment (one phase). */
export interface MidTemperature {
  equipment: string;
  phase: string | null;
  loadMw: number | null;
  designC: number | null;
  maxC: number | null;
  status: MidStatus | null;
  remarks: string | null;
}

export interface MidReport {
  mill: string;
  /** Period end: visits up to and including this date. */
  to: string;
  /** Where the rows come from: MID's Excel reports until the MID logbook forms go live. */
  sources: { kind: 'report' | 'logbook'; name: string; date: string }[];
  /** Every visit up to `to`, oldest first. */
  visits: MidVisit[];
  /** The last visit up to `to`. */
  latest: MidVisit | null;
  /** The last thermography visit up to `to` (Temperature Reading form); null when none. */
  temperature: { date: string; readings: MidTemperature[] } | null;
  /** Report cells left out (typed as a date / time instead of a number). */
  skipped: { date: string; machine: string; point: string; field: string; raw: string }[];
}
