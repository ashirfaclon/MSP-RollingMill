/**
 * Equipment reference data — the DEFAULTS. Values the plant gave once, that change only when the
 * equipment does. Each is typed, carries its unit in its name, and says where it came from.
 *
 * The values in use are these defaults overlaid with any edit made on the dashboard (the user,
 * 31 Oct 2026): an edit is saved to the logbook "Equipment settings" forms (forms-db/equipment.store),
 * which keep who changed what and when; this file is never rewritten at run time. To change a
 * default for good, edit it here in a commit (with the source and date).
 */

/** HSM stand DC motor — the rated (nameplate) armature current, A. */
export interface HsmMotorRating {
  /** The stand as the Mill Load Log Sheet names it: "RM 1" … "RM 5", "FM 1" … "FM 6". */
  stand: string;
  ratedCurrentA: number;
}

/** HSM stand DC motors: roughing R1–R5 (Revpower), finishing F1–F6 (CG). Source: the plant's DC motor details, 26 Oct 2026. */
export const HSM_MOTOR_DEFAULTS: readonly HsmMotorRating[] = [
  { stand: 'RM 1', ratedCurrentA: 630 },
  { stand: 'RM 2', ratedCurrentA: 630 },
  { stand: 'RM 3', ratedCurrentA: 872 },
  { stand: 'RM 4', ratedCurrentA: 872 },
  { stand: 'RM 5', ratedCurrentA: 983 },
  { stand: 'FM 1', ratedCurrentA: 1214 },
  { stand: 'FM 2', ratedCurrentA: 1214 },
  { stand: 'FM 3', ratedCurrentA: 1807 },
  { stand: 'FM 4', ratedCurrentA: 1807 },
  { stand: 'FM 5', ratedCurrentA: 1807 },
  { stand: 'FM 6', ratedCurrentA: 1807 },
];

/** RMD gearbox oil tank — inside dimensions, m. A box with a flat bottom: oil (L) = level × length × width × 1000. */
export interface RmdOilTank {
  /** The field stem of the Oil Tank Level / Temperature forms ("20-r-stand", "intermill" …). */
  tank: string;
  label: string;
  group: 'roughing' | 'route';
  lengthM: number;
  widthM: number;
  depthM: number;
}

/** RMD gearbox oil tanks. Source: the plant's oil tank capacities, 19 Oct 2026 (2,670 / 1,275 / 932 L). */
export const RMD_OIL_TANK_DEFAULTS: readonly RmdOilTank[] = [
  { tank: '20-r-stand', label: '20" R stand', group: 'roughing', lengthM: 1.63, widthM: 1.26, depthM: 1.3 },
  { tank: '16-r-stand', label: '16" R stand', group: 'roughing', lengthM: 1.63, widthM: 1.26, depthM: 1.3 },
  { tank: 'intermill', label: 'Intermill', group: 'route', lengthM: 1.25, widthM: 1.01, depthM: 1.01 },
  { tank: 'old-continuous-stand-1-2', label: 'OC stand 1–2', group: 'route', lengthM: 1.26, widthM: 0.85, depthM: 0.87 },
  { tank: 'old-continuous-stand-3-4', label: 'OC stand 3–4', group: 'route', lengthM: 1.26, widthM: 0.85, depthM: 0.87 },
  { tank: 'old-continuous-stand-5-6', label: 'OC stand 5–6', group: 'route', lengthM: 1.26, widthM: 0.85, depthM: 0.87 },
  { tank: 'new-continuous-stand-1-2', label: 'NC stand 1–2', group: 'route', lengthM: 1.26, widthM: 0.85, depthM: 0.87 },
  { tank: 'new-continuous-stand-3-4', label: 'NC stand 3–4', group: 'route', lengthM: 1.26, widthM: 0.85, depthM: 0.87 },
  { tank: 'new-continuous-stand-5-6', label: 'NC stand 5–6', group: 'route', lengthM: 1.26, widthM: 0.85, depthM: 0.87 },
  { tank: 'new-continuous-stand-7-8', label: 'NC stand 7–8', group: 'route', lengthM: 1.26, widthM: 0.85, depthM: 0.87 },
];

/** Sanity bounds for an edit (a typing slip, not a real motor or tank, is refused). */
export const EQUIPMENT_LIMITS = { ratedCurrentA: [1, 20_000], tankM: [0.1, 10] } as const;
