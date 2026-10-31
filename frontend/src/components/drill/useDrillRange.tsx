'use client';

/**
 * Period and grouping controls shared by every drill-down. Every drill-down shows the Duration
 * filter's period; the fixed-date presets ("since the counter started", "since the ERP went live")
 * were removed (the user, 31 Oct 2026) — a period before a source starts simply has no data.
 */
import { useState } from 'react';
import { Seg } from './DrillDrawer';
import { autoGrain } from '@/lib/periods';
import { useSelection, type Grain } from '@/services/hsmProduction';

export type RangeId = 'selection';

const GRAINS: { id: Grain; label: string }[] = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

export function useDrillRange(ids: RangeId[], initial: RangeId, opts: { grain?: boolean } = {}) {
  const sel = useSelection();
  const [range, setRange] = useState<RangeId>(initial);
  // Until the reader picks one, the grouping follows the period's length (autoGrain), so a
  // two-month period opens on weeks rather than sixty daily rows.
  const [picked, setGrain] = useState<Grain | null>(null);
  const today = sel.today;

  const datesOf = (): { from: string; to: string } | null => sel.dates;
  const labelOf: Record<RangeId, { label: string; title?: string }> = {
    selection: { label: `Duration filter${sel.dates ? ` · ${sel.label}` : ''}`, title: 'The period chosen in the Duration filter' },
  };

  const dates = datesOf();
  const grain = picked ?? autoGrain(dates);
  const controls = (
    <>
      {/* One choice is no choice: the period control shows only when there are several. */}
      {ids.length > 1 && (
        <Seg
          label="Period"
          value={range}
          options={ids.map((id) => ({ id, ...labelOf[id], disabled: !datesOf() }))}
          onChange={setRange}
        />
      )}
      {opts.grain !== false && <Seg label="Group by" value={grain} options={GRAINS} onChange={setGrain} />}
    </>
  );
  return { range, dates, grain, controls, today };
}
