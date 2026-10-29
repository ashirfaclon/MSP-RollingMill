'use client';

/**
 * The Mill mimic panel's live pill: "Live · hh:mm IST" while the historian is writing, "No
 * recent readings" when it is not; while the store retries it says so and keeps the last
 * answer's time. Nothing is counted or listed here (the user, 30 Oct 2026): each reading
 * carries its own quality on the drawing.
 */
import type { LiveSnapshot } from './liveStore';
import type { TwinModel } from './twinModel';

const HM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const hm = (ms: number | null | undefined) => (ms ? `${HM.format(new Date(ms))} IST` : '—');

export default function LivePill({ snap, model, lastReadingAt }: { snap: LiveSnapshot<unknown>; model: TwinModel; lastReadingAt: string | null | undefined }) {
  const last = lastReadingAt ? Date.parse(lastReadingAt) : null;
  let tone = 'na'; let text = 'Connecting…'; let title = '';
  if (snap.status === 'retrying' && !snap.data) { tone = 'na'; text = 'Historian unavailable'; title = snap.error ?? ''; }
  else if (snap.data) {
    const fresh = last !== null && model.now - last <= 15 * 60_000;
    if (!fresh) { tone = 'warn'; text = `No recent readings · last ${hm(last)}`; }
    else { tone = 'ok'; text = `Live · ${hm(last)}`; }
    if (snap.status === 'retrying') { title = `Retrying — ${snap.error ?? 'request failed'}; showing the answer of ${hm(snap.receivedAt)}`; text += ' · retrying'; }
  }
  return <span className={`chip chip--${tone}`} title={title || undefined}>{text}</span>;
}
