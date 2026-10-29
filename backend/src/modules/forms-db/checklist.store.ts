/**
 * HSM checklists in their logbook forms (HSM Checklists Form Spec), one entry per save:
 *   production variance — the production figures filled here from the Production card's source (the
 *     Influx counter and the ERP log sheet for the plant day), the reasons as typed;
 *   shift setup — every column as typed.
 */
import type { Env } from '../../config/env';
import type { SetupSaveBody, VarianceSaveBody } from '../../contracts';
import { saveFormEntries, type FormWrite } from '../../integrations/logbook/client';
import { HttpError } from '../../shared/http-error';
import { isDate, productionComparison, round2 } from '../hsm/production.service';
import { SETUP_FORM, SETUP_KEYS, SETUP_TEXT, VARIANCE_FORM, VARIANCE_KEYS as V } from './forms';

const reason = (v: unknown, name: string) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new HttpError(400, 'bad_value', `${name} must be a number ≥ 0`);
  return v;
};

export async function saveVariance(env: Env, body: VarianceSaveBody, filledBy: string): Promise<FormWrite> {
  if (!isDate(String(body?.date))) throw new HttpError(400, 'bad_date', 'date must be YYYY-MM-DD');
  const day = (await productionComparison(env, body.date, body.date, 'day')).days.find((d) => d.date === body.date);
  const influx = day?.influxMt ?? null;
  const erp = day?.erpMt ?? null;
  const variance = influx !== null && erp !== null ? round2(influx - erp) : null;
  // One row per date: a date saved before is updated, not added again.
  return saveFormEntries(VARIANCE_FORM, [{
    [V.date]: body.date,
    [V.influx]: influx === null ? null : round2(influx),
    [V.erp]: erp === null ? null : round2(erp),
    [V.variance]: variance,
    [V.variancePct]: variance !== null && erp ? round2((variance / erp) * 100) : null,
    [V.missRoll]: reason(body.missRoll, 'Miss roll'),
    [V.finishEndcut]: reason(body.finishEndcut, 'Finish end cut'),
    [V.millScale]: reason(body.millScale, 'Mill scale'),
    [V.endCut]: reason(body.endCut, 'End cut'),
  }], (r) => String(r[V.date] ?? ''), filledBy, env);
}

export function saveSetup(env: Env, body: SetupSaveBody, filledBy: string): Promise<FormWrite> {
  const v = body?.values ?? {};
  if (!isDate(String(v.Date))) throw new HttpError(400, 'bad_date', 'Date must be YYYY-MM-DD');
  if (v.Shift !== 'Day' && v.Shift !== 'Night') throw new HttpError(400, 'bad_shift', 'Shift must be Day or Night');
  const entry: Record<string, unknown> = {};
  for (const k of SETUP_KEYS) {
    const x = v[k];
    if (x === undefined || x === null || x === '') { entry[k] = null; continue; }
    if (SETUP_TEXT.has(k)) entry[k] = String(x).slice(0, 500);
    else if (typeof x === 'number' && Number.isFinite(x)) entry[k] = x;
    else throw new HttpError(400, 'bad_value', `${k} must be a number`);
  }
  // One row per date and shift: a shift saved before is updated, not added again.
  return saveFormEntries(SETUP_FORM, [entry], (r) => (r.Date && r.Shift ? `${r.Date}|${r.Shift}` : ''), filledBy, env);
}
