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
