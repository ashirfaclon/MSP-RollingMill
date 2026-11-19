'use client';

/**
 * Alerts (the user, 19 Nov 2026): the backend's one checker reads every form the mill's limits judge
 * and lists what is past its limit, and the data checks that failed (a form not filled, a typing
 * slip, a form that can't be read). The alert sender (next step) will send from this same list.
 */
import { useApi, type AlertsReport, type AlertSeverity } from './hsmApi';
import type { SettingsMill } from './settings';

export const alertsUrl = (mill: SettingsMill) => `/api/alerts/${mill}`;
export const alertSettingsUrl = (mill: SettingsMill) => `/api/settings/${mill}/alerts`;

export function useMillAlerts(mill: SettingsMill) {
  const url = alertsUrl(mill);
  const s = useApi<AlertsReport>(url);
  return { data: s.dataUrl === url ? s.data : null, error: s.error };
}

export const SEVERITY_LABEL: Record<AlertSeverity, string> = { critical: 'Critical', warning: 'Warning', data: 'Data check' };
