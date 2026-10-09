'use client';

/**
 * Material balance drill-down — billets in against strip out and where the difference went,
 * per day / week / month over the dashboard's period, from the ERP Production Log Sheet:
 * the totals, a chart and a table of the same split, and where it comes from.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillAxis, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LogPeriod, type LogSheetReport } from '@/services/hsmApi';

const AXES: DrillAxis[] = [{ title: 'MT', unit: 'MT' }];
const f = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));
const pctOf = (v: number | null, of: number | null) => (v === null || !of ? null : (v / of) * 100);

export default function BalanceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The dashboard's period; only the grouping is chosen here.
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/hsm/logsheet', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<LogSheetReport>(url);

  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title="Material balance · ERP log sheet"
      sub="HSM · MT"
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && <Content data={data} />}
    </DrillDrawer>
  );
}

function Content({ data }: { data: LogSheetReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => {
    const col = (id: string, name: string, token: string, pick: (r: LogPeriod) => number | null): DrillSeries =>
      ({ id, name, token, type: 'column', stack: 'out', data: rows.map(pick), dp: 1 });
    // Only the difference, opened out like the panel's loss bar: finished is ~96 % of the
    // input, so stacked with it the losses would be unreadable slivers.
    return [
      col('bloss', 'Burning loss', '--s-pred', (r) => r.burningLossMt),
      col('endcut', 'End cut', '--s-alt', (r) => r.endCutMt),
      col('missroll', 'Miss-roll', '--violet', (r) => r.missRollMt),
      col('reject', 'Reject', '--risk', (r) => r.rejectMt),
    ];
  }, [rows]);

  return (
    <>
      <Stats items={[
        { label: 'Billet input', value: f(t.inputMt), unit: 'MT' },
        { label: 'Finished', value: f(t.productionMt), unit: 'MT' },
        { label: 'Mass difference', value: f(t.massDiffMt), unit: `MT${t.inputMt ? ` · ${fmtNum(pctOf(t.massDiffMt, t.inputMt), 1)}% of input` : ''}`, tone: 'v-warn' },
      ]} />

      {t.entryDays === 0 ? (
        <p className="pd-empty">No log-sheet entry in this period — the ERP is entered up to {dm(data.erp.lastDate)}.</p>
      ) : (
        <DrillChart
          series={series}
          categories={categories}
          axes={AXES}
          ariaLabel={`Losses by period: ${rows.map((x) => `${x.label} burning loss ${f(x.burningLossMt)}, end cut ${f(x.endCutMt)}, miss-roll ${f(x.missRollMt)}, reject ${f(x.rejectMt)}`).join('; ')}`}
        />
      )}

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Material balance by period">
          <thead>
            <tr>
              <th>Period</th>
              <th className="r">Input</th><th className="r">Finished</th>
              <th className="r">Burning loss</th><th className="r">End cut</th><th className="r">Miss-roll</th><th className="r">Reject</th>
              <th className="r">Unaccounted</th>
            </tr>
          </thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>

      <SourceBox sources={SOURCES} formula={FORMULA} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function Row({ r }: { r: LogPeriod }) {
  const n = (v: number | null) => <td className="num r v-val">{f(v)}</td>;
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      {n(r.inputMt)}{n(r.productionMt)}{n(r.burningLossMt)}{n(r.endCutMt)}{n(r.missRollMt)}{n(r.rejectMt)}
      {/* What the four losses leave unexplained; ~0 when the log sheet balances. */}
      <td className={`num r ${r.balanceGapMt === null ? 'v-na' : Math.abs(r.balanceGapMt) < 0.05 ? 'v-ok' : 'v-warn'}`}>{f(r.balanceGapMt)}</td>
    </tr>
  );
}

const SOURCES: SourceSystem[] = [
  {
    name: 'ERP',
    rows: [
      ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
      ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'S1', TNATURE = 'PRLOG', SERIES = 'L6P'"],
      ['Field', "ATTR_CODE = 'INPUT_MT', 'PRODUCTION_MT', 'BLOSS_MT', 'ENDCUT_MT', 'MISSROLL_MT', 'REJECT_MT', summed per VRDATE"],
    ],
  },
];

const FORMULA = [
  'Mass difference = INPUT_MT − PRODUCTION_MT',
  'Losses = BLOSS_MT + ENDCUT_MT + MISSROLL_MT + REJECT_MT',
  'Unaccounted = Mass difference − Losses',
];
