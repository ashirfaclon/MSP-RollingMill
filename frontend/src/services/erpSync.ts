'use client';

/**
 * The Sync ERP button's data (the user, 25 Nov 2026): GET /api/erp/sync for the run and each mill's last
 * fetch — every minute, every 2 s while a run goes; POST to start one (all four mills). When a mill's
 * fetch time moves — this button's run, the 15-minute schedule's, or another person's — every open
 * screen reloads, so the new ERP figures show without a page refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeader, sessionRejected } from '@/auth/session';
import type { ErpSyncState } from '@contracts';
import { API_BASE } from './apiBase';
import { fetchJson, reloadAllData } from './hsmApi';

export type { ErpSyncState };

const IDLE_MS = 60_000;
const RUNNING_MS = 2_000;

export function useErpSync() {
  const [state, setState] = useState<ErpSyncState | null>(null);
  const [starting, setStarting] = useState(false);
  /** A refusal of the last press (the ERP not set up, synced a moment ago, the service down): a word for the button, the reason in full. */
  const [notice, setNotice] = useState<{ short: string; full: string } | null>(null);
  const seen = useRef<string | null>(null);

  const take = useCallback((s: ErpSyncState) => {
    const key = JSON.stringify(s.mills);
    if (seen.current !== null && key !== seen.current) reloadAllData();
    seen.current = key;
    setState(s);
  }, []);

  const running = !!state?.running || starting;
  useEffect(() => {
    const ctl = new AbortController();
    const load = () => fetchJson<ErpSyncState>('/api/erp/sync', ctl.signal).then(take).catch(() => {});
    load();
    const timer = setInterval(load, running ? RUNNING_MS : IDLE_MS);
    return () => { ctl.abort(); clearInterval(timer); };
  }, [running, take]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8_000);
    return () => clearTimeout(t);
  }, [notice]);

  const start = useCallback(async () => {
    setStarting(true);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/erp/sync`, { method: 'POST', cache: 'no-store', headers: authHeader() });
      if (res.status === 401) { sessionRejected(); return; }
      const body = (res.headers.get('content-type') ?? '').includes('application/json') ? await res.json() : null;
      if (!res.ok) {
        const short = res.status === 429 ? 'Wait a minute' : res.status === 503 ? 'ERP not set up' : 'Not started';
        setNotice({ short, full: body?.message ?? 'The ERP sync could not be started' });
        return;
      }
      take(body as ErpSyncState);
    } catch {
      setNotice({ short: 'Not started', full: 'The data service is not reachable from this page' });
    } finally {
      setStarting(false);
    }
  }, [take]);

  return { state, running, notice, start };
}
