'use client';

/**
 * The Settings screen (the user, 19 Nov 2026; SETTINGS_AND_ALERTS_REPLICATION.md §10): every limit of
 * the mill a reading is judged by — and alerts will raise on — with where it came from: the plant's
 * own, a standard placeholder to replace, or "Set by <name> on <date>". Opened from the top bar's
 * Settings button, or a drill-down's "Edit limits" (at that limit).
 *
 * The boxes show the limit in use. Change one, type your name, Save: only the changed limits are
 * sent, checked whole by the backend (every problem listed), saved in IOsense, and every screen
 * reloads with them. A box left empty means no limit on that side; Reset puts the default back.
 * The draft is dropped when the drawer closes or the mill changes, so an edit is never saved
 * against the wrong mill. The equipment the figures are worked out with (HSM motor ratings, RMD
 * tank sizes) sits below, with its own Edit.
 */
import { useEffect, useState } from 'react';
import DrillDrawer from '@/components/drill/DrillDrawer';
import EquipmentSettings from '@/components/asset/EquipmentSettings';
import { dm } from '@/lib/plantDay';
import { postJson, type LimitSetting, type SettingsSaveResult } from '@/services/hsmApi';
import { HSM_MOTORS_URL, RMD_TANKS_URL, useHsmMotorRatings, useRmdOilTanks } from '@/services/equipment';
import { settingsUrl, useMillSettings, type SettingsMill } from '@/services/settings';
import '@/components/plan/plan.css';
import '@/components/checklist/checklist.css';
import '@/components/asset/asset.css';
import './settings.css';

const GROUPS: LimitSetting['group'][] = ['Temperatures', 'Oil', 'Motors', 'Vibration', 'Chemistry', 'Daily production'];
const NAME_KEY = 'rm-settings-name';
const MILL_NAME: Record<SettingsMill, string> = { hsm: 'HSM', rmd: 'RMD', lsm: 'LSM', rms: 'RMS' };

type Draft = Record<string, { min: string; max: string }>;
const text = (v: number | null) => (v === null ? '' : String(v));
const parse = (s: string) => (s.trim() === '' ? null : Number(s));

function savedName(): string {
  try { return window.localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

export default function SettingsDrawer({ mill, focusId, onClose }: { mill: SettingsMill; focusId: string | null; onClose: () => void }) {
  const { data, error } = useMillSettings(mill);
  const [draft, setDraft] = useState<Draft>({});
  const [resets, setResets] = useState<Set<string>>(new Set());
  const [name, setName] = useState(savedName);
  const [status, setStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null);

  // Opened at one limit (a drill-down's "Edit limits"): bring its row into view.
  useEffect(() => {
    if (!focusId || !data) return;
    const row = document.getElementById(`set-${focusId}`);
    row?.scrollIntoView({ block: 'center' });
    row?.querySelector('input')?.focus();
  }, [focusId, data]);

  const valueOf = (l: LimitSetting) => draft[l.id] ?? { min: text(l.min), max: text(l.max) };
  const changedIds = Object.keys(draft).filter((id) => {
    const l = data?.limits.find((x) => x.id === id);
    return l && (parse(draft[id].min) !== l.min || parse(draft[id].max) !== l.max);
  });
  const pending = changedIds.length + [...resets].filter((id) => !draft[id]).length;

  const edit = (l: LimitSetting, side: 'min' | 'max', v: string) => {
    // After Reset the boxes show the default: typing starts from it.
    const base = resets.has(l.id) && !draft[l.id] ? { min: text(l.defaults.min), max: text(l.defaults.max) } : valueOf(l);
    setDraft((d) => ({ ...d, [l.id]: { ...base, [side]: v } }));
    setResets((r) => { const n = new Set(r); n.delete(l.id); return n; });
    setStatus(null);
  };
  const reset = (l: LimitSetting) => {
    setDraft((d) => { const n = { ...d }; delete n[l.id]; return n; });
    setResets((r) => new Set(r).add(l.id));
    setStatus(null);
  };
  const discard = () => { setDraft({}); setResets(new Set()); setStatus(null); };

  const save = async () => {
    if (!data || !pending) return;
    if (!name.trim()) { setStatus({ kind: 'error', text: 'Type your name, so everyone can see who set these limits.' }); return; }
    const bad = changedIds.find((id) => [draft[id].min, draft[id].max].some((s) => s.trim() !== '' && !Number.isFinite(Number(s))));
    if (bad) { setStatus({ kind: 'error', text: `${data.limits.find((l) => l.id === bad)!.label}: enter a number.` }); return; }
    const limits: Record<string, { min: number | null; max: number | null } | null> = {};
    for (const id of resets) limits[id] = null;
    for (const id of changedIds) limits[id] = { min: parse(draft[id].min), max: parse(draft[id].max) };
    try { window.localStorage.setItem(NAME_KEY, name.trim()); } catch { /* the name is only a convenience */ }
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      const r = await postJson<SettingsSaveResult>(settingsUrl(mill), { by: name.trim(), limits });
      discard();
      setStatus({ kind: 'saved', text: r.changed
        ? `Saved — ${r.changed} limit${r.changed === 1 ? '' : 's'} changed. Every screen now uses ${r.changed === 1 ? 'it' : 'them'}.`
        : 'Nothing was different from what is saved.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  const down = data?.store.connection === 'down';
  const controls = (
    <div className="set-bar">
      <label className="set-name">
        <span className="rm-k">Your name</span>
        <input className="pc-in" type="text" value={name} maxLength={60} placeholder="Name" onChange={(e) => setName(e.target.value)} aria-label="Your name" />
      </label>
      <span className="set-actions">
        {pending > 0 && <span className="set-pending">{pending} change{pending === 1 ? '' : 's'} not saved</span>}
        <button type="button" className="pc-btn" onClick={discard} disabled={!pending || status?.kind === 'saving'}>Cancel</button>
        <button type="button" className="ck-save" onClick={save} disabled={!pending || down || status?.kind === 'saving'}>Save</button>
      </span>
    </div>
  );

  return (
    <DrillDrawer open onClose={onClose} title={`${MILL_NAME[mill]} · Settings`} sub="The limits every screen judges a reading by — and alerts will raise on"
      controls={controls} loading={!data && !error} error={error} hasData={!!data}>
      {data && (
        <>
          {status && <p role="status" className={`set-msg${status.kind === 'error' ? ' set-msg--error' : ''}`}>{status.text}</p>}
          <p className={`set-store${down ? ' v-warn' : ''}`}>
            {data.store.message}
            {!down && data.store.updatedAt && <> · last change {dm(data.store.updatedAt.slice(0, 10))}{data.store.updatedBy ? ` by ${data.store.updatedBy}` : ''}</>}
          </p>
          {GROUPS.map((g) => {
            const rows = data.limits.filter((l) => l.group === g);
            if (!rows.length) return null;
            return (
              <section key={g} className="set-group" aria-label={g}>
                <h3 className="rm-k">{g}</h3>
                <div className="pd-table-wrap">
                  <table className="grid pd-table set-table" aria-label={`${g} limits`}>
                    <colgroup><col className="set-c-label" /><col className="set-c-num" /><col className="set-c-num" /><col className="set-c-src" /></colgroup>
                    <thead><tr><th>Limit</th><th className="r">Min</th><th className="r">Max</th><th>Where it comes from</th></tr></thead>
                    <tbody>
                      {rows.map((l) => {
                        const v = valueOf(l);
                        const changed = changedIds.includes(l.id);
                        const resetting = resets.has(l.id) && !draft[l.id];
                        return (
                          <tr key={l.id} id={`set-${l.id}`} className={focusId === l.id ? 'set-focus' : undefined}>
                            <td>
                              <b>{l.label}</b> <span className="set-unit">{l.unit}</span>
                              <span className="set-reading">{l.reading}</span>
                            </td>
                            {(['min', 'max'] as const).map((side) => (
                              <td key={side} className="num r">
                                <input className="pc-in set-in" type="number" step="any" inputMode="decimal" value={resetting ? text(l.defaults[side]) : v[side]}
                                  placeholder="none" aria-label={`${l.label} ${side === 'min' ? 'minimum' : 'maximum'} (${l.unit})`}
                                  onChange={(e) => edit(l, side, e.target.value)} />
                              </td>
                            ))}
                            <td className="set-source">
                              <SourceChip l={l} changed={changed} resetting={resetting} />
                              {l.source === 'edited' && !resetting && (
                                <button type="button" className="set-reset" onClick={() => reset(l)}
                                  title={`Back to the default: ${limitPair(l.defaults.min, l.defaults.max, l.unit)}`}>Reset</button>
                              )}
                              <span className="set-basis">{l.defaults.basis}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {mill === 'hsm' && <HsmMotors />}
          {mill === 'rmd' && <RmdTanks />}
        </>
      )}
    </DrillDrawer>
  );
}

const limitPair = (min: number | null, max: number | null, unit: string) =>
  (min === null && max === null ? 'no limit' : `${min ?? '—'} to ${max ?? '—'} ${unit}`);

/** Where the limit in use came from, in words. */
function SourceChip({ l, changed, resetting }: { l: LimitSetting; changed: boolean; resetting: boolean }) {
  if (changed) return <span className="chip chip--info">Changed — not saved</span>;
  if (resetting) return <span className="chip chip--info">Back to the default on Save</span>;
  if (l.source === 'edited') return <span className="chip chip--ok">Set by {l.setBy ?? 'the plant'}{l.setAt ? ` · ${dm(l.setAt.slice(0, 10))}` : ''}</span>;
  if (l.source === 'plant') return <span className="chip chip--ok">Plant&apos;s limit</span>;
  if (l.source === 'placeholder') return <span className="chip chip--warn" title="A standard figure to start with — replace it with the plant's own">Standard placeholder</span>;
  return <span className="chip chip--na">Not set — no alert</span>;
}

/** HSM: each stand motor's rated current, which Motor loading % is worked out with. */
function HsmMotors() {
  const motors = useHsmMotorRatings();
  if (!motors.data) return null;
  return (
    <section className="set-group" aria-label="Equipment">
      <h3 className="rm-k">Equipment</h3>
      <EquipmentSettings
        title="Motor rated current"
        cols={[{ key: 'a', label: 'Rated current (A)', dp: 0, step: '1' }]}
        rows={motors.data.rows.map((r) => ({ id: r.stand, label: r.stand, values: { a: r.ratedCurrentA }, defaults: { a: r.defaultA }, edited: r.edited, editedAt: r.editedAt, editedBy: r.editedBy }))}
        saveUrl={HSM_MOTORS_URL}
        toBody={(changed) => ({ rows: changed.map((c) => ({ stand: c.id, ratedCurrentA: c.values.a })) })}
      />
    </section>
  );
}

/** RMD: each gearbox oil tank's inside size, which the level in litres and % full are worked out with. */
function RmdTanks() {
  const tanks = useRmdOilTanks();
  if (!tanks.data) return null;
  return (
    <section className="set-group" aria-label="Equipment">
      <h3 className="rm-k">Equipment</h3>
      <EquipmentSettings
        title="Oil tank size"
        cols={[{ key: 'l', label: 'Length (m)', dp: 2, step: '0.01' }, { key: 'w', label: 'Width (m)', dp: 2, step: '0.01' }, { key: 'd', label: 'Depth (m)', dp: 2, step: '0.01' }]}
        derivedLabel="Capacity (L)"
        rows={tanks.data.rows.map((r) => ({
          id: r.tank, label: r.label, values: { l: r.lengthM, w: r.widthM, d: r.depthM },
          defaults: { l: r.defaults.lengthM, w: r.defaults.widthM, d: r.defaults.depthM },
          edited: r.edited, editedAt: r.editedAt, editedBy: r.editedBy,
          derived: (v) => (Number.isFinite(v.l * v.w * v.d) ? Math.round(v.l * v.w * v.d * 1000).toLocaleString('en-IN') : '—'),
        }))}
        saveUrl={RMD_TANKS_URL}
        toBody={(changed) => ({ rows: changed.map((c) => ({ tank: c.id, lengthM: c.values.l, widthM: c.values.w, depthM: c.values.d })) })}
      />
    </section>
  );
}
