/**
 * GET /api/alerts/:mill — the Alerts page: every reading past its limit, and every data check that
 * failed, worked out by the one checker (modules/alerts) from the same forms and limits the screens use.
 * POST /api/settings/:mill/alerts — the Settings screen's Alerts tab: when each alert notifies.
 */

/** critical / warning: a reading past its limit; data: the reading can't be trusted (form not filled, a typing slip, source down). */
export type AlertSeverity = 'critical' | 'warning' | 'data';

/**
 * limit:<limitId>  a reading past one of the mill's limits (Settings → Limits)
 * stale:<source>   a form not filled for longer than expected
 * entry:slip       a reading that can't be real (a typing slip) — not judged against its limit
 * source:<source>  a form that can't be read at all
 */
export type AlertKind = 'limit' | 'stale' | 'entry' | 'source';

export interface Alarm {
  /** Stable for one point: mill|rule|asset|point. */
  key: string;
  /** This crossing: the key and when it started — what the sender will remember it sent. */
  episode: string;
  ruleId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** "Flywheel bearings", "Drive Temp not filled". */
  label: string;
  /** "Drive 03", "OC stand 3", "Oil tank 2"; the mill for a mill-wide figure. */
  asset: string;
  /** "Flywheel DE", "Pinion gear D side"; '' when the asset is the point. */
  point: string;
  /** One line, as a message will say it. */
  message: string;
  /** The latest reading of the crossing (limit, entry); null for a data check without one. */
  value: number | null;
  /** The furthest past the limit during the crossing. */
  worst: number | null;
  unit: string;
  /** The limit judged by (limit alarms). */
  limit: { min: number | null; max: number | null } | null;
  limitId: string | null;
  /** When the crossing started: the first reading past the limit (its day, and time when filled). */
  since: string;
  /** The latest reading of the crossing. */
  lastAt: string;
  /** Readings past the limit in this crossing. */
  readings: number;
  active: boolean;
  /** The reading that brought it back inside; null while active. */
  clearedAt: string | null;
  /** Crossings of this point in the checked window (a hunting reading shows once, "3 times"). */
  occurrences: number;
  /** Notifications switched off for this rule: the row still shows, quietly. */
  muted: boolean;
  /** The severity is pinned in Settings, not worked out from the reading. */
  severityPinned: boolean;
  /** The form it comes from. */
  source: string;
}

/** When a rule notifies — the Alerts tab. Every field is resolved: the rule's, else the mill's, else shipped. */
export interface AlertControls {
  /** Messages on / off. Off never hides the row on the Alerts page. */
  enabled: boolean;
  /** Readings past the limit in a row before it raises (limit rules). */
  onDelayReadings: number;
  /** Days without an entry before a "not filled" check raises (stale rules). */
  staleDays: number;
  /** Re-arm margin: back inside by this much before it counts as normal (limit rules). */
  deadband: { mode: 'pct-of-band' | 'absolute'; value: number };
  /** Pins the severity; null = worked out from the reading. */
  severityOverride: AlertSeverity | null;
  /** The least severe alarm that sends a message: critical or warning (data checks are never sent). */
  minSeverityToNotify: AlertSeverity;
}
export type AlertField = keyof AlertControls;
/** Which layer a field's value came from. */
export type AlertControlSource = 'shipped' | 'mill' | 'rule';

export interface AlertRuleInfo {
  ruleId: string;
  kind: AlertKind;
  label: string;
  /** limit rules: the limit in use, its unit and id (to open Settings → Limits at it). */
  limitId: string | null;
  limit: { min: number | null; max: number | null } | null;
  unit: string;
  source: string;
  /** False with the reason when it can never raise now (no limit set). */
  canFire: boolean;
  blockedReason: string | null;
  controls: AlertControls;
  /** What each field is without this rule's own setting (the mill's, else shipped): a blank box shows it. */
  inherited: AlertControls;
  /** Where each field's value comes from. */
  from: Record<AlertField, AlertControlSource>;
  /** The fields that mean something for this rule (deadband only on limit rules …). */
  applies: AlertField[];
  /** Who last tuned this rule, when. */
  setBy: string | null;
  setAt: string | null;
}

export interface AlertsReport {
  mill: 'hsm' | 'rmd' | 'lsm' | 'rms';
  /** When the readings were checked. */
  checkedAt: string;
  /** How far back readings are checked (days). */
  windowDays: number;
  /** Data checks first, then critical, then warning; active before cleared; longest standing first. */
  alarms: Alarm[];
  rules: AlertRuleInfo[];
  /** The mill's own defaults (resolved over shipped) and the shipped values. */
  defaults: AlertControls;
  shipped: AlertControls;
  defaultsFrom: Record<AlertField, AlertControlSource>;
  counts: { critical: number; warning: number; data: number; cleared: number; muted: number; rules: number; noLimit: number };
  /** The settings store: down = the defaults are in use. */
  store: { connection: 'up' | 'down'; message: string };
  /** Who is told, and how often (Settings → Escalation matrix). */
  escalation: MillEscalation;
  /** The alert sender (its own deployment), from the last check it recorded in IOsense. */
  sender: { running: boolean; message: string; lastCheckAt: string | null };
}

/* ------------------------------ who is told (SMS-ALERTS.md §5.5) ------------------------------ */

/** One way of telling a level: on / off and who. Off keeps its contacts, so switching it back on needs no retyping. */
export interface AlertChannel { enabled: boolean; contacts: string[] }

/** One level of the mill's escalation matrix. */
export interface EscalationLevel {
  /**
   * How often this level is told while the alert stands (with one message per crossing off): level 1
   * every N minutes after the first; a later level first after N minutes, then every N. 0 = once, with the first alert.
   */
  everyMinutes: number;
  /** Phone numbers. */
  sms: AlertChannel;
  /** Phone numbers. */
  whatsapp: AlertChannel;
  /** Email ids. */
  email: AlertChannel;
}

/** A mill's contacts (the user, 21 Nov 2026: one list per mill). */
export interface MillEscalation {
  /** On: each crossing is told once, to level 1 only. Off: every level on its own interval while it stands. */
  onePerCrossing: boolean;
  /** Up to 10. None: alerts still go to the webhook, with nobody named. */
  levels: EscalationLevel[];
  setBy: string | null;
  setAt: string | null;
}

/** A field set to null goes back to the layer below. */
export type AlertControlsPatch = { [K in AlertField]?: AlertControls[K] | null };

export interface AlertSettingsSaveBody {
  by?: string;
  defaults?: AlertControlsPatch;
  /** A rule set to null drops every setting of it. */
  rules?: Record<string, AlertControlsPatch | null>;
  /** The whole contact list, replacing the saved one. */
  escalation?: Pick<MillEscalation, 'onePerCrossing' | 'levels'>;
}
