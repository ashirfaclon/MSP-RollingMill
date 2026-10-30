'use client';

/**
 * HSM · Asset Health — the layout of the approved mock-up (HSM_Asset_Health_Dashboard.png), wired
 * only from the sources the HSM sheet names (HSM source KPI.xlsx, Asset Health; the user,
 * 21 Oct 2026). NA everywhere else, never a sample figure:
 *   Bearing temp       Mill Load Log Sheet: the hottest DC motor DE / NDE temperature at the
 *                      selected group's stands' latest readings, °C; opens every stand, and the
 *                      Condition trend is the hottest of each reading. (Deviation from a
 *                      comparable-load baseline once the form has history.)
 *   Motor current      Mill Load Log Sheet: loading % = load ÷ the motor's rated current × 100
 *                      (Strip_Mill_DC_Motor_Details.xlsx, the plant, 26 Oct 2026), the mean of the
 *                      group's stands at their latest readings; the drill-down shows amps and %.
 *   Run hours          ERP log sheet NET_RUNNING_HRS over the period (whole mill).
 *   Mimic, status   the Visualization mimic's Influx tags (the user, 26 Oct 2026): billets since
 *                      08:00, RM / FM drives on (On_Off), the production counter for the period.
 * The stand name places a reading in its group (RM → roughing, FM → finishing). The drive group is
 * chosen in the header (the user, 28 Oct 2026) — roughing, finishing, auxiliary (MID's pumps); the
 * mimic only shows the live state. Vibration from MID. No PM items: HSM's equipment is not in the
 * ERP's PM module (the user, 29 Oct 2026). The rest have
 * no source in the sheet.
 */
import { useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import { useHsmMimic } from '@/components/visualization/useHsmMimic';
import DrillDrawer, { Seg, Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { HSM_RATED_CURRENT_A, loadingPct } from '@/config/hsmMotors';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type HsmMillLoadEntry, type HsmMillLoadReport, type RunningRateReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import { useMid } from './useMid';
import { MidVibrationDrawer, MidVibrationTrend, midDate, MidRemarks } from './MidVibration';
import './asset.css';

/** The drive groups the header selects; each is also its MID section. */
type Group = 'roughing' | 'finishing' | 'auxiliary';
const GROUPS: { id: Group; label: string }[] = [{ id: 'roughing', label: 'Roughing' }, { id: 'finishing', label: 'Finishing' }, { id: 'auxiliary', label: 'Auxiliary' }];
/** The groups whose stands the Mill Load Log Sheet covers. */
const STANDS: Partial<Record<Group, 'roughing' | 'finishing'>> = { roughing: 'roughing', finishing: 'finishing' };
const NAME: Record<Group, string> = { roughing: 'Roughing', finishing: 'Finishing', auxiliary: 'Auxiliary' };

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
/** The hotter of a reading's DE and NDE temperature; null without either. */
const hottest = (e: HsmMillLoadEntry) => {
  const t = [e.deTempC, e.ndeTempC].filter((v): v is number => v !== null);
  return t.length ? Math.max(...t) : null;
};

export default function AssetHealth() {
  const [group, setGroup] = useState<Group>('finishing');
  const [open, setOpen] = useState(false);
  const drive = NAME[group];
  const gid = STANDS[group] ?? null;
  const { dates } = useSelection();
  const [vibOpen, setVibOpen] = useState(false);
  const mid = useMid('hsm', group);

  const loadUrl = rangeUrl('/api/hsm/mill-load', dates);
  const loadS = useApi<HsmMillLoadReport>(loadUrl);
  const load = loadS.data && loadS.dataUrl === loadUrl ? loadS.data : null;
  const rateUrl = rangeUrl('/api/hsm/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const rateS = useApi<RunningRateReport>(rateUrl);
  const runH = rateS.data && rateS.dataUrl === rateUrl ? rateS.data.totals.erpRunH : null;

  const latest = gid && load ? load.latest.filter((e) => e.group === gid) : [];
  const temps = latest.map(hottest).filter((v): v is number => v !== null);
  const bearingC = temps.length ? Math.max(...temps) : null;
  const loads = latest.map((e) => e.loadA).filter((v): v is number => v !== null);
  const loadA = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : null;
  const pcts = latest.map((e) => loadingPct(e.stand, e.loadA)).filter((v): v is number => v !== null);
  const loadPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const trend = gid && load ? load.entries.filter((e) => e.group === gid && hottest(e) !== null) : [];
  const canOpen = !!gid && !!load;
  const mimic = useHsmMimic();
  const liveGroup = gid ? mimic.group(gid) : null;

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">HSM · {group === 'auxiliary' ? 'Auxiliary · pumps' : `${drive} drive group`}</h2>
          <Seg label="Drive group" value={group} onChange={setGroup} options={GROUPS} />
        </div>
        {/* Status only where there is a source (the user, 28 Oct 2026): the RM / FM drives' On_Off — none for the pumps. */}
        {gid && (liveGroup && liveGroup.state !== 'no-data'
          ? <span className="chip chip--info ah-status">{liveGroup.stateLabel}</span>
          : <span className="chip chip--na ah-status">No live data</span>)}
        <dl className="ah-asset-facts">
          {([['Last inspection', midDate(mid.date)]] as const).map(([k, v]) => (
            <div className="ah-fact" key={k}><dt className="rm-k">{k}</dt><dd className={`num ${v ? 'v-val' : 'v-na'}`}>{v ?? 'NA'}</dd></div>
          ))}
        </dl>
      </Panel>

      <section className="rm-strip ah-strip ah-strip--five" aria-label="Condition KPIs">
        <KpiCard label="Vibration RMS" value={mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1)} unit="mm/s" note="" series="hold" noEntries={!!mid.report && mid.maxMmS === null}
          {...(mid.machines.length ? { onOpen: () => setVibOpen(true), openLabel: 'Each machine at the last MID visit' } : {})} />
        <MidVibrationDrawer open={vibOpen} onClose={() => setVibOpen(false)} title={`${drive} group`} mid={mid} />
        <KpiCard
          label="Bearing temp"
          value={bearingC === null ? 'NA' : fixed(bearingC, 0)}
          noEntries={!!gid && !!load && bearingC === null}
          unit="°C"
          note=""
          series="hold"
          {...(canOpen ? { onOpen: () => setOpen(true), openLabel: 'Each stand: load and DC motor temperatures' } : {})}
        />
        <KpiCard
          label="Motor current"
          value={loadPct === null ? 'NA' : fixed(loadPct, 0)}
          noEntries={!!gid && !!load && loadPct === null}
          unit="%"
          note=""
          series="prod"
          {...(canOpen ? { onOpen: () => setOpen(true), openLabel: 'Each stand: load and DC motor temperatures' } : {})}
        />
        {NA('Gearbox oil', '', 'hold')}
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod"
          noEntries={!!rateS.data && rateS.dataUrl === rateUrl && runH == null} />
      </section>

      <div className="rm-row ah-row--one">
        <Panel title="Condition trends" sub="Bearing temperature, each reading" className="rm-panel" bodyClass="rm-body ah-trends">
          <MidVibrationTrend mid={mid} />
          <BearingTrend entries={trend} />
        </Panel>
      </div>

      <div className="rm-row ah-row--one">
        <Panel title="Remarks" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <MidRemarks mid={mid} />
        </Panel>
      </div>

      <DrillDrawer open={open} onClose={() => setOpen(false)} title={`${drive} · mill load`} sub="HSM · A · °C"
        loading={!loadS.data && !loadS.error} error={loadS.error} hasData={!!load}>
        {load && (
          <>
            <Stats items={[
              { label: 'Motor current loading', value: loadPct === null ? 'NA' : fixed(loadPct, 0), unit: '% · mean of stands', tone: loadPct === null ? 'v-na' : undefined },
              { label: 'Motor current', value: loadA === null ? 'NA' : fixed(loadA, 0), unit: 'A · mean of stands', tone: loadA === null ? 'v-na' : undefined },
              { label: 'Hottest bearing', value: bearingC === null ? 'NA' : fixed(bearingC, 0), unit: '°C · DC motor', tone: bearingC === null ? 'v-na' : undefined },
            ]} />
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Mill load per stand">
                <thead><tr><th>Stand</th><th className="r">Load (A)</th><th className="r">Rated (A)</th><th className="r">Loading (%)</th><th className="r">DC motor DE (°C)</th><th className="r">DC motor NDE (°C)</th><th>Reading</th></tr></thead>
                <tbody>
                  {latest.length === 0
                    ? <tr><td colSpan={7} className="v-na">NA</td></tr>
                    : latest.map((e) => (
                      <tr key={e.stand}>
                        <td><b>{e.stand}</b></td>
                        <td className="num r">{e.loadA === null ? '—' : fixed(e.loadA, 0)}</td>
                        <td className="num r">{HSM_RATED_CURRENT_A[e.stand] ? fixed(HSM_RATED_CURRENT_A[e.stand], 0) : '—'}</td>
                        <td className="num r v-val">{loadingPct(e.stand, e.loadA) === null ? '—' : fixed(loadingPct(e.stand, e.loadA), 0)}</td>
                        <td className="num r">{e.deTempC === null ? '—' : fixed(e.deTempC, 0)}</td>
                        <td className="num r">{e.ndeTempC === null ? '—' : fixed(e.ndeTempC, 0)}</td>
                        <td>{dm(e.date)}{e.time ? ` · ${e.time.slice(11, 16)}` : ''} · {e.shift}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <SourceBox
              sources={[{ name: 'Logbook', rows: [
                ['Form', 'Electrical HSM → Mill Load Log Sheet'],
                ['Field', 'stand name, load in amp, DC motor DE temp, DC motor NDE temp — by the form\'s date'],
              ] }]}
              formula={[
                'Each stand\'s latest reading of the period; RM stands = roughing, FM stands = finishing',
                'Loading % = load ÷ rated current × 100 per stand (rated current: Strip_Mill_DC_Motor_Details, R1–R5 630–983 A, F1–F6 1,214–1,807 A)',
                'Motor current = the mean loading % of the group\'s stands',
                'Bearing temp = the hottest DC motor DE / NDE temperature of the group\'s stands',
              ]}
            />
            {load.logbook.connection === 'down' && <p className="v-warn">{load.logbook.message}</p>}
          </>
        )}
      </DrillDrawer>
    </div>
  );
}

function BearingTrend({ entries }: { entries: HsmMillLoadEntry[] }) {
  const categories = useMemo(() => entries.map((e) => `${dm(e.date)}${e.time ? ` ${e.time.slice(11, 16)}` : ''} ${e.stand}`), [entries]);
  const series = useMemo<DrillSeries[]>(() => [{ id: 'bt', name: 'Hottest DC motor bearing', token: '--s-order', type: 'line', data: entries.map(hottest), dp: 0 }], [entries]);
  const axes = useMemo(() => [{ title: '°C', unit: '°C' }], []);
  const last = entries.at(-1);
  return (
    <div className="ah-trend">
      <div className="ah-trend-head">
        <span className="rm-k">Bearing temp · °C</span>
        <span className={`num ${last ? 'v-val' : 'v-na'}`}>{last ? fixed(hottest(last), 0) : 'NA'}</span>
      </div>
      {entries.length
        ? <DrillChart series={series} categories={categories} axes={axes} ariaLabel={`Hottest DC motor bearing per reading: ${entries.map((e) => `${e.date} ${e.stand} ${hottest(e)} °C`).join('; ')}`} />
        : <div className="ah-trend-plot" role="img" aria-label="Bearing temperature: no readings" />}
    </div>
  );
}

