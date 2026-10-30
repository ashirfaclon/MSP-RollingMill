'use client';

/**
 * LSM Asset Health · Motor current drill-down: LSM Electrical Logbook → Mill Load Log Sheet. The
 * latest reading's load on every pass, by stand (stand 1 passes 1–4, stands 2–7 one pass each),
 * and the mean load of each reading over the period.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { axisFloor, fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import type { LsmMillLoadReading, LsmMillLoadReport } from '@/services/hsmApi';

const when = (e: LsmMillLoadReading) => `${dm(e.date)}${e.time ? ` · ${e.time.slice(11, 16)}` : ''}`;

export default function LsmMillLoadDrawer({ open, onClose, report, loading, error }: {
  open: boolean; onClose: () => void; report: LsmMillLoadReport | null; loading: boolean; error: string | null;
}) {
  return (
    <DrillDrawer open={open} onClose={onClose} title="Mill stands · motor current" sub="LSM · A"
      loading={loading} error={error} hasData={!!report}>
      {report && <Content r={report} />}
    </DrillDrawer>
  );
}

function Content({ r }: { r: LsmMillLoadReport }) {
  const last = r.latest;
  const readings = useMemo(() => r.entries.filter((e) => e.meanA !== null), [r.entries]);
  const categories = useMemo(() => readings.map(when), [readings]);
  const series = useMemo<DrillSeries[]>(() => [{ id: 'mean', name: 'Mean load', token: '--s-prod', type: 'line', data: readings.map((e) => e.meanA), dp: 0 }], [readings]);
  const axes = useMemo(() => [{ title: 'A', unit: 'A', min: axisFloor(readings.map((e) => e.meanA)) }], [readings]);
  return (
    <>
      <Stats items={[
        { label: 'Motor current', value: last?.meanA == null ? 'NA' : fixed(last.meanA, 0), unit: 'A · mean of passes', tone: last?.meanA == null ? 'v-na' : undefined },
        { label: 'Reading', value: last ? when(last) : 'NA', unit: last ? [last.section, last.billetSize].filter(Boolean).join(' · ') : '', wrap: true },
      ]} />
      {readings.length > 1 && (
        <DrillChart series={series} categories={categories} axes={axes}
          ariaLabel={`Mean motor current per reading: ${readings.map((e) => `${e.date} ${e.time ?? ''} ${e.meanA} A`).join('; ')}`} />
      )}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Load per stand and pass">
          <thead><tr><th>Stand</th><th>Pass</th><th className="r">Load (A)</th></tr></thead>
          <tbody>
            {!last || last.passes.length === 0
              ? <tr><td colSpan={3} className="v-na">NA</td></tr>
              : last.passes.map((p) => (
                <tr key={`${p.stand}-${p.pass}`}>
                  <td><b>Stand {p.stand}</b></td>
                  <td>Pass {p.pass}</td>
                  <td className={`num r ${p.loadA === null ? 'v-na' : 'v-val'}`}>{p.loadA === null ? '—' : fixed(p.loadA, 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'Logbook', rows: [
          ['Form', 'Light Structure Mill → Electrical Logbook → Mill Load Log Sheet'],
          ['Field', 'stand 1 pass 1–4 amp, stand 2 pass 5 amp … stand 7 pass 10 amp; section, billet size — by the form\'s date'],
        ] }]}
        formula={[
          'Motor current = mean load of the passes filled, at the latest reading of the period (A)',
          'Chart = that mean for each reading of the period',
        ]}
      />
      {r.logbook.connection === 'down' && <p className="v-warn">{r.logbook.message}</p>}
    </>
  );
}
