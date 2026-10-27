'use client';

/**
 * HSM Condition Analytics · Conversion cost drill-down: the plant's monthly costing sheet(s) for the
 * period, line for line — losses, power and other costs, each in ₹ and ₹ per MT of production.
 */
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import type { CostingMonth, CostingReport, CostLine } from '@/services/hsmApi';

const rs = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`));

export default function HsmCostingDrawer({ open, onClose, report, loading, error }: {
  open: boolean; onClose: () => void; report: CostingReport | null; loading: boolean; error: string | null;
}) {
  return (
    <DrillDrawer open={open} onClose={onClose} title="Conversion cost" sub="HSM · ₹/MT" loading={loading} error={error} hasData={!!report}>
      {report && <Content r={report} />}
    </DrillDrawer>
  );
}

function Content({ r }: { r: CostingReport }) {
  const p = r.period;
  const missing = r.months.filter((m) => !r.sheets.some((s) => s.month === m));
  return (
    <>
      <Stats items={[
        { label: 'Conversion cost', value: p ? fixed(p.conversionPerMt, 0) : 'NA', unit: '₹/MT', tone: p ? undefined : 'v-na' },
        { label: 'Production', value: p ? fixed(p.productionMt, 1) : 'NA', unit: 'MT', tone: p ? undefined : 'v-na' },
        { label: 'Tariff', value: p ? fixed(p.tariffPerKwh, 2) : 'NA', unit: '₹/kWh', tone: p ? undefined : 'v-na' },
      ]} />
      {missing.length > 0 && <p className="v-na">No costing sheet for {missing.map(monthName).join(', ')}.</p>}
      {r.sheets.map((s) => <Month key={s.month} s={s} />)}
      <SourceBox
        sources={[{ name: 'Plant costing sheet', rows: r.sheets.length ? r.sheets.map((s) => [monthName(s.month), s.source] as [string, string]) : [['Sheet', 'none for this period']] }]}
        formula={[
          'Conversion cost per MT = the sheet\'s "Total Conversion Cost/MT": losses + power + other costs, each ÷ the month\'s production',
          'Several months: weighted by each month\'s production',
          'A period touching a month without a sheet shows NA',
        ]}
      />
    </>
  );
}

function Month({ s }: { s: CostingMonth }) {
  return (
    <section aria-label={`Costing ${monthName(s.month)}`}>
      <h3 className="rm-k">{monthName(s.month)} · {fixed(s.productionMt, 1)} MT</h3>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`Cost lines ${monthName(s.month)}`}>
          <thead><tr><th>Cost</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Cost (₹)</th><th className="r">₹/MT</th></tr></thead>
          <tbody>
            <Group title="Losses (MT · ₹/MT)" lines={s.losses} />
            <Group title="Power (kWh · ₹/kWh)" lines={s.power} />
            <Group title="Other costs" lines={s.others} />
          </tbody>
          <tfoot><tr><td colSpan={4}>Total conversion cost per MT</td><td className="num r">{fixed(s.conversionPerMt, 0)}</td></tr></tfoot>
        </table>
      </div>
    </section>
  );
}

function Group({ title, lines }: { title: string; lines: CostLine[] }) {
  return (
    <>
      <tr><td colSpan={5}><b>{title}</b></td></tr>
      {lines.map((l) => (
        <tr key={l.name}>
          <td>{l.name}</td>
          <td className="num r">{l.qty === null ? '—' : fixed(l.qty, 2)}</td>
          <td className="num r">{l.rate === null ? '—' : fixed(l.rate, 2)}</td>
          <td className="num r">{rs(l.rs)}</td>
          <td className="num r v-val">{fixed(l.perMt, 0)}</td>
        </tr>
      ))}
    </>
  );
}
