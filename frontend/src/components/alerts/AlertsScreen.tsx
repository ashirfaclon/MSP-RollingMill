'use client';

/**
 * Alerts (the user, 19 Nov 2026; SETTINGS_AND_ALERTS_REPLICATION.md §10.3): what is past its limit on
 * the mill now, and the data checks that failed — from the backend's one checker, which reads the same
 * forms and limits Asset Health colours by, so the two never disagree.
 *
 *   Limits crossed   one row per point: the reading, its limit, since when, how many readings; a crossing
 *                    that cleared stays a week, softly
 *   Data checks      forms not filled, typing slips, forms that can't be read: shown here, and by
 *                    default never sent as a message
 *
 * An alert switched off in Settings still shows, muted (§6.1). No demo rows: an invented alert looks
 * identical to a real one (§10.3). Until the alert sender runs, the page says nothing is sent.
 */
import KpiCard from '@/components/visualization/KpiCard';
import Panel from '@/components/Panel';
import { dm } from '@/lib/plantDay';
import type { Alarm, AlertSeverity, AlertsReport } from '@/services/hsmApi';
import { SEVERITY_LABEL, useMillAlerts } from '@/services/alerts';
import { openAlertSettings, type SettingsMill } from '@/services/settings';
import '@/components/visualization/visualization.css';
import '@/components/asset/asset.css';
import '@/components/production/production-drawer.css';
import '@/components/settings/settings.css';
import './alerts.css';

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
const withUnit = (v: number, unit: string) => (unit.startsWith('%') ? `${fmt(v)}${unit}` : `${fmt(v)} ${unit}`);

/** "18 Nov 14:20", or "18 Nov" when the form gave no time. */
export function whenOf(at: string): string {
  if (!at) return '—';
  const time = /(\d{1,2}:\d{2})/.exec(at.slice(10))?.[1];
  return time ? `${dm(at.slice(0, 10))} ${time}` : dm(at.slice(0, 10));
}
/** When the checker ran, IST: "19 Nov, 18:40". */
const checkedAt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const limitOf = (a: Alarm) => {
  if (!a.limit) return '—';
  const { min, max } = a.limit;
  if (min !== null && max !== null) return `${withUnit(min, a.unit)} – ${withUnit(max, a.unit)}`;
  return max !== null ? `max ${withUnit(max, a.unit)}` : `min ${withUnit(min!, a.unit)}`;
};

const RANK: Record<AlertSeverity, number> = { data: 0, warning: 1, critical: 2 };

/** Whether this row will send a message: on, off in Settings, or below the alert's "Messages from" (screen only). */
function Messages({ a, report }: { a: Alarm; report: AlertsReport }) {
  if (a.muted) return <span className="pill pill--na" title="Messages are off for this alert in Settings — it still shows here">Off</span>;
  const floor = (report.rules.find((r) => r.ruleId === a.ruleId)?.controls ?? report.defaults).minSeverityToNotify;
  return RANK[a.severity] < RANK[floor]
    ? <span className="al-on" title={`Messages are sent from ${SEVERITY_LABEL[floor].toLowerCase()} up for this alert`}>Screen only</span>
    : <span className="al-on al-on--yes">On</span>;
}

export default function AlertsScreen({ mill }: { mill: SettingsMill }) {
  const { data, error } = useMillAlerts(mill);
  const limitRows = data?.alarms.filter((a) => a.kind === 'limit') ?? [];
  const dataRows = data?.alarms.filter((a) => a.kind !== 'limit') ?? [];
  const loading = !data && !error;
  const n = (v: number | undefined) => (v === undefined ? 'NA' : String(v));

  return (
    <div className="rm-viz al">
      {data && (
        <p className="al-banner" role="note">
          <b>{data.sender.message}</b>
          {data.store.connection === 'down' && <> {data.store.message}.</>}
        </p>
      )}
      {error && !data && <p className="al-banner al-banner--error" role="alert">The alerts can&apos;t be loaded: {error}</p>}

      <section className="rm-strip ah-strip ah-strip--four" aria-label="Alert counts">
        <KpiCard label="Critical" value={n(data?.counts.critical)} unit="now" note="Far past the limit, or past it a week" series="hold" loading={loading}
          tone={data ? (data.counts.critical ? 'v-risk' : 'v-ok') : undefined} />
        <KpiCard label="Warning" value={n(data?.counts.warning)} unit="now" note="Past the limit" series="hold" loading={loading}
          tone={data ? (data.counts.warning ? 'v-warn' : 'v-ok') : undefined} />
        <KpiCard label="Data checks" value={n(data?.counts.data)} unit="now" note="Not filled, a typing slip, can't be read" series="hold" loading={loading} />
        <KpiCard label="Cleared" value={n(data?.counts.cleared)} unit="last 7 days" note="Back inside the limit" series="hold" loading={loading} />
      </section>

      <div className="rm-row ah-row--one">
        <Panel title="Limits crossed" sub={data ? `Readings of the last ${data.windowDays} days against the limits in Settings · checked ${checkedAt(data.checkedAt)}` : undefined}
          className="rm-panel" bodyClass="rm-body">
          {data && !limitRows.length && <p className="al-empty">Nothing past its limit. Every reading of the last {data.windowDays} days is inside the limits in Settings.</p>}
          {limitRows.length > 0 && (
            <div className="pd-table-wrap">
              <table className="grid al-table" aria-label="Limits crossed">
                <thead>
                  <tr>
                    <th>Severity</th><th>Where</th><th>What</th><th className="r">Reading</th><th>Limit</th>
                    <th>Since</th><th className="r">Readings out</th><th>Status</th><th>Messages</th><th aria-label="Settings" />
                  </tr>
                </thead>
                <tbody>
                  {limitRows.map((a) => (
                    <tr key={a.key} className={`${a.muted ? 'al-row--muted' : ''}${a.active ? '' : ' al-row--cleared'}`}>
                      <td><span className={`pill pill--${a.active ? a.severity : 'cleared'}`}>{a.active ? SEVERITY_LABEL[a.severity] : 'Cleared'}</span>{a.severityPinned && <span className="al-pin" title="Severity set in Settings">set</span>}</td>
                      <td><b>{a.asset}</b>{a.point && <span className="al-sub">{a.point}</span>}</td>
                      <td>{a.label}<span className="al-sub">{a.source}</span></td>
                      <td className={`num r ${a.active ? (a.severity === 'critical' ? 'v-risk' : 'v-warn') : ''}`}>
                        {a.value === null ? '—' : withUnit(a.value, a.unit)}
                        {a.worst !== null && a.worst !== a.value && <span className="al-sub">worst {withUnit(a.worst, a.unit)}</span>}
                      </td>
                      <td className="num">{limitOf(a)}</td>
                      <td>{whenOf(a.since)}{a.occurrences > 1 && <span className="al-sub">{a.occurrences} times in {data!.windowDays} days</span>}</td>
                      <td className="num r">{a.readings}</td>
                      <td>{a.active ? <>Active<span className="al-sub">last {whenOf(a.lastAt)}</span></> : <>Back inside<span className="al-sub">{whenOf(a.clearedAt ?? '')}</span></>}</td>
                      <td><Messages a={a} report={data!} /></td>
                      <td><button type="button" className="set-link" onClick={() => openAlertSettings(a.ruleId)} aria-label={`Settings for ${a.label}`}>Settings</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="rm-row ah-row--one">
        <Panel title="Data checks" sub="Readings that can't be trusted — shown here; not sent as messages unless set in Settings" className="rm-panel" bodyClass="rm-body">
          {data && !dataRows.length && <p className="al-empty">Every form is filled and readable, and no reading looks like a typing slip.</p>}
          {dataRows.length > 0 && (
            <div className="pd-table-wrap">
              <table className="grid al-table" aria-label="Data checks">
                <thead><tr><th>Check</th><th>What happened</th><th>Since</th><th>Messages</th><th aria-label="Settings" /></tr></thead>
                <tbody>
                  {dataRows.map((a) => (
                    <tr key={a.key} className={a.muted ? 'al-row--muted' : undefined}>
                      <td><span className="pill pill--data">{a.kind === 'stale' ? 'Not filled' : a.kind === 'entry' ? 'Typing slip' : "Can't be read"}</span></td>
                      <td>{a.message}</td>
                      <td>{a.since ? whenOf(a.since) : '—'}</td>
                      <td><Messages a={a} report={data!} /></td>
                      <td><button type="button" className="set-link" onClick={() => openAlertSettings(a.ruleId)} aria-label={`Settings for ${a.label}`}>Settings</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {data && data.counts.noLimit > 0 && (
        <p className="al-foot">
          {data.counts.noLimit} alert{data.counts.noLimit === 1 ? ' has' : 's have'} no limit yet and can&apos;t raise:{' '}
          {data.rules.filter((r) => !r.canFire).map((r) => r.label).join(', ')}. Set one in Settings → Limits.
        </p>
      )}
    </div>
  );
}
