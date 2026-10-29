/**
 * Plant configuration for the twins' signals (mill-mimic-improvement-spec C2, C3) — never in
 * drawing code. What is known is written here; what the plant has not given stays null, and
 * the drawing says so rather than inventing it:
 *
 *   - staleAfterMs   how old a reading may be before it is drawn grey with its age;
 *   - min / max      the plausible range: outside it a reading is SUSPECT, shown with "?";
 *   - zeroBand       readings within ±zeroBand display as ≈0 (a sensor offset the plant has
 *                    confirmed). None confirmed yet, so none configured (the user, 29 Oct 2026);
 *   - ratedA         the stand's rated current, for the reference bar. Pending from the plant;
 *                    until it comes, bars compare against the highest current in the group now.
 */

export interface SignalSpec {
  staleAfterMs: number;
  min?: number;
  max?: number;
  zeroBand?: number;
}

/** A machine's reference figures. */
export interface RatingSpec {
  /** Rated current, A; null = not given by the plant. */
  ratedA: number | null;
}

/** The historian writes about every 10 s; the backend calls a reading fresh for 15 min. */
const STATION_STALE_MS = 15 * 60_000;
/** The counters are summed over the day; a quiet two minutes is a stopped mill, not a fault. */
const COUNTER_STALE_MS = 2 * 60_000;

/** A drive's current: never below zero. No zero band until the plant confirms an offset. */
export const CURRENT: SignalSpec = { staleAfterMs: STATION_STALE_MS, min: 0 };
export const RPM: SignalSpec = { staleAfterMs: STATION_STALE_MS, min: 0 };
export const FORCE_T: SignalSpec = { staleAfterMs: STATION_STALE_MS, min: 0 };
export const RUNNING: SignalSpec = { staleAfterMs: STATION_STALE_MS };
export const BILLETS: SignalSpec = { staleAfterMs: COUNTER_STALE_MS, min: 0 };
/** HSM roughing mill speed: a normalised feedback, idle ≈ 0.1, rolling 0.8–1.0. */
export const HSM_MILL_SPEED: SignalSpec = { staleAfterMs: STATION_STALE_MS, min: 0, max: 1.2 };
/** RMD line speed, m/s. */
export const LINE_MPS: SignalSpec = { staleAfterMs: STATION_STALE_MS, min: 0, max: 40 };

/** Rated currents per stand id. All pending from the plant (29 Oct 2026). */
export const RATING: Record<string, RatingSpec> = {};
export const ratingOf = (id: string): RatingSpec => RATING[id] ?? { ratedA: null };

/** Reference-bar thresholds against RATED current (spec C3). Only apply when a rating is configured. */
export const BAR_WARN = 0.9;
export const BAR_RISK = 1.0;

/** The polling policy (spec C11, the user, 29 Oct 2026): see liveStore.ts. */
export const POLL = {
  /** Matches the historian's own cadence (a reading about every 10 s). */
  intervalMs: 10_000,
  /** On failure: double each time, up to this, with ±20 % jitter. */
  backoffMaxMs: 60_000,
  /** A request that takes longer than this is abandoned. */
  timeoutMs: 15_000,
  /** Staleness is re-judged this often, so a frozen feed greys out without any new message. */
  assessMs: 250,
};
