'use client';

/**
 * RMD Breakdown (the user, 25 Nov 2026), as the plant's sheet: the total hours on the card — the ERP log sheet's
 * seven items, every one in minutes: mechanical, electrical, process, raw material, power / other, the mill
 * single stand and mill 1½ — for the Rolling chosen. Opens like Finished stock: the total, then each item on its
 * own, largest first, with its share.
 */
import { useMemo, useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import type { RmdProductionReport } from '@/services/hsmApi';

const MODE: Record<RmdProductionReport['mode'], string> = { all: 'Online + Offline', online: 'Online', offline: 'Offline' };

export default function RmdBreakdownCard({ data, error, term, lastEntry }: {
  data: RmdProductionReport | null; error: string | null; term: string | null;
  lastEntry: { value: string; date: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const up = !!data && data.erp.connection === 'up';
  const t = data?.totals;
  const items = useMemo(() => (t ? [...t.breakdown].sort((a, b) => b.hrs - a.hrs) : []), [t]);
  return (
    <>
      <KpiCard
        label="Breakdown"
        term={term}
        value={t?.breakdownHrs == null ? 'NA' : fixed(t.breakdownHrs)}
        noEntries={up && t?.breakdownHrs == null}
        lastEntry={lastEntry}
        unit="h"
        note={error ? 'ERP data unavailable' : data && !up ? data.erp.message : ''}
        series="reject"
        loading={!data && !error}
        onOpen={() => setOpen(true)}
        openLabel="Breakdown hours by cause"
      />
      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Breakdown" sub={`RMD · hours · ${data ? MODE[data.mode] : ''}`}
        loading={!data && !error} error={error} hasData={up && !!t}>
        {up && t && (
          <>
            <Stats items={[
              { label: 'Breakdown', value: t.breakdownHrs == null ? 'NA' : fixed(t.breakdownHrs), unit: 'h' },
              { label: 'Causes with time', value: String(items.filter((x) => x.hrs > 0).length), unit: `of ${items.length}` },
              { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
            ]} />
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Breakdown by cause">
                <thead><tr><th>Cause</th><th className="r">Hours</th><th className="r">Minutes</th><th className="r">Share</th></tr></thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.code}>
                      <td><b>{x.label}</b></td>
                      <td className="num r v-val">{fixed(x.hrs)}</td>
                      <td className="num r">{fixed(x.hrs * 60, 0)}</td>
                      <td className="num r">{t.breakdownHrs ? `${fixed((x.hrs / t.breakdownHrs) * 100, 1)} %` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td><b>Total</b></td><td className="num r">{t.breakdownHrs == null ? '—' : fixed(t.breakdownHrs)}</td><td className="num r">{t.breakdownHrs == null ? '—' : fixed(t.breakdownHrs * 60, 0)}</td><td /></tr></tfoot>
              </table>
            </div>
            <SourceBox
              sources={[{ name: 'ERP', rows: [
                ['Table', "ATTR_TRAN_DATA_BODY · USER_CODE = 'FA-SKJ' · Online / Offline: ATTR_TRAN_DATA_HEAD.TRAN_COLUMN_NAME1 (RO001 / RO002)"],
                ['Fields', items.map((x) => x.code).join(', ') + ' — minutes'],
              ] }]}
              formula={[
                'Breakdown = Σ of the seven fields of the period\'s entries ÷ 60, hours — the plant\'s sheet',
                'The ERP\'s own MILL_TOTAL_BREAKDOWN_HRS counts the first five only; the sheet adds the single stand and mill 1½',
                'A negative entry (a typing slip) is left out',
              ]}
            />
          </>
        )}
      </DrillDrawer>
    </>
  );
}
