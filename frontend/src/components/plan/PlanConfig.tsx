'use client';

/**
 * Production plan config (the user, 28 Oct 2026): the plant fills each mill's plan on the dashboard
 * instead of the Excel imports. One form for all four mills, holding only what the dashboard uses —
 * the target MT per day and per shift (Production by shift: target, compliance, plan gap):
 *   Month, the month's plan (MT, the mill's Production measure), shutdown dates (working days =
 *   calendar days − shutdowns), and the day-by-day Day / Night targets — spread evenly from the
 *   month (half per shift), or written day by day (HSM runs one shift for about 15 days at a time).
 * Left out, as the dashboard reads none of it: sizes, billet-size splits, MT/h, hours, remarks.
 * Opens on the current plan (/api/:mill/plan). Saving is not connected yet.
 */
import { useEffect, useMemo, useState } from 'react';
import DrillDrawer from '@/components/drill/DrillDrawer';
import { fixed } from '@/lib/num';
import { DAY_START_HOUR, dm, shiftsLabel } from '@/lib/plantDay';
import { rangeUrl, useApi } from '@/services/hsmApi';
import '@/components/checklist/checklist.css';
import './plan.css';

export type PlanMill = 'hsm' | 'rmd' | 'lsm' | 'rms';
/** The measure the plan is in — the one its Production card shows, so plan and actual compare. */
const MEASURE: Record<PlanMill, string> = {
  hsm: 'Production, as the Production card',
  rmd: 'Prime + Short length, as the Production · Prime + SL card',
  lsm: 'PRODUTION_MT, as the Production card',
  rms: 'PRODUCTION_MT, as the Production card',
};

interface PlanDayIn { date: string; planMt: number | null; byShift: Record<string, number | null> }
interface Row { date: string; off: boolean; day: string; night: string }

const monthDates = (m: string) => {
  const n = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
};
const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));
const r2 = (v: number) => String(Math.round(v * 100) / 100);
const thisMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

export default function PlanConfig({ mill, open, onClose }: { mill: PlanMill; open: boolean; onClose: () => void }) {
  const [month, setMonth] = useState(thisMonth);
  const dates = useMemo(() => monthDates(month), [month]);
  const url = open ? rangeUrl(`/api/${mill}/plan`, { from: dates[0], to: dates[dates.length - 1] }) : null;
  const s = useApi<{ days: PlanDayIn[] }>(url);
  const current = s.data && s.dataUrl === url ? s.data : null;
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState('');

  // Opens on the plan the dashboard uses now, month by month.
  useEffect(() => {
    if (!current) return;
    const byDate = new Map(current.days.map((d) => [d.date, d]));
    const next = dates.map((date) => {
      const d = byDate.get(date);
      return { date, off: false, day: d?.byShift.Day != null ? r2(d.byShift.Day) : '', night: d?.byShift.Night != null ? r2(d.byShift.Night) : '' };
    });
    setRows(next);
    const sum = current.days.reduce((a, d) => a + (d.planMt ?? 0), 0);
    setTotal(sum ? r2(sum) : '');
  }, [current, dates]);

  const working = rows.filter((r) => !r.off).length;
  const dayT = rows.reduce((a, r) => a + (num(r.day) ?? 0), 0);
  const nightT = rows.reduce((a, r) => a + (num(r.night) ?? 0), 0);
  const entered = num(total);
  const off = entered !== null && Math.abs(dayT + nightT - entered) >= 0.05;

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const spread = () => {
    if (entered === null || !working) return;
    const half = r2(entered / working / 2);
    setRows((rs) => rs.map((r) => (r.off ? { ...r, day: '0', night: '0' } : { ...r, day: half, night: half })));
  };

  return (
    <DrillDrawer open={open} onClose={onClose} title={`${mill.toUpperCase()} · production plan`} sub={shiftsLabel(DAY_START_HOUR[mill])}
      loading={!!url && !s.data && !s.error} error={s.error} hasData={rows.length > 0}>
      <div className="ck-form">
        <div className="ck-grid ck-grid--wide">
          <label className="ck-f"><span>Month</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
          <label className="ck-f"><span>Month plan (MT)</span>
            <input type="number" min={0} step="0.01" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} aria-describedby="pc-measure" />
          </label>
          <div className="ck-f"><span>Working days</span><input readOnly value={`${working} of ${rows.length}`} aria-label="Working days" /></div>
        </div>
        <p className="pc-hint" id="pc-measure">{MEASURE[mill]}. Tick a date as shutdown and it gets no target.</p>
        <div className="ck-actions pc-actions">
          <button type="button" className="pc-btn" onClick={spread} disabled={entered === null || !working}
            title="Month plan ÷ working days, half to each shift">Spread over working days</button>
          <span>or type each day&apos;s Day / Night target below</span>
        </div>

        <div className="pd-table-wrap pc-scroll">
          <table className="grid pd-table pc-table" aria-label="Plan per day and shift">
            <thead><tr><th>Date</th><th>Shutdown</th><th className="r">Day (MT)</th><th className="r">Night (MT)</th><th className="r">Day total</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.date} className={r.off ? 'pc-off' : undefined}>
                  <td>{dm(r.date)}</td>
                  <td><input type="checkbox" checked={r.off} aria-label={`${dm(r.date)} shutdown`}
                    onChange={(e) => setRow(i, e.target.checked ? { off: true, day: '0', night: '0' } : { off: false })} /></td>
                  {(['day', 'night'] as const).map((k) => (
                    <td key={k} className="r">
                      <input className="pc-in" type="number" min={0} step="0.01" inputMode="decimal" value={r[k]} disabled={r.off}
                        aria-label={`${dm(r.date)} ${k === 'day' ? 'Day' : 'Night'} shift target`} onChange={(e) => setRow(i, { [k]: e.target.value })} />
                    </td>
                  ))}
                  <td className="num r">{num(r.day) === null && num(r.night) === null ? '—' : fixed((num(r.day) ?? 0) + (num(r.night) ?? 0), 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}>Month</td><td className="num r">{fixed(dayT, 2)}</td><td className="num r">{fixed(nightT, 2)}</td><td className="num r">{fixed(dayT + nightT, 2)}</td></tr></tfoot>
          </table>
        </div>
        {off && <p className="pc-warn" role="status">The days add up to {fixed(dayT + nightT, 2)} MT, not the month plan {fixed(entered, 2)} MT.</p>}

        <div className="ck-actions">
          <button type="button" className="ck-save" disabled>Save plan</button>
          <span>Preview — saving is not connected yet.</span>
        </div>
      </div>
    </DrillDrawer>
  );
}
