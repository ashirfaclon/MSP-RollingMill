'use client';

/**
 * HSM Asset Health's Bearing temp and Oil temp (the user, 25 Nov 2026), from the logbook's HSM Mechanical →
 * Bearing Temperature Details: the hottest reduction-cum-pinion gearbox bearing (D / ND side) and the hottest
 * lubrication tank, each at its latest reading of the period, for the drive group the header picks
 * (Roughing: RM 1–5, VE 1, tanks 1–2; Finishing: FM 1–6, tanks 3–4; All: every one). Each opens its own
 * drill-down; both are coloured against the form's own range, T < 65 °C, editable in Settings.
 */
import { useMemo } from 'react';
import { toneOf, useMillSettings, worstTone } from '@/services/settings';
import LimitsNote from '@/components/settings/LimitsNote';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type HsmBearingEntry, type HsmBearingReport, type HsmLatestBearing, type HsmLatestTank, type LimitSetting } from '@/services/hsmApi';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import BearingTrendAll, { type BearingPoint } from './BearingTrendAll';
import { hhmm, whenText, withWhere, type CardWhere } from './cardWhere';

type StandGroup = 'roughing' | 'finishing';
const URL_PATH = '/api/hsm/bearing-temp';
const FORM = 'HSM → HSM Mechanical → Bearing Temperature Details';

const atOf = (date: string, time: string | null) => (hhmm(time) ? `${date} ${hhmm(time)}` : date);
const when = (r: { date: string; time: string | null; shift: string }) => `${dm(r.date)}${hhmm(r.time) ? ` ${hhmm(r.time)}` : ''}${r.shift ? ` · ${r.shift}` : ''}`;

/** The hottest bearing side of the latest readings, and where it is. */
function hottestBearing(rows: HsmLatestBearing[]): { c: number; w: CardWhere } | null {
  let best: { c: number; w: CardWhere } | null = null;
  for (const b of rows) {
    for (const [side, v] of [['D side', b.dC], ['ND side', b.ndC]] as const) {
      if (v !== null && (!best || v > best.c)) best = { c: v, w: { where: `${b.unit} · ${side}`, date: b.date, time: hhmm(b.time) } };
    }
  }
  return best;
}
/** The hottest tank of the latest readings, and which. */
function hottestTank(rows: HsmLatestTank[]): { c: number; w: CardWhere } | null {
  let best: { c: number; w: CardWhere } | null = null;
  for (const t of rows) if (t.tempC !== null && (!best || t.tempC > best.c)) best = { c: t.tempC, w: { where: `Tank ${t.tank} · ${t.stands}`, date: t.date, time: hhmm(t.time) } };
  return best;
}

/** Every bearing of the group's units, each reading: a line per unit and side, the ND side dashed. */
export function hsmGearPoints(entries: HsmBearingEntry[], groups: StandGroup[]): BearingPoint[] {
  return entries.flatMap((e) => e.bearings.filter((b) => groups.includes(b.group)).flatMap((b) => ([['D side', b.dC], ['ND side', b.ndC]] as const)
    .filter(([, v]) => v !== null)
    .map(([side, v]) => ({ at: atOf(e.date, e.time), unit: b.unit, position: 'Gearbox', side, dashed: side === 'ND side', value: v! }))));
}
/** Every tank of the group, each reading. */
function hsmOilPoints(entries: HsmBearingEntry[], groups: StandGroup[]): BearingPoint[] {
  return entries.flatMap((e) => e.tanks.filter((t) => groups.includes(t.group) && t.tempC !== null)
    .map((t) => ({ at: atOf(e.date, e.time), unit: `Tank ${t.tank}`, position: 'Oil', side: '', dashed: false, value: t.tempC! })));
}

/** The group's figures from a report: each unit's / tank's latest reading, and the hottest of each. */
function figuresOf(r: HsmBearingReport | null, groups: StandGroup[] | null) {
  const bearings = r && groups ? r.latestBearings.filter((b) => groups.includes(b.group)) : [];
  const tanks = r && groups ? r.latestTanks.filter((t) => groups.includes(t.group)) : [];
  return { bearings, tanks, bearing: hottestBearing(bearings), oil: hottestTank(tanks) };
}

/** Both cards' data: the figures, their limits and tones, the last entry when the period has none, the trends. */
export function useHsmGearTemps(groups: StandGroup[] | null, dates: { from: string; to: string } | null) {
  const url = rangeUrl(URL_PATH, dates);
  const s = useApi<HsmBearingReport>(url);
  const report = s.data && s.dataUrl === url ? s.data : null;
  const settings = useMillSettings('hsm');
  const limits = { bearing: settings.limit('gearbox-bearing-temp'), oil: settings.limit('oil-temp') };
  const f = figuresOf(report, groups);
  const last = useLastEntry<HsmBearingReport>(URL_PATH, !!groups && !!report && !f.bearing && !f.oil, report?.lastDate, dates?.from);
  const lastF = figuresOf(last.data, groups);
  const bearingTrend = useMemo(() => (groups && report ? hsmGearPoints(report.entries, groups) : []), [groups, report]);
  const lastTrend = useMemo(() => (groups && last.data ? hsmGearPoints(last.data.entries, groups) : []), [groups, last.data]);
  return {
    report, loading: !s.data && !s.error, error: s.error, limits, ...f,
    bearingTone: worstTone(f.bearings.flatMap((b) => [toneOf(b.dC, limits.bearing), toneOf(b.ndC, limits.bearing)])),
    oilTone: worstTone(f.tanks.map((t) => toneOf(t.tempC, limits.oil))),
    bearingLast: withWhere(lastFigure(f.bearing?.c ?? null, last, (d) => figuresOf(d, groups).bearing?.c ?? null, (n) => fixed(n, 0)), lastF.bearing?.w ?? null),
    oilLast: withWhere(lastFigure(f.oil?.c ?? null, last, (d) => figuresOf(d, groups).oil?.c ?? null, (n) => fixed(n, 0)), lastF.oil?.w ?? null),
    /* Condition trends: the period's readings, else the last entry's (its date shown). */
    trend: bearingTrend.length ? bearingTrend : lastTrend,
    trendLast: !bearingTrend.length && lastTrend.length ? last.date : null,
  };
}
export type HsmGearTemps = ReturnType<typeof useHsmGearTemps>;
/** A card's "where": the equipment and when it was read. */
export const whereOf = (x: { w: CardWhere } | null) => (x ? { name: x.w.where, when: whenText(x.w) } : null);

const Source = ({ fields, formula }: { fields: string; formula: string[] }) => (
  <SourceBox sources={[{ name: 'Logbook', rows: [['Form', FORM], ['Field', fields]] }]} formula={formula} />
);

/** Each bearing at its latest reading: D and ND side, coloured against the limit; when, the shift and the section rolling. */
export function HsmBearingDrawer({ open, onClose, g, title }: { open: boolean; onClose: () => void; g: HsmGearTemps; title: string }) {
  const l = g.limits.bearing;
  return (
    <DrillDrawer open={open} onClose={onClose} title={`${title} · bearing temperatures`} sub="HSM · reduction cum pinion gear · °C"
      loading={g.loading} error={g.error} hasData={!!g.report}>
      {g.report && (
        <>
          <Stats items={[
            { label: 'Hottest bearing', value: g.bearing ? fixed(g.bearing.c, 0) : 'NA', unit: g.bearing ? `°C · ${g.bearing.w.where}` : '°C', tone: g.bearing ? g.bearingTone : 'v-na' },
            { label: 'Stands read', value: String(g.bearings.length), unit: 'latest reading of each' },
            { label: 'Rounds', value: String(g.report.entries.length), unit: 'in the period' },
          ]} />
          <div className="pd-table-wrap">
            <table className="grid pd-table" aria-label="Bearing temperatures per stand">
              <thead><tr><th>Stand</th><th className="r">D side (°C)</th><th className="r">ND side (°C)</th><th>Reading</th><th>Section</th></tr></thead>
              <tbody>
                {g.bearings.length === 0
                  ? <tr><td colSpan={5} className="v-na">No reading in this period</td></tr>
                  : g.bearings.map((b) => (
                    <tr key={b.unit}>
                      <td><b>{b.unit}</b></td>
                      <td className={`num r ${toneOf(b.dC, l) ?? ''}`}>{b.dC === null ? '—' : fixed(b.dC, 0)}</td>
                      <td className={`num r ${toneOf(b.ndC, l) ?? ''}`}>{b.ndC === null ? '—' : fixed(b.ndC, 0)}</td>
                      <td>{when(b)}</td>
                      <td>{b.section ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <LimitsNote limits={[l]} />
          <Source
            fields="each stand's reduction cum pinion gear D side °C and ND side °C (RM 1–5, VE 1 N-OS / OS, FM 1–6) — by the form's date and time"
            formula={[
              'Each stand\'s latest reading of the period; Roughing = RM 1–5 and VE 1, Finishing = FM 1–6',
              'Bearing temp = the hottest D / ND side of those readings',
              'Entries remarked "test" are left out; the form\'s own averages are not used',
            ]}
          />
        </>
      )}
    </DrillDrawer>
  );
}

/** Each lubrication tank at its latest reading, coloured against the limit, and every reading of the period. */
export function HsmOilDrawer({ open, onClose, g, title, groups }: { open: boolean; onClose: () => void; g: HsmGearTemps; title: string; groups: StandGroup[] | null }) {
  const l: LimitSetting | null = g.limits.oil;
  const points = useMemo(() => (g.report && groups ? hsmOilPoints(g.report.entries, groups) : []), [g.report, groups]);
  return (
    <DrillDrawer open={open} onClose={onClose} title={`${title} · oil temperature`} sub="HSM · lubrication tanks · °C"
      loading={g.loading} error={g.error} hasData={!!g.report}>
      {g.report && (
        <>
          <Stats items={[
            { label: 'Hottest tank', value: g.oil ? fixed(g.oil.c, 0) : 'NA', unit: g.oil ? `°C · ${g.oil.w.where}` : '°C', tone: g.oil ? g.oilTone : 'v-na' },
            { label: 'Rounds', value: String(g.report.entries.length), unit: 'in the period' },
          ]} />
          <div className="pd-table-wrap">
            <table className="grid pd-table" aria-label="Oil temperature per lubrication tank">
              <thead><tr><th>Tank</th><th>Stands</th><th className="r">Oil (°C)</th><th>Reading</th></tr></thead>
              <tbody>
                {g.tanks.length === 0
                  ? <tr><td colSpan={4} className="v-na">No reading in this period</td></tr>
                  : g.tanks.map((t) => (
                    <tr key={t.tank}>
                      <td><b>Lubrication tank {t.tank}</b></td>
                      <td>{t.stands}</td>
                      <td className={`num r ${toneOf(t.tempC, l) ?? ''}`}>{t.tempC === null ? '—' : fixed(t.tempC, 0)}</td>
                      <td>{when(t)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {points.length > 0 && <BearingTrendAll what="Oil" points={points} />}
          <LimitsNote limits={[l]} />
          <Source
            fields="Lubrication Tank-1 (R1 & R2), Tank-2 (R3, R4 & R5), Tank-3 (F1, F2 & F3), Tank-4 (F4, F5 & F6), °C — by the form's date and time"
            formula={[
              'Each tank\'s latest reading of the period; Roughing = tanks 1–2, Finishing = tanks 3–4',
              'Oil temp = the hottest of those tanks',
              'Entries remarked "test" are left out; the form\'s own average is not used',
            ]}
          />
        </>
      )}
    </DrillDrawer>
  );
}
