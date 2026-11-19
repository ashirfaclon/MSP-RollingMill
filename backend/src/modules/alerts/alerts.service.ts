/**
 * The Alerts page and the Settings screen's Alerts tab (the user, 19 Nov 2026;
 * SETTINGS_AND_ALERTS_REPLICATION.md §4–§7, §9):
 *
 *   rules     every alert a mill can have — one per limit (Settings → Limits), one "not filled" check
 *             per form, one typing-slip check — with its controls resolved and whether it can fire
 *   alarms    the readings of the last WINDOW_DAYS checked by the one checker (engine.ts) against the
 *             limits in use, with the controls applied: the live list. The alert sender (step 5) will
 *             read this same list, so a message and the row on the screen can never disagree.
 *
 * A crossing shows while it is active, and for RECENT_DAYS after it cleared. Switching an alert off
 * never hides its row (§6.1): it shows, muted.
 */
import type { Env } from '../../config/env';
import { plausibleOf, type LimitMill } from '../../config/limits';
import type { Alarm, AlertControls, AlertKind, AlertRuleInfo, AlertSettingsSaveBody, AlertsReport, LimitSetting, SettingsSaveResult } from '../../contracts';
import { HttpError } from '../../shared/http-error';
import { sharedFresh } from '../../shared/shared-fresh';
import { byOf, limitsOf, loadSettings, saveDoc, storeStatus, type SettingsDoc } from '../settings/settings.store';
import { alertSection, appliesTo, applyLayer, checkAlertPatch, resolveDefaults, resolveRule, SHIPPED, type MillAlertSection, type RuleRef, type StoredControls } from './controls';
import { crossings } from './engine';
import { collect, DAILY_IDS, SOURCES, WINDOW_DAYS, type Collected, type Reading, type Source } from './readings';

/** A cleared crossing stays on the page this many days. */
export const RECENT_DAYS = 7;
/** A typing slip shows this many days after it was filed. */
const SLIP_DAYS = 14;
/** The readings are read at most once a minute for every viewer (the forms are filled a few times a day). */
const READ_FRESH_MS = 60_000;
const DAY_MS = 86_400_000;

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const dm = (d: string) => `${Number(d.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1]}`;
const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
const withUnit = (v: number, unit: string) => (unit.startsWith('%') ? `${fmt(v)}${unit}` : `${fmt(v)} ${unit}`);
const where = (asset: string, point: string) => (point ? `${asset} · ${point}` : asset);

/* ------------------------------ the rules ------------------------------ */

interface RuleDef { ruleId: string; kind: AlertKind; label: string; source: string; limit: LimitSetting | null; shipped: Partial<AlertControls> }

function ruleDefs(mill: LimitMill, limits: LimitSetting[]): RuleDef[] {
  return [
    ...limits.map((l): RuleDef => ({ ruleId: `limit:${l.id}`, kind: 'limit', label: l.label, source: l.reading, limit: l, shipped: {} })),
    ...SOURCES[mill].map((s): RuleDef => ({ ruleId: `stale:${s.key}`, kind: 'stale', label: `${s.label} not filled`, source: s.label, limit: null, shipped: { staleDays: s.expectDays } })),
    { ruleId: 'entry:slip', kind: 'entry', label: 'Readings that look like a typing slip', source: 'Every form above', limit: null, shipped: {} },
  ];
}

const hasLimit = (l: LimitSetting | null) => !!l && (l.min !== null || l.max !== null);

function ruleInfo(d: RuleDef, sec: MillAlertSection): AlertRuleInfo {
  const r = resolveRule(sec, d.ruleId, d.shipped);
  const blocked = d.kind === 'limit' && !hasLimit(d.limit) ? 'No limit set — no alert until one is set in Settings → Limits' : null;
  return {
    ruleId: d.ruleId, kind: d.kind, label: d.label,
    limitId: d.limit?.id ?? null, limit: d.limit ? { min: d.limit.min, max: d.limit.max } : null,
    unit: d.limit?.unit ?? '', source: d.source,
    canFire: blocked === null, blockedReason: blocked,
    controls: r.controls, inherited: resolveRule({ defaults: sec.defaults }, d.ruleId, d.shipped).controls,
    from: r.from, applies: appliesTo(d.kind), setBy: r.setBy, setAt: r.setAt,
  };
}

/* ------------------------------ the alarms ------------------------------ */

const RANK: Record<Alarm['severity'], number> = { data: 0, critical: 1, warning: 2 };
/** §4: data, then critical, then warning; active before cleared; then longest standing. */
export const alarmOrder = (a: Alarm, b: Alarm) =>
  RANK[a.severity] - RANK[b.severity] || Number(b.active) - Number(a.active) || a.since.localeCompare(b.since) || a.key.localeCompare(b.key);

/** Controls applied to a row: pinned severity, muted. */
function finish(a: Omit<Alarm, 'muted' | 'severityPinned'>, c: AlertControls): Alarm {
  return { ...a, severity: c.severityOverride ?? a.severity, severityPinned: c.severityOverride !== null, muted: !c.enabled };
}

/** Every alarm of a mill from its readings, its limits in use and its alert controls. */
export function alarmsOf(mill: LimitMill, got: Pick<Collected, 'readings' | 'sources' | 'today'>, limits: LimitSetting[], sec: MillAlertSection): Alarm[] {
  const byId = new Map(limits.map((l) => [l.id, l]));
  const ctlOf = (ruleId: string, shipped: Partial<AlertControls> = {}) => resolveRule(sec, ruleId, shipped).controls;
  const out: Alarm[] = [];
  const { today } = got;

  // Readings by point; a reading that can't be real is a slip, kept out of its series.
  const series = new Map<string, Reading[]>();
  const slips = new Map<string, Reading[]>();
  for (const r of got.readings) {
    const k = [r.limitId, r.asset, r.point].join('|');
    const p = plausibleOf(r.limitId);
    if (p && (r.value < p[0] || r.value > p[1])) { (slips.get(k) ?? slips.set(k, []).get(k)!).push(r); continue; }
    (series.get(k) ?? series.set(k, []).get(k)!).push(r);
  }

  for (const [k, rs] of series) {
    const l = byId.get(rs[0].limitId);
    if (!hasLimit(l ?? null)) continue;
    const ruleId = `limit:${l!.id}`;
    const c = ctlOf(ruleId);
    const xs = crossings(rs, l!, c);
    const x = xs[xs.length - 1];
    if (!x || (!x.active && daysBetween(x.clearedDay!, today) > RECENT_DAYS)) continue;
    const { asset, point } = rs[0];
    const side = l!.max !== null && x.value > l!.max ? `above the max of ${withUnit(l!.max, l!.unit)}`
      : l!.min !== null && x.value < l!.min ? `below the min of ${withUnit(l!.min, l!.unit)}`
        : 'back near the limit';
    const key = `${mill}|${ruleId}|${asset}|${point}`;
    out.push(finish({
      key, episode: `${key}|${x.since}`, ruleId, kind: 'limit', severity: x.severity,
      label: l!.label, asset, point,
      message: x.active
        ? `${where(asset, point)}: ${l!.label.toLowerCase()} ${withUnit(x.value, l!.unit)}, ${side} (since ${dm(x.sinceDay)})`
        : `${where(asset, point)}: ${l!.label.toLowerCase()} back inside on ${dm(x.clearedDay!)} (worst ${withUnit(x.worst, l!.unit)})`,
      value: x.value, worst: x.worst, unit: l!.unit, limit: { min: l!.min, max: l!.max }, limitId: l!.id,
      since: x.since, lastAt: x.lastAt, readings: x.readings, active: x.active, clearedAt: x.clearedAt,
      occurrences: xs.length, source: l!.reading,
    }, c));
  }

  const slipCtl = ctlOf('entry:slip');
  for (const [k, rs] of slips) {
    const recent = rs.filter((r) => daysBetween(r.day, today) <= SLIP_DAYS);
    const r = recent[recent.length - 1];
    if (!r) continue;
    const l = byId.get(r.limitId);
    const [lo, hi] = plausibleOf(r.limitId)!;
    const key = `${mill}|entry:slip|${k}`;
    out.push(finish({
      key, episode: `${key}|${r.at}`, ruleId: 'entry:slip', kind: 'entry', severity: 'data',
      label: l?.label ?? r.limitId, asset: r.asset, point: r.point,
      message: `${where(r.asset, r.point)}: ${(l?.label ?? r.limitId).toLowerCase()} filed as ${withUnit(r.value, l?.unit ?? '')} on ${dm(r.day)} — can't be real (${lo}–${hi}); check the entry`,
      value: r.value, worst: r.value, unit: l?.unit ?? '', limit: null, limitId: r.limitId,
      since: r.at, lastAt: r.at, readings: recent.length, active: true, clearedAt: null, occurrences: recent.length,
      source: l?.reading ?? '',
    }, slipCtl));
  }

  for (const s of got.sources) out.push(...sourceAlarm(mill, s, today, ctlOf));
  return out.sort(alarmOrder);
}

/** A form that can't be read, or isn't filled. */
function sourceAlarm(mill: LimitMill, s: Source, today: string, ctlOf: (id: string, shipped?: Partial<AlertControls>) => AlertControls): Alarm[] {
  const ruleId = SOURCES[mill].some((x) => x.key === s.key) ? `stale:${s.key}` : `source:${s.key}`;
  const c = ctlOf(ruleId, { staleDays: s.expectDays });
  const base = {
    ruleId, severity: 'data' as const, asset: mill.toUpperCase(), point: '', value: null, worst: null, unit: '',
    limit: null, limitId: null, readings: 0, active: true, clearedAt: null, occurrences: 1, source: s.label,
  };
  if (!s.ok) {
    const key = `${mill}|${ruleId}|down`;
    return [finish({ ...base, key, episode: `${key}|${today}`, kind: 'source', label: `${s.label} can't be read`,
      message: `${s.label} can't be read: ${s.message}`, since: today, lastAt: today }, c)];
  }
  if (ruleId.startsWith('source:')) return [];
  const days = s.lastDate ? daysBetween(s.lastDate, today) : null;
  if (days !== null && days <= c.staleDays) return [];
  const key = `${mill}|${ruleId}`;
  const since = s.lastDate ? addDays(s.lastDate, 1) : '';
  return [finish({ ...base, key, episode: `${key}|${since || 'none'}`, kind: 'stale', label: `${s.label} not filled`,
    message: s.lastDate ? `${s.label}: no entry for ${days} days (last ${dm(s.lastDate)})` : `${s.label}: no entry in the last six months`,
    since, lastAt: s.lastDate ?? '' }, c)];
}

/* ------------------------------ the report ------------------------------ */

/** The daily figures with a limit set — the only ones worth reading. */
const dailyWithLimit = (limits: LimitSetting[]) => DAILY_IDS.filter((id) => hasLimit(limits.find((l) => l.id === id) ?? null));

export async function millAlerts(env: Env, mill: LimitMill, nowMs = Date.now()): Promise<AlertsReport> {
  const doc = await loadSettings(env);
  const limits = limitsOf(doc, mill);
  const sec = alertSection(doc, mill);
  const daily = dailyWithLimit(limits);
  const got = await sharedFresh(`alerts:${mill}:${daily.join(',')}`, READ_FRESH_MS, () => collect(env, mill, daily, nowMs), nowMs);
  const alarms = alarmsOf(mill, got, limits, sec);
  const rules = ruleDefs(mill, limits).map((d) => ruleInfo(d, sec));
  const def = resolveDefaults(sec);
  const active = alarms.filter((a) => a.active);
  return {
    mill, checkedAt: new Date(nowMs).toISOString(), windowDays: WINDOW_DAYS,
    alarms, rules, defaults: def.controls, shipped: SHIPPED, defaultsFrom: def.from,
    counts: {
      critical: active.filter((a) => a.severity === 'critical').length,
      warning: active.filter((a) => a.severity === 'warning').length,
      data: active.filter((a) => a.severity === 'data').length,
      cleared: alarms.filter((a) => !a.active).length,
      muted: rules.filter((r) => !r.controls.enabled).length,
      rules: rules.length,
      noLimit: rules.filter((r) => !r.canFire).length,
    },
    store: storeStatus(doc),
    sender: { running: false, message: 'No messages are sent yet — the alert sender is the next step. This page shows what it will send.' },
  };
}

/* ------------------------------ saving ------------------------------ */

const objectOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Save the mill's alert settings: checked whole, applied over the newest document, only what changed. */
export async function saveAlertSettings(env: Env, mill: LimitMill, body: AlertSettingsSaveBody, filledBy: string, nowMs = Date.now()): Promise<SettingsSaveResult> {
  const doc = await loadSettings(env);
  const refs = new Map<string, RuleRef>(ruleDefs(mill, limitsOf(doc, mill)).map((d) => [d.ruleId, { kind: d.kind, label: d.label }]));
  const { defaultsPatch, rulesPatch, problems } = checkAlertPatch(body, refs);
  if (problems.length) throw new HttpError(400, 'bad_alert_settings', problems.join(' · '));
  const by = byOf(body?.by);
  return saveDoc(env, (cur: SettingsDoc, now) => {
    const sec = alertSection(cur, mill);
    let changed = 0;
    const d = applyLayer(sec.defaults, Object.keys(defaultsPatch).length ? defaultsPatch : {}, by, now);
    changed += d.changed;
    const rules: Record<string, StoredControls> = { ...(sec.rules ?? {}) };
    for (const [id, patch] of rulesPatch) {
      const r = applyLayer(rules[id], patch, by, now);
      changed += r.changed;
      if (r.next) rules[id] = r.next; else delete rules[id];
    }
    // Pruned at every level, so a cleared setting looks like one never made.
    const millSec: Record<string, unknown> = {};
    if (d.next) millSec.defaults = d.next;
    if (Object.keys(rules).length) millSec.rules = rules;
    const alerts = { ...objectOf(cur.alerts), [mill]: millSec };
    if (!Object.keys(millSec).length) delete alerts[mill];
    const next: SettingsDoc = { ...cur, alerts };
    if (!Object.keys(alerts).length) delete next.alerts;
    return { next, changed };
  }, by, filledBy, nowMs);
}

/** Tests: the rule ids a mill has. */
export const ruleIdsOf = (mill: LimitMill) => ruleDefs(mill, limitsOf({ version: 1, updatedAt: null, updatedBy: null, limits: {} }, mill)).map((d) => d.ruleId);
