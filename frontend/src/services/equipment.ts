'use client';

/**
 * Equipment settings in use (the user, 31 Oct 2026): the backend's defaults (config/equipment.ts)
 * overlaid with any edit made on the dashboard. The HSM motor rated currents set Motor current
 * loading %; the RMD oil tank sizes turn levels into litres; the RMD temperature limits colour the
 * bearing and oil temperature readings (both worked out in the backend).
 */
import { useApi, type HsmMotorRatings, type RmdOilTanks, type RmdTempLimits } from './hsmApi';

export const HSM_MOTORS_URL = '/api/forms/equipment/hsm-motors';
export const RMD_TANKS_URL = '/api/forms/equipment/rmd-tanks';
export const RMD_LIMITS_URL = '/api/forms/equipment/rmd-temperature-limits';

export function useHsmMotorRatings() {
  const s = useApi<HsmMotorRatings>(HSM_MOTORS_URL);
  const data = s.dataUrl === HSM_MOTORS_URL ? s.data : null;
  const rated = new Map((data?.rows ?? []).map((r) => [r.stand, r.ratedCurrentA]));
  return { data, rated, error: s.error };
}

export function useRmdOilTanks() {
  const s = useApi<RmdOilTanks>(RMD_TANKS_URL);
  return { data: s.dataUrl === RMD_TANKS_URL ? s.data : null, error: s.error };
}

export function useRmdTempLimits() {
  const s = useApi<RmdTempLimits>(RMD_LIMITS_URL);
  return { data: s.dataUrl === RMD_LIMITS_URL ? s.data : null, error: s.error };
}

/** A stand's loading % (load ÷ rated current × 100), or null without its load or rated current. */
export const loadingPct = (rated: Map<string, number>, stand: string, loadA: number | null): number | null => {
  const r = rated.get(stand);
  return loadA === null || !r ? null : (loadA / r) * 100;
};
