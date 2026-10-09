/**
 * The plant day: a date means the mill's day-start hour IST on that date to the same hour the
 * next day — never midnight to midnight. HSM's day starts at 06:00; RMD's at 08:00 (its two
 * shifts are 08:00–20:00 and 20:00–08:00). Selecting 24 Sep on HSM reads 24 Sep 06:00 →
 * 25 Sep 06:00. Every date the Duration filter holds is a plant date in this sense.
 *
 * Pure helpers on YYYY-MM-DD strings, shared by the selection store, the picker and the
 * data hooks so they cannot disagree about where a day starts.
 */

export const PLANT_DAY_START_HOUR = 6;
/** Where each mill's day starts, IST hour. */
export const DAY_START_HOUR = { hsm: 6, rmd: 8 } as const;
/** "06:00" — the cycle boundary as shown on screen. */
export const PLANT_DAY_START = `${String(PLANT_DAY_START_HOUR).padStart(2, '0')}:00`;

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const H_MS = 3_600_000;

/** The plant date an instant falls in: before the day-start hour IST it is still the previous date. */
export const plantDate = (ms: number, hour: number = PLANT_DAY_START_HOUR) => new Date(ms + IST_MS - hour * H_MS).toISOString().slice(0, 10);

/** Epoch ms of the day-start hour IST on plant date `d` — the start of its cycle. */
export const plantDayStartMs = (d: string, hour: number = PLANT_DAY_START_HOUR) => Date.parse(`${d}T00:00:00Z`) - IST_MS + hour * H_MS;

export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "22 Sep" */
export const dm = (d: string | null | undefined) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '—');

/** "06:00 IST" — every time on screen names its zone. */
export const dayStartIst = (hour: number = PLANT_DAY_START_HOUR) => `${String(hour).padStart(2, '0')}:00 IST`;
export const PLANT_DAY_START_IST = dayStartIst();

/** The cycle a range of plant dates covers: "24 Sep 06:00 IST → 25 Sep 06:00 IST". */
export const cycleLabel = (from: string, to: string, hour: number = PLANT_DAY_START_HOUR) =>
  `${dm(from)} ${dayStartIst(hour)} → ${dm(addDays(to, 1))} ${dayStartIst(hour)}`;

/** Whole plant days in an inclusive range. */
export const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
