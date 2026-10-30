'use client';

/**
 * MID vibration on an Asset Health screen: the drill-down (each machine of the section at the last visit,
 * its status and diagnosis, then every point's H / V / A) and the Condition trend (the section's highest
 * reading per visit), and the Remarks panel. The rows are the MID logbook forms — Vibration Reading and
 * Temperature Reading — over MID's earlier Excel reports.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import type { MidMachine, MidStatus } from '@/services/hsmApi';
import type { MidView } from './useMid';

const TONE: Record<MidStatus, string> = { Good: 'v-ok', Acceptable: 'v-warn', 'Un-acceptable': 'v-risk' };
const mm = (v: number | null) => (v === null ? '—' : fixed(v, 1));
const day = (d: string) => `${dm(d)} ${d.slice(0, 4)}`;

export function MidVibrationDrawer({ open, onClose, title, mid }: { open: boolean; onClose: () => void; title: string; mid: MidView }) {
  const r = mid.report;
  return (
    <DrillDrawer open={open} onClose={onClose} title={`${title} · vibration`} sub="MID · mm/s RMS" loading={mid.loading} error={mid.error} hasData={!!r}>
      {r && (
        <>
          <Stats items={[
            { label: 'Highest reading', value: mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1), unit: 'mm/s', tone: mid.maxMmS === null ? 'v-na' : undefined },
            { label: 'MID visit', value: mid.date ? day(mid.date) : 'NA', unit: '', tone: mid.date ? undefined : 'v-na', wrap: true },
            { label: 'Machines', value: String(mid.machines.length), unit: mid.worst?.status ? `worst: ${mid.worst.status}` : '' },
          ]} />
          <div className="pd-table-wrap">
            <table className="grid pd-table" aria-label="MID machines">
              <thead><tr><th>Machine</th><th className="r">Highest (mm/s)</th><th>Status</th><th>Diagnosis</th></tr></thead>
              <tbody>
                {mid.machines.length === 0
                  ? <tr><td colSpan={4} className="v-na">NA</td></tr>
                  : mid.machines.map((m) => (
                    <tr key={m.machine}>
                      <td><b>{m.machine}</b></td>
                      <td className="num r v-val">{mm(m.maxMmS)}</td>
                      <td className={m.status ? TONE[m.status] : 'v-na'}>{m.status ?? '—'}</td>
                      <td>{m.diagnosis ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="pd-table-wrap">
            <table className="grid pd-table" aria-label="MID readings">
              <thead><tr><th>Machine</th><th>Part</th><th>Point</th><th className="r">H</th><th className="r">V</th><th className="r">A</th></tr></thead>
              <tbody>
                {mid.machines.flatMap((m) => m.points.map((p) => (
                  <tr key={`${m.machine}-${p.part}-${p.point}`}>
                    <td>{m.machine}</td><td>{p.part ?? p.component}</td><td>{p.point}</td>
                    <td className="num r">{mm(p.horizontal)}</td><td className="num r">{mm(p.vertical)}</td><td className="num r">{mm(p.axial)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          {r.temperature && (
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="MID thermography">
                <thead><tr><th>Equipment ({day(r.temperature.date)})</th><th>Phase</th><th className="r">Max (°C)</th><th className="r">Design (°C)</th><th>Status</th><th>Remarks</th></tr></thead>
                <tbody>
                  {r.temperature.readings.map((t) => (
                    <tr key={`${t.equipment}-${t.phase}`}>
                      <td>{t.equipment}</td><td>{t.phase ?? '—'}</td>
                      <td className="num r v-val">{mm(t.maxC)}</td><td className="num r">{mm(t.designC)}</td>
                      <td className={t.status ? TONE[t.status] : 'v-na'}>{t.status ?? '—'}</td><td>{t.remarks ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SourceBox
            sources={[{ name: 'MID', rows: [
              ['Data', r.sources.length ? r.sources.map((s) => `${s.name} (${day(s.date)})`).join(', ') : 'no MID visit up to the period end'],
              ['Form', 'MID Logbook → Vibration Reading (per point) and Temperature Reading (per equipment and phase)'],
              ...(r.skipped.length ? [['Left out', r.skipped.map((s) => `${s.machine} ${s.point} ${s.field}: "${s.raw}" (not a number)`).join('; ')] as [string, string]] : []),
            ] }]}
            formula={[
              'The last MID visit up to the end of the period',
              'Highest reading = the highest of horizontal, vertical and axial velocity over the section\'s machines (mm/s RMS)',
              'Status = the worst of MID\'s verdicts on the machine\'s points; diagnosis = their remarks',
              'Thermography = the readings of the last Temperature Reading visit up to the end of the period',
            ]}
          />
        </>
      )}
    </DrillDrawer>
  );
}

/**
 * Severity zones of ISO 20816-3 (was 10816-3), group 2 machines on flexible foundations: the zone
 * boundaries MID's own grades sit closest to (its Acceptable readings cluster round 4.5 mm/s, its one
 * Un-acceptable reading is 7.5). A reference, not the plant's limit; the plant's verdict is MID's grade.
 */
const ZONES: { to: number; key: string; name: string }[] = [
  { to: 2.3, key: 'a', name: 'A · new machine condition' },
  { to: 4.5, key: 'b', name: 'B · unrestricted operation' },
  { to: 7.1, key: 'c', name: 'C · restricted operation' },
  { to: Infinity, key: 'd', name: 'D · damage likely' },
];
const BOUNDS = ZONES.slice(0, -1).map((z) => z.to);

interface VibRow { machine: string; value: number; prev: number | null; status: MidStatus | null; parts: { part: string; h: number | null; v: number | null; a: number | null; max: number }[] }

/** Each part's highest H / V / A over its points. */
function partsOf(m: MidMachine): VibRow['parts'] {
  const by = new Map<string, VibRow['parts'][number]>();
  for (const p of m.points) {
    const name = p.part ?? p.component;
    const cur = by.get(name) ?? { part: name, h: null, v: null, a: null, max: 0 };
    const hi = (x: number | null, y: number | null) => (y === null ? x : x === null ? y : Math.max(x, y));
    cur.h = hi(cur.h, p.horizontal); cur.v = hi(cur.v, p.vertical); cur.a = hi(cur.a, p.axial);
    cur.max = Math.max(cur.max, p.horizontal ?? 0, p.vertical ?? 0, p.axial ?? 0);
    by.set(name, cur);
  }
  return [...by.values()].sort((x, y) => y.max - x.max);
}

/**
 * The Condition trend block: every machine of the section at the last MID visit, highest first (the
 * user, 31 Oct 2026). Each bar is stacked by severity zone — the part of the reading inside A, B, C and
 * D — on one scale, with a tick at the previous visit's reading; MID's grade beside it. Hover or focus
 * a row for each part's H / V / A.
 */
export function MidVibrationTrend({ mid }: { mid: MidView }) {
  const last = mid.visits.at(-1) ?? null;
  const prev = mid.visits.length > 1 ? mid.visits[mid.visits.length - 2] : null;
  const rows = useMemo<VibRow[]>(() => (last?.machines ?? [])
    .filter((m) => m.maxMmS !== null)
    .map((m) => ({
      machine: m.machine, value: m.maxMmS!, status: m.status, parts: partsOf(m),
      prev: prev?.machines.find((x) => x.machine === m.machine)?.maxMmS ?? null,
    }))
    .sort((a, b) => b.value - a.value), [last, prev]);
  // One scale for every row: past zone D's start, and past the highest reading unless that is an outlier
  // (over twice the next): an outlier runs off the end, marked, its figure still exact.
  const top = rows[0]?.value ?? 0;
  const next = rows[1]?.value ?? top;
  const scale = Math.max(9, Math.ceil((top > 2 * next ? next : top) * 1.15));
  const pct = (v: number) => `${(Math.min(v, scale) / scale) * 100}%`;
  const zonesUsed = new Set(rows.flatMap((r) => ZONES.filter((z, i) => r.value > (i ? ZONES[i - 1].to : 0)).map((z) => z.key)));

  return (
    <div className="ah-trend vib">
      <div className="ah-trend-head">
        <span className="rm-k">Vibration · mm/s RMS</span>
        {last && <span className="ah-trend-date">MID visit {day(last.date)}{prev ? ` · tick: ${day(prev.date)}` : ''}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="ah-trend-empty">{mid.report ? 'No MID vibration readings for this section yet' : 'NA'}</p>
      ) : (
        <>
          <div className="vib-legend" aria-label="Severity zones, ISO 20816-3 group 2, flexible foundation">
            {ZONES.filter((z) => zonesUsed.has(z.key)).map((z) => (
              <span key={z.key} className="vib-legend-item"><i className={`vib-swatch vib-z-${z.key}`} aria-hidden />{z.name}</span>
            ))}
            <span className="vib-legend-src">ISO 20816-3 · group 2, flexible</span>
          </div>
          <div className="vib-axis" aria-hidden>
            <span />
            <span className="vib-axis-track">
              <b style={{ left: '0%' }}>0</b>
              {BOUNDS.filter((b) => b < scale).map((b) => <b key={b} style={{ left: pct(b) }}>{b}</b>)}
              <b style={{ left: '100%' }}>{scale}</b>
            </span>
            <span /><span />
          </div>
          <ul className="vib-rows" aria-label={`Vibration of ${rows.length} machines, highest first`}>
            {rows.map((r) => {
              const segs = ZONES.map((z, i) => {
                const from = i ? ZONES[i - 1].to : 0;
                return { key: z.key, w: Math.max(0, Math.min(r.value, z.to, scale) - Math.min(from, scale)) };
              }).filter((x) => x.w > 0);
              const over = r.value > scale;
              return (
                <li key={r.machine} className="vib-row" tabIndex={0}
                  aria-label={`${r.machine}: ${fixed(r.value, 1)} mm/s${r.status ? `, MID ${r.status}` : ''}${r.prev !== null ? `, previous visit ${fixed(r.prev, 1)}` : ''}`}>
                  <span className="vib-name" title={r.machine}>{r.machine}</span>
                  <span className="vib-track">
                    {BOUNDS.filter((b) => b < scale).map((b) => <i key={b} className="vib-guide" style={{ left: pct(b) }} aria-hidden />)}
                    <span className={`vib-bar${over ? ' vib-bar--over' : ''}`} style={{ width: pct(r.value) }}>
                      {segs.map((sg) => <i key={sg.key} className={`vib-seg vib-z-${sg.key}`} style={{ flexGrow: sg.w }} />)}
                    </span>
                    {r.prev !== null && <i className="vib-prev" style={{ left: pct(r.prev) }} title={`Previous visit ${fixed(r.prev, 1)} mm/s`} aria-hidden />}
                  </span>
                  <span className="vib-val num">{fixed(r.value, 1)}</span>
                  <span className="vib-grade"><i className={`vib-dot ${r.status ? TONE[r.status] : 'v-na'}`} aria-hidden />{r.status ?? 'NA'}</span>
                  <span className="vib-tip" role="tooltip">
                    <b>{r.machine}</b>
                    <table>
                      <thead><tr><th>Part</th><th>H</th><th>V</th><th>A</th></tr></thead>
                      <tbody>
                        {r.parts.map((pt) => (
                          <tr key={pt.part}><td>{pt.part}</td><td>{mm(pt.h)}</td><td>{mm(pt.v)}</td><td>{mm(pt.a)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Remarks order (the user, 28 Oct 2026): Un-acceptable, then Acceptable, then Good. */
const REMARK_ORDER: Record<MidStatus, number> = { 'Un-acceptable': 0, Acceptable: 1, Good: 2 };

/**
 * The Remarks panel: each remark of the last MID visits, one line each — every machine's (Vibration Reading)
 * and every thermography reading's (Temperature Reading). The whole mill, not the selected group (HSM's
 * and RMD's remarks are on auxiliary pumps, which no group selects).
 */
export function MidRemarks({ mid }: { mid: MidView }) {
  const rows = [
    ...(mid.report?.latest?.machines ?? []).map((m) => ({ key: m.machine, head: m.machine, status: m.status, text: m.diagnosis })),
    ...(mid.report?.temperature?.readings ?? []).map((t) => ({
      key: `t-${t.equipment}-${t.phase}`, head: t.phase ? `${t.equipment} · ${t.phase}` : t.equipment, status: t.status, text: t.remarks,
    })),
  ]
    .filter((m) => m.text)
    .sort((x, y) => (x.status ? REMARK_ORDER[x.status] : 3) - (y.status ? REMARK_ORDER[y.status] : 3));
  if (!rows.length) return <div className="ah-row"><span className="num v-na">NA</span></div>;
  return (
    <ul className="ah-remarks" aria-label="Remarks">
      {rows.map((m) => (
        <li className="ah-remark" key={m.key}>
          <span className="ah-remark-head">
            <b>{m.head}</b>
            <span className={`ah-remark-status ${m.status ? TONE[m.status] : 'v-na'}`}>{m.status ?? 'NA'}</span>
          </span>
          <span className="ah-remark-text">{m.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** "21 Apr 2026" for the Last inspection fact; null without a visit. */
export const midDate = (d: string | null) => (d ? day(d) : null);
