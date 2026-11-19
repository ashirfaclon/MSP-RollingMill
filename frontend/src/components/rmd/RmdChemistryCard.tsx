'use client';

/**
 * RMD chemical composition — as the plant gave it: the logbook form Steel Melting Shop → SMS →
 * CCM Lolipop Sample, the RMD samples (its "mill" field). The card shows the latest sample of
 * the period, %C / %Mn / %S / %P / %Si with its furnace number and CCM; it opens every sample.
 * C, S and P (and S + P) are coloured against their limits in the mill's Settings (the user,
 * 19 Nov 2026; IS 1786 Fe 500D by default); Mn and Si have none.
 */
import { useState } from 'react';
import LimitsNote from '@/components/settings/LimitsNote';
import { toneOf, useMillSettings, worstTone, type Tone } from '@/services/settings';
import { useLastEntry } from '@/services/lastEntry';
import DrillDrawer from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { NO_ENTRIES } from '@/components/visualization/KpiCard';
import { useSelection, dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdChemSample, type RmdChemistryReport } from '@/services/hsmApi';

const ELEMENTS: { key: 'c' | 'mn' | 's' | 'p' | 'si'; label: string }[] = [
  { key: 'c', label: 'C' }, { key: 'mn', label: 'Mn' }, { key: 's', label: 'S' }, { key: 'p', label: 'P' }, { key: 'si', label: 'Si' },
];
const pct = (v: number | null) => (v === null ? '—' : String(Number(v.toFixed(3))));

type Limits = ReturnType<typeof useMillSettings>['limit'];
/** An element's colour: C against its limit; S and P against theirs and against S + P together. */
function chemTone(s: RmdChemSample, key: (typeof ELEMENTS)[number]['key'], limit: Limits): Tone | undefined {
  const sp = s.s !== null && s.p !== null ? toneOf(s.s + s.p, limit('chem-sp')) : undefined;
  if (key === 'c') return toneOf(s.c, limit('chem-c'));
  if (key === 's') return worstTone([toneOf(s.s, limit('chem-s')), sp]);
  if (key === 'p') return worstTone([toneOf(s.p, limit('chem-p')), sp]);
  return undefined;
}

export default function RmdChemistryCard() {
  const { dates } = useSelection();
  const url = rangeUrl('/api/rmd/chemistry', dates);
  const { data, dataUrl, error } = useApi<RmdChemistryReport>(url);
  const r = data && dataUrl === url ? data : null;
  const [open, setOpen] = useState(false);
  /* No sample in the period: the last sample before it, said plainly (the user, 30 Oct 2026). */
  const prev = useLastEntry<RmdChemistryReport>('/api/rmd/chemistry', !!r && !r.latest, r?.lastDate, dates?.from);
  const fromBefore = !r?.latest && !!prev.data?.latest;
  const last = r?.latest ?? prev.data?.latest ?? null;
  const loading = !r && !error;
  const { limit } = useMillSettings('rmd');

  return (
    <>
      <button type="button" className="rm-card rm-card--button rm-tone--order rmd-chem-card" aria-label="Chemical composition"
        aria-haspopup="dialog" title="Every lollipop sample of the period" onClick={() => setOpen(true)}>
        <span className="rm-card-label">Chemical composition<span className="rm-card-label-unit">· %</span></span>
        {loading
          ? <span className="rm-card-value"><span className="skel skel--num-lg" role="status" aria-busy="true" aria-label="Loading" /></span>
          : last
            ? (
              <span className="rm-card-value rmd-chem num v-val">
                {ELEMENTS.map((e) => (
                  <span key={e.key} className="rmd-chem-cell">
                    <span className="rm-card-src">{e.label}</span>
                    <span className={`rmd-chem-v ${chemTone(last, e.key, limit) ?? ''}`}>{pct(last[e.key])}</span>
                  </span>
                ))}
              </span>
            )
            : <span className="rm-card-value num v-val">NA</span>}
        <span className="rm-card-note">
          {last && fromBefore ? <span className="rm-card-last">Last entry · {dm(last.date)}</span>
            : last ? `Furnace ${last.furnace || '—'} · CCM ${last.ccm || '—'} · ${dm(last.date)}`
            : r?.logbook.connection === 'down' ? r.logbook.message
            : r ? <span className="rm-card-empty">{NO_ENTRIES}</span> : ''}
        </span>
      </button>
      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Chemical composition" sub="RMD · SMS lollipop samples · %"
        loading={loading} error={error} hasData={!!r}>
        {r && <Content r={r} limit={limit} />}
      </DrillDrawer>
    </>
  );
}

function Content({ r, limit }: { r: RmdChemistryReport; limit: Limits }) {
  return (
    <>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Lollipop samples">
          <thead>
            <tr>
              <th>Date</th><th>Furnace</th><th>CCM</th><th>Section</th>
              {ELEMENTS.map((e) => <th key={e.key} className="r">%{e.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.samples.length === 0
              ? <tr><td colSpan={4 + ELEMENTS.length} className="v-na">NA</td></tr>
              : r.samples.map((s, i) => <Row key={i} s={s} limit={limit} />)}
          </tbody>
        </table>
      </div>
      <LimitsNote limits={[limit('chem-c'), limit('chem-s'), limit('chem-p'), limit('chem-sp')]} />
      <SourceBox
        sources={[{ name: 'Logbook', rows: [
          ['Form', 'Steel Melting Shop → SMS → CCM Lolipop Sample'],
          ['Filter', 'Mill = RMD'],
          ['Field', 'Furnace Number, CCM, %C_18, %Mn_19, %S_20, %P_21, %Si_22 — by the form\'s date'],
        ] }]}
        formula={['Card = the latest sample of the period', 'Table = every sample of the period, newest first']}
      />
      {r.logbook.connection === 'down' && <p className="v-warn">{r.logbook.message}</p>}
    </>
  );
}

function Row({ s, limit }: { s: RmdChemSample; limit: Limits }) {
  return (
    <tr>
      <td>{dm(s.date)}{s.time ? ` · ${s.time.slice(11, 16) || s.time}` : ''}</td>
      <td><b>{s.furnace || '—'}</b></td>
      <td>{s.ccm || '—'}</td>
      <td>{s.section || '—'}</td>
      {ELEMENTS.map((e) => <td key={e.key} className={`num r ${s[e.key] === null ? 'v-na' : chemTone(s, e.key, limit) ?? 'v-val'}`}>{pct(s[e.key])}</td>)}
    </tr>
  );
}
