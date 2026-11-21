'use client';

/**
 * The Settings screen's Alerts tab (the user, 19 Nov 2026; SETTINGS_AND_ALERTS_REPLICATION.md §6, §10.2):
 * when each of the mill's alerts sends a message. The limits themselves are on the Limits tab — one
 * limit sheet, not two.
 *
 *   Mill defaults   apply to every alert of the mill that has no setting of its own
 *   Each alert      its own setting, over the mill's; a blank box takes the mill's (shown greyed)
 *
 * Drafts are strings (an input mid-typing is "6" on the way to "60"); only changed boxes are sent, a
 * cleared box as null (back to the layer below). Checked whole by the backend, every problem listed.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { dm } from '@/lib/plantDay';
import { postJson, type AlertControls, type AlertControlsPatch, type AlertField, type AlertRuleInfo, type AlertsReport, type SettingsSaveResult } from '@/services/hsmApi';
import { alertSettingsUrl, SEVERITY_LABEL, useMillAlerts } from '@/services/alerts';
import { openSettings, type SettingsMill } from '@/services/settings';

type Draft = Record<string, string>;
const SEVERITIES = ['critical', 'warning', 'data'] as const;
/** Data checks are never sent (the user, 21 Nov 2026): messages are from critical, or from warning up. */
const FLOORS = ['critical', 'warning'] as const;

/** A field as the box shows it. Deadband: "2" (%), or "1.5 abs". */
function show(f: AlertField, c: AlertControls): string {
  const v = c[f];
  if (f === 'enabled') return v ? 'on' : 'off';
  if (f === 'deadband') { const d = v as AlertControls['deadband']; return d.mode === 'absolute' ? `${d.value} abs` : String(d.value); }
  return v === null ? '' : String(v);
}
/** What a placeholder says for an inherited value. */
function words(f: AlertField, c: AlertControls, unit = ''): string {
  const v = c[f];
  if (f === 'enabled') return v ? 'On' : 'Off';
  if (f === 'severityOverride') return v === null ? 'Auto' : SEVERITY_LABEL[v as keyof typeof SEVERITY_LABEL];
  if (f === 'minSeverityToNotify') return SEVERITY_LABEL[v as keyof typeof SEVERITY_LABEL];
  if (f === 'deadband') { const d = v as AlertControls['deadband']; return d.mode === 'absolute' ? `${d.value} ${unit}` : `${d.value} %`; }
  return String(v);
}
/** A box's text → the value sent; undefined when it can't be read (refused before sending). */
function parse(f: AlertField, s: string): AlertControls[AlertField] | undefined {
  const t = s.trim();
  if (f === 'enabled') return t === 'on' ? true : t === 'off' ? false : undefined;
  if (f === 'severityOverride') return (SEVERITIES as readonly string[]).includes(t) ? t as AlertControls['severityOverride'] : undefined;
  if (f === 'minSeverityToNotify') return (FLOORS as readonly string[]).includes(t) ? t as AlertControls['minSeverityToNotify'] : undefined;
  if (f === 'deadband') {
    const m = /^(\d+(?:\.\d+)?)\s*(abs)?$/.exec(t);
    return m ? { mode: m[2] ? 'absolute' : 'pct-of-band', value: Number(m[1]) } : undefined;
  }
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : undefined;
}

const COLS: { f: AlertField; label: string; title: string }[] = [
  { f: 'enabled', label: 'Messages', title: 'Send a message for this alert. Off still lists it on the Alerts page.' },
  { f: 'onDelayReadings', label: 'Readings in a row', title: 'Readings past the limit in a row before it raises (1 = the first one)' },
  { f: 'staleDays', label: 'Days without entry', title: 'Days without an entry in the form before it raises' },
  { f: 'deadband', label: 'Deadband', title: 'Back inside the limit by this much before it counts as normal again: a % of the band, or an amount in the reading\'s unit' },
  { f: 'severityOverride', label: 'Severity', title: 'Fix the severity, or leave it Auto: worked out from the reading (critical when far past the limit, or past it a week)' },
  { f: 'minSeverityToNotify', label: 'Messages from', title: 'The least severe alarm that sends a message. Data checks are never sent.' },
];

/** The Alerts tab: its draft, its save, and what it draws. The drawer shows the controls of the tab open. */
export function useAlertSettings(mill: SettingsMill, name: string, focusId: string | null, active: boolean) {
  const { data, error } = useMillAlerts(mill);
  const [draft, setDraft] = useState<Draft>({});
  const [resets, setResets] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!active || !focusId || !data) return;
    const row = document.getElementById(`al-${focusId}`);
    row?.scrollIntoView({ block: 'center' });
  }, [active, focusId, data]);

  /** A box's saved value: the rule's (or the mill's) own setting; '' when it inherits. */
  const own = (key: string): string => {
    if (!data) return '';
    const [layer, id, f] = key.split('|') as ['def' | 'rule', string, AlertField];
    if (layer === 'def') return data.defaultsFrom[f] === 'mill' ? show(f, data.defaults) : '';
    const r = data.rules.find((x) => x.ruleId === id);
    return r && r.from[f] === 'rule' ? show(f, r.controls) : '';
  };
  const valueOf = (key: string) => (resets.has(key.split('|')[1]) && key.startsWith('rule|') ? '' : draft[key] ?? own(key));
  const changed = Object.keys(draft).filter((k) => draft[k].trim() !== own(k));
  const resetIds = [...resets];
  const pending = changed.length + resetIds.length;

  const edit = (key: string, v: string) => {
    setDraft((d) => ({ ...d, [key]: v }));
    const id = key.split('|')[1];
    if (key.startsWith('rule|') && resets.has(id)) setResets((r) => { const n = new Set(r); n.delete(id); return n; });
    setStatus(null);
  };
  const reset = (id: string) => {
    setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith(`rule|${id}|`))));
    setResets((r) => new Set(r).add(id));
    setStatus(null);
  };
  const discard = () => { setDraft({}); setResets(new Set()); setStatus(null); };

  const save = async () => {
    if (!data || !pending) return;
    if (!name.trim()) { setStatus({ kind: 'error', text: 'Type your name, so everyone can see who changed these alerts.' }); return; }
    const defaults: AlertControlsPatch = {};
    const rules: Record<string, AlertControlsPatch | null> = {};
    for (const id of resetIds) rules[id] = null;
    for (const k of changed) {
      const [layer, id, f] = k.split('|') as ['def' | 'rule', string, AlertField];
      if (layer === 'rule' && resets.has(id)) continue;
      const text = draft[k].trim();
      const v = text === '' ? null : parse(f, text);
      if (v === undefined) {
        const label = layer === 'def' ? 'Mill defaults' : data.rules.find((r) => r.ruleId === id)?.label ?? id;
        setStatus({ kind: 'error', text: `${label}: ${COLS.find((c) => c.f === f)!.label.toLowerCase()} — enter ${f === 'deadband' ? 'a number (a %), or a number and "abs" for an amount' : 'a whole number'}.` });
        return;
      }
      const patch = layer === 'def' ? defaults : ((rules[id] as AlertControlsPatch | undefined) ?? (rules[id] = {}));
      (patch as Record<string, unknown>)[f] = v;
    }
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      const body = { by: name.trim(), ...(Object.keys(defaults).length ? { defaults } : {}), ...(Object.keys(rules).length ? { rules } : {}) };
      const r = await postJson<SettingsSaveResult>(alertSettingsUrl(mill), body);
      discard();
      setStatus({ kind: 'saved', text: r.changed ? `Saved — ${r.changed} setting${r.changed === 1 ? '' : 's'} changed. The Alerts page uses ${r.changed === 1 ? 'it' : 'them'} now.` : 'Nothing was different from what is saved.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  const body = data ? <AlertsBody data={data} focusId={focusId} valueOf={valueOf} edit={edit} reset={reset} resets={resets} changed={changed} /> : null;
  return { data, error, pending, discard, save, status, body, down: data?.store.connection === 'down' };
}

function AlertsBody({ data, focusId, valueOf, edit, reset, resets, changed }: {
  data: AlertsReport; focusId: string | null; valueOf: (k: string) => string;
  edit: (k: string, v: string) => void; reset: (id: string) => void; resets: Set<string>; changed: string[];
}) {
  const groups: { title: string; kind: AlertRuleInfo['kind'] }[] = [
    { title: 'Limits', kind: 'limit' }, { title: 'Forms not filled', kind: 'stale' }, { title: 'Typing slips', kind: 'entry' },
  ];
  const cell = (key: string, f: AlertField, inherited: string, label: string, unit = ''): ReactNode => {
    const v = valueOf(key);
    const edited = changed.includes(key);
    const cls = `pc-in al-in${edited ? ' al-in--edited' : ''}`;
    if (f === 'enabled' || f === 'severityOverride' || f === 'minSeverityToNotify') {
      const opts = f === 'enabled' ? [['on', 'On'], ['off', 'Off']] : (f === 'minSeverityToNotify' ? FLOORS : SEVERITIES).map((s) => [s, SEVERITY_LABEL[s]]);
      return (
        <select className={cls} value={v} onChange={(e) => edit(key, e.target.value)} aria-label={label}>
          <option value="">{inherited}</option>
          {opts.map(([o, t]) => <option key={o} value={o}>{t}</option>)}
        </select>
      );
    }
    return <input className={cls} type="text" inputMode="decimal" value={v} placeholder={inherited} aria-label={label}
      title={f === 'deadband' && unit ? `A % of the band, or e.g. "1 abs" for 1 ${unit}` : undefined} onChange={(e) => edit(key, e.target.value)} />;
  };

  return (
    <>
      <p className="set-store">{data.sender.message} Set here when each alert will send a message; the Alerts page lists every alert either way. Who is told, and how often, is on the Escalation matrix tab.</p>
      <section className="set-group" aria-label="Mill defaults">
        <h3 className="rm-k">Mill defaults</h3>
        <p className="set-note-src">For every alert below with no setting of its own. A blank box keeps the standard setting, shown in grey.</p>
        <div className="pd-table-wrap">
          <table className="grid pd-table set-table al-set-table" aria-label="Mill defaults">
            <thead><tr>{COLS.filter((c) => c.f !== 'staleDays').map((c) => <th key={c.f} title={c.title}>{c.label}</th>)}</tr></thead>
            <tbody>
              <tr>
                {COLS.filter((c) => c.f !== 'staleDays').map((c) => (
                  <td key={c.f}>{cell(`def||${c.f}`, c.f, words(c.f, data.shipped), `Mill default: ${c.label}`)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {groups.map((g) => {
        const rules = data.rules.filter((r) => r.kind === g.kind);
        if (!rules.length) return null;
        const cols = COLS.filter((c) => rules[0].applies.includes(c.f));
        return (
          <section key={g.kind} className="set-group" aria-label={`${g.title} alerts`}>
            <h3 className="rm-k">{g.title}</h3>
            <div className="pd-table-wrap">
              <table className="grid pd-table set-table al-set-table" aria-label={`${g.title} alerts`}>
                <thead><tr><th className="al-c-rule">Alert</th>{cols.map((c) => <th key={c.f} title={c.title}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {rules.map((r) => {
                    const tuned = Object.values(r.from).includes('rule');
                    const resetting = resets.has(r.ruleId);
                    const ruleChanged = changed.some((k) => k.startsWith(`rule|${r.ruleId}|`));
                    return (
                      <tr key={r.ruleId} id={`al-${r.ruleId}`} className={`${focusId === r.ruleId ? 'set-focus' : ''}${r.canFire ? '' : ' al-set-off'}`}>
                        <td className="al-c-rule">
                          <b>{r.label}</b>
                          {r.kind === 'limit' && (
                            <span className="set-reading">
                              {r.canFire ? limitWords(r) : 'No limit yet — can\'t raise'}{' · '}
                              <button type="button" className="set-reset" onClick={() => openSettings(r.limitId ?? undefined)}>{r.canFire ? 'Change limit' : 'Set a limit'}</button>
                            </span>
                          )}
                          {r.kind !== 'limit' && <span className="set-reading">{r.kind === 'stale' ? 'A data check: no entry in the form for that many days' : 'A reading that can\'t be real is listed, not judged'}</span>}
                          {(ruleChanged || resetting || tuned) && (
                            <span className="set-reading">
                              {ruleChanged ? <span className="chip chip--info">Changed — not saved</span>
                                : resetting ? <span className="chip chip--info">Back to the mill&apos;s on Save</span>
                                  : <span className="chip chip--ok">Set by {r.setBy ?? 'the plant'}{r.setAt ? ` · ${dm(r.setAt.slice(0, 10))}` : ''}</span>}
                              {tuned && !resetting && <> <button type="button" className="set-reset" onClick={() => reset(r.ruleId)}>Reset</button></>}
                            </span>
                          )}
                        </td>
                        {cols.map((c) => (
                          <td key={c.f}>{cell(`rule|${r.ruleId}|${c.f}`, c.f, words(c.f, r.inherited, r.unit), `${r.label}: ${c.label}`, r.unit)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

const limitWords = (r: AlertRuleInfo) => {
  const u = r.unit.startsWith('%') ? r.unit : ` ${r.unit}`;
  const { min, max } = r.limit!;
  if (min !== null && max !== null) return `Limit ${min}–${max}${u}`;
  return max !== null ? `Limit max ${max}${u}` : `Limit min ${min}${u}`;
};
