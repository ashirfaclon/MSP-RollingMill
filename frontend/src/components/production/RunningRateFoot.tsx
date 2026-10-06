'use client';

/**
 * Running rate for the Duration period, calculated: Influx production ÷ hours the mill was
 * running (billets leaving the furnace less than 10 min apart). Live — today counts up.
 * Opens the drawer that compares it with the ERP log sheet's rate.
 */
import { useState } from 'react';
import RunningRateDrawer from '@/components/drill/RunningRateDrawer';
import { fixed } from '@/lib/num';
import { rangeUrl, useApi, type RunningRateReport } from '@/services/hsmApi';
import { useSelection } from '@/services/hsmProduction';

export default function RunningRateFoot() {
  const { dates } = useSelection();
  const [open, setOpen] = useState(false);
  const url = rangeUrl('/api/hsm/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const { data, dataUrl, error } = useApi<RunningRateReport>(url);
  const current = data && dataUrl === url ? data : null;
  const rate = current?.totals.rateTph ?? null;

  return (
    <>
      <button
        type="button"
        className="rm-foot-item rm-foot-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Production ÷ running hours, by day, with the ERP rate beside it"
      >
        <span className="rm-k">Running rate</span>
        {!current && !error
          ? <span className="skel skel--num" role="status" aria-label="Loading" />
          : <span className={`rm-foot-v num ${rate === null ? 'v-na' : 'v-val'}`}>{rate === null ? 'NA' : `${fixed(rate, 2)} TPH`}</span>}
      </button>
      <RunningRateDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
