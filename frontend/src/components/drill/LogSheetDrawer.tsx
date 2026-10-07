'use client';

/**
 * ERP Production Log Sheet drill-down — the source of the yield, the mass balance and the
 * quality split. One response, three views of it; each view pairs its chart with a table
 * of the same sums and the check that proves them:
 *
 *   Yield         production ÷ input per period.
 *   Mass balance  input = production + burning loss + end cut + miss-roll + reject.
 *   Quality       production = prime + defective + rolling defect, and = strip received
 *                 into stores (PROD_TRAN) the same day.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Seg, Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillAxis, type DrillSeries } from './DrillChart';
import { useDrillRange } from './useDrillRange';
import { hhmm } from './CounterDrawer';
import { dm } from '@/services/hsmProduction';
import { plantDayStartMs } from '@/lib/plantDay';
import { rangeUrl, useApi, type LogPeriod, type LogSheetReport, type YieldComparison, type YieldPeriod } from '@/services/hsmApi';

export type LogView = 'yield' | 'balance' | 'quality';

const VIEWS: { id: LogView; label: string }[] = [
  { id: 'yield', label: 'Yield' },
  { id: 'balance', label: 'Mass balance' },
  { id: 'quality', label: 'Quality & stores' },
];

const TITLES: Record<LogView, string> = {
  yield: 'Mass yield · Influx',
  balance: 'Mass balance · ERP log sheet',
  quality: 'Quality split · ERP log sheet',
};

const f = (v: number | null, dp = 2) => fmtNum(v, dp);
const pct = (part: number | null, whole: number | null) => (part === null || !whole ? null : (part / whole) * 100);

export default function LogSheetDrawer(props: { open: boolean; onClose: () => void; view: LogView; onView: (v: LogView) => void }) {
  const r = useDrillRange(['last30', 'selection', 'since'], 'last30');
  const url = props.open && r.dates ? rangeUrl('/api/hsm/logsheet', { ...r.dates, grain: r.grain }) : null;
  const log = useApi<LogSheetReport>(props.view === 'yield' ? null : url);
  // The yield view compares ERP with Influx — its own endpoint.
  const yUrl = props.open && r.dates ? rangeUrl('/api/hsm/yield', { ...r.dates, grain: r.grain }) : null;
  const yld = useApi<YieldComparison>(props.view === 'yield' ? yUrl : null);
  const cur = props.view === 'yield' ? { ...yld, want: yUrl } : { ...log, want: url };

  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title={TITLES[props.view]}
      sub="HSM · Hot Strip Mill · ERP division S1 · Production Log Sheet"
      controls={<>
        <Seg label="View" value={props.view} options={VIEWS} onChange={props.onView} />
        {r.controls}
      </>}
      loading={cur.loading}
      stale={!!cur.data && cur.dataUrl !== cur.want}
      error={cur.error}
      hasData={!!cur.data}
    >
      {props.view === 'yield'
        ? yld.data && <YieldContent data={yld.data} />
        : log.data && <Content data={log.data} view={props.view} />}
    </DrillDrawer>
  );
}

function Content({ data, view }: { data: LogSheetReport; view: LogView }) {
  const rows = data.rows;
  const t = data.totals;
  const { series, axes } = useMemo(() => chartOf(view, rows), [view, rows]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const aria = `${TITLES[view]} per period: ${rows.map((x) => `${x.label} input ${f(x.inputMt)}, production ${f(x.productionMt)}`).join('; ')}`;

  return (
    <>
      <Stats items={statsOf(view, t)} />
      {t.entryDays === 0 ? (
        <p className="pd-empty">No log-sheet entry in this period — the ERP is entered up to {dm(data.erp.lastDate)}.</p>
      ) : (
        <DrillChart series={series} categories={categories} axes={axes} ariaLabel={aria} />
      )}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${TITLES[view]} by period`}>
          <thead><Head view={view} /></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} view={view} />)}</tbody>
          <tfoot><Row r={t} view={view} /></tfoot>
        </table>
      </div>
      <ul className="pd-notes">
        <li><b>Source</b> — ERP Production Log Sheet (ATTR_TRAN_DATA PRLOG · series L6P · division S1 Strip Mill), synced {hhmm(data.erp.syncedAt)}; entered up to <b>{dm(data.erp.lastDate)}</b>. A day can hold more than one voucher; the day&apos;s figure is their sum. Days not entered yet are blank, not zero.</li>
        {view === 'yield' && <li><b>Mass yield</b> = Σ production ÷ Σ billet input over the period — a ratio of sums, not an average of daily percentages. The ERP&apos;s own YIELD_PERCENTAGE field is not used: its formula does not reproduce from the other fields.</li>}
        {view === 'balance' && <li><b>Check</b> — each voucher must satisfy input = production + burning loss + end cut + miss-roll + reject. ✓ means every entered day in the period balances within {'0.05'} MT; otherwise the gap (MT) is shown.</li>}
        {view === 'quality' && <>
          <li><b>Split check</b> — production = prime + defective + rolling defect on the log sheet.</li>
          <li><b>Stores check</b> — log-sheet production against finished strip received into stores (PROD_TRAN, finished-strip items) for the same date. They are separate ERP records; agreeing is what makes the production figure safe to use.</li>
        </>}
        {data.erp.connection === 'down' && <li className="v-warn">{data.erp.message}</li>}
      </ul>
    </>
  );
}

/* ------------------------------ yield view ------------------------------- */

const YIELD_AXES: DrillAxis[] = [{ title: 'Yield %', unit: '%' }];

function YieldContent({ data }: { data: YieldComparison }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'influx', name: 'Influx yield (net output ÷ input)', token: '--s-order', type: 'line', data: rows.map((x) => x.netYieldPct), dp: 2 },
    { id: 'erp', name: 'ERP yield (production ÷ input)', token: '--s-prod', type: 'line', dashed: true, data: rows.map((x) => x.erpYieldPct), dp: 2 },
  ], [rows]);
  const tooltip = useMemo(() => (i: number) => {
    const x = rows[i];
    if (!x) return '';
    const bp = x.byProducts ? Object.values(x.byProducts).reduce((a, v) => a + v, 0) : null;
    return `<b>${x.label}</b><br/>`
      + `Influx: <b>${fmtNum(x.netYieldPct, 2)} %</b> = ${f(x.netOutputT)} ÷ ${f(x.netInputT)} t<br/>`
      + `<span style="opacity:.75">net = counter ${f(x.influxOutputT)} − by-products ${f(bp)}</span><br/>`
      + `ERP: <b>${fmtNum(x.erpYieldPct, 2)} %</b> = ${f(x.erpOutputMt)} ÷ ${f(x.erpInputMt)} MT`;
  }, [rows]);
  const awaiting = t.influxDays - t.netDays;

  return (
    <>
      <Stats items={[
        { label: 'Influx yield', value: fmtNum(t.netYieldPct, 2), unit: `% · ${t.netDays} of ${t.days} days` },
        { label: 'Net output (Influx)', value: fmtNum(t.netOutputT, 2), unit: 'MT' },
        { label: 'Input (Influx)', value: fmtNum(t.netInputT, 2), unit: 'MT' },
        { label: 'ERP yield', value: fmtNum(t.erpYieldPct, 2), unit: `% · ${t.erpDays} of ${t.days} days` },
      ]} />
      <DrillChart
        series={series}
        categories={categories}
        axes={YIELD_AXES}
        tooltip={tooltip}
        ariaLabel={`Yield per period: ${rows.map((x) => `${x.label} Influx ${fmtNum(x.netYieldPct, 1)} %, ERP ${fmtNum(x.erpYieldPct, 1)} %`).join('; ')}`}
      />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Mass yield by period">
          <thead>
            <tr>
              <th>Period</th>
              <th className="r" title="Billets × L × B × H × density">Influx input</th>
              <th className="r" title="Total_Production_Ton, reset events less noise">Counter output</th>
              <th className="r" title="Mill scale + strip end cut + miss-roll strip + strip finish end cut (ERP stores)">− By-products</th>
              <th className="r">= Net output</th>
              <th className="r">Influx yield %</th>
              <th className="r">ERP yield %</th>
            </tr>
          </thead>
          <tbody>{rows.map((x) => <YieldRow key={x.key} r={x} />)}</tbody>
          <tfoot><YieldRow r={t} /></tfoot>
        </table>
      </div>

      <h3 className="pd-h">By-products taken off · ERP stores (PROD_TRAN, division S1)</h3>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="By-products by period">
          <thead>
            <tr>
              <th>Period</th>
              {BY_PRODUCT_COLUMNS.map((c) => <th key={c.key} className="r" title={`Item ${c.code} · PROD_TRAN.QTYRECD · = log sheet ${c.logField}`}>{c.name}</th>)}
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>{rows.map((x) => <ByProductRow key={x.key} r={x} />)}</tbody>
          <tfoot><ByProductRow r={t} /></tfoot>
        </table>
      </div>

      <SizeEvents data={data} />
      <ul className="pd-notes">
        <li><b>Influx yield</b> = net output ÷ Influx input, over the days whose by-products are booked in the ERP{awaiting > 0 ? ` (${awaiting} day${awaiting > 1 ? 's' : ''} in this period still await them; by-products booked to ${dm(data.byProductsLastDate)})` : ''}.</li>
        <li><b>Influx input</b> = for each billet-size event, billets discharged (Dicharged_Billet) × that event&apos;s billet weight = length (m) × breadth (mm ÷ 1000) × height (mm ÷ 1000) × {data.densityGcm3} g/cm³ (= t/m³). Every change of length, breadth or height starts a new event.</li>
        <li><b>Net output</b> = counter output (Total_Production_Ton, reset events less noise, per plant day 06:00 → 06:00) − the four by-products: Mill Scale and Strip Endcut (weight taken off every coil), Miss Roll Strip and Strip Finish Endcut (whole pieces lost).</li>
        <li><b>ERP yield</b> = Σ PRODUCTION_MT ÷ Σ INPUT_MT, Production Log Sheet (strip mill S1), synced {hhmm(data.erp.syncedAt)}; entered up to <b>{dm(data.erp.lastDate)}</b> — shown for comparison.</li>
        {data.influx.unweighedBillets > 0 && <li className="v-warn">{data.influx.unweighedBillets} billets had no billet-size setting in the historian and are left out of the Influx input.</li>}
        {(data.erp.connection === 'down' || data.influx.connection === 'down') && (
          <li className="v-warn">{data.erp.connection === 'down' ? data.erp.message : data.influx.message}</li>
        )}
      </ul>
    </>
  );
}

const BY_PRODUCT_COLUMNS = [
  { key: 'millScale', name: 'Mill Scale', code: 'C01010100093', logField: 'BLOSS_MT' },
  { key: 'stripEndcut', name: 'Strip Endcut', code: 'C01010100033', logField: 'ENDCUT_MT' },
  { key: 'missRoll', name: 'Miss Roll Strip', code: 'C01010100016', logField: 'MISSROLL_MT' },
  { key: 'finishEndcut', name: 'Strip Finish Endcut', code: 'C01010100032', logField: 'REJECT_MT' },
] as const;

function ByProductRow({ r }: { r: YieldPeriod }) {
  const b = r.byProducts;
  return (
    <tr>
      <td><b>{r.label}</b></td>
      {BY_PRODUCT_COLUMNS.map((c) => <td key={c.key} className="num r v-val">{b ? fmtNum(b[c.key], 2) : '—'}</td>)}
      <td className="num r v-val"><b>{b ? fmtNum(Object.values(b).reduce((a, v) => a + v, 0), 2) : '—'}</b></td>
    </tr>
  );
}

const EVENT_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

/** Each billet size in force during the period, with the billets and tonnes charged under it. */
function SizeEvents({ data }: { data: YieldComparison }) {
  const ev = data.sizeEvents;
  if (!ev.length) return null;
  const periodStart = plantDayStartMs(data.from);
  // The same billets and window as the yield table — show its total so the two never differ
  // by a rounding cent (each event row is rounded on its own).
  const billets = data.totals.billets;
  const tonnes = data.totals.influxInputT;
  return (
    <>
      <h3 className="pd-h">Billet size events · Influx input by event</h3>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Billet size events">
          <thead>
            <tr>
              <th>From (IST)</th><th>To (IST)</th>
              <th className="r">Length (m)</th><th className="r">Breadth (mm)</th><th className="r">Height (mm)</th>
              <th className="r">Billet weight (t)</th><th className="r">Billets</th><th className="r">Input (t)</th>
            </tr>
          </thead>
          <tbody>
            {ev.map((e) => (
              <tr key={e.start}>
                <td className="num">
                  {/* An event set before the period began started at some earlier time we did not read — say so. */}
                  {Date.parse(e.start) < periodStart
                    ? <span className="pd-dim" title={`Set before the period; in force at ${EVENT_TIME.format(new Date(periodStart))}`}>set earlier</span>
                    : EVENT_TIME.format(new Date(e.start))}
                </td>
                <td className="num">{e.end ? EVENT_TIME.format(new Date(e.end)) : <span className="pd-dim">still set</span>}</td>
                <td className="num r">{fmtNum(e.lengthM, 2)}</td>
                <td className="num r">{fmtNum(e.breadthMm, 0)}</td>
                <td className="num r">{fmtNum(e.heightMm, 0)}</td>
                <td className="num r v-val">{fmtNum(e.weightT, 4)}</td>
                <td className="num r v-val">{fmtNum(e.billets, 0)}</td>
                <td className="num r v-val"><b>{fmtNum(e.inputT, 2)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={6}><b>Total in the period</b> <span className="pd-dim">· billets counted from the period&apos;s first 06:00 to its last</span></td><td className="num r">{fmtNum(billets, 0)}</td><td className="num r">{fmtNum(tonnes, 2)}</td></tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function YieldRow({ r }: { r: YieldPeriod }) {
  const n = (v: number | null, dp = 2) => <td className="num r v-val">{fmtNum(v, dp)}</td>;
  const bp = r.byProducts ? Object.values(r.byProducts).reduce((a, v) => a + v, 0) : null;
  return (
    <tr>
      <td>
        <b>{r.label}</b>
        {r.days > 1 && r.key !== 'total' ? <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span> : null}
        {r.netDays < r.influxDays && <span className="pd-dim" title="Days whose by-products are booked in the ERP"> · {r.netDays}/{r.influxDays}d</span>}
      </td>
      {/* Booked days only once any are booked, so input, counter and net are one calculation. */}
      {n(r.netDays ? r.netInputT : r.influxInputT)}
      {n(r.netDays ? r.netCounterT : r.influxOutputT)}
      <td className="num r v-val">{bp === null ? <span className="pd-dim" title="By-products not booked in the ERP yet">awaited</span> : `− ${fmtNum(bp, 2)}`}</td>
      {n(r.netOutputT)}
      <td className="num r v-val"><b>{fmtNum(r.netYieldPct, 2)}</b></td>
      <td className="num r">{fmtNum(r.erpYieldPct, 2)}</td>
    </tr>
  );
}

function chartOf(view: LogView, rows: LogPeriod[]): { series: DrillSeries[]; axes: DrillAxis[] } {
  const col = (id: string, name: string, token: string, pick: (r: LogPeriod) => number | null, stack?: string): DrillSeries =>
    ({ id, name, token, type: 'column', stack, data: rows.map(pick), dp: 2 });
  const line = (id: string, name: string, token: string, pick: (r: LogPeriod) => number | null, extra: Partial<DrillSeries> = {}): DrillSeries =>
    ({ id, name, token, type: 'line', data: rows.map(pick), dp: 2, ...extra });
  const mt: DrillAxis = { title: 'MT', unit: 'MT' };
  if (view === 'yield') {
    return {
      axes: [mt, { title: 'Yield %', unit: '%', opposite: true, max: 100 }],
      series: [
        col('input', 'Billet input', '--na', (r) => r.inputMt),
        col('production', 'Production', '--s-prod', (r) => r.productionMt),
        line('yield', 'Mass yield %', '--s-order', (r) => r.yieldPct, { axis: 1 }),
      ],
    };
  }
  if (view === 'balance') {
    return {
      axes: [mt],
      series: [
        col('production', 'Production', '--s-prod', (r) => r.productionMt, 'out'),
        col('bloss', 'Burning loss', '--s-pred', (r) => r.burningLossMt, 'out'),
        col('endcut', 'End cut', '--s-alt', (r) => r.endCutMt, 'out'),
        col('missroll', 'Miss-roll', '--violet', (r) => r.missRollMt, 'out'),
        col('reject', 'Reject', '--risk', (r) => r.rejectMt, 'out'),
        line('input', 'Billet input', '--text', (r) => r.inputMt, { dashed: true }),
      ],
    };
  }
  return {
    axes: [mt],
    series: [
      col('prime', 'Prime', '--ok', (r) => r.primeMt, 'q'),
      col('defective', 'Defective', '--s-free', (r) => r.defectiveMt, 'q'),
      col('rolling', 'Rolling defect', '--risk', (r) => r.rollingDefectMt, 'q'),
      line('production', 'Log-sheet production', '--s-prod', (r) => r.productionMt),
      line('stores', 'Received into stores', '--s-alt', (r) => r.storesMt, { dashed: true }),
    ],
  };
}

function statsOf(view: LogView, t: LogPeriod) {
  const days = { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` };
  if (view === 'yield') {
    return [
      { label: 'Mass yield', value: fmtNum(t.yieldPct, 2), unit: '%' },
      { label: 'Production', value: f(t.productionMt), unit: 'MT' },
      { label: 'Billet input', value: f(t.inputMt), unit: 'MT' },
      days,
    ];
  }
  if (view === 'balance') {
    return [
      { label: 'Billet input', value: f(t.inputMt), unit: 'MT' },
      { label: 'Production', value: f(t.productionMt), unit: 'MT' },
      { label: 'Mass difference', value: f(t.massDiffMt), unit: `MT${t.inputMt ? ` · ${fmtNum(pct(t.massDiffMt, t.inputMt), 1)}%` : ''}`, tone: 'v-warn' },
      { label: 'Balances', value: `${t.balanceOkDays}`, unit: `of ${t.entryDays} days`, tone: t.balanceOkDays === t.entryDays ? 'v-ok' : 'v-warn' },
    ];
  }
  return [
    { label: 'Prime', value: f(t.primeMt), unit: `MT${t.productionMt ? ` · ${fmtNum(pct(t.primeMt, t.productionMt), 1)}%` : ''}` },
    { label: 'Defective + rolling', value: f(t.defectiveMt === null ? null : t.defectiveMt + (t.rollingDefectMt ?? 0)), unit: 'MT' },
    { label: 'Split balances', value: `${t.qualityOkDays}`, unit: `of ${t.entryDays} days`, tone: t.qualityOkDays === t.entryDays ? 'v-ok' : 'v-warn' },
    { label: 'Matches stores', value: `${t.storesOkDays}`, unit: `of ${t.entryDays} days`, tone: t.storesOkDays === t.entryDays ? 'v-ok' : 'v-warn' },
  ];
}

function Head({ view }: { view: LogView }) {
  if (view === 'yield') {
    return <tr><th>Period</th><th className="r">Input (MT)</th><th className="r">Production (MT)</th><th className="r">Difference (MT)</th><th className="r">Yield %</th><th className="r">Entered</th></tr>;
  }
  if (view === 'balance') {
    return <tr><th>Period</th><th className="r">Input</th><th className="r">Production</th><th className="r">Burning loss</th><th className="r">End cut</th><th className="r">Miss-roll</th><th className="r">Reject</th><th className="r">Check</th></tr>;
  }
  return <tr><th>Period</th><th className="r">Production</th><th className="r">Prime</th><th className="r">Defective</th><th className="r">Rolling defect</th><th className="r">Split</th><th className="r">Stores</th><th className="r">Log − stores</th></tr>;
}

/** ✓ when every entered day in the row passed, otherwise the summed gap. */
function Check({ ok, of, gap }: { ok: number; of: number; gap: number | null }) {
  if (!of) return <span className="pd-dim">—</span>;
  if (ok === of) return <span className="pd-check pd-check--ok" title={`Holds on all ${of} entered day${of > 1 ? 's' : ''}`}>✓</span>;
  return <span className="pd-check pd-check--warn" title={`Holds on ${ok} of ${of} entered days`}>{fmtNum(gap, 2)} · {ok}/{of}</span>;
}

function Row({ r, view }: { r: LogPeriod; view: LogView }) {
  const label = (
    <td>
      <b>{r.label}</b>
      {r.days > 1 && r.key !== 'total' ? <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span> : null}
      {r.entryDays < r.days && <span className="pd-dim" title="Days with a log-sheet entry"> · {r.entryDays}/{r.days}d</span>}
    </td>
  );
  const n = (v: number | null) => <td className="num r v-val">{f(v)}</td>;
  if (view === 'yield') {
    return <tr>{label}{n(r.inputMt)}{n(r.productionMt)}{n(r.massDiffMt)}<td className="num r v-val"><b>{fmtNum(r.yieldPct, 2)}</b></td><td className="num r">{r.entries} v · {r.entryDays}d</td></tr>;
  }
  if (view === 'balance') {
    return (
      <tr>
        {label}{n(r.inputMt)}{n(r.productionMt)}{n(r.burningLossMt)}{n(r.endCutMt)}{n(r.missRollMt)}{n(r.rejectMt)}
        <td className="num r"><Check ok={r.balanceOkDays} of={r.entryDays} gap={r.balanceGapMt} /></td>
      </tr>
    );
  }
  return (
    <tr>
      {label}{n(r.productionMt)}{n(r.primeMt)}{n(r.defectiveMt)}{n(r.rollingDefectMt)}
      <td className="num r"><Check ok={r.qualityOkDays} of={r.entryDays} gap={r.qualityGapMt} /></td>
      {n(r.storesMt)}
      <td className="num r"><Check ok={r.storesOkDays} of={r.entryDays} gap={r.storesGapMt} /></td>
    </tr>
  );
}

/** Drawer state for a component that opens the log sheet on a chosen view. */
export function useLogSheetDrawer() {
  const [view, setView] = useState<LogView | null>(null);
  const [last, setLast] = useState<LogView>('yield');
  return {
    open: (v: LogView) => { setLast(v); setView(v); },
    drawer: (
      <LogSheetDrawer open={view !== null} view={view ?? last} onView={(v) => { setLast(v); setView(v); }} onClose={() => setView(null)} />
    ),
  };
}
