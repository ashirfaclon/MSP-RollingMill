'use client';

/**
 * One fetch hook for every HSM endpoint. The backend (../backend, a separate service)
 * computes every figure; this only fetches, keeps the last good answer on screen while a
 * refresh runs, and discards a late response for a URL that is no longer asked for.
 *
 * Where the API is: NEXT_PUBLIC_API_BASE_URL when set (the browser calls the backend
 * directly — the backend must list this site in CORS_ORIGINS); otherwise same-origin
 * `/api/…`, which next.config.ts proxies to BACKEND_URL.
 *
 * Several panels read the same URL (the yield card and the balance panel share one log
 * sheet): requests within DEDUPE_MS share one network call.
 */
import { useEffect, useRef, useState } from 'react';
import { authHeader, sessionRejected } from '@/auth/session';
import { API_BASE } from './apiBase';

/** Response types come from the backend's API contract (type-only — no backend code is bundled). */
export type {
  Grain, LogPeriod, LogSheetReport, SizeReport, SizeRow, OrdersReport, OrderPeriod, OpenLine, ErpMeta, StockReport,
  HsmLive, StandNow, GroupNow, ElectricalDelaysReport, ElectricalDelay, StandTrend, StandMetric, YieldComparison, YieldPeriod, RunningRateReport, RatePeriod, RateDay,
  PowerReport, PowerDay, PowerEntry, PlanReport, PlanDay, RmdBilletsReport, RmdBilletPeriod,
  RmdLive, RmdStationNow, RmdZoneNow, RmdZoneId, RmdStationTrend, RmdCurrentTrend, RmdConditionReport, RmdConditionGroup, RmdMillSpeedReport, RmdChemistryReport, RmdChemSample, RmdRunningRateReport, RmdRatePeriod, RmdProductionReport, RmdProductionPeriod, RmdStockReport, RmdPlanReport, RmdPlanDay, RmdAssetForms, RmdBearingGroup, RmdOilGroup, RmdReading, LsmProductionReport, LsmProductionPeriod, LsmStockReport, LsmDriveReport, LsmDriveReading, RmsDriveReport, RmsDriveReading, LsmMillLoadReport, LsmMillLoadReading, FormRunningRateReport, HsmMillLoadReport, HsmMillLoadEntry, MidReport, MidMachine, MidVisit, MidSection, MidStatus, PmReport, PmMonth, PmBreakdown, SavedPlan, SavedCaInputs, HsmMotorRatings, RmdOilTanks, RmdTempLimits, FormSaveResult, CaReport, RmsStockReport, RmsProductionReport, RmsProductionPeriod,
} from '@contracts';


const DEDUPE_MS = 10_000;
const inflight = new Map<string, { at: number; p: Promise<unknown> }>();

/** With `signal` (the live store's polling) the request is the caller's own: no sharing, abortable. */
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const hit = signal ? undefined : inflight.get(url);
  if (hit && Date.now() - hit.at < DEDUPE_MS) return hit.p as Promise<T>;
  const p = (async () => {
    const res = await fetch(`${API_BASE}${url}`, { cache: 'no-store', headers: authHeader(), signal });
    // The backend refuses every call without a valid session — back to the sign-in screen.
    if (res.status === 401) { sessionRejected(); throw new Error('Signed out'); }
    const type = res.headers.get('content-type') ?? '';
    // A static deploy with no API behind it answers with the HTML page — say so plainly.
    if (!type.includes('application/json')) throw new Error('The data service is not reachable from this page');
    const body = await res.json();
    if (!res.ok) throw new Error(body?.message ?? 'The request could not be completed');
    return body as T;
  })();
  if (signal) return p;
  inflight.set(url, { at: Date.now(), p });
  p.catch(() => inflight.delete(url));
  if (inflight.size > 64) inflight.delete(inflight.keys().next().value!);
  return p;
}

export interface ApiState<T> {
  data: T | null;
  /** The URL `data` answers — compare with the current one to tell a stale answer. */
  dataUrl: string | null;
  /** True only while nothing has been shown yet. */
  loading: boolean;
  error: string | null;
}

/** GET `url` now and every `refreshMs`; null pauses. */
export function useApi<T>(url: string | null, refreshMs = 60_000): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, dataUrl: null, loading: true, error: null });
  const reqId = useRef(0);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const run = () => {
      const id = ++reqId.current;
      fetchJson<T>(url)
        .then((data) => { if (alive && id === reqId.current) setState({ data, dataUrl: url, loading: false, error: null }); })
        .catch((err: Error) => {
          if (!alive || id !== reqId.current) return;
          // Keep the previous numbers on screen; state the failure beside them.
          setState((s) => ({ ...s, loading: false, error: err.message }));
        });
    };
    run();
    const timer = setInterval(run, refreshMs);
    // A save (postJson) reloads every screen at once, so the saved figures show straight away.
    window.addEventListener(SAVED_EVENT, run);
    return () => { alive = false; clearInterval(timer); window.removeEventListener(SAVED_EVENT, run); };
  }, [url, refreshMs]);

  return state;
}

const SAVED_EVENT = 'rm-data-saved';

/**
 * POST a JSON body (the config popups' saves). On success the request cache is emptied and every
 * open screen reloads its data. Throws the backend's message on a refusal.
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST', cache: 'no-store', headers: { ...authHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res.status === 401) { sessionRejected(); throw new Error('Signed out'); }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new Error('The data service is not reachable from this page');
  const out = await res.json();
  if (!res.ok) throw new Error(out?.message ?? 'The save could not be completed');
  inflight.clear();
  window.dispatchEvent(new Event(SAVED_EVENT));
  return out as T;
}

export const rangeUrl = (path: string, p: { from: string; to: string; grain?: string } | null) =>
  p ? `${path}?from=${p.from}&to=${p.to}${p.grain ? `&grain=${p.grain}` : ''}` : null;
