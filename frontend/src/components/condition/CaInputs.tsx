'use client';

/**
 * The Condition Analytics inputs popup: one month's targets and costs for a mill (caConfig.ts), from
 * the "Edit inputs" button on Costing & impact. Saving is not connected yet — it will go to the mill's
 * logbook form, one entry per month, the latest entry of a month winning (as the production plan).
 */
import { useState } from 'react';
import DrillDrawer from '@/components/drill/DrillDrawer';
import { caFieldsFor, type CaGroup, type CaMill } from './caConfig';
import '@/components/checklist/checklist.css';

const thisMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

export default function CaInputs({ mill, open, onClose }: { mill: CaMill; open: boolean; onClose: () => void }) {
  const fields = caFieldsFor(mill);
  const [month, setMonth] = useState(thisMonth);
  const [values, setValues] = useState<Record<string, string>>({});
  const groups: CaGroup[] = ['Targets', 'Costs'];

  return (
    <DrillDrawer open={open} onClose={onClose} title={`${mill.toUpperCase()} · CA inputs`} sub="Targets and costs, one month at a time"
      loading={false} error={null} hasData>
      <div className="ck-form">
        <div className="ck-grid ck-grid--wide">
          <label className="ck-f"><span>Month</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
        </div>
        {groups.map((g) => (
          <section className="ck-group" key={g} aria-label={g}>
            <div className="ck-group-head"><h3 className="rm-k">{g}</h3></div>
            <div className="ck-grid ck-grid--wide">
              {fields.filter((f) => f.group === g).map((f) => (
                <label className="ck-f" key={f.key} title={`Used for: ${f.feeds}`}>
                  <span>{f.label}</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                </label>
              ))}
            </div>
          </section>
        ))}
        {mill === 'hsm' && <p className="ck-sum">Actual tariff, other conversion and material values come from the HSM costing sheet.</p>}
        <div className="ck-actions">
          <button type="button" className="ck-save" disabled>Save inputs</button>
          <span>Preview — saving is not connected yet.</span>
        </div>
      </div>
    </DrillDrawer>
  );
}
