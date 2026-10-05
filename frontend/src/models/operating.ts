/**
 * Run time from power — the mill counts as RUNNING whenever its drive power is above an
 * idle level. Energy falls out of the same readings.
 *
 * Read it from the mill stand drives, not the plant incomer: the furnace, pumps and
 * lighting draw power while the mill is stopped, and would make it look always-on.
 *
 * Two settings decide what a stop is:
 *   idleKw      — at or below this, the stands are not rolling (motors still draw a
 *                 no-load current, so this is not zero)
 *   minStopMin  — a dip shorter than this is the gap between two billets, not a stop
 */

export interface PowerSample {
  /** Start of the interval, epoch ms. The reading covers `stepMs` from here. */
  ts: number;
  kw: number;
}

export interface RunDetection {
  idleKw: number;
  minStopMin: number;
  /** Interval each reading covers, ms. */
  stepMs: number;
}

export interface OperatingInput {
  /** Which meter the series is — an IOsense device/tag once wired. */
  meter: string;
  detection: RunDetection;
  series: PowerSample[];
}

export interface Stop { fromMs: number; toMs: number }

export interface RunTime {
  fromMs: number;
  toMs: number;
  /** Length of the window, h. */
  windowH: number;
  /** Rolling time, h. Derived from power, never measured. */
  runH: number;
  /** Stopped time, h (stops at least `minStopMin` long). */
  stopH: number;
  /** Hours the series actually covers — less than the window means readings are missing. */
  coveredH: number;
  /** Energy drawn in the window, MWh. */
  energyMwh: number;
  /** Energy drawn while stopped — power spent rolling nothing. */
  idleEnergyMwh: number;
  stops: Stop[];
}

const H = 3_600_000;
const MIN = 60_000;

/**
 * Run time and energy inside [fromMs, toMs). Only readings that START inside the window
 * count, so adjacent windows (shifts) partition the series exactly.
 */
export function runTime(input: OperatingInput, fromMs: number, toMs: number): RunTime {
  const { idleKw, minStopMin, stepMs } = input.detection;
  const pts = input.series.filter((p) => p.ts >= fromMs && p.ts < toMs).sort((a, b) => a.ts - b.ts);

  const stops: Stop[] = [];
  let energyKwh = 0;
  let idleKwh = 0;
  let stopMs = 0;

  // Walk the readings, grouping consecutive below-idle ones into candidate stops.
  let i = 0;
  while (i < pts.length) {
    const kwh = (p: PowerSample) => (p.kw * stepMs) / H;
    if (pts[i].kw > idleKw) {
      energyKwh += kwh(pts[i]);
      i += 1;
      continue;
    }
    let j = i;
    let runKwh = 0;
    // A gap in the readings ends a stop: missing data must not be counted as stopped.
    while (j < pts.length && pts[j].kw <= idleKw && (j === i || pts[j].ts - pts[j - 1].ts === stepMs)) {
      runKwh += kwh(pts[j]);
      j += 1;
    }
    const len = (j - i) * stepMs;
    energyKwh += runKwh;
    if (len >= minStopMin * MIN) {
      stops.push({ fromMs: pts[i].ts, toMs: pts[i].ts + len });
      stopMs += len;
      idleKwh += runKwh;
    }
    i = j;
  }

  const coveredMs = pts.length * stepMs;
  return {
    fromMs,
    toMs,
    windowH: (toMs - fromMs) / H,
    runH: (coveredMs - stopMs) / H,
    stopH: stopMs / H,
    coveredH: coveredMs / H,
    energyMwh: energyKwh / 1000,
    idleEnergyMwh: idleKwh / 1000,
    stops,
  };
}
