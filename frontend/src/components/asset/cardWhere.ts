/**
 * Which equipment a Vibration / Bearing temp card's figure is from, and when it was entered (the user,
 * 31 Oct 2026): the card's note shows the equipment, then the date and time.
 */
import { dm } from '@/lib/plantDay';
import type { HsmMillLoadEntry, LsmDriveReading, MidMachine, RmdBearingGroup, RmsDriveReading } from '@/services/hsmApi';

export interface CardWhere {
  /** The equipment and point: "FM 3 · DC motor NDE", "Drive 2 · Flywheel NDE". */
  where: string;
  /** Day of the entry (YYYY-MM-DD) and its time ("14:20"), when the source has one. */
  date: string;
  time: string | null;
}

/** "14:20" from an ISO date-time or "14:20[:00]". */
export const hhmm = (t: string | null | undefined) => (!t ? null : t.includes('T') ? t.slice(11, 16) : t.slice(0, 5));
/** "29 Oct 14:20", or "29 Oct" without a time. */
export const whenText = (w: { date: string; time: string | null }) => `${dm(w.date)}${w.time ? ` ${w.time}` : ''}`;
const drive = (d: string) => d.replace(/^DRIVE\s*0*(\d+)$/i, 'Drive $1');

/** The highest MID reading: its machine, on the visit's date (MID gives no time). */
export function midTop(machines: MidMachine[], date: string | null): CardWhere | null {
  const m = machines.reduce<MidMachine | null>((a, x) => (x.maxMmS !== null && (!a || x.maxMmS > a.maxMmS!) ? x : a), null);
  return m && date ? { where: m.machine, date, time: null } : null;
}

/** HSM Mill Load Log Sheet: the hottest DC motor bearing of the readings. */
export function hsmHottest(entries: HsmMillLoadEntry[]): CardWhere | null {
  let best: { v: number; w: CardWhere } | null = null;
  for (const e of entries) {
    for (const [side, v] of [['DE', e.deTempC], ['NDE', e.ndeTempC]] as const) {
      if (v !== null && (!best || v > best.v)) best = { v, w: { where: `${e.stand} · DC motor ${side}`, date: e.date, time: hhmm(e.time) } };
    }
  }
  return best?.w ?? null;
}

/** LSM Drive Temp: the hottest bearing of the readings. */
export function lsmHottest(entries: LsmDriveReading[]): CardWhere | null {
  let best: { v: number; w: CardWhere } | null = null;
  for (const e of entries) {
    for (const [pos, v] of [
      ['Flywheel DE', e.flywheelDeC], ['Flywheel NDE', e.flywheelNdeC], ['Reduction gear DE', e.reductionDeC],
      ['Reduction gear NDE', e.reductionNdeC], ['Pinion gear DE', e.pinionDeC], ['Pinion gear NDE', e.pinionNdeC],
    ] as const) {
      if (v !== null && (!best || v > best.v)) best = { v, w: { where: `${drive(e.drive)} · ${pos}`, date: e.date, time: hhmm(e.at) } };
    }
  }
  return best?.w ?? null;
}

/** RMS Drive Temp: the hottest bearing of the readings. */
export function rmsHottest(entries: RmsDriveReading[]): CardWhere | null {
  let best: { v: number; w: CardWhere } | null = null;
  for (const e of entries) {
    for (const b of e.bearings) {
      if (!best || b.valueC > best.v) best = { v: b.valueC, w: { where: `${drive(e.drive)} · ${b.component} ${b.point.toLowerCase()}`, date: e.date, time: hhmm(e.at) } };
    }
  }
  return best?.w ?? null;
}

/** RMD bearing forms: the group's hottest bearing; its time from the entry it was read in. */
export function rmdHottest(g: RmdBearingGroup | null): CardWhere | null {
  const m = g?.max;
  if (!m) return null;
  const h = [...(g.history ?? [])].reverse().find((x) => x.equipment === m.equipment && x.point === m.point && x.value === m.value && x.at === m.at);
  return { where: `${m.equipment} · ${m.point}`, date: m.at, time: hhmm(h?.time) };
}

/** A card's last entry with the equipment it is from (shown under it, with its time). */
export function withWhere<T extends { value: string; date: string }>(last: T | null, w: CardWhere | null): (T & { where?: { name: string; time: string | null } }) | null {
  return last ? { ...last, ...(w ? { where: { name: w.where, time: w.time } } : {}) } : null;
}
