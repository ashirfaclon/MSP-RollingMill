'use client';

/**
 * Condition Analytics costing on every mill's CA screen (/api/ca/:mill): the month's CA inputs, saved
 * on the dashboard, with the mill's production, running hours, power and yield — Output opportunity,
 * Conversion cost, Cost variance, Yield material loss, Output margin, the Matched-run rows and the
 * Costing & impact rows. A month of the period without inputs: "No CA inputs for <month>".
 * One drill-down for all of them: the period month by month, with the formulas.
 */
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import { fixed } from '@/lib/num';
import { rangeUrl, useApi, type CaReport, type FormRunningRateReport } from '@/services/hsmApi';
import { addDays, dm, useSelection } from '@/services/hsmProduction';
import { useLastEntry } from '@/services/lastEntry';
import { useErpLastDate } from '@/components/production/SpecificEnergyCard';

export type CaMillId = 'hsm' | 'rmd' | 'lsm' | 'rms';
export interface CaView {
  report: CaReport | null; loading: boolean; error: string | null;
  /** The period has no production yet: the CA figures of the last day the ERP has (the user, 30 Oct 2026). */
  last: { report: CaReport; date: string } | null;
  /** LSM / RMS: that day has no running hours either: the CA figures of the last day with a rate. */
  lastRate: { report: CaReport; date: string } | null;
}

/**
 * LSM / RMS running hours come from the logbook production sheet, which can stop before the ERP:
 * the last day in the 31 days before `from` that has both production and hours, when `need`.
 */
export function useLastRateDate(mill: CaMillId, need: boolean, from: string | null | undefined): string | null {
  const form = mill === 'lsm' || mill === 'rms';
  const url = form && need && from ? `/api/${mill}/running-rate?from=${addDays(from, -31)}&to=${addDays(from, -1)}&grain=day` : null;
  const s = useApi<FormRunningRateReport>(url);
  const rows = url && s.dataUrl === url ? s.data?.rows ?? [] : [];
  return [...rows].reverse().find((r) => r.rateTph != null)?.key ?? null;
}

export function useCa(mill: CaMillId): CaView {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/ca/${mill}`, dates);
  const s = useApi<CaReport>(url);
  const report = s.data && s.dataUrl === url ? s.data : null;
  const erpLast = useErpLastDate(mill);
  const l = useLastEntry<CaReport>(`/api/ca/${mill}`, !!report && report.actual.mt === null, erpLast, dates?.from);
  const last = l.data && l.date && l.data.missing.length === 0 ? { report: l.data, date: l.date } : null;
  const needRate = !!report && report.actual.rateTph === null && (report.actual.mt !== null || (!!last && last.report.actual.rateTph === null));
  const rateDate = useLastRateDate(mill, needRate, dates?.from);
  const lr = useLastEntry<CaReport>(`/api/ca/${mill}`, needRate, rateDate, dates?.from);
  const lastRate = lr.data && lr.date && lr.data.missing.length === 0 ? { report: lr.data, date: lr.date } : null;
  return { report, loading: !s.data && !s.error, error: s.error, last, lastRate };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const inr = (v: number, dp = 0) =>
  `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const signed = (v: number, dp = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fixed(Math.abs(v), dp)}`;

/** Why a card is empty: a month without inputs, else nothing recorded at the source. */
function emptyNote(ca: CaView, v: number | null): boolean | string {
  const r = ca.report;
  if (!r || v !== null) return false;
  if (r.missing.length) return `No CA inputs for ${r.missing.map(monthLabel).join(', ')}`;
  return true;
}

export type CaCardId = 'opportunity' | 'conversion' | 'variance' | 'yieldLoss' | 'margin';

/** One of the five CA cards. */
export function CaCard({ id, ca, onOpen, unitYield = '₹' }: {
  id: CaCardId; ca: CaView; onOpen: () => void; unitYield?: '₹' | '₹ lakh';
}) {
  const pick: Record<CaCardId, (k: CaReport['kpis'] | null) => number | null> = {
    opportunity: (k) => k?.opportunityMt ?? null,
    conversion: (k) => k?.conversionPerMt ?? null,
    variance: (k) => k?.variancePerMt ?? null,
    yieldLoss: (k) => k?.yieldLossRs ?? null,
    margin: (k) => k?.marginRs ?? null,
  };
  const spec: Record<CaCardId, { label: string; unit: string; series: Series; show: (v: number) => string }> = {
    opportunity: { label: 'Output opportunity', unit: 'MT', series: 'order', show: (v) => fixed(v, 1) },
    conversion: { label: 'Conversion cost', unit: '₹/MT', series: 'prod', show: (v) => fixed(v, 0) },
    variance: { label: 'Cost variance', unit: '₹/MT', series: 'hold', show: (v) => signed(v, 0) },
    yieldLoss: { label: 'Yield material loss', unit: unitYield, series: 'hold', show: (v) => (unitYield === '₹ lakh' ? fixed(v / 1e5, 2) : fixed(v, 0)) },
    margin: { label: 'Output margin', unit: '₹', series: 'order', show: (v) => fixed(v, 0) },
  };
  const c = spec[id];
  const cv = pick[id](ca.report?.kpis ?? null);
  // The last day with the figure: the ERP's last day, else (rate-based figures) the last day with a rate.
  const lastSrc = cv === null ? [ca.last, ca.lastRate].find((x) => x && pick[id](x.report.kpis) !== null) ?? null : null;
  const lv = lastSrc ? pick[id](lastSrc.report.kpis) : null;
  const v = cv;
  return (
    <KpiCard label={c.label} value={v === null ? 'NA' : c.show(v)} unit={c.unit} note="" series={c.series}
      loading={ca.loading} noEntries={emptyNote(ca, cv)}
      lastEntry={lv !== null && lastSrc ? { value: c.show(lv), date: lastSrc.date } : null}
      onOpen={onOpen} openLabel="CA costing, month by month" />
  );
}

const Row = ({ k, v, last }: { k: string; v: string | null; last?: string | null }) => (
  <div className="ah-row"><span className="rm-k">{k}</span>
    <span className={`num ${v === null ? 'v-na' : 'v-val'}`}>{v ?? 'NA'}{v !== null && last && <span className="rm-card-last ca-last"> · Last entry · {dm(last)}</span>}</span>
  </div>
);

/** The period's report, or the last day's when the period has no production yet; `date` set for the latter. */
function actualSource(ca: CaView): { r: CaReport | null; date: string | null } {
  const r = ca.report;
  if (r && r.actual.mt === null && ca.last) return { r: ca.last.report, date: ca.last.date };
  return { r, date: null };
}

/** Matched-run performance: actual vs the month's benchmark (one plant-entered benchmark, not size-matched). */
export function CaMatchedRows({ ca }: { ca: CaView }) {
  const { r, date } = actualSource(ca);
  const i = r?.inputs ?? null;
  const a = r?.actual ?? null;
  // No rate that day: the last day with one.
  const lr = a?.rateTph == null && ca.lastRate ? ca.lastRate : null;
  const ra = lr ? lr.report.actual : a;
  const ri = lr ? lr.report.inputs : i;
  return (
    <>
      <Row k="Production rate · actual vs matched" last={lr ? lr.date : date} v={ri && ra?.rateTph != null ? `${fixed(ra.rateTph, 2)} vs ${fixed(ri.benchmarkRateTph, 2)} TPH` : null} />
      <Row k="Energy per MT · actual vs matched" last={date} v={i && a?.kwhPerMt != null ? `${fixed(a.kwhPerMt, 1)} vs ${fixed(i.benchmarkKwhPerMt, 1)} kWh/MT` : null} />
    </>
  );
}

/** Costing & impact rows from the inputs. */
export function CaCostRows({ ca }: { ca: CaView }) {
  const { r, date } = actualSource(ca);
  const i = r?.inputs ?? null;
  const k = r?.kpis ?? null;
  const y = r?.actual.yieldPct ?? null;
  return (
    <>
      <Row k="Tariff" v={i ? `${inr(i.tariffActual, 2)}/kWh · standard ${inr(i.tariffStandard, 2)}` : null} />
      <Row k="Contribution" v={i ? `${inr(i.contributionPerMt)}/MT` : null} />
      <Row k="Net material" v={i ? `${inr(i.netMaterialPerMt)}/MT` : null} />
      <Row k="Other conversion · actual / standard" last={date}
        v={i && k?.otherActualPerMt != null ? `${inr(k.otherActualPerMt)}/MT · ${inr(i.otherConversionStandard)}/MT` : null} />
      <Row k="Yield material variance" last={date} v={i && y !== null ? `${fixed(y, 2)} % vs ${fixed(i.standardYieldPct, 2)} % standard` : null} />
    </>
  );
}

const n = (v: number | null, dp = 0) => (v === null ? '—' : fixed(v, dp));

export function CaDrawer({ open, onClose, mill, ca, sources }: {
  open: boolean; onClose: () => void; mill: CaMillId; ca: CaView;
  /** The mill's own sources for production, hours, power and yield. */
  sources: [string, string][];
}) {
  const r = ca.report;
  const k = r?.kpis ?? null;
  return (
    <DrillDrawer open={open} onClose={onClose} title="CA costing" sub={`${mill.toUpperCase()} · month by month`} loading={ca.loading} error={ca.error} hasData={!!r}>
      {r && k && (
        <>
          <Stats items={[
            { label: 'Conversion cost', value: k.conversionPerMt === null ? 'NA' : fixed(k.conversionPerMt, 0), unit: '₹/MT', tone: k.conversionPerMt === null ? 'v-na' : undefined },
            { label: 'Standard', value: k.standardPerMt === null ? 'NA' : fixed(k.standardPerMt, 0), unit: '₹/MT', tone: k.standardPerMt === null ? 'v-na' : undefined },
            { label: 'Output opportunity', value: k.opportunityMt === null ? 'NA' : fixed(k.opportunityMt, 1), unit: 'MT', tone: k.opportunityMt === null ? 'v-na' : undefined },
          ]} />
          {k.variance && (
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Cost variance, three ways">
                <thead><tr><th>Cost variance</th><th className="r">₹</th><th className="r">₹/MT</th></tr></thead>
                <tbody>
                  {([['Tariff', k.variance.tariffRs], ['Energy use', k.variance.energyRs], ['Other conversion', k.variance.otherRs], ['Total', k.variance.totalRs]] as const).map(([label, rs]) => (
                    <tr key={label}><td>{label === 'Total' ? <b>{label}</b> : label}</td><td className="num r">{inr(rs)}</td>
                      <td className="num r v-val">{r.actual.mt ? signed(rs / r.actual.mt, 0) : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pd-table-wrap">
            <table className="grid pd-table" aria-label="CA costing per month">
              <thead><tr>
                <th>Month</th><th>Inputs</th><th className="r">MT</th><th className="r">Run h</th><th className="r">TPH</th><th className="r">kWh/MT</th><th className="r">Yield %</th>
                <th className="r">Conv. ₹/MT</th><th className="r">Opportunity MT</th><th className="r">Yield loss ₹</th><th className="r">Margin ₹</th>
              </tr></thead>
              <tbody>
                {r.months.map((m) => (
                  <tr key={m.month}>
                    <td><b>{monthLabel(m.month)}</b>{m.share < 1 ? ` · ${fixed(m.share * 100, 0)} %` : ''}</td>
                    <td className={m.inputs ? '' : 'v-na'}>{m.inputs ? 'Saved' : 'None'}</td>
                    <td className="num r">{n(m.actual.mt, 1)}</td><td className="num r">{n(m.actual.runH, 1)}</td><td className="num r">{n(m.actual.rateTph, 2)}</td>
                    <td className="num r">{n(m.actual.kwhPerMt, 1)}</td><td className="num r">{n(m.actual.yieldPct, 2)}</td>
                    <td className="num r v-val">{n(m.kpis.conversionPerMt)}</td><td className="num r">{n(m.kpis.opportunityMt, 1)}</td>
                    <td className="num r">{n(m.kpis.yieldLossRs)}</td><td className="num r">{n(m.kpis.marginRs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceBox
            sources={[
              { name: 'Logbook', rows: [['Form', `CA Inputs → ${mill.toUpperCase()} CA Inputs (saved on the dashboard, latest of each month)`]] },
              { name: 'Mill', rows: sources },
            ]}
            formula={[
              'Output opportunity = max(0, benchmark rate − actual rate) × running hours — a potential: billets and orders for the extra tonnes are not checked',
              'Conversion cost = kWh/MT × actual tariff + other conversion (the month\'s ₹ × its share of days in the period) ÷ production',
              'Standard = benchmark kWh/MT × standard tariff + standard other conversion; Cost variance = conversion cost − standard',
              'Variance, three ways: kWh/MT × (actual − standard tariff); (kWh/MT − benchmark) × standard tariff; other conversion actual − standard',
              'Yield material loss = max(0, standard yield − actual yield) × billet input × net material value',
              'Output margin = output opportunity × incremental contribution',
              'More than one month: each month with its own inputs, then ₹ and MT added up',
            ]}
          />
        </>
      )}
    </DrillDrawer>
  );
}
