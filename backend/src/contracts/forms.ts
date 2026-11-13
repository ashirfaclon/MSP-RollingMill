/** The dashboard's config forms (logbook forms used as its store): what the popups save and read back. */

/**
 * One date of a plan. A shutdown can be one shift or the whole day (the user, 31 Oct 2026): a shift
 * that is off has no target.
 */
export interface PlanDayInput { date: string; dayOff: boolean; nightOff: boolean; dayMt: number; nightMt: number }

/** Which RMD rolling a plan is for (RMD only; the user, 13 Nov 2026). */
export type PlanRolling = 'online' | 'offline';

/** POST /api/forms/plan/:mill — one month's plan; the dashboard writes one entry per date (RMD: per date and rolling). */
export interface PlanSaveBody {
  /** YYYY-MM */
  month: string;
  monthPlanMt: number;
  days: PlanDayInput[];
  /** RMD: required — the plan is saved for Online or Offline. Other mills: none. */
  rolling?: PlanRolling;
}

/** GET /api/forms/plan/:mill?month=YYYY-MM[&rolling=online|offline] — the month as last saved (latest entry per date). */
export interface SavedPlan {
  month: string;
  rolling: PlanRolling | null;
  saved: boolean;
  monthPlanMt: number | null;
  days: PlanDayInput[];
  savedAt: string | null;
}

/** POST /api/forms/ca/:mill, GET /api/forms/ca/:mill?month=YYYY-MM — one month's CA inputs. */
export interface CaInputsBody {
  month: string;
  values: Record<string, number>;
}
export interface SavedCaInputs {
  month: string;
  saved: boolean;
  values: Record<string, number | null>;
  savedAt: string | null;
}

/** POST /api/forms/hsm/variance — the reasons typed; the production figures are filled by the server. */
export interface VarianceSaveBody {
  date: string;
  missRoll: number | null;
  finishEndcut: number | null;
  millScale: number | null;
  endCut: number | null;
}

/** POST /api/forms/hsm/setup — the shift setup checklist, keyed as the form defines its columns. */
export interface SetupSaveBody {
  values: Record<string, string | number | null>;
}

export interface FormSaveResult {
  ok: true;
  form: string;
  entries: number;
}

/** Who last changed a setting on the dashboard, when; edited = false while the default is in use. */
interface EditedBy { edited: boolean; editedAt: string | null; editedBy: string | null }

/** GET /api/forms/equipment/hsm-motors — each HSM stand motor's rated current in use (A), and its default. */
export interface HsmMotorRatings {
  logbook: { connection: 'up' | 'down'; message: string };
  rows: ({ stand: string; ratedCurrentA: number; defaultA: number } & EditedBy)[];
}
/** POST /api/forms/equipment/hsm-motors */
export interface HsmMotorRatingsBody { rows: { stand: string; ratedCurrentA: number }[] }

/** GET /api/forms/equipment/rmd-tanks — each RMD gearbox oil tank's inside size in use (m), its capacity (L) and defaults. */
export interface RmdOilTanks {
  logbook: { connection: 'up' | 'down'; message: string };
  rows: ({
    tank: string; label: string; group: 'roughing' | 'route';
    lengthM: number; widthM: number; depthM: number; capacityL: number;
    defaults: { lengthM: number; widthM: number; depthM: number };
  } & EditedBy)[];
}
/** POST /api/forms/equipment/rmd-tanks */
export interface RmdOilTanksBody { rows: { tank: string; lengthM: number; widthM: number; depthM: number }[] }

/** GET /api/forms/equipment/rmd-temperature-limits — RMD bearing, flywheel and oil tank limits in use (°C), and defaults. */
export interface RmdTempLimits {
  logbook: { connection: 'up' | 'down'; message: string };
  rows: ({
    limit: 'bearing' | 'flywheel' | 'oil-tank'; label: string;
    minC: number; maxC: number; defaults: { minC: number; maxC: number };
  } & EditedBy)[];
}
/** POST /api/forms/equipment/rmd-temperature-limits */
export interface RmdTempLimitsBody { rows: { limit: string; minC: number; maxC: number }[] }
