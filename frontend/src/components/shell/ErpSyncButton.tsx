'use client';

/**
 * Sync ERP (the user, 25 Nov 2026): fetch the ERP now, and when this mill's ERP data was last fetched.
 * One press syncs all four mills (about 25 s); the time shown is this mill's own, ready for per-mill
 * access. A failed run says so beside the time — the screens keep the last good figures.
 */
import { useEffect, useState } from 'react';
import type { MillId } from '@/config/navigation';
import { useErpSync } from '@/services/erpSync';

const AT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
const FULL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const when = (iso: string) => `${AT.format(Date.parse(iso))} · ${ON.format(Date.parse(iso))}`;

/** True until `iso` passes — a timer marks it passed, so a rest after a run ends on time. */
function useUntil(iso: string | null | undefined) {
  const [passed, setPassed] = useState<string | null>(null);
  useEffect(() => {
    if (!iso) return;
    const t = setTimeout(() => setPassed(iso), Math.max(0, Date.parse(iso) - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [iso]);
  return !!iso && passed !== iso;
}

export default function ErpSyncButton({ mill }: { mill: MillId }) {
  const { state, running, notice, start } = useErpSync();
  const resting = useUntil(state?.nextAllowedAt);
  const fetched = state?.mills[mill] ?? null;
  const last = state?.lastAttempt ?? null;
  // The last run failed after this mill's data was fetched: the figures are the older ones.
  const failed = !running && !!last && !last.ok && (!fetched || Date.parse(last.attemptedAt) > Date.parse(fetched));
  const off = state !== null && !state.configured;

  const millName = mill.toUpperCase();
  const auto = state && state.intervalMinutes > 0 ? `Synced automatically every ${state.intervalMinutes} min.` : 'Automatic sync is off on this server.';
  const title = [
    notice ? `${notice.full.replace(/\.$/, '')}.` : '',
    off ? 'The ERP connection is not set up on this server.'
      : fetched ? `${millName}'s ERP data was fetched ${FULL.format(Date.parse(fetched))}.` : `${millName}'s ERP data has not been fetched yet.`,
    failed ? `The last sync failed (${FULL.format(Date.parse(last!.attemptedAt))}) — showing the data fetched before.` : '',
    running ? 'Fetching all four mills from the ERP now…' : resting ? 'Synced a moment ago — available again in under a minute.' : off ? '' : 'Press to fetch all four mills now (about 25 s).',
    off ? '' : auto,
  ].filter(Boolean).join(' ');

  return (
    <div className={`tb-erp${failed || notice ? ' tb-erp--warn' : ''}`}>
      <button
        type="button"
        className="tb-reset tb-erp-btn"
        onClick={() => void start()}
        disabled={running || resting || off || state === null}
        aria-busy={running}
        title={title}
      >
        <SyncGlyph spin={running} />
        {/* Label over this mill's last fetch: one control, narrow enough for the busiest bar at 1366. */}
        <span className="tb-erp-text">
          <span className="tb-erp-label">{running ? 'Syncing…' : 'Sync ERP'}</span>
          <span className="tb-erp-at">
            {notice?.short ?? (state === null ? '—' : failed ? `Failed · ${fetched ? when(fetched) : 'no data'}` : fetched ? when(fetched) : 'Not synced')}
          </span>
        </span>
      </button>
      {/* Read out when a run starts, ends or is refused. */}
      <span className="tb-erp-live" role="status" aria-live="polite">
        {notice?.full ?? (running ? 'Syncing the ERP' : failed ? 'ERP sync failed' : fetched ? `ERP synced ${when(fetched)}` : '')}
      </span>
    </div>
  );
}

function SyncGlyph({ spin }: { spin: boolean }) {
  return (
    <svg className={spin ? 'tb-erp-spin' : undefined} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
