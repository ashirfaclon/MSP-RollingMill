'use client';

/**
 * HSM · Asset Health — the layout of the approved mock-up (HSM_Asset_Health_Dashboard.png), wired
 * only from the sources the HSM sheet names (HSM source KPI.xlsx, Asset Health; the user,
 * 21 Oct 2026). NA everywhere else, never a sample figure:
 *   Motor temp         Mill Load Log Sheet: the hottest DC motor DE / NDE temperature at the
 *                      selected group's stands' latest readings, °C; opens every stand, and the
 *                      Condition trend is the hottest of each reading. (Deviation from a
 *                      comparable-load baseline once the form has history.) Named Motor temp, not
 *                      Bearing temp: they are the DC motors' own temperatures (the user, 25 Nov 2026).
 *   Bearing temp       HSM Mechanical → Bearing Temperature Details (the user, 25 Nov 2026): the hottest
 *                      reduction-cum-pinion gearbox bearing, D / ND side, at each stand's latest reading.
 *   Oil temp           the same form: the hottest lubrication tank at its latest reading (tanks 1–2
 *                      roughing, 3–4 finishing). Both in HsmGearTemps.tsx.
 *   Motor current      Mill Load Log Sheet: loading % = load ÷ the motor's rated current × 100
 *                      (Strip_Mill_DC_Motor_Details.xlsx, the plant, 26 Oct 2026), the mean of the
 *                      group's stands at their latest readings; the drill-down shows amps and %.
 *   Run hours          ERP log sheet NET_RUNNING_HRS over the period (whole mill).
 *   Last inspection    the MID visit date, under the Vibration card. No top bar: the drive group is
 *                      switched in the page header (the user, 31 Oct 2026).
 * The stand name places a reading in its group (RM → roughing, FM → finishing). The drive group is
 * chosen in the header (the user, 28 Oct 2026) — roughing, finishing, auxiliary (MID's pumps); the
 * mimic only shows the live state. Vibration from MID. No PM items: HSM's equipment is not in the
 * ERP's PM module (the user, 29 Oct 2026). The rest have
 * no source in the sheet.
 * Each reading is coloured against its limit in the mill's Settings (the user, 19 Nov 2026): green
 * inside, amber outside, red far outside; a card takes the worst of its stands.
 */
import { useMemo, useState } from 'react';
import { toneOf, useMillSettings, worstTone } from '@/services/settings';
import LimitsNote from '@/components/settings/LimitsNote';
import { hsmHottest, midTop, whenText, withWhere } from './cardWhere';
import HeaderSlot from '@/components/shell/HeaderSlot';
import Picker from '@/components/shell/Picker';
import BearingTrendAll, { hsmBearingPoints } from './BearingTrendAll';
import { HsmBearingDrawer, HsmOilDrawer, useHsmGearTemps, whereOf } from './HsmGearTemps';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import Panel from '@/components/Panel';
import KpiCard from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { HSM_MOTORS_URL, loadingPct, useHsmMotorRatings } from '@/services/equipment';
import EquipmentSettings from './EquipmentSettings';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type HsmMillLoadEntry, type HsmMillLoadReport, type RunningRateReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import { useMid } from './useMid';
import { MidVibrationDrawer, MidVibrationTrend, midDate, MidRemarks, remarkSummary } from './MidVibration';
import './asset.css';

/** The drive groups the header selects; each is also its MID section. */
type Group = 'all' | 'roughing' | 'finishing' | 'auxiliary';
const GROUPS: { id: Group; label: string }[] = [
  // All: the whole mill — every stand and every MID machine (the user, 31 Oct 2026).
  { id: 'all', label: 'All' }, { id: 'roughing', label: 'Roughing' }, { id: 'finishing', label: 'Finishing' }, { id: 'auxiliary', label: 'Auxiliary' },
];
const GROUP_OPTIONS = GROUPS.map((g) => ({ id: g.id, text: g.label }));
/** The stand groups of the Mill Load Log Sheet each group covers. */
const STANDS: Partial<Record<Group, ('roughing' | 'finishing')[]>> = { all: ['roughing', 'finishing'], roughing: ['roughing'], finishing: ['finishing'] };
const NAME: Record<Group, string> = { all: 'All stands', roughing: 'Roughing', finishing: 'Finishing', auxiliary: 'Auxiliary' };
/** A Mill Load reading's stand in the selected groups. */
const inStands = (stands: ('roughing' | 'finishing')[] | null, e: HsmMillLoadEntry) => !!stands && e.group !== null && stands.includes(e.group);

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
  const rateD = rateS.data && rateS.dataUrl === rateUrl ? rateS.data : null;
  const runH = rateD ? rateD.totals.erpRunH : null;
  /* No ERP run hours in the period: the last day booked (the user, 30 Oct 2026). */
  const rateLast = useLastEntry<RunningRateReport>('/api/hsm/running-rate', !!rateD && runH == null, rateD?.erp.lastDate, dates?.from, 'grain=day');

  /* The card figures from a mill-load report, for the group: the hottest DC motor bearing, the mean load. */
  // Rated current per stand: the defaults with any edit made on the dashboard (the user, 31 Oct 2026).
  const motors = useHsmMotorRatings();
  const figures = (r: HsmMillLoadReport | null) => {
    const l = gid && r ? r.latest.filter((e) => inStands(gid, e)) : [];
    const ts = l.map(hottest).filter((v): v is number => v !== null);
    const ls = l.map((e) => e.loadA).filter((v): v is number => v !== null);
    const ps = l.map((e) => loadingPct(motors.rated, e.stand, e.loadA)).filter((v): v is number => v !== null);
    return {
      latest: l, bearingC: ts.length ? Math.max(...ts) : null,
      loadA: ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null,
      loadPct: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null,
    };
  };
  const { latest, bearingC, loadA, loadPct } = figures(load);
  // The limits in use: DC motor temperature and motor loading, per stand; the card is the worst stand.
  const settings = useMillSettings('hsm');
  const bearingL = settings.limit('motor-bearing-temp'), loadingL = settings.limit('motor-loading');
  const bearingTone = worstTone(latest.flatMap((e) => [toneOf(e.deTempC, bearingL), toneOf(e.ndeTempC, bearingL)]));
  const loadingTone = worstTone(latest.map((e) => toneOf(loadingPct(motors.rated, e.stand, e.loadA), loadingL)));
  /* Nothing filled in the period: the last day the Mill Load Log Sheet has (the user, 30 Oct 2026). */
  const loadLast = useLastEntry<HsmMillLoadReport>('/api/hsm/mill-load', !!gid && !!load && latest.length === 0, load?.lastDate, dates?.from);
  // Every DC motor bearing of the group's stands, each reading (the user, 31 Oct 2026).
  const trend = useMemo(() => (gid && load ? hsmBearingPoints(load.entries.filter((e) => inStands(gid, e))) : []), [gid, load]);
  const canOpen = !!gid && !!load;
  // Gearbox bearings and lubrication oil, from HSM Mechanical → Bearing Temperature Details (the user, 25 Nov 2026).
  const gear = useHsmGearTemps(gid, dates);
  const [gearOpen, setGearOpen] = useState<'bearing' | 'oil' | null>(null);
  const gearCanOpen = !!gid && !!gear.report;

  return (
    <div className="rm-viz ah">
      {/* The drive group: in the top bar, not a "Selected asset" panel (the user, 31 Oct 2026). */}
      {/* A dropdown in the top bar's row, beside Mill (the user, 21 Nov 2026 — was tabs on a line of their own). */}
      <HeaderSlot><Picker label="Group" title="Drive group" value={group} onChoose={setGroup} options={GROUP_OPTIONS} /></HeaderSlot>

      {/* No Gearbox oil card: HSM has no source for it (the user, 31 Oct 2026). */}
      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        <KpiCard label="Vibration RMS" value={mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1)} unit="mm/s" series="hold" noEntries={!!mid.report && mid.maxMmS === null}
          tone={toneOf(mid.maxMmS, settings.limit('vibration'))}
          /* The machine with the highest reading, and the MID visit it is from (the user, 31 Oct 2026). */
          note="" where={(() => { const t = midTop(mid.machines, mid.date); return t ? { name: t.where, when: `MID · ${midDate(t.date)}` } : null; })()}
          {...(mid.machines.length ? { onOpen: () => setVibOpen(true), openLabel: 'Each machine at the last MID visit' } : {})} />
        <MidVibrationDrawer open={vibOpen} onClose={() => setVibOpen(false)} title={group === 'all' ? 'Whole mill' : `${drive} group`} mid={mid} />
        <KpiCard label="Bearing temp" value={gear.bearing ? fixed(gear.bearing.c, 0) : 'NA'} unit="°C" note="" series="hold"
          loading={!!gid && gear.loading} tone={gear.bearingTone}
          noEntries={!!gid && !!gear.report && !gear.bearing} lastEntry={gear.bearingLast} where={whereOf(gear.bearing)}
          {...(gearCanOpen ? { onOpen: () => setGearOpen('bearing'), openLabel: 'Each stand: gearbox bearings, D and ND side' } : {})} />
        <HsmBearingDrawer open={gearOpen === 'bearing'} onClose={() => setGearOpen(null)} g={gear} title={drive} />
        <KpiCard
          label="Motor temp"
          value={bearingC === null ? 'NA' : fixed(bearingC, 0)}
          noEntries={!!gid && !!load && bearingC === null}
          lastEntry={withWhere(lastFigure(bearingC, loadLast, (d) => figures(d).bearingC, (n) => fixed(n, 0)), loadLast.data ? hsmHottest(figures(loadLast.data).latest) : null)}
          where={(() => { const h = hsmHottest(latest); return h ? { name: h.where, when: whenText(h) } : null; })()}
          unit="°C"
          note=""
          series="hold"
          tone={bearingTone}
          {...(canOpen ? { onOpen: () => setOpen(true), openLabel: 'Each stand: load and DC motor temperatures' } : {})}
        />
        <KpiCard
          label="Motor current"
          value={loadPct === null ? 'NA' : fixed(loadPct, 0)}
          noEntries={!!gid && !!load && loadPct === null}
          lastEntry={lastFigure(loadPct, loadLast, (d) => figures(d).loadPct, (n) => fixed(n, 0))}
          unit="%"
          note=""
          series="prod"
          tone={loadingTone}
          {...(canOpen ? { onOpen: () => setOpen(true), openLabel: 'Each stand: load and DC motor temperatures' } : {})}
        />
        <KpiCard label="Oil temp" value={gear.oil ? fixed(gear.oil.c, 0) : 'NA'} unit="°C" note="" series="hold"
          loading={!!gid && gear.loading} tone={gear.oilTone}
          noEntries={!!gid && !!gear.report && !gear.oil} lastEntry={gear.oilLast} where={whereOf(gear.oil)}
          {...(gearCanOpen ? { onOpen: () => setGearOpen('oil'), openLabel: 'Each lubrication tank' } : {})} />
        <HsmOilDrawer open={gearOpen === 'oil'} onClose={() => setGearOpen(null)} g={gear} title={drive} groups={gid} />
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod"
          noEntries={!!rateS.data && rateS.dataUrl === rateUrl && runH == null}
          lastEntry={lastFigure(runH, rateLast, (d) => d.totals.erpRunH, (n) => fixed(n, 1))} />
      </section>

      <div className="rm-row ah-row--one">
        <Panel title="Condition trends" sub="Every machine, gearbox bearing and motor" className="rm-panel" bodyClass="rm-body ah-trends">
          <MidVibrationTrend mid={mid} />
          {/* Every gearbox bearing of the group's stands, each round; the last entry's when the period has none. */}
          <BearingTrendAll
            points={gear.trend}
            last={gear.trendLast}
            empty={!gid ? 'No bearing temperature source for this group' : gear.report && !gear.report.lastDate ? 'No entries recorded yet in the Bearing Temperature Details form' : 'No bearing readings in this period'} />
          <BearingTrendAll
            what="Motor"
            points={trend.length || !gid || !loadLast.data ? trend : hsmBearingPoints(loadLast.data.entries.filter((e) => inStands(gid, e)))}
            last={!trend.length && gid && loadLast.data ? loadLast.date : null}
            empty={!gid ? 'No motor temperature source for this group' : !load?.lastDate ? 'No entries recorded yet in the Mill Load Log Sheet' : 'No motor temperature readings in this period'} />
        </Panel>
      </div>

      <div className="rm-row ah-row--one">
        <Panel title="Remarks" sub={remarkSummary(mid) ?? undefined} className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <MidRemarks mid={mid} />
        </Panel>
      </div>

      <DrillDrawer open={open} onClose={() => setOpen(false)} title={`${drive} · mill load`} sub="HSM · A · °C"
        loading={!loadS.data && !loadS.error} error={loadS.error} hasData={!!load}>
        {load && (
          <>
            <Stats items={[
              { label: 'Motor current loading', value: loadPct === null ? 'NA' : fixed(loadPct, 0), unit: '% · mean of stands', tone: loadPct === null ? 'v-na' : loadingTone },
              { label: 'Motor current', value: loadA === null ? 'NA' : fixed(loadA, 0), unit: 'A · mean of stands', tone: loadA === null ? 'v-na' : undefined },
              { label: 'Hottest motor', value: bearingC === null ? 'NA' : fixed(bearingC, 0), unit: '°C · DC motor', tone: bearingC === null ? 'v-na' : bearingTone },
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
                        <td className="num r">{motors.rated.get(e.stand) ? fixed(motors.rated.get(e.stand)!, 0) : '—'}</td>
                        <td className={`num r ${toneOf(loadingPct(motors.rated, e.stand, e.loadA), loadingL) ?? 'v-val'}`}>{loadingPct(motors.rated, e.stand, e.loadA) === null ? '—' : fixed(loadingPct(motors.rated, e.stand, e.loadA), 0)}</td>
                        <td className={`num r ${toneOf(e.deTempC, bearingL) ?? ''}`}>{e.deTempC === null ? '—' : fixed(e.deTempC, 0)}</td>
                        <td className={`num r ${toneOf(e.ndeTempC, bearingL) ?? ''}`}>{e.ndeTempC === null ? '—' : fixed(e.ndeTempC, 0)}</td>
                        <td>{dm(e.date)}{e.time ? ` · ${e.time.slice(11, 16)}` : ''} · {e.shift}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {/* The rated current each loading % is worked out with — editable (the user, 31 Oct 2026). */}
            {motors.data && (
              <EquipmentSettings
                title="Motor rated current"
                cols={[{ key: 'a', label: 'Rated current (A)', dp: 0, step: '1' }]}
                rows={motors.data.rows.filter((r) => gid?.some((g) => (g === 'roughing' ? r.stand.startsWith('RM') : r.stand.startsWith('FM'))))
                  .map((r) => ({ id: r.stand, label: r.stand, values: { a: r.ratedCurrentA }, defaults: { a: r.defaultA }, edited: r.edited, editedAt: r.editedAt, editedBy: r.editedBy }))}
                saveUrl={HSM_MOTORS_URL}
                toBody={(changed) => ({ rows: changed.map((c) => ({ stand: c.id, ratedCurrentA: c.values.a })) })}
              />
            )}
            <LimitsNote limits={[loadingL, bearingL]} />
            <SourceBox
              sources={[{ name: 'Logbook', rows: [
                ['Form', 'Electrical HSM → Mill Load Log Sheet'],
                ['Field', 'stand name, load in amp, DC motor DE temp, DC motor NDE temp — by the form\'s date'],
              ] }]}
              formula={[
                'Each stand\'s latest reading of the period; RM stands = roughing, FM stands = finishing',
                'Loading % = load ÷ rated current × 100 per stand (rated current: the table above — the plant\'s motor details, editable)',
                'Motor current = the mean loading % of the group\'s stands',
                'Motor temp = the hottest DC motor DE / NDE temperature of the group\'s stands',
              ]}
            />
            {load.logbook.connection === 'down' && <p className="v-warn">{load.logbook.message}</p>}
          </>
        )}
      </DrillDrawer>
    </div>
  );
}

