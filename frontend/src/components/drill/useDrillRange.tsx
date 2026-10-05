'use client';

/**
 * Period and grouping controls shared by every drill-down. The Duration filter is always
 * one click away; the other presets exist because the ERP is entered 1–2 days late, so
 * "Today" alone would open most ERP drawers on an empty day.
 */
import { useState } from 'react';
import { Seg } from './DrillDrawer';
import {
  COUNTER_START_DATE, ERP_START_DATE, addDays, dm, useSelection, type Grain,
} from '@/services/hsmProduction';

export type RangeId = 'counter' | 'last30' | 'selection' | 'since';

const MAX_DAYS = 400;

const GRAINS: { id: Grain; label: string }[] = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

export function useDrillRange(ids: RangeId[], initial: RangeId, opts: { grain?: boolean } = {}) {
  const sel = useSelection();
  const [range, setRange] = useState<RangeId>(initial);
  const [grain, setGrain] = useState<Grain>('day');
  const today = sel.today;

  const datesOf = (id: RangeId): { from: string; to: string } | null => {
    if (id === 'selection') return sel.dates;
    if (!today) return null;
    if (id === 'counter') return { from: COUNTER_START_DATE, to: today };
    if (id === 'last30') return { from: addDays(today, -29), to: today };
    const from = ERP_START_DATE > addDays(today, -(MAX_DAYS - 1)) ? ERP_START_DATE : addDays(today, -(MAX_DAYS - 1));
    return { from, to: today };
  };
  const labelOf: Record<RangeId, { label: string; title?: string }> = {
    counter: { label: `${dm(COUNTER_START_DATE)} → today`, title: 'Since the mill counter started publishing' },
    last30: { label: 'Last 30 days' },
    selection: { label: `Duration filter${sel.dates ? ` · ${sel.label}` : ''}`, title: 'The period chosen in the Duration filter' },
    since: { label: `Since ${dm(ERP_START_DATE)} ’25`, title: 'Since the ERP went live for the strip mill' },
  };

  const dates = datesOf(range);
  const controls = (
    <>
      <Seg
        label="Period"
        value={range}
        options={ids.map((id) => ({ id, ...labelOf[id], disabled: !datesOf(id) }))}
        onChange={setRange}
      />
      {opts.grain !== false && <Seg label="Group by" value={grain} options={GRAINS} onChange={setGrain} />}
    </>
  );
  return { range, dates, grain, controls, today };
}
