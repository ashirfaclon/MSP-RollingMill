'use client';

/**
 * An ERP log-sheet figure beside the Influx counter that measures the same thing, per
 * day / week / month, with the variance between them — chart and table of the same
 * numbers, so every figure on the card can be verified by hand. Production (MT) and
 * billets (pieces) both open this.
 */
import { useMemo, type ReactNode } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import { useDrillRange } from './useDrillRange';
import { dm, useProduction, type PeriodRow, type ProductionComparison } from '@/services/hsmProduction';
import { rangeUrl, useApi } from '@/services/hsmApi';

export const hhmm = (iso: string | null) => (iso
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(iso))
  : '—');
const varClass = (v: number | null) => (v === null ? 'v-na' : Math.abs(v) < 0.005 ? 'v-ok' : 'v-warn');

export interface CounterConfig {
  /** API path; production has its own hook for the card, the rest go through useApi. */
  path: '/api/hsm/production' | '/api/hsm/billets';
  title: string;
  sub: string;
  unit: string;
  dp: number;
  erpName: string;
  influxName: string;
  tableLabel: string;
  notes: (d: ProductionComparison) => ReactNode;
}

export default function CounterDrawer({ open, onClose, config }: { open: boolean; onClose: () => void; config: CounterConfig }) {
  const r = useDrillRange(['counter', 'selection'], 'counter');
  const params = open && r.dates ? { ...r.dates, grain: r.grain } : null;
  // Production shares the card's hook (and its cache); billets go through the generic one.
  const prod = useProduction(config.path === '/api/hsm/production' ? params : null);
  const other = useApi<ProductionComparison>(config.path === '/api/hsm/production' ? null : rangeUrl(config.path, params));
  const { data, loading, error } = config.path === '/api/hsm/production' ? prod : other;
  const stale = !!data && !!r.dates && (data.from !== r.dates.from || data.to !== r.dates.to || data.grain !== r.grain);

  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={config.title}
      sub={config.sub}
      controls={r.controls}
      loading={loading}
      stale={stale}
      error={error}
      hasData={!!data}
    >
      {data && <Content data={data} config={config} />}
    </DrillDrawer>
  );
}

function Content({ data, config }: { data: ProductionComparison; config: CounterConfig }) {
  const t = data.totals;
  const u = config.unit;
  const f = (v: number | null) => fmtNum(v, config.dp);
  const rows = data.rows;
  const hasNet = data.totals.byProductDays !== undefined;
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'erp', name: config.erpName, token: '--s-prod', type: 'line', data: rows.map((x) => x.erpMt), dp: config.dp },
    { id: 'influx', name: config.influxName, token: '--s-order', type: 'line', data: rows.map((x) => x.influxMt), dp: config.dp },
    // Production only: the counter less the four by-products booked in ERP stores.
    ...(hasNet ? [{ id: 'net', name: 'Influx net (− 4 by-products)', token: '--s-alt', type: 'line' as const, data: rows.map((x) => x.netMt ?? null), dp: config.dp }] : []),
    { id: 'variance', name: 'Variance (Influx − ERP)', token: '--warn', type: 'line', dashed: true, data: rows.map((x) => x.varianceMt), dp: config.dp },
  ], [rows, config, hasNet]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const axes = useMemo(() => [{ title: u, unit: u }], [u]);
  const tooltip = useMemo(() => (i: number) => {
    const x = rows[i];
    if (!x) return '';
    const cmp = x.comparedDays === x.days ? `${x.days} day${x.days > 1 ? 's' : ''} compared`
      : `variance over ${x.comparedDays} of ${x.days} day${x.days > 1 ? 's' : ''}`;
    return `<b>${x.label}</b><br/>`
      + `ERP: <b>${f(x.erpMt)} ${u}</b>${x.erpDays < x.days ? ` <span style="opacity:.7">(${x.erpDays}/${x.days} days entered)</span>` : ''}<br/>`
      + `Influx: <b>${f(x.influxMt)} ${u}</b>${x.influxFullDays < x.days ? ` <span style="opacity:.7">(${x.influxFullDays}/${x.days} full days)</span>` : ''}<br/>`
      + `Variance: <b>${f(x.varianceMt)} ${u}</b>${x.variancePct !== null ? ` (${fmtNum(x.variancePct, 1)}%)` : ''}<br/>`
      + `<span style="opacity:.7">${cmp}</span>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, u]);

  return (
    <>
      <Stats items={[
        { label: config.erpName, value: f(t.erpMt), unit: u },
        { label: 'Influx counter', value: f(t.influxMt), unit: u },
        { label: 'Variance', value: f(t.varianceMt), unit: `${u}${t.variancePct !== null ? ` · ${fmtNum(t.variancePct, 1)}%` : ''}`, tone: varClass(t.varianceMt) },
        { label: 'Days compared', value: String(t.comparedDays), unit: `of ${t.days}` },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        tooltip={tooltip}
        ariaLabel={`${config.tableLabel}: ${rows.map((x) => `${x.label} ERP ${f(x.erpMt)}, Influx ${f(x.influxMt)}, variance ${f(x.varianceMt)}`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={config.tableLabel}>
          <thead>
            <tr>
              <th>Period</th>
              <th className="r">ERP ({u})</th>
              <th className="r">Influx ({u})</th>
              {hasNet && <th className="r" title="Influx less mill scale, strip end cut, miss-roll strip and strip finish end cut (ERP stores)">Net ({u})</th>}
              <th className="r">Variance ({u})</th>
              <th className="r">Variance %</th>
              <th className="r">Compared</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => <Row key={x.key} r={x} f={f} net={hasNet} />)}
          </tbody>
          <tfoot><Row r={t} f={f} net={hasNet} /></tfoot>
        </table>
      </div>

      <ResetEvents data={data} config={config} />

      <ul className="pd-notes">
        {config.notes(data)}
        {(data.erp.connection === 'down' || data.influx.connection === 'down') && (
          <li className="v-warn">{data.erp.connection === 'down' ? data.erp.message : data.influx.message}</li>
        )}
      </ul>
    </>
  );
}

const EV_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const START_LABEL: Record<ProductionComparison['events'][number]['startedBy'], string> = {
  'day start': '06:00 start', reset: 'after reset', 'first reading': 'first reading',
};
const END_LABEL: Record<ProductionComparison['events'][number]['endedBy'], string> = {
  reset: 'reset', 'day end': '06:00 end', 'latest reading': 'latest reading',
};

/**
 * The counter as reset events: each reset closes an event (counter before the reset −
 * counter at the event's start); a plant day's figure is the total of its events. Each
 * day ends in a subtotal row, the same number as that day in the table above.
 */
function ResetEvents({ data, config }: { data: ProductionComparison; config: CounterConfig }) {
  const u = config.unit;
  const f = (v: number) => fmtNum(v, config.dp);
  const byDay = new Map<string, ProductionComparison['events']>();
  for (const e of data.events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  if (!byDay.size) return null;
  const dayTotal = new Map(data.days.map((d) => [d.date, d.influxMt]));
  return (
    <>
      <h3 className="pd-h">Counter reset events · how each day&apos;s Influx figure is made</h3>
      {data.noise.applied && data.noise.ticks > 0 && (
        <p className="pd-dim">Noise removed in this period: {data.noise.ticks} counter tick{data.noise.ticks > 1 ? 's' : ''} ({f(data.noise.value)} {u}) with no billet discharged in the {data.noise.windowMinutes} minutes before.</p>
      )}
      <div className="pd-table-wrap pd-table-wrap--tall">
        <table className="grid pd-table" aria-label="Counter reset events">
          <thead>
            <tr>
              <th>From (IST)</th><th>To (IST)</th>
              <th className="r" title="Counter when the event started">Start ({u})</th>
              <th className="r" title="Counter just before the reset, or at 06:00 / the latest reading">End ({u})</th>
              {data.noise.applied && <th className="r" title="Counter ticks with no billet discharged in the minutes before">Noise ({u})</th>}
              <th className="r" title="End − start − noise">Counted ({u})</th>
            </tr>
          </thead>
          <tbody>
            {[...byDay].map(([date, evs]) => (
              <EventDay key={date} date={date} evs={evs} total={dayTotal.get(date) ?? null} f={f} u={u} noise={data.noise.applied} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EventDay({ date, evs, total, f, u, noise }: {
  date: string; evs: ProductionComparison['events']; total: number | null; f: (v: number) => string; u: string; noise: boolean;
}) {
  return (
    <>
      {evs.map((e) => (
        <tr key={e.start}>
          <td className="num" title={START_LABEL[e.startedBy]}>{EV_TIME.format(new Date(e.start))}{e.startedBy !== 'reset' && <span className="pd-dim"> · {START_LABEL[e.startedBy]}</span>}</td>
          <td className="num" title={END_LABEL[e.endedBy]}>{EV_TIME.format(new Date(e.end))}{e.endedBy !== 'reset' && <span className="pd-dim"> · {END_LABEL[e.endedBy]}</span>}</td>
          <td className="num r">{f(e.startValue)}</td>
          <td className="num r">{f(e.endValue)}</td>
          {noise && <td className={`num r ${e.noise ? 'v-warn' : 'pd-dim'}`}>{e.noise ? `− ${f(e.noise)}` : '—'}</td>}
          <td className="num r v-val">{f(e.value)}</td>
        </tr>
      ))}
      <tr className="pd-subtotal">
        <td colSpan={noise ? 5 : 4}><b>{dm(date)}</b> <span className="pd-dim">· plant day total, {evs.length} event{evs.length > 1 ? 's' : ''}</span></td>
        <td className="num r"><b>{total === null ? '—' : `${f(total)} ${u}`}</b></td>
      </tr>
    </>
  );
}

function Row({ r, f, net }: { r: PeriodRow; f: (v: number | null) => string; net: boolean }) {
  const partial = r.days > 1 || r.key === 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{partial && r.key !== 'total' ? <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span> : null}</td>
      <td className="num r v-val">
        {f(r.erpMt)}
        {r.erpDays < r.days && <span className="pd-dim" title="Days with an ERP entry"> · {r.erpDays}/{r.days}d</span>}
      </td>
      <td className="num r v-val">
        {f(r.influxMt)}
        {r.influxMt !== null && r.influxFullDays < r.days && <span className="pd-dim" title="Days the counter covered fully"> · {r.influxFullDays}/{r.days}d</span>}
      </td>
      {net && (
        <td className="num r v-val">
          {r.netMt === null || r.netMt === undefined ? <span className="pd-dim" title="By-products not booked in the ERP yet">awaited</span> : f(r.netMt)}
        </td>
      )}
      <td className={`num r ${varClass(r.varianceMt)}`}>{f(r.varianceMt)}</td>
      <td className={`num r ${varClass(r.varianceMt)}`}>{r.variancePct === null ? '—' : `${fmtNum(r.variancePct, 1)}%`}</td>
      <td className="num r">{r.comparedDays}/{r.days}</td>
    </tr>
  );
}

/* ------------------------------ the two uses ----------------------------- */

export const PRODUCTION_COUNTER: CounterConfig = {
  path: '/api/hsm/production',
  title: 'Production · ERP vs Influx',
  sub: 'HSM · Hot Strip Mill · MT per period',
  unit: 'MT',
  dp: 2,
  erpName: 'ERP production',
  influxName: 'Influx · Total_Production_Ton',
  tableLabel: 'Production by period',
  notes: (d) => (
    <>
      <li><b>ERP</b> — Production Log Sheet (strip mill, division S1), synced {hhmm(d.erp.syncedAt)}; entered up to <b>{dm(d.erp.lastDate)}</b>. The ERP is filled in 1–2 days after the production date.</li>
      <li><b>Influx</b> — Finishing Mill · General · Total_Production_Ton, as reset events: each reset closes an event = counter before the reset − counter at the event&apos;s start, and a plant day ({d.dayBoundary} to {d.dayBoundary}) is the total of its events — listed below. The mill computes it as coils counted × the set billet weight — no losses taken off, not weighed strip. <b>Noise</b>: right after an operator reset the counter sometimes ticks with no billet going in; a tick counts only if a billet was discharged in the 5 minutes before it, and each billet stands behind one tick. Readings since {hhmm(d.influx.firstReadingAt)}.</li>
      <li><b>Variance</b> = Influx − ERP: coils at the set billet weight minus weighed finished strip, so a small positive gap is mostly mill loss (scale, end cuts, miss-rolls). Counted only on days where the ERP has an entry and the counter covered the whole day.</li>
    </>
  ),
};

export const BILLET_COUNTER: CounterConfig = {
  path: '/api/hsm/billets',
  title: 'Billets · ERP vs Influx',
  sub: 'HSM · Hot Strip Mill · billets charged per period',
  unit: 'pcs',
  dp: 0,
  erpName: 'ERP billets (input pcs)',
  influxName: 'Influx · Dicharged_Billet',
  tableLabel: 'Billets by period',
  notes: (d) => (
    <>
      <li><b>ERP</b> — Production Log Sheet INPUT_PCS (strip mill, division S1), synced {hhmm(d.erp.syncedAt)}; entered up to <b>{dm(d.erp.lastDate)}</b>.</li>
      <li><b>Influx</b> — Finishing Mill · General · Dicharged_Billet (the historian&apos;s spelling), a count reset with the production counter, read the same way: per reset event, totalled per plant day ({d.dayBoundary} to {d.dayBoundary}). Readings since {hhmm(d.influx.firstReadingAt)}.</li>
      <li><b>Variance</b> = Influx − ERP pieces, on days where the ERP has an entry and the counter covered the whole day. Both count the same billets, so the gap should stay within a few pieces; a larger day-to-day swing that cancels out over a week is an entry booked on the neighbouring date.</li>
    </>
  ),
};
