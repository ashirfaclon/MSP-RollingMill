'use client';

/**
 * HSM · Production variance checklist — the plant's "Production variance checklist" sheet
 * (Rolling_Mill_Checklists_Data.xlsx) as a form, one per plant day (no shift; the user, 26 Oct 2026).
 * Filled by the dashboard:
 *   Production (Influx)   the Production card's counter total for the plant day;
 *   Production (ERP)      the ERP log sheet's PRODUCTION_MT for the day;
 *   Variance, Variance %  Influx − ERP, and that ÷ ERP × 100 (the sheet's "Variance / 100" is a slip).
 * The reasons (miss roll, finish end cut, mill scale, end cut) are typed by the user.
 * Preview only: saving is not connected yet (storage to be confirmed by the user).
 */
import { useEffect, useState } from 'react';
import DrillDrawer from '@/components/drill/DrillDrawer';
import { fixed } from '@/lib/num';
import { useProduction, useSelection } from '@/services/hsmProduction';
import './checklist.css';

const REASONS = [
  { key: 'missRoll', label: 'Miss roll' },
  { key: 'finishEndcut', label: 'Finish end cut' },
  { key: 'millScale', label: 'Mill scale' },
  { key: 'stripEndcut', label: 'End cut' },
] as const;
type ReasonKey = (typeof REASONS)[number]['key'];
const mt = (v: number | null) => (v === null ? '' : fixed(v, 2));

export default function VarianceChecklist({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { today } = useSelection();
  const [date, setDate] = useState('');
  const day = date || today || '';
  const prod = useProduction(open && day ? { from: day, to: day, grain: 'day' } : null);
  const d = prod.data?.days.find((x) => x.date === day) ?? null;
  const influx = d?.influxMt ?? null;
  const erp = d?.erpMt ?? null;
  const variance = influx !== null && erp !== null ? influx - erp : null;
  const pct = variance !== null && erp ? (variance / erp) * 100 : null;

  // The reasons are typed by the person; a new date starts them empty.
  const [reasons, setReasons] = useState<Record<ReasonKey, string>>({ missRoll: '', finishEndcut: '', millScale: '', stripEndcut: '' });
  useEffect(() => {
    setReasons({ missRoll: '', finishEndcut: '', millScale: '', stripEndcut: '' });
  }, [day]);
  const reasonTotal = REASONS.reduce((a, r) => a + (Number(reasons[r.key]) || 0), 0);
  const unexplained = variance !== null ? variance - reasonTotal : null;

  return (
    <DrillDrawer open={open} onClose={onClose} title="Production variance checklist" sub="HSM · MT"
      loading={prod.loading && !prod.data} error={prod.error} hasData>
      <form className="ck-form" onSubmit={(e) => e.preventDefault()} aria-label="Production variance checklist">
        <div className="ck-group">
          <div className="ck-grid ck-grid--wide">
            <label className="ck-f"><span>Date</span>
              <input type="date" value={day} max={today ?? undefined} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="ck-group">
          <div className="ck-group-head"><h3 className="rm-k">Production</h3><span className="ck-auto">Filled by the dashboard · whole plant day 06:00–06:00</span></div>
          <div className="ck-grid ck-grid--wide">
            <label className="ck-f"><span>Production (Influx / HMI)</span><input readOnly value={mt(influx)} placeholder="NA" /></label>
            <label className="ck-f"><span>Production (ERP)</span><input readOnly value={mt(erp)} placeholder="NA" /></label>
            <label className="ck-f"><span>Variance (Influx − ERP)</span><input readOnly value={mt(variance)} placeholder="NA" /></label>
            <label className="ck-f"><span>Variance %</span><input readOnly value={pct === null ? '' : `${fixed(pct, 2)} %`} placeholder="NA" /></label>
          </div>
        </div>

        <div className="ck-group">
          <div className="ck-group-head"><h3 className="rm-k">Reason for variance · MT</h3></div>
          <div className="ck-grid ck-grid--wide">
            {REASONS.map((r) => (
              <label className="ck-f" key={r.key}><span>{r.label}</span>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={reasons[r.key]}
                  onChange={(e) => setReasons((s) => ({ ...s, [r.key]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div className="ck-sum" aria-label="Reasons against variance">
            <span>Reasons total <b className="num">{fixed(reasonTotal, 2)} MT</b></span>
            <span>Variance <b className="num">{variance === null ? 'NA' : `${fixed(variance, 2)} MT`}</b></span>
            <span>Not explained <b className="num">{unexplained === null ? 'NA' : `${fixed(unexplained, 2)} MT`}</b></span>
          </div>
        </div>

        <div className="ck-actions">
          <button type="submit" className="ck-save" disabled>Save</button>
          <span>Preview — saving is not connected yet</span>
        </div>
      </form>
    </DrillDrawer>
  );
}
