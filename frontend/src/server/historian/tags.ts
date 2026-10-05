/**
 * Tag definitions — the single place a business name is bound to historian coordinates.
 *
 * A reading is identified by measurement + `Unit` tag + `Group` tag + `_field`. Group is
 * not optional in spirit: on this historian a field name is not unique (the same field is
 * published by several machines on one Unit), and matching without it averages different
 * machines together.
 *
 * `mapped: false` is the honesty switch — an unmapped tag is never queried and never
 * produces a value, so a KPI that depends on it stays NA instead of acquiring a guessed
 * number. `scale` records where a tag's name disagrees with its reality.
 */

export interface TagDef {
  /** Internal, stable. */
  key: string;
  /** Client-facing name. */
  label: string;
  measurement: string;
  unitTag: string;
  group?: string;
  field: string;
  /** Engineering unit AFTER scale. */
  unit: string;
  /** Multiplier onto the raw reading. */
  scale: number;
  mapped: boolean;
  /** Declared by the plant, not yet seen in the historian. */
  pending?: boolean;
}

/**
 * HSM process tags. None confirmed yet — the historian catalogue
 * (`GET /api/historian/catalogue`) is how they get found. Until a tag is listed here with
 * `mapped: true`, nothing that depends on it produces a value.
 */
export const HSM_TAGS: TagDef[] = [];

/**
 * Finishing Mill running production counter. NOT a weighed output: the mill computes it
 * as billets discharged × a theoretical billet weight from operator-set L×B×H (verified
 * 30 Sep 2026: 54 × 0.16 × 0.16 × 3.2 × 7.85 = 34.73 t). The operator resets it to 0 at
 * every SKU (product size) change — per the plant, 30 Sep 2026 — so resets fall at any hour,
 * several a day or none. Production is therefore the SUM OF ITS INCREASES, never its peak.
 * Published from 21 Sep 2026 12:47 IST. Drives the Production card; ERP comparison in the drawer.
 */
export const HSM_TOTAL_PRODUCTION: TagDef = {
  key: 'hsm_total_production_t',
  label: 'Total_Production_Ton',
  measurement: 'HSM',
  unitTag: 'Finishing Mill',
  group: 'General',
  field: 'Total_Production_Ton',
  unit: 't',
  scale: 1,
  mapped: true,
};

/** The historian measurement HSM publishes under — seen in the catalogue on 29 Sep 2026. */
export const HSM_MEASUREMENT = 'HSM';

/** Only mapped tags are ever queried. */
export const mappedOnly = (defs: TagDef[]) => defs.filter((d) => d.mapped);

/**
 * Billets discharged from the reheating furnace into the mill — a count that resets with
 * Total_Production_Ton, so a day's billets are the SUM OF ITS INCREASES as well. Checked
 * 30 Sep 2026: 1 748 over 22–29 Sep against 1 753 on the ERP log sheet (INPUT_PCS).
 */
export const HSM_DISCHARGED_BILLET: TagDef = {
  key: 'hsm_discharged_billet',
  label: 'Dicharged_Billet',            // sic — the historian's spelling
  measurement: 'HSM',
  unitTag: 'Finishing Mill',
  group: 'General',
  field: 'Dicharged_Billet',
  unit: 'pcs',
  scale: 1,
  mapped: true,
};

/** Roughing mill speed setpoint/feedback — idle ≈ 0.1, rolling 0.8–1.0. */
export const HSM_MILL_SPEED: TagDef = {
  key: 'hsm_mill_speed',
  label: 'Rolling_Mill_Speed',
  measurement: 'HSM',
  unitTag: 'Roughing Mill',
  group: 'General',
  field: 'Rolling_Mill_Speed',
  unit: '',
  scale: 1,
  mapped: true,
};

/**
 * One mill stand. Its readings live on `Unit` = the mill, `Group` = the stand, with the
 * stand's position number suffixed to every field (On_Off3, Motor_RPM3 …). Two stands
 * publish their current under a truncated name — recorded here, not guessed at runtime.
 */
export interface StandDef {
  id: string;
  group: 'roughing' | 'finishing';
  unitTag: string;
  n: number;
  fields: { onOff: string; current: string; rpm: string; force: string };
}

const stand = (group: StandDef['group'], n: number, current?: string): StandDef => {
  const prefix = group === 'roughing' ? 'RM' : 'FM';
  return {
    id: `${prefix}_0${n}`,
    group,
    unitTag: group === 'roughing' ? 'Roughing Mill' : 'Finishing Mill',
    n,
    fields: { onOff: `On_Off${n}`, current: current ?? `Motor_Current${n}`, rpm: `Motor_RPM${n}`, force: `Roll_Force_Ton${n}` },
  };
};

/** Seen in the historian on 30 Sep 2026: RM_01–05 and FM_01–06, no intermediate group. */
export const HSM_STANDS: StandDef[] = [
  stand('roughing', 1), stand('roughing', 2), stand('roughing', 3), stand('roughing', 4), stand('roughing', 5, 'Motor_Curren5'),
  stand('finishing', 1, 'Motor_Curren1'), stand('finishing', 2), stand('finishing', 3), stand('finishing', 4), stand('finishing', 5), stand('finishing', 6),
];
