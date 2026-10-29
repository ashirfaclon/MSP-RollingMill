'use client';

/**
 * The Mill mimic panel's live pill (improvement-spec C2): a summary, not a promise. "Live ·
 * 15:30 IST" only when every signal is good; "Live · 3 signals stale" otherwise, and clicking
 * it lists which. While the store retries it says so and keeps the last answer's time.
 */
import { useEffect, useRef, useState } from 'react';
import type { LiveSnapshot } from './liveStore';
import type { TwinModel } from './twinModel';

const HM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const hm = (ms: number | null | undefined) => (ms ? `${HM.format(new Date(ms))} IST` : '—');

export default function LivePill({ snap, model, lastReadingAt }: { snap: LiveSnapshot<unknown>; model: TwinModel; lastReadingAt: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const issues = model.issues.stale.length + model.issues.suspect.length;
  const last = lastReadingAt ? Date.parse(lastReadingAt) : null;
  let tone = 'na'; let text = 'Connecting…'; let title = '';
  if (snap.status === 'retrying' && !snap.data) { tone = 'na'; text = 'Historian unavailable'; title = snap.error ?? ''; }
  else if (snap.data) {
    const fresh = last !== null && model.now - last <= 15 * 60_000;
    if (!fresh) { tone = 'warn'; text = `No recent readings · last ${hm(last)}`; }
    else if (issues) { tone = 'warn'; text = `Live · ${model.issues.stale.length ? `${model.issues.stale.length} stale` : ''}${model.issues.stale.length && model.issues.suspect.length ? ', ' : ''}${model.issues.suspect.length ? `${model.issues.suspect.length} doubtful` : ''}`; }
    else { tone = 'ok'; text = `Live · ${hm(last)}`; }
    if (snap.status === 'retrying') { title = `Retrying — ${snap.error ?? 'request failed'}; showing the answer of ${hm(snap.receivedAt)}`; text += ' · retrying'; }
  }
  const list = issues > 0;
  return (
    <span className="mx-pill" ref={ref}>
      <button type="button" className={`chip chip--${tone}`} title={title || (list ? 'Which signals' : undefined)}
        onClick={() => list && setOpen((o) => !o)} aria-expanded={list ? open : undefined} aria-haspopup={list ? 'true' : undefined}
        style={{ cursor: list ? 'pointer' : 'default' }}>
        {text}
      </button>
      {open && (
        <div className="mx-pill-list" role="dialog" aria-label="Signals not good">
          {model.issues.stale.length > 0 && <><b>Stale</b>{model.issues.stale.join(', ')}</>}
          {model.issues.suspect.length > 0 && <><b>Doubtful</b>{model.issues.suspect.join(', ')}</>}
        </div>
      )}
    </span>
  );
}
