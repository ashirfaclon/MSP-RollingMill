'use client';

/**
 * ERP PM on an Asset Health screen (/api/pm/:mill), whole mill — the ERP marks no section or stand on
 * its equipment: Next PM and Open work orders in the header, the PM on time card, the ERP PM &
 * work-order history rows, and one drill-down behind all of them. MTBF = the screen's own running
 * hours ÷ the breakdowns. A mill with no equipment in the ERP PM module (HSM) shows NA throughout.
 */
import { fixed } from '@/lib/num';
import { dm } from '@/lib/plantDay';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type PmReport } from '@/services/hsmApi';
import KpiCard from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';

export interface PmView {
  report: PmReport | null;
  loading: boolean;
  error: string | null;
  /** The mill has equipment in the ERP PM module. */
  inErp: boolean;
}

export function usePm(mill: 'hsm' | 'rmd' | 'lsm' | 'rms'): PmView {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/pm/${mill}`, dates);
  const s = useApi<PmReport>(url);
  const report = s.data && s.dataUrl === url ? s.data : null;
  return { report, loading: !s.data && !s.error, error: s.error, inErp: !!report && report.equipment > 0 };
}

const day = (d: string) => `${dm(d)} ${d.slice(0, 4)}`;
/** The ERP division of each mill's equipment. */
const DIVISION: Record<string, string> = { hsm: 'S1', rmd: 'RM', lsm: 'LS', rms: 'RS' };

/** Header facts: Next PM · ERP and Open work orders; null = NA. */
export function pmFacts(pm: PmView): { nextPm: string | null; openWorkOrders: string | null } {
  const r = pm.inErp ? pm.report! : null;
  return {
    nextPm: r?.nextPm ? day(r.nextPm.date) : null,
    openWorkOrders: r ? String(r.openWorkOrders) : null,
  };
}

export function PmOnTimeCard({ pm, onOpen }: { pm: PmView; onOpen: () => void }) {
  const pct = pm.inErp ? pm.report!.pm.onTimePct : null;
  return (
    <KpiCard label="PM on time" value={pct === null ? 'NA' : fixed(pct, 1)} unit="%" note="" series="order" loading={pm.loading}
      noEntries={pm.inErp && pct === null ? 'No PM due in this period' : false}
      {...(pm.inErp ? { onOpen, openLabel: 'PM due, done on time and breakdowns, from the ERP' } : {})} />
  );
}

/** The ERP PM & work-order history rows: PM completed on time, MTBF, MTTR, Open action. */
export function ErpPmRows({ pm, runH, onOpen }: { pm: PmView; runH: number | null; onOpen: () => void }) {
  const r = pm.inErp ? pm.report! : null;
  const n = r?.breakdowns.length ?? 0;
  const rows: [string, string | null][] = [
    ['PM completed on time', r && r.pm.due ? `${fixed(r.pm.doneOnTime, 0)} of ${fixed(r.pm.due, 0)}` : null],
    // MTBF = running hours ÷ breakdowns; none in the period: "no failure" with the running hours (plant sheet).
    ['MTBF', !r || runH === null ? null : n ? `${fixed(runH / n, 1)} h` : `No failure · ${fixed(runH, 1)} run h`],
    ['MTTR', !r ? null : n && r.mttrH !== null ? `${fixed(r.mttrH, 2)} h` : n ? null : 'No failure'],
    ['Open action', r ? String(r.openActions) : null],
  ];
  return (
    <>
      {rows.map(([k, v]) => {
        const body = <><span className="rm-k">{k}</span><span className={`num ${v === null ? 'v-na' : 'v-val'}`}>{v ?? 'NA'}</span></>;
        return r
          ? <button type="button" key={k} className="ah-row ah-row--button" onClick={onOpen} aria-haspopup="dialog" title="ERP PM: PM due, done on time and breakdowns">{body}</button>
          : <div className="ah-row" key={k}>{body}</div>;
      })}
    </>
  );
}

export function ErpPmDrawer({ open, onClose, pm, runH, title }: { open: boolean; onClose: () => void; pm: PmView; runH: number | null; title: string }) {
  const r = pm.report;
  const n = r?.breakdowns.length ?? 0;
  return (
    <DrillDrawer open={open} onClose={onClose} title={`${title} · ERP PM`} sub={r ? `${dm(r.from)} – ${dm(r.pm.asOf)}` : ''}
      loading={pm.loading} error={pm.error} hasData={pm.inErp}>
      {r && (
        <>
          <Stats items={[
            { label: 'PM due', value: fixed(r.pm.due, 0) },
            { label: 'Done on time', value: String(r.pm.doneOnTime), unit: r.pm.done > r.pm.doneOnTime ? `+ ${r.pm.done - r.pm.doneOnTime} late` : '' },
            { label: 'PM on time', value: r.pm.onTimePct === null ? 'NA' : fixed(r.pm.onTimePct, 1), unit: '%' },
            { label: 'Breakdowns', value: String(n), unit: r.breakdownHours === null ? '' : `${fixed(r.breakdownHours, 2)} h down` },
            { label: 'MTBF', value: runH === null ? 'NA' : n ? fixed(runH / n, 1) : 'No failure', unit: runH !== null && n ? 'h' : '' },
          ]} />
          <div className="pd-table-wrap">
            <table className="grid pd-table" aria-label="PM due per month">
              <thead><tr><th>Month</th><th className="r">Due</th><th className="r">Done on time</th><th className="r">Done late</th><th className="r">Not done</th></tr></thead>
              <tbody>
                {r.months.length === 0
                  ? <tr><td colSpan={5} className="v-na">No PM due in the period</td></tr>
                  : r.months.map((m) => (
                    <tr key={m.month}>
                      <td>{dm(`${m.month}-01`).split(' ')[1]} {m.month.slice(0, 4)}</td>
                      <td className="num r">{m.due}</td><td className="num r">{m.doneOnTime}</td><td className="num r">{m.doneLate}</td><td className="num r">{m.open}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="pd-table-wrap">
            <table className="grid pd-table" aria-label="Breakdowns">
              <thead><tr><th>Equipment</th><th>From</th><th>To</th><th className="r">Hours</th><th>Status</th><th>Remark</th></tr></thead>
              <tbody>
                {n === 0
                  ? <tr><td colSpan={6} className="v-na">No breakdown in the period</td></tr>
                  : r.breakdowns.map((b) => (
                    <tr key={b.vrno}>
                      <td><b>{b.equipment}</b></td><td>{dm(b.from)} {b.from.slice(11)}</td><td>{dm(b.to)} {b.to.slice(11)}</td>
                      <td className="num r">{fixed(b.hours, 2)}</td><td>{b.closed ? 'Closed' : 'Open'}</td><td>{b.remark ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <SourceBox
            sources={[{ name: 'ERP', rows: [
              ['Equipment', `EQPT_ID_MAST · division ${DIVISION[r.mill]} · ${r.equipment} equipment`],
              ['PM schedule', 'EQPT_PM_TRAN · TNATURE = PMREM · due FROM_DATE · done ACTION_VRNO / ACTION_VRDATE'],
              ['Breakdowns', 'EQPT_PM_LOG · TNATURE = BKDN · FROM_DATE → TO_DATE · CLOSED_STATUS'],
              ['Work orders', 'EQPT_PM_TRAN · TNATURE = WOPM'],
            ] }]}
            formula={[
              'PM on time = 100 × PM done by its due date ÷ PM due in the period (up to yesterday — PM due today can still be done today)',
              'A PM closed by a test action does not count as done; breakdowns remarked "test" are left out',
              'MTBF = running hours (the Run hours card) ÷ breakdowns; MTTR = breakdown hours ÷ breakdowns',
              'Next PM = the first date from today with PM not done · Open work orders = not closed or cancelled · Open action = breakdowns not closed',
              'Whole mill: the ERP marks no section or stand on its equipment',
            ]}
          />
        </>
      )}
    </DrillDrawer>
  );
}
