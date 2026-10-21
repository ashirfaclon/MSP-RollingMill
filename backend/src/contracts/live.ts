/** GET /api/hsm/live and /api/hsm/stands — the plant historian, now and as a trend. */
import type { StandGroup } from './common';

export interface StandNow {
  id: string;
  group: StandGroup;
  /** Drive on (On_Off = 1); null when there is no fresh reading. */
  on: boolean | null;
  currentA: number | null;
  rpm: number | null;
  forceT: number | null;
  at: string | null;
  fresh: boolean;
}

export interface GroupNow {
  id: StandGroup;
  label: string;
  total: number;
  /** Stands with a fresh reading and the drive on. */
  on: number;
  /** Stands with a fresh reading at all. */
  reporting: number;
  state: 'all-on' | 'partial' | 'all-off' | 'no-data';
  stateLabel: string;
}

export interface HsmLive {
  connection: 'up' | 'down';
  message: string;
  now: string;
  plantDay: string;
  plantDayStart: string;
  /** Billets discharged since the plant day started (sum of counter increases). */
  billetsToday: number | null;
  millSpeed: number | null;
  lastReadingAt: string | null;
  fresh: boolean;
  stands: StandNow[];
  groups: GroupNow[];
}

export type StandMetric = 'current' | 'rpm' | 'force' | 'onOff';

export interface StandTrend {
  connection: 'up' | 'down';
  message: string;
  group: StandGroup;
  metric: StandMetric;
  unit: string;
  from: string;
  to: string;
  bucketSeconds: number;
  /** One series per stand: [epoch ms, interval mean] — null where the stand did not report. */
  series: { id: string; field: string; points: [number, number | null][] }[];
  /** Roughing mill speed on the same time base, for context. */
  speed: [number, number | null][];
}

/** GET /api/hsm/electrical-delays — the logbook's Electrical Delays form, faults only. */
export interface ElectricalDelay {
  date: string;
  shift: string;
  section: string;
  timeFrom: string | null;
  timeTo: string | null;
  /** From the form's duration (HH:MM:SS); null when not filled. */
  minutes: number | null;
  details: string;
  /** Stands the fault names, e.g. ["F1", "F2", "F5"]. */
  stands: string[];
  /** roughing (R stands), finishing (F stands), both, or null when it names none. */
  group: 'roughing' | 'finishing' | 'both' | null;
}

export interface DelayTotals { faults: number; minutes: number; mttrMin: number | null }

export interface ElectricalDelaysReport {
  from: string;
  to: string;
  form: string;
  logbook: { connection: 'up' | 'down'; message: string };
  /** Newest first. */
  delays: ElectricalDelay[];
  totals: { all: DelayTotals; roughing: DelayTotals; finishing: DelayTotals };
}

/** GET /api/hsm/mill-load — the logbook's Mill Load Log Sheet: one reading per stand. */
export interface HsmMillLoadEntry {
  /** The form's Date (the day the reading is for) and its time. */
  date: string;
  time: string | null;
  shift: string;
  /** "RM 4", "FM 2" … as normalised from the form's stand name. */
  stand: string;
  group: 'roughing' | 'finishing' | null;
  /** Load in amp. */
  loadA: number | null;
  /** DC motor drive-end / non-drive-end temperature, °C. */
  deTempC: number | null;
  ndeTempC: number | null;
}
export interface HsmMillLoadReport {
  from: string;
  to: string;
  form: string;
  logbook: { connection: 'up' | 'down'; message: string };
  /** Each stand's latest reading of the period. */
  latest: HsmMillLoadEntry[];
  /** Every reading of the period, oldest first. */
  entries: HsmMillLoadEntry[];
}
