/**
 * Plant settings: the limits every screen judges a reading by and alerts will raise on
 * (the user, 19 Nov 2026), built as docs/SETTINGS_AND_ALERTS_REPLICATION.md §3 describes:
 *
 *   - Two layers. The defaults ship in config/limits.ts; the overrides are ONE document holding only
 *     what a person changed, so an untouched limit keeps tracking its default.
 *   - Shared. The document is a row of the logbook insight (tag rolling-mill-settings/settings);
 *     each save adds a row with the whole document and the newest row wins — the history is the
 *     audit trail. Read at most every 120 s by whoever asks (the API, and later the alert sender),
 *     so every deployment sees a save within two minutes. Nothing is kept on the server's disk.
 *   - Patch: a limit absent is left as is; { min, max } sets it; null drops the edit (back to the
 *     default). Empty objects are pruned, so a cleared edit looks like one never made.
 *   - Failure: no IOsense → the defaults, said on the screen. A read that fails after a good one
 *     keeps what is in hand. A save first re-reads the store and refuses when it can't, so it never
 *     builds on a stale document and erases another save.
 *   - The connector drops empty objects: a document is accepted on `version === 1` alone, every
 *     missing section defaults to {}. A save spreads the current document first, so a section this
 *     build does not know (written by a newer one) is carried forward.
 *
 * `settingsVersion()` moves on every change in hand; caches compare against it.
 */
import type { Env } from '../../config/env';
import { LIMIT_DEFAULTS, type LimitDef, type LimitMill } from '../../config/limits';
import type { LimitSetting, MillSettings, SettingsSaveBody, SettingsSaveResult } from '../../contracts';
import { appendFormEntry, fetchFormEntries, type InsightEntry } from '../../integrations/logbook/client';
import { HttpError } from '../../shared/http-error';

export const SETTINGS_FORM = 'rolling-mill-settings__settings';
const TAG = 'rolling-mill-settings/settings';
const REFRESH_MS = 120_000;
/** After a failed read, try again sooner. */
const RETRY_MS = 30_000;
/** Saves are rare: read every one ever made. */
const LOOK_BACK_MS = 3650 * 86_400_000;

export interface LimitOverride { min: number | null; max: number | null; by: string | null; at: string }
export interface SettingsDoc {
  version: 1;
  updatedAt: string | null;
  updatedBy: string | null;
  /** mill → limit id → the edit. */
  limits: Record<string, Record<string, LimitOverride>>;
  /** Sections a newer build wrote, carried forward untouched. */
  [section: string]: unknown;
}

const empty = (): SettingsDoc => ({ version: 1, updatedAt: null, updatedBy: null, limits: {} });
const objectOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/** A stored row → the document, or null when it is not one. */
export function coerce(raw: unknown): SettingsDoc | null {
  const r = objectOf(raw);
  if (r.version !== 1) return null;
  const limits: SettingsDoc['limits'] = {};
  for (const [mill, ids] of Object.entries(objectOf(r.limits))) {
    for (const [id, o] of Object.entries(objectOf(ids))) {
      const v = objectOf(o);
      const min = numOrNull(v.min); const max = numOrNull(v.max);
      if (min === null && max === null) continue;
      (limits[mill] ??= {})[id] = { min, max, by: strOrNull(v.by), at: String(v.at ?? '') };
    }
  }
  return { ...r, version: 1, updatedAt: strOrNull(r.updatedAt), updatedBy: strOrNull(r.updatedBy), limits };
}

/** The newest row that is a document; null when the store has none. */
export function newestDoc(rows: InsightEntry[]): SettingsDoc | null {
  const at = (x: InsightEntry) => String(x.createdAt ?? x.invocationTime ?? '');
  for (const row of [...rows].sort((a, b) => at(b).localeCompare(at(a)))) {
    const doc = coerce(row.result);
    if (doc) return doc;
  }
  return null;
}

/* ------------------------------ the document in hand ------------------------------ */

const state = { doc: empty(), loaded: false, readAt: 0, error: null as string | null, version: 0 };
let reading: Promise<void> | null = null;

export const settingsVersion = () => state.version;

/** Tests only: forget the document in hand. */
export function resetSettings() {
  Object.assign(state, { doc: empty(), loaded: false, readAt: 0, error: null, version: 0 });
  reading = null;
}

function install(doc: SettingsDoc) {
  if (JSON.stringify(doc) !== JSON.stringify(state.doc)) state.version += 1;
  state.doc = doc;
}

async function refresh(env: Env, nowMs: number) {
  const read = await fetchFormEntries(TAG, nowMs - LOOK_BACK_MS, env, nowMs);
  if (!read.ok) {
    // Keep what is in hand: a blip must not drop every edit.
    state.error = read.message;
    state.readAt = nowMs - REFRESH_MS + RETRY_MS;
    return;
  }
  state.error = null;
  state.readAt = nowMs;
  state.loaded = true;
  // Never saved: the defaults everywhere, not an error.
  install(newestDoc(read.rows) ?? empty());
}

/** The document in use, re-read from the store when the copy in hand is older than 120 s (or `force`). */
export async function loadSettings(env: Env, force = false, nowMs = Date.now()): Promise<SettingsDoc> {
  if (force || nowMs - state.readAt >= REFRESH_MS) {
    reading ??= refresh(env, nowMs).finally(() => { reading = null; });
    await reading;
  }
  return state.doc;
}

/* ------------------------------ limits in use ------------------------------ */

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Past these a reading outside the limit is critical (§4: deeper than one full band width; a
 * one-sided limit's width is taken as 15 % of the limit).
 */
export function criticalOf(min: number | null, max: number | null): LimitSetting['critical'] {
  if (min !== null && max !== null) return { below: round(min - (max - min), 4), above: round(max + (max - min), 4) };
  return {
    below: min === null ? null : round(min - Math.abs(min) * 0.15, 4),
    above: max === null ? null : round(max + Math.abs(max) * 0.15, 4),
  };
}

function inUse(def: LimitDef, o: LimitOverride | undefined): LimitSetting {
  const min = o ? o.min : def.min;
  const max = o ? o.max : def.max;
  return {
    id: def.id, group: def.group, label: def.label, unit: def.unit, reading: def.reading,
    min, max,
    defaults: { min: def.min, max: def.max, approval: def.approval, basis: def.basis },
    source: o ? 'edited' : def.approval,
    setBy: o ? o.by : null,
    setAt: o ? o.at || null : null,
    critical: criticalOf(min, max),
    range: [def.range[0], def.range[1]],
    dp: def.dp,
  };
}

/** Every limit of a mill in use: the default, or the edit saved over it. */
export function limitsOf(doc: SettingsDoc, mill: LimitMill): LimitSetting[] {
  return LIMIT_DEFAULTS[mill].map((d) => inUse(d, doc.limits[mill]?.[d.id]));
}

/** id → the limit in use, read through the store (the screens' and the alerts' one source). */
export async function limitsInUse(env: Env, mill: LimitMill): Promise<Map<string, LimitSetting>> {
  return new Map(limitsOf(await loadSettings(env), mill).map((l) => [l.id, l]));
}

/** Where a reading falls against a limit: inside, below or above it — and how far. Null without a limit. */
export function judge(value: number, l: Pick<LimitSetting, 'min' | 'max' | 'critical'> | null | undefined):
  { status: 'ok' | 'low' | 'high'; severity: 'warning' | 'critical' | null } | null {
  if (!l || (l.min === null && l.max === null)) return null;
  if (l.min !== null && value < l.min) return { status: 'low', severity: l.critical.below !== null && value <= l.critical.below ? 'critical' : 'warning' };
  if (l.max !== null && value > l.max) return { status: 'high', severity: l.critical.above !== null && value >= l.critical.above ? 'critical' : 'warning' };
  return { status: 'ok', severity: null };
}

export async function millSettings(env: Env, mill: LimitMill): Promise<MillSettings> {
  const doc = await loadSettings(env);
  return { mill, limits: limitsOf(doc, mill), store: { ...storeStatus(doc), updatedAt: doc.updatedAt, updatedBy: doc.updatedBy } };
}

/* ------------------------------ saving ------------------------------ */

/** The patch checked against the mill's limits: what to set or reset, and every problem at once. */
export function checkPatch(mill: LimitMill, body: SettingsSaveBody | undefined) {
  const changes = new Map<string, { min: number | null; max: number | null } | null>();
  const problems: string[] = [];
  const raw = objectOf(body?.limits);
  if (!Object.keys(raw).length) problems.push('Nothing to save');
  for (const [id, v] of Object.entries(raw)) {
    const def = LIMIT_DEFAULTS[mill].find((d) => d.id === id);
    if (!def) { problems.push(`Unknown limit: ${id}`); continue; }
    if (v === null) { changes.set(id, null); continue; }
    const o = objectOf(v);
    const side = (x: unknown, name: string) => {
      if (x === null || x === undefined || x === '') return null;
      const n = typeof x === 'number' ? x : Number.NaN;
      if (!Number.isFinite(n)) { problems.push(`${def.label}: the ${name} must be a number`); return null; }
      if (n < def.range[0] || n > def.range[1]) {
        problems.push(`${def.label}: ${n} ${def.unit} is outside ${def.range[0]}–${def.range[1]} ${def.unit} — check the number`);
        return null;
      }
      return round(n, def.dp);
    };
    const min = side(o.min, 'minimum');
    const max = side(o.max, 'maximum');
    if (min === null && max === null) {
      if (o.min == null && o.max == null) problems.push(`${def.label}: enter a minimum or a maximum, or reset it to its default`);
      continue;
    }
    if (min !== null && max !== null && min >= max) { problems.push(`${def.label}: the minimum must be below the maximum`); continue; }
    changes.set(id, { min, max });
  }
  return { changes, problems };
}

/** The store as the screens say it: up, or down with why (the defaults, or the settings last read, in use). */
export function storeStatus(doc: SettingsDoc): { connection: 'up' | 'down'; message: string } {
  if (state.error) return { connection: 'down', message: `${state.loaded ? 'Showing the settings last read' : 'Showing the defaults'} — the settings store can't be read: ${state.error}` };
  return { connection: 'up', message: doc.updatedAt ? 'Saved in IOsense' : 'Defaults in use — nothing changed yet' };
}

/**
 * Save a change to the document: `apply` makes the next document from the newest one in the store
 * (never from a stale copy) and counts what it changed; nothing changed writes nothing. Written as a
 * new row, then in use here at once. Shared by the limits and the alert settings.
 */
export async function saveDoc(
  env: Env, apply: (cur: SettingsDoc, now: string) => { next: SettingsDoc; changed: number },
  by: string | null, filledBy: string, nowMs = Date.now(),
): Promise<SettingsSaveResult> {
  const now = new Date(nowMs).toISOString();
  const cur = await loadSettings(env, true, nowMs);
  if (state.error) throw new HttpError(502, 'settings_store_down', `Not saved — the settings store can't be read: ${state.error}`);
  const { next, changed } = apply(cur, now);
  if (!changed) return { ok: true, changed: 0, updatedAt: cur.updatedAt ?? now };
  const doc: SettingsDoc = { ...next, version: 1, updatedAt: now, updatedBy: by };
  const w = await appendFormEntry(SETTINGS_FORM, doc as unknown as Record<string, unknown>, filledBy, env);
  if (!w.ok) throw new HttpError(502, 'settings_save_failed', `Not saved — ${w.message}`);
  install(doc);
  state.readAt = nowMs;
  return { ok: true, changed, updatedAt: now };
}

/** The name typed in the Settings screen: trimmed, at most 60 characters; null when blank. */
export const byOf = (by: unknown) => strOrNull(typeof by === 'string' ? by.trim().slice(0, 60) : null);

/**
 * Save a mill's limits: checked whole (refused with every problem listed), applied over the newest
 * document in the store.
 */
export async function saveMillSettings(env: Env, mill: LimitMill, body: SettingsSaveBody, filledBy: string, nowMs = Date.now()): Promise<SettingsSaveResult> {
  const { changes, problems } = checkPatch(mill, body);
  if (problems.length) throw new HttpError(400, 'bad_settings', problems.join(' · '));
  const by = byOf(body?.by);
  return saveDoc(env, (cur, now) => {
    const millLimits: Record<string, LimitOverride> = { ...(cur.limits[mill] ?? {}) };
    let changed = 0;
    for (const [id, v] of changes) {
      const had = millLimits[id];
      if (v === null) {
        if (had) { delete millLimits[id]; changed += 1; }
        continue;
      }
      if (had && had.min === v.min && had.max === v.max) continue;
      millLimits[id] = { ...v, by, at: now };
      changed += 1;
    }
    const limits = { ...cur.limits, [mill]: millLimits };
    // Pruned: a mill with no edit left is dropped, so a cleared edit looks like one never made.
    if (!Object.keys(millLimits).length) delete limits[mill];
    return { next: { ...cur, limits }, changed };
  }, by, filledBy, nowMs);
}
