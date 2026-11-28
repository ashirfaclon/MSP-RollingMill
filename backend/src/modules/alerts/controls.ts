/**
 * When each alert notifies — the Settings screen's Alerts tab (the user, 19 Nov 2026;
 * docs/SETTINGS_AND_ALERTS_REPLICATION.md §6). Three layers, each field resolved separately:
 *
 *   SHIPPED  →  the mill's defaults  →  the rule's own setting
 *
 * stored in the settings document's `alerts` section (mill → { defaults, rules }), saved like the
 * limits: only what changed, null drops a setting back to the layer below, empty objects pruned.
 *
 * The shipped layer is the behaviour before anyone tunes anything: every alert on, raised on the
 * first reading past its limit (a filed reading is a deliberate one), re-armed 2 % of the band back
 * inside, the severity worked out from the reading, and messages from warning up. Data checks show on
 * the screen and page nobody, whatever is set (the user, 21 Nov 2026), so "messages from" is critical
 * or warning only. How often a standing alert is told again is the mill's contact list's (escalation.ts),
 * not a per-alert repeat (dropped 21 Nov 2026; a stored one is ignored).
 *
 * "Not filled" checks keep their own days (each form's expected filling interval), so a mill-wide
 * "readings in a row" never means days for them: staleDays is set per rule only.
 */
import type { AlertControlSource, AlertControls, AlertControlsPatch, AlertField, AlertKind, AlertSeverity, AlertSettingsSaveBody, MillEscalation } from '../../contracts';
import type { LimitMill } from '../../config/limits';
import type { SettingsDoc } from '../settings/settings.store';
import { escalationOf } from './escalation';

export const SHIPPED: AlertControls = {
  enabled: true,
  onDelayReadings: 1,
  staleDays: 2,
  deadband: { mode: 'pct-of-band', value: 2 },
  severityOverride: null,
  minSeverityToNotify: 'warning',
};
export const FIELDS = Object.keys(SHIPPED) as AlertField[];
const SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'data'];

/** The fields that mean something for a rule of this kind. */
export function appliesTo(kind: AlertKind): AlertField[] {
  const common: AlertField[] = ['enabled', 'severityOverride', 'minSeverityToNotify'];
  if (kind === 'limit') return ['enabled', 'onDelayReadings', 'deadband', ...common.slice(1)];
  if (kind === 'stale') return ['enabled', 'staleDays', ...common.slice(1)];
  return common;
}
/** What a mill's defaults may set: everything but the per-form days. */
const DEFAULT_FIELDS: AlertField[] = FIELDS.filter((f) => f !== 'staleDays');

/** One stored layer: some fields, with who set them and when. */
export type StoredControls = Partial<AlertControls> & { by?: string | null; at?: string };
export interface MillAlertSection { defaults?: StoredControls; rules?: Record<string, StoredControls>; escalation?: MillEscalation }

const objectOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** A stored layer read leniently: a field that is not valid is ignored (falls through to the layer below). */
function storedOf(raw: unknown): StoredControls {
  const r = objectOf(raw);
  const out: StoredControls = {};
  for (const f of FIELDS) {
    if (r[f] === undefined || r[f] === null) continue;
    const ok = validField(f, r[f]);
    if (ok.ok) (out as Record<string, unknown>)[f] = ok.value;
  }
  if (typeof r.by === 'string') out.by = r.by;
  if (typeof r.at === 'string') out.at = r.at;
  return out;
}

/** The mill's stored alert settings, from the document. */
export function alertSection(doc: SettingsDoc, mill: LimitMill): MillAlertSection {
  const m = objectOf(objectOf(doc.alerts)[mill]);
  const rules: Record<string, StoredControls> = {};
  for (const [id, v] of Object.entries(objectOf(m.rules))) rules[id] = storedOf(v);
  return { defaults: storedOf(m.defaults), rules, escalation: escalationOf(m.escalation) };
}

const hasField = (s: StoredControls | undefined, f: AlertField) => s !== undefined && s[f] !== undefined;

/** Each field of the mill's defaults, and where it came from. */
export function resolveDefaults(sec: MillAlertSection): { controls: AlertControls; from: Record<AlertField, AlertControlSource> } {
  const controls = { ...SHIPPED } as Record<AlertField, unknown>;
  const from = {} as Record<AlertField, AlertControlSource>;
  for (const f of FIELDS) {
    const mine = DEFAULT_FIELDS.includes(f) && hasField(sec.defaults, f);
    controls[f] = mine ? sec.defaults![f] : SHIPPED[f];
    from[f] = mine ? 'mill' : 'shipped';
  }
  return { controls: controls as unknown as AlertControls, from };
}

/** Each field for one rule: its own, else the mill's, else shipped (`shipped` overrides SHIPPED for this rule, e.g. a form's days). */
export function resolveRule(sec: MillAlertSection, ruleId: string, shipped: Partial<AlertControls> = {}) {
  const base = resolveDefaults(sec);
  const own = sec.rules?.[ruleId];
  const controls = { ...base.controls } as Record<AlertField, unknown>;
  const from = { ...base.from };
  for (const f of FIELDS) {
    if (hasField(own, f)) { controls[f] = own![f]; from[f] = 'rule'; continue; }
    if (f in shipped && base.from[f] === 'shipped') controls[f] = shipped[f as keyof typeof shipped];
  }
  return { controls: controls as unknown as AlertControls, from, setBy: own?.by ?? null, setAt: own?.at ?? null };
}

/* ------------------------------ checking a save ------------------------------ */

const whole = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** One field's value checked: its value, or why it is refused (in words). */
function validField(f: AlertField, v: unknown): { ok: true; value: unknown } | { ok: false; why: string } {
  switch (f) {
    case 'enabled':
      return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, why: 'messages must be on or off' };
    case 'onDelayReadings':
      return whole(v, 1, 9) ? { ok: true, value: v } : { ok: false, why: 'readings in a row must be a whole number from 1 to 9' };
    case 'staleDays':
      return whole(v, 1, 90) ? { ok: true, value: v } : { ok: false, why: 'days without an entry must be a whole number from 1 to 90' };
    case 'severityOverride':
      return SEVERITIES.includes(v as AlertSeverity) ? { ok: true, value: v } : { ok: false, why: 'severity must be critical, warning or data' };
    case 'minSeverityToNotify':
      return v === 'critical' || v === 'warning' ? { ok: true, value: v } : { ok: false, why: 'messages are sent from critical or from warning up — data checks are never sent' };
    case 'deadband': {
      const d = objectOf(v);
      if (d.mode !== 'pct-of-band' && d.mode !== 'absolute') return { ok: false, why: 'deadband must be a % of the limit band or an amount' };
      if (typeof d.value !== 'number' || !Number.isFinite(d.value) || d.value < 0) return { ok: false, why: 'deadband must be a number, 0 or more' };
      if (d.mode === 'pct-of-band' && d.value > 50) return { ok: false, why: 'deadband must be 0 to 50 % of the band' };
      return { ok: true, value: { mode: d.mode, value: d.value } };
    }
  }
}

/** A rule the patch may tune: its kind and label. */
export interface RuleRef { kind: AlertKind; label: string }

/**
 * A patch checked against the mill's rules: refused whole with every problem (§6.3). What a field
 * may be, and that it means something where it is set (no deadband on a "not filled" check, no
 * per-form days in the mill's defaults, an amount deadband only on one rule — units differ).
 */
export function checkAlertPatch(body: AlertSettingsSaveBody | undefined, rules: Map<string, RuleRef>) {
  const problems: string[] = [];
  const defaults = objectOf(body?.defaults) as AlertControlsPatch;
  const ruleRaw = objectOf(body?.rules);
  if (!Object.keys(defaults).length && !Object.keys(ruleRaw).length && body?.escalation === undefined) problems.push('Nothing to save');

  const checkLayer = (patch: Record<string, unknown>, allowed: AlertField[], where: string, defaultsLayer: boolean) => {
    const out: AlertControlsPatch = {};
    for (const [f, v] of Object.entries(patch)) {
      if (!FIELDS.includes(f as AlertField)) { problems.push(`${where}: unknown setting ${f}`); continue; }
      const field = f as AlertField;
      if (!allowed.includes(field)) { problems.push(`${where}: ${LABEL[field]} does not apply here`); continue; }
      if (v === null) { (out as Record<string, unknown>)[field] = null; continue; }
      const ok = validField(field, v);
      if (!ok.ok) { problems.push(`${where}: ${ok.why}`); continue; }
      if (field === 'deadband' && defaultsLayer && (ok.value as AlertControls['deadband']).mode === 'absolute') {
        problems.push(`${where}: a deadband as an amount is set on one alert (the units differ) — use a % for every alert`);
        continue;
      }
      (out as Record<string, unknown>)[field] = ok.value;
    }
    return out;
  };

  const defaultsPatch = checkLayer(defaults as Record<string, unknown>, DEFAULT_FIELDS, 'Mill defaults', true);
  const rulesPatch = new Map<string, AlertControlsPatch | null>();
  for (const [id, v] of Object.entries(ruleRaw)) {
    const ref = rules.get(id);
    if (!ref) { problems.push(`Unknown alert: ${id}`); continue; }
    if (v === null) { rulesPatch.set(id, null); continue; }
    rulesPatch.set(id, checkLayer(objectOf(v), appliesTo(ref.kind), ref.label, false));
  }
  return { defaultsPatch, rulesPatch, problems };
}

export const LABEL: Record<AlertField, string> = {
  enabled: 'messages on / off', onDelayReadings: 'readings in a row', staleDays: 'days without an entry',
  deadband: 'deadband', severityOverride: 'severity', minSeverityToNotify: 'messages from',
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Apply a checked patch to one stored layer: the next layer (undefined when empty) and how many fields changed. */
export function applyLayer(cur: StoredControls | undefined, patch: AlertControlsPatch | null, by: string | null, at: string) {
  const fields: Partial<AlertControls> = {};
  for (const f of FIELDS) if (cur?.[f] !== undefined) (fields as Record<string, unknown>)[f] = cur[f];
  let changed = 0;
  const entries = patch === null ? FIELDS.filter((f) => fields[f] !== undefined).map((f) => [f, null] as const) : Object.entries(patch);
  for (const [f, v] of entries) {
    const field = f as AlertField;
    if (v === null || v === undefined) {
      if (fields[field] !== undefined) { delete fields[field]; changed += 1; }
      continue;
    }
    if (same(fields[field], v)) continue;
    (fields as Record<string, unknown>)[field] = v;
    changed += 1;
  }
  if (!Object.keys(fields).length) return { next: undefined, changed };
  return { next: { ...fields, by: changed ? by : cur?.by ?? null, at: changed ? at : cur?.at ?? at } as StoredControls, changed };
}
