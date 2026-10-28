'use client';

/**
 * MID vibration on an Asset Health screen: the drill-down (each machine of the section at the last visit,
 * its status and diagnosis, then every point's H / V / A) and the Condition trend (the section's highest
 * reading per visit). The rows are MID's monthly reports until the MID logbook forms go live.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import type { MidStatus } from '@/services/hsmApi';
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
          <SourceBox
            sources={[{ name: 'MID', rows: [
              ['Data', r.sources.length ? r.sources.map((s) => `${s.name} (${day(s.date)})`).join(', ') : 'no MID visit up to the period end'],
              ['Shape', 'MID logbook forms: Vibration Reading (per point) and Machine Condition (per machine)'],
              ...(r.skipped.length ? [['Left out', r.skipped.map((s) => `${s.machine} ${s.point} ${s.field}: "${s.raw}" (not a number)`).join('; ')] as [string, string]] : []),
            ] }]}
            formula={[
              'The last MID visit up to the end of the period',
              'Highest reading = the highest of horizontal, vertical and axial velocity over the section\'s machines (mm/s RMS)',
              'Status and diagnosis = MID\'s verdict and remark for each machine',
            ]}
          />
        </>
      )}
    </DrillDrawer>
  );
}

/** The Condition trend block: the section's highest reading per MID visit. */
export function MidVibrationTrend({ mid }: { mid: MidView }) {
  const categories = useMemo(() => mid.trend.map((t) => day(t.date)), [mid.trend]);
  // A bar per visit: MID comes about once a month, and a single visit still shows.
  const series = useMemo<DrillSeries[]>(() => [{ id: 'vib', name: 'Highest vibration', token: '--s-prod', type: 'column', data: mid.trend.map((t) => t.maxMmS), dp: 1 }], [mid.trend]);
  const axes = useMemo(() => [{ title: 'mm/s', unit: 'mm/s', min: 0 }], []);
  const last = mid.trend.at(-1);
  return (
    <div className="ah-trend">
      <div className="ah-trend-head">
        <span className="rm-k">Vibration · mm/s RMS</span>
        <span className={`num ${last ? 'v-val' : 'v-na'}`}>{last ? fixed(last.maxMmS, 1) : 'NA'}</span>
      </div>
      {mid.trend.length
        ? <DrillChart series={series} categories={categories} axes={axes} ariaLabel={`Highest vibration per MID visit: ${mid.trend.map((t) => `${t.date} ${t.maxMmS} mm/s`).join('; ')}`} />
        : <div className="ah-trend-plot" role="img" aria-label="Vibration: no data" />}
    </div>
  );
}

/** Remarks order (the user, 28 Oct 2026): Un-acceptable, then Acceptable, then Good. */
const REMARK_ORDER: Record<MidStatus, number> = { 'Un-acceptable': 0, Acceptable: 1, Good: 2 };

/**
 * The Remarks panel: each machine's remark at the last MID visit, one line each — the whole mill, not the
 * selected group (HSM's and RMD's remarks are on auxiliary pumps, which no mimic zone selects).
 */
export function MidRemarks({ mid }: { mid: MidView }) {
  const rows = (mid.report?.latest?.machines ?? [])
    .filter((m) => m.diagnosis)
    .sort((x, y) => (x.status ? REMARK_ORDER[x.status] : 3) - (y.status ? REMARK_ORDER[y.status] : 3));
  if (!rows.length) return <div className="ah-row"><span className="num v-na">NA</span></div>;
  return (
    <ul className="ah-remarks" aria-label="Remarks">
      {rows.map((m) => (
        <li className="ah-remark" key={m.machine}>
          <span className="ah-remark-head">
            <b>{m.machine}</b>
            <span className={`ah-remark-status ${m.status ? TONE[m.status] : 'v-na'}`}>{m.status ?? 'NA'}</span>
          </span>
          <span className="ah-remark-text">{m.diagnosis}</span>
        </li>
      ))}
    </ul>
  );
}

/** "21 Apr 2026" for the Last inspection fact; null without a visit. */
export const midDate = (d: string | null) => (d ? day(d) : null);
