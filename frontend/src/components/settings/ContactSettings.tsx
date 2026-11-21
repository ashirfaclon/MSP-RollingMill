'use client';

/**
 * The Settings screen's "Escalation matrix" tab (named so by the user, 21 Nov 2026; was "Who is told") (the user, 21 Nov 2026; SMS-ALERTS.md §5.5): the mill's
 * contact list — one per mill. Up to 10 levels, each with how often it is told and three channels
 * (SMS, WhatsApp, email), each switchable, each a comma-separated list. Plus the one switch:
 * one message per crossing (level 1 only), or every level on its own interval.
 *
 * The draft is the whole list as typed; Save sends it whole and the backend checks it (phones
 * normalised, a channel on with nobody refused — every problem listed). A channel switched off keeps
 * its contacts, so switching it back on needs no retyping.
 */
import { useState } from 'react';
import { dm } from '@/lib/plantDay';
import { postJson, type AlertsReport, type EscalationLevel, type MillEscalation, type SettingsSaveResult } from '@/services/hsmApi';
import { alertSettingsUrl, useMillAlerts } from '@/services/alerts';
import type { SettingsMill } from '@/services/settings';

const MAX_LEVELS = 10;
const CHANNELS = [
  { id: 'sms', label: 'SMS', hint: 'Phone numbers, e.g. +91 98765 43210' },
  { id: 'whatsapp', label: 'WhatsApp', hint: 'Phone numbers, e.g. +91 98765 43210' },
  { id: 'email', label: 'Email', hint: 'Email ids, e.g. shift.engineer@mspsteel.com' },
] as const;
type ChannelId = typeof CHANNELS[number]['id'];

interface DraftLevel { every: string; channels: Record<ChannelId, { on: boolean; text: string }> }
interface Draft { onePerCrossing: boolean; levels: DraftLevel[] }

const draftOf = (e: MillEscalation): Draft => ({
  onePerCrossing: e.onePerCrossing,
  levels: e.levels.map((l) => ({
    every: String(l.everyMinutes),
    channels: { sms: { on: l.sms.enabled, text: l.sms.contacts.join(', ') }, whatsapp: { on: l.whatsapp.enabled, text: l.whatsapp.contacts.join(', ') }, email: { on: l.email.enabled, text: l.email.contacts.join(', ') } },
  })),
});
const blankLevel = (): DraftLevel => ({ every: '0', channels: { sms: { on: true, text: '' }, whatsapp: { on: false, text: '' }, email: { on: false, text: '' } } });
const listOf = (t: string) => t.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

/** The draft as the backend takes it; the minutes as typed (a bad one is refused there, in words). */
function bodyOf(d: Draft): Pick<MillEscalation, 'onePerCrossing' | 'levels'> {
  return {
    onePerCrossing: d.onePerCrossing,
    levels: d.levels.map((l): EscalationLevel => {
      const ch = (id: ChannelId) => ({ enabled: l.channels[id].on, contacts: listOf(l.channels[id].text) });
      return { everyMinutes: l.every.trim() === '' ? 0 : Number(l.every), sms: ch('sms'), whatsapp: ch('whatsapp'), email: ch('email') };
    }),
  };
}
/** Compared as sent, so "a,b" and "a, b" are the same list. */
const same = (a: Draft, b: Draft) => JSON.stringify(bodyOf(a)) === JSON.stringify(bodyOf(b));

export function useContactSettings(mill: SettingsMill, name: string) {
  const { data, error } = useMillAlerts(mill);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null);
  const saved = data ? draftOf(data.escalation) : null;
  const shown = draft ?? saved;
  const pending = draft && saved && !same(draft, saved) ? 1 : 0;

  const change = (fn: (d: Draft) => Draft) => {
    if (!shown) return;
    setDraft(fn(structuredClone(shown)));
    setStatus(null);
  };
  const discard = () => { setDraft(null); setStatus(null); };
  const save = async () => {
    if (!draft || !pending) return;
    if (!name.trim()) { setStatus({ kind: 'error', text: 'Type your name, so everyone can see who changed the contacts.' }); return; }
    const bad = draft.levels.findIndex((l) => l.every.trim() !== '' && !/^\d+$/.test(l.every.trim()));
    if (bad >= 0) { setStatus({ kind: 'error', text: `Level ${bad + 1}: every — enter whole minutes (0 = once, with the first alert).` }); return; }
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      await postJson<SettingsSaveResult>(alertSettingsUrl(mill), { by: name.trim(), escalation: bodyOf(draft) });
      setDraft(null);
      setStatus({ kind: 'saved', text: 'Saved — the alert sender uses this list within two minutes.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  const body = data && shown ? <ContactsBody data={data} draft={shown} change={change} /> : null;
  return { data, error, pending, discard, save, status, body, down: data?.store.connection === 'down' };
}

function ContactsBody({ data, draft, change }: { data: AlertsReport; draft: Draft; change: (fn: (d: Draft) => Draft) => void }) {
  const e = data.escalation;
  const mill = data.mill.toUpperCase();
  return (
    <>
      <p className="set-store">
        {data.sender.message} Who is told when an alert of {mill} sends a message. Each message goes to the plant&apos;s n8n workflow,
        which sends the SMS, WhatsApp and email to exactly the people below. Data checks are never sent.
      </p>
      {(e.setBy || e.setAt) && <span className="chip chip--ok ct-set">Set by {e.setBy ?? 'the plant'}{e.setAt ? ` · ${dm(e.setAt.slice(0, 10))}` : ''}</span>}

      <section className="set-group" aria-label="How often">
        <h3 className="rm-k">How often</h3>
        <label className="ct-switch">
          <input type="checkbox" checked={draft.onePerCrossing} onChange={(ev) => change((d) => ({ ...d, onePerCrossing: ev.target.checked }))} />
          <span>
            <b>One message per crossing</b>
            <span className="set-reading">
              On: when a reading goes past its limit, level 1 is told once. Nothing more until it is back inside and goes out again.
              Off: each level is told on its own &quot;every&quot; while the reading stays out (below).
            </span>
          </span>
        </label>
        {draft.onePerCrossing && draft.levels.length > 1 && (
          <p className="ct-warn" role="note">With one message per crossing on, only level 1 is told — levels 2 and above wait until it is off.</p>
        )}
      </section>

      <section className="set-group" aria-label="Levels">
        <h3 className="rm-k">Levels</h3>
        {!draft.levels.length && <p className="set-note-src">No one yet. Messages still go to the workflow, with nobody named on them. Add level 1 below.</p>}
        {draft.levels.map((l, i) => (
          <fieldset key={i} className="ct-level" aria-label={`Level ${i + 1}`}>
            <legend className="ct-legend">
              <b>Level {i + 1}</b>
              <button type="button" className="set-reset" onClick={() => change((d) => ({ ...d, levels: d.levels.filter((_, j) => j !== i) }))}>Remove</button>
            </legend>
            <label className="ct-every">
              <span>Every</span>
              <input className="pc-in ct-min" type="text" inputMode="numeric" value={l.every} aria-label={`Level ${i + 1}: every (minutes)`}
                onChange={(ev) => change((d) => { d.levels[i].every = ev.target.value; return d; })} />
              <span>minutes</span>
              <span className="set-reading ct-every-note">
                {i === 0 ? 'Told with the first message, then again every N minutes while it stays out. 0 = only the first.'
                  : 'First told after N minutes out, then every N. 0 = told once, with the first message.'}
              </span>
            </label>
            {CHANNELS.map((c) => (
              <div key={c.id} className="ct-chan">
                <label className="ct-chan-on">
                  <input type="checkbox" checked={l.channels[c.id].on} aria-label={`Level ${i + 1}: ${c.label} on`}
                    onChange={(ev) => change((d) => { d.levels[i].channels[c.id].on = ev.target.checked; return d; })} />
                  <span>{c.label}</span>
                </label>
                <input className={`pc-in ct-list${l.channels[c.id].on ? '' : ' ct-list--off'}`} type="text" value={l.channels[c.id].text} placeholder={c.hint}
                  aria-label={`Level ${i + 1}: ${c.label} contacts`} onChange={(ev) => change((d) => { d.levels[i].channels[c.id].text = ev.target.value; return d; })} />
              </div>
            ))}
          </fieldset>
        ))}
        {draft.levels.length < MAX_LEVELS && (
          <button type="button" className="pc-btn ct-add" onClick={() => change((d) => ({ ...d, levels: [...d.levels, blankLevel()] }))}>+ Add level {draft.levels.length + 1}</button>
        )}
      </section>

      <details className="ct-sample">
        <summary>What the workflow receives</summary>
        <pre>{JSON.stringify(sampleOf(mill, draft), null, 2)}</pre>
      </details>
    </>
  );
}

/** A made-up alert as level 1 would get it, to show the shape (the real one is built by the alert sender). */
function sampleOf(mill: string, d: Draft) {
  const l = bodyOf(d).levels[0];
  const on = (c?: { enabled: boolean; contacts: string[] }) => (c?.enabled ? c.contacts : []);
  return {
    id: '…', kind: 'raised', level: 1, department: mill, severity: 'warning', title: 'Oil temperature high',
    equipment: 'Drive 03 · Gearbox oil', valueText: '68 °C', limitText: '65 °C',
    smsTo: on(l?.sms), whatsappTo: on(l?.whatsapp), emailTo: on(l?.email),
    subject: `[WARNING] ${mill} Drive 03 · Gearbox oil — Oil temperature high`,
    body: `Department: ${mill}\nEquipment: Drive 03 · Gearbox oil\nCondition: Oil temperature high\nSeverity: WARNING\nReading: 68 °C\nLimit: > max 65 °C\nTime: 21 Nov 2026, 15:01 IST`,
  };
}
