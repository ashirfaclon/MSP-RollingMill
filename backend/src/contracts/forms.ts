/** The dashboard's config forms (logbook forms used as its store): what the popups save and read back. */

/** POST /api/forms/plan/:mill — one month's plan; the dashboard writes one entry per date. */
export interface PlanSaveBody {
  /** YYYY-MM */
  month: string;
  monthPlanMt: number;
  days: { date: string; shutdown: boolean; dayMt: number; nightMt: number }[];
}

/** GET /api/forms/plan/:mill?month=YYYY-MM — the month as last saved (latest entry per date). */
export interface SavedPlan {
  month: string;
  saved: boolean;
  monthPlanMt: number | null;
  days: { date: string; shutdown: boolean; dayMt: number; nightMt: number }[];
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
