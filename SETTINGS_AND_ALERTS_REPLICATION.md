# Settings and alert notifications: replication guide

How the CPP dashboard's plant settings and alert notification system is built, and how to
stand up the same system for another division's dashboard.

Written 12 Nov 2026 against branch `demopowerplant` at `ef0f235`. Every file path, constant
and endpoint below was read from that commit. Section 11 lists the places where the CPP
build does not yet do what its UI says; read it before you copy anything.

Related records, narrower in scope:

- `docs/CPP_ALERT_SOURCES.md`: the `metric:`, `lab:`, `labstale:` and `pm:` rule families
- `docs/ALERTS.md`: the pellet plant's Supervisor alerts panel (shares only `engine.ts`)

---

## 1. What the system is

Two features that share one store:

1. **Plant settings.** Targets, operating bands and plant-stated figures that every screen
   judges against. Edited in a drawer and shared by every deployment and every user.
2. **Alerts.** One evaluator produces the alarm list. The dashboard draws that list on
   screen, and a separate watcher process turns new crossings into notifications: an n8n
   webhook plus a row in an IOsense insight. The plant tunes when it gets paged (mute,
   on-delay, deadband, severity) in a second drawer, and those settings are saved into the
   same settings store.

```
 config/cpp_limits.json        (shipped baseline, read-only, in git)
            │
            ▼
 ┌──────────────────────┐   newest row wins    ┌─────────────────────────────┐
 │ settings document    │◀────────────────────▶│ IOsense insight             │
 │ (sparse overrides)   │  read every 120 s,   │ INS_90424a8a1628            │
 │ settingsStore.ts     │  whole doc on save   │ resultName "cpp/settings"   │
 └─────────┬────────────┘                      └─────────────────────────────┘
           │ limitFor / metricAlertBand / labAlertBand / resolveAlertControls
           ▼
 ┌──────────────────────┐  episodesFor()  ┌──────────────┐
 │ computeAlarms        │────────────────▶│ engine.ts    │
 │ cpp/alarms.ts        │◀────────────────│ (evaluator)  │
 └─────────┬────────────┘                 └──────────────┘
           │ CppAlarm[]  =  snapshot.alarms
     ┌─────┴───────────────────────────┐
     ▼                                 ▼
 Dashboard (API server)            Watcher (separate process)
 Alerts page, Asset Health         runTick → dedup → suppress → outbox
 /api/cpp, /api/cpp/alerts                     │
                                   ┌───────────┼──────────────────┐
                                   ▼           ▼                  ▼
                            insight sink   webhook:<url1>    webhook:<url2> …
                            INS_9b503b…    (n8n prod + test)
```

The rule behind this architecture: **there is one evaluator.** The watcher computes nothing
of its own. It reads `snapshot.alarms`, the same array the screen draws, so a notification
and the on-screen row can never disagree about whether something is out of band. To add a
new alert source, push a row into that array and add a catalogue entry. Do not write a
second evaluator.

---

## 2. File map

### Backend: settings

| File | Role | Copy as-is? |
|---|---|---|
| `backend/src/cpp/settingsStore.ts` | Settings document type, sparse merge, patch apply, cache and version counter | Copy the mechanics; replace the sections with your division's |
| `backend/src/cpp/settingsInsight.ts` | Read/write the document to the shared insight | Copy; change insight id and `resultName` |
| `backend/src/logbook/write.ts` | IOsense Bruce insight read/write client | Copy unchanged (already generic) |
| `backend/src/cpp/parameters.ts` | `limitFor`, `metricAlertBand`, `labAlertBand`: baseline merged with overrides | Rewrite for your parameters; keep the merge rule |
| `config/cpp_limits.json` | Shipped baseline, with `approval` and `basis` on every value | New file for your division |
| `backend/src/api/server.ts` `GET/PUT /api/cpp/settings` | Settings API and validation | Rewrite fields; keep the validation rules |

### Backend: alerts

| File | Role | Copy as-is? |
|---|---|---|
| `backend/src/alerts/engine.ts` | `episodesFor`: persistence, hysteresis, escalation | Unchanged. Already shared with pellet |
| `backend/src/cpp/alarms.ts` | `computeAlarms`: builds rules, calls the engine, applies mute/severity pin | Rewrite for your rule families |
| `backend/src/cpp/alertConfig.ts` | The 3-layer alert controls, shipped defaults, resolver, derivations | Copy nearly unchanged |
| `backend/src/cpp/alertConfigPatch.ts` | Validation of a config patch, ceilings, error sentences | Copy; adjust band sections |
| `backend/src/cpp/alertRules.ts` | Rule catalogue built without a historian read (mirrors `alarms.ts`) | Rewrite against your `alarms.ts` |
| `backend/src/alerts/watch/main.ts` | Watcher process: tick loop, health, heartbeat, startup banner | Copy; see §11 for fixes |
| `backend/src/alerts/watch/watcher.ts` | `runTick`: dedup, prime, suppression, re-arm | Copy; swap the alarm source and plant list |
| `backend/src/alerts/watch/types.ts` | `AlertEvent`, `WatchState`, `Outboxed`, `SinkId` | Copy |
| `backend/src/alerts/watch/store.ts` | `state.json`, `outbox.jsonl`, `events.jsonl` with atomic writes | Copy unchanged |
| `backend/src/alerts/watch/deliver.ts` | Outbox, per-URL sinks, severity floor, backoff, flush budget | Copy unchanged |
| `backend/src/alerts/watch/webhook.ts` | Multi-URL POST, n8n test sibling, secret header, timeout | Copy unchanged |
| `backend/src/alerts/watch/insight.ts` | Alert row into the alerts insight | Copy; change id and `resultName` prefix |
| `backend/src/alerts/watch/message.ts` | Fixed 7-line subject/body, IST timestamp | Copy unchanged |
| `backend/src/alerts/watch/suppress.ts` | Hot-reloaded suppression file | Copy; change file path |
| `config/cpp_alert_suppressions.json` | Suppression list, ships empty | New file, empty |

### Frontend

| File | Role |
|---|---|
| `frontend/src/cpp/useCppSettings.ts` | Settings drawer state: string drafts, patch builder, `SETTINGS_SAVED_EVENT` |
| `frontend/src/cpp/CppSettingsDrawer.tsx` + `settingsdrawer.css` | Settings drawer: panes Plant / Targets / Operating bands / Ladder bands / Feeder calibration |
| `frontend/src/alerts/useCppAlerts.ts` | `useAlertRules` (catalogue, polled) and `useAlertDraft` (drawer editing) |
| `frontend/src/alerts/CppAlertsConfigDrawer.tsx` | Alert config drawer: panes Plant defaults / Rules |
| `frontend/src/alerts/CppAlerts.tsx` + `alerts.css` | Alerts page: live alarms table, notifying column, counts |

### Tests to port (all in `backend/test/`)

`cppSettings`, `cppSettingsInsight`, `cppSettingsRoundTrip`, `cppAlertConfig`,
`cppAlertConfigPatch`, `cppAlertDeadband`, `cppAlertRules`, `cppAlertSources`,
`cppAlertWatcher`, `cppAlertMessage`. Run with `npm --prefix backend test`.

---

## 3. The settings store

### 3.1 Two layers, and only the second is written

| Layer | Where | Written by |
|---|---|---|
| Baseline | `config/cpp_limits.json`, in git | Developers only. A redeploy always restores it. Every value carries `approval` (e.g. `statistical`, `provisional`, `approved`) and a `basis` sentence saying where the number came from. |
| Overrides | One JSON document, stored in the shared insight | The drawers. Holds **only what a person changed**. |

An untouched value keeps tracking the shipped figure instead of being frozen at whatever it
was the day someone opened the drawer. Effective value = override if present, else
baseline. An edited band is reported as `approval: 'approved'` with basis
`Set in the plant settings by <who> on <date>.`

### 3.2 The document

```ts
interface CppSettingsFile {
  version: 1;
  updatedAt: string | null;
  updatedBy: string | null;          // free text typed in the drawer
  metricsByUnit:        Record<unit, Record<metricKey, { target: number }>>;
  bandsByLocation:      Record<unit, Record<locationId, Record<paramId, Band>>>;
  plantByUnit:          Record<unit, PlantOverride>;
  turbineRatingsByUnit: Record<unit, Record<tagKey, number>>;
  feederCurvesByUnit:   Record<unit, Record<boiler, { a?, b?, c?, rpmMin?, rpmMax? }>>;
  boilerRefsByUnit:     Record<unit, Record<boiler, number>>;
  ladderBandsByKind:    Record<componentKind, Record<rowName, Band>>;   // not per unit
  fuelMixBands:         Record<fuelGroup, Band>;                        // not per unit
  alertsByUnit:         Record<unit, { defaults?: AlertControls; rules?: Record<ruleId, AlertControls> }>;
  metricBandsByUnit:    Record<unit, Record<metricKey, Band>>;          // alert bands, derived figures
  labBandsByUnit:       Record<unit, Record<locationId, Record<field, Band>>>; // alert bands, lab sheets
}
type Band = { min: number | null; max: number | null };   // one side may be null
```

Everything below `updatedBy` is CPP vocabulary. For a new division, keep `version`,
`updatedAt`, `updatedBy`, `alertsByUnit` and the band sections, and replace the rest with
your division's own settable figures.

Design rules that carry over to any division:

- **Scope each limit to what it is a property of.** Operating bands are per machine
  (WHRB-1 runs 490 °C and WHRB-3 runs 479 °C). Ladder bands are per component kind (a
  bearing limit is the same on every turbine). Pick the key that matches the physical fact.
- **A target and an alert band are different numbers in different sections.**
  `metricsByUnit` holds what the plant aims at and colours every card. `metricBandsByUnit`
  holds where it wants to be paged. Writing an alert threshold into the target would
  recolour the screen as a side effect of tuning an alert.
- **Bands are stored as min/max, never as a tolerance.** A percentage of target would move
  the alert every time someone edited the target.
- **Derived totals are never settable.** Plant capacity is the sum of per-turbine ratings;
  there is no capacity input box.

### 3.3 Patch semantics

`PUT` carries only what changed. In every section:

| Value in patch | Meaning |
|---|---|
| absent | leave as is |
| a value | set the override |
| `null` | **drop the override** and fall back to the baseline. It does not mean "set to nothing". |
| `0` (where valid) | a real value. For example, a turbine rating of 0 means it is out for overhaul. |

After applying, empty objects are pruned at every level, so a cleared override looks
exactly like one that was never set. This matters because the whole document is appended
to the insight on every save, so empty husks would pile up in history forever.

### 3.4 Sharing between deployments (`settingsInsight.ts`)

- **One source of truth:** insight `INS_90424a8a1628` (`CPP_SETTINGS_INSIGHT_ID`),
  `resultName: 'cpp/settings'`. The insight is append-only, so each save writes a new row
  holding the **whole** document and the newest row wins. The history doubles as an audit
  trail.
- Row metadata: `{ by, formId: 'cpp-settings', source: 'cpp-dashboard', origin: DEPLOY_NAME | HOSTNAME }`.
  `origin` records which box the edit was typed on.
- **Read:** the API server calls `refreshCppSettings()` at boot and every 120 s
  (`SETTINGS_REFRESH_MS` in `server.ts`). It reads one page, newest first.
- **Write:** the edit goes live in memory immediately, then the document is pushed. If the
  push fails, the drawer is told in words: the edit is live on this box and has not reached
  the others.
- After a successful write, `clearInsightCache()` runs. Without it, a refresh landing inside
  the 60 s scan cache re-installs the pre-save document and the edit looks lost.
- **The local file is not read.** `backend/data/cpp-settings.json` (`CPP_SETTINGS_FILE`) is
  written as a diagnostic mirror only. Two boxes falling back to two different stale local
  files is how production and local once showed heat-rate targets of 3,050 and 3,340 on
  the same minute.

Failure handling you must keep:

| Situation | Behaviour |
|---|---|
| No `IOSENSE_BEARER` | Run the shipped baseline, no overrides, and say so on the drawer |
| Insight empty (never saved) | Not an error. Baseline everywhere. |
| Read fails after a good read | **Keep what is in hand.** A network blip must not drop every override. |
| Read fails before any good read | Baseline |

`readInsightRows` takes an `onError` callback so that "no rows" and "connector failed" are
distinguishable. Both return `[]`, and they mean opposite things here.

### 3.5 Two traps already hit in production, both fixed and both easy to reintroduce

1. **The connector drops empty objects.** A document saved with `metricsByUnit: {}` comes
   back without that key. The old guard checked for `metricsByUnit` and discarded the whole
   document, so every first save on a site was silently lost (3 Nov 2026). `coerce()` now
   checks only `version === 1` and defaults each missing or non-object section to `{}`.
2. **Older builds erasing newer sections.** `saveCppSettings` builds the next document as
   `{ ...cur, version: 1, updatedAt, ...named sections }`. Spreading `cur` **first** carries
   forward any section this build does not know about. Otherwise an older server saving
   one target would erase the whole alert configuration written by a newer one.

### 3.6 Cache invalidation

`settingsVersion()` is a counter bumped on every save and every successful shared read.
Every memo (limit caches in `parameters.ts`, `resolveAlertControls`, `alertRuleCatalogue`)
compares against it and clears itself when it moves. There are no events or subscriptions.
After a save, the server also calls `invalidateCppSnapshotCache()`, and the browser
dispatches `SETTINGS_SAVED_EVENT` (`'cpp:settings-saved'`) so open screens refetch at once.

---

## 4. The evaluator (`alerts/engine.ts`)

`episodesFor(rule, sample, shiftFraction)` walks a series and returns every **episode**
(one continuous stretch outside the band).

| Step | Behaviour | Rule field |
|---|---|---|
| Disabled / no band | Returns nothing | `enabled`, `lcl`/`ucl` both null |
| Bad inputs | Any `inputs[i].ok === false` suppresses the rule; a `data` alarm is raised in its place | `sample.inputs` |
| Band check | `v < lcl` LOW, `v > ucl` HIGH | `lcl`, `ucl` |
| Shift proration | Shift-total limits scale by elapsed fraction (CPP uses none) | `prorateByShift` |
| Raise | After `raiseAfter` consecutive breaching samples | `raiseAfter` |
| Hysteresis | While open, the reading must come back past the limit by a margin before it counts as normal. Margin = `hysteresisAbs` if set, else `hysteresis × band width` | `hysteresis`, `hysteresisAbs` |
| Clear | After `clearAfter` consecutive normal samples | `clearAfter` |
| Escalate | Warning to Critical on depth (`deviationRatio ≥ deviationFactor`), duration (`readings ≥ afterReadings`) or a sustained rise | `escalation` |

CPP's shipped rule constants (`alarms.ts`): `raiseAfter: 2`, `clearAfter: 3`,
`hysteresis: 0.02`, `escalation: { deviationFactor: 1 }`. A breach deeper than one full band
width is critical, which is the same ratio the parameter table colours red by.

`computeAlarms` collapses a rule's episodes into one `CppAlarm` with `occurrences` (a
hunting parameter shows one row saying "8 times", not eight rows).

### The alarm row (`CppAlarm`), which is the contract between evaluator, screen and watcher

```ts
{ key, ruleId, asset, message, severity: 'critical'|'warning'|'data',
  value, unit, limit, band, provisional,
  since, minutes, active, clearedAt, occurrences,
  area, action, muted?, severityPinned? }
```

Sort order: data, then critical, then warning; within a severity, active before cleared,
then longest standing.

---

## 5. Rule families and ids

A rule id is `<family>:<scope>`. The id is what overrides, suppressions, the insight
`resultName` and the webhook payload all key on.

| Family | Id pattern | Fires when | Needs a band | Goes through engine | Source |
|---|---|---|---|---|---|
| `param` | `param:<location>:<param>` | Mapped tag outside its operating band | yes | yes | historian |
| `data` | `data:<location>:<param>` | Mapped tag stopped changing (its `param` rule is suppressed) | no | no | historian |
| `stopped` | `stopped:<tagKey>` | Turbine < 0.1 MW (critical if down now) | no | no | historian |
| `nosteam` | `nosteam:<location>` | Mapped boiler < 1 TPH | no | no | historian |
| `metric` | `metric:<key>` | Derived KPI series outside its alert band | yes, **none shipped** | yes | derived |
| `lab` | `lab:<location>:<field>` | Hand-filed lab value outside its alert band | yes, **none shipped** | yes (on-delay counted in shifts) | lab |
| `labstale` | `labstale:coal:<unit>` | Lab sheet not filed for the period | no | no | lab |
| `pm` | `pm:<unit>` | ERP: maintenance missed or not okay; `data` if the register is stale | no | no | erp |

Principles to keep when you define your own families:

- **No limit, no rule.** A parameter without a band raises nothing. The app never invents
  a band. `metric:` and `lab:` ship with no bands at all, so adding them changed nothing
  until the plant typed one.
- **A broken input raises a `data` row, never a fake process alarm.**
- **Derived figures are evaluated on their series, never on the card's window value.**
  `partial` inputs are evaluated and flagged `provisional`; `unreliable` inputs are replaced
  by a `data:metric:<key>` row; `awaiting` is silent.
- **Stamp an episode with something that does not move.** Lab episodes use the shift end.
  An identity built from the window start re-raised every standing alarm at each shift
  change.
- **State rules (`labstale`, `pm`) ship on at `data` severity**, below the default webhook
  floor, so they show on screen and in history but page nobody.

---

## 6. Alert controls: what the plant can tune

### 6.1 Three layers

```
SHIPPED_ALERT_DEFAULTS  →  alertsByUnit[unit].defaults  →  alertsByUnit[unit].rules[ruleId]
```

`resolveAlertControls(unit, ruleId)` fills every field and records which layer it came
from (`source: 'shipped' | 'unit' | 'rule'`). The drawer shows that as a chip.

| Field | Shipped | Meaning | Applied by |
|---|---|---|---|
| `enabled` | `true` | Notifications on/off. **Never hides the row**: sets `alarm.muted`. | `alarms.ts` sets `muted` (see §11) |
| `onDelayMinutes` | `2` | Must be out of band this long before raising | engine via `raiseAfterFor` (param, metric); `labRaiseAfter` (lab, in shifts) |
| `deadband` | `{ mode: 'pct-of-band', value: 2 }` | Re-arm margin. `pct-of-band` or `absolute` (in the parameter's unit) | engine via `hysteresisFor` |
| `severityOverride` | `null` | Pins severity, beating escalation; sets `severityPinned` | `alarms.ts` |
| `cooldownMinutes` | `0` | Repeat interval; 0 = once per crossing | **not applied** (see §11) |
| `minSeverityToNotify` | `'warning'` | Per-rule webhook floor | **not applied** (see §11) |

**The shipped layer reproduces pre-configuration behaviour exactly**: 2 min at the
watcher's 60 s bucket equals `raiseAfter: 2`, and 2 % equals `hysteresis: 0.02`. Deploying
the config system onto a live plant therefore changes nothing until someone saves
something. Keep that property. `cooldownMinutes` ships as 0 rather than a "helpful" 120,
because 24 standing conditions reminding every 2 h would be 1,152 messages a day.

### 6.2 Derivations (`alertConfig.ts`)

- `raiseAfterFor(onDelayMinutes, bucketMs)` = `max(1, round(minutes × 60000 / bucketMs))`.
  This is exact on the watcher (60 s buckets). On a long dashboard window the delay clamps
  to 1 sample, and the UI reports that.
- `hysteresisFor(d)`: `pct-of-band` gives `{ hysteresis: value/100 }`. `absolute` gives
  `{ hysteresis: 0.02, hysteresisAbs: value }`. The /100 happens **only here**. The
  frontend stores, sends and displays per cent.
- `labRaiseAfter(ctl)`: 1 if the on-delay is still the shipped value, otherwise the typed
  number read as **shifts**.
- `bypassesEngine(ruleId)`: true for `data:`, `stopped:`, `nosteam:`, `labstale:`, `pm:`.
  These have no band, so a deadband is refused for them.

### 6.3 Validation (`alertConfigPatch.ts`)

A patch is **refused whole** and lists every problem at once (HTTP 400,
`{ error, problems[] }`).

| Check | Limit |
|---|---|
| Repeat interval | whole minutes, 0 to `10_080` (1 week) |
| On-delay | whole minutes, 0 to `720` (12 h); for lab rules whole shifts 1 to `9` |
| Deadband % | 0 to `50` |
| Deadband on a band-less rule | refused |
| Severity / floor | one of `critical`, `warning`, `data` |
| Band | needs min or max; `min < max` |
| Band on an unmapped parameter | refused (it could never compare against a reading) |
| Band on a metric with no series (`turbine_eff`) | refused |
| Lab band | only where the catalogue says that lab rule exists |
| **Unknown rule id** | **kept and returned as a warning**, not refused. A `param:` rule disappears when its band is removed and comes back when the band returns; its tuning must survive that round trip. |

---

## 7. The rule catalogue (`alertRules.ts`)

`alertRuleCatalogue(unit)` lists every rule a plant **could** have, built from static
tables plus the settings. It reads no historian, so `/api/cpp/alerts` answers in
microseconds. Its predicates are copied deliberately from `alarms.ts`. If you change which
rules `alarms.ts` raises, change this file in the same commit.

Each `AlertRuleInfo` carries: `ruleId`, `kind`, `label`, `asset`, `uom`, `band`,
`canFire`, `controls` (resolved), `deadbandApplies`, `onDelayAppliedBy`
(`engine`|`watcher`), `onDelayUnit` (`minutes`|`shifts`), `source`
(`historian`|`derived`|`lab`|`erp`), and the reasons it cannot fire:

| Flag | Meaning | What the drawer offers |
|---|---|---|
| `bandMissing` | Could alarm, no limit yet | min/max boxes on the row |
| `instrumentMissing` | No tag mapped | nothing editable; needs the plant |
| `blockedReason` | Any other cause, in words (e.g. no series) | the sentence |
| `orphanedOverride` | A saved setting for a rule that does not exist now | listed, kept |

---

## 8. The watcher process

### 8.1 Run it as its own deployment

```
npm --prefix backend run alerts        # tsx src/alerts/watch/main.ts
```

It is separate from the API server on purpose. An API restart for a frontend change must not
create a gap in alerting, and a watcher stuck on an unreachable webhook must not take the
dashboard down.

### 8.2 One tick (every `ALERT_INTERVAL_SECONDS`, default 60, minimum 15)

1. `if (running) skip`. Ticks never overlap.
2. For each plant: `getCppSnapshot({ unit, phase: 'full' }).alarms`.
3. Ignore `!active`. Ignore if matched by the suppression file.
4. Dedup key = `${unit}:${alarm.key}`. **Nothing derived from a reading or a time.**
5. Key not in previous `open` → emit an event. Key already open → silent.
6. Key in previous `open` but not now → re-armed, silently. Nothing is posted on recovery.
7. A plant that fails to read keeps its previous `open` keys. Clearing them would re-raise
   everything on the next good read.
8. **Cold start primes:** with `primedAt === null`, everything currently standing is adopted
   without announcement. Otherwise every deploy would re-page ~20 days-old conditions.
9. Save state, enqueue events, flush the outbox, ping the heartbeat.

### 8.3 The event

```ts
interface AlertEvent {
  id: string;        // `${unit}:${key}:${at}` — stable across retries, the idempotency key
  at: string;        // ISO, the tick that saw the crossing
  plant: string;     // "CPP-1"
  unit: CppUnitSel;  // "CPP1"
  asset: string;     // "TG-3"
  severity: 'critical' | 'warning' | 'data';
  message: string;
  value: number | null; uom: string; limit: number | null;
  ruleId: string;
}
```

### 8.4 Durable state (`ALERT_STATE_DIR`, default `<repo>/.alert-state`, gitignored)

| File | Lifetime | If lost |
|---|---|---|
| `state.json` | rewritten each tick (`primedAt`, `open`) | re-primes: no duplicates, but crossings during the gap are never sent |
| `outbox.jsonl` | rewritten as entries clear; **written before any delivery** | undelivered alerts lost |
| `events.jsonl` | append-only local record of every event | history only |

Writes are temp file plus rename. A corrupt line in the outbox skips that line only, and a
corrupt state file re-primes rather than crashing. **Put this directory on a volume that
survives redeploys.**

### 8.5 Delivery (`deliver.ts`)

- Sinks per event: always `insight`, plus `webhook:<url>` **for each configured URL** if
  `severity ≥ ALERT_WEBHOOK_MIN_SEVERITY` (default `warning`). The insight always gets the
  event, so history has no holes.
- Sinks are keyed by URL, not by position, so reordering the list cannot misroute queued
  entries. One receiver being down retries only that receiver.
- Backoff per entry: 0, 1, 2, 4, 8 … min, capped at 30 min, measured from `lastTriedAt`.
- **New events are attempted first, every tick.** Retries get what is left of
  `ALERT_FLUSH_BUDGET_MS` (default 20 000). `0` defers all retries. On 3 Nov 2026 a
  6,778-entry backlog flush took 89 s against a 60 s tick and stopped evaluation; this is
  the fix.
- `normaliseOwed` expands legacy `'webhook'` entries to the current URL list and drops
  sinks for URLs that are no longer configured.

### 8.6 Webhook (`webhook.ts`)

- `ALERT_WEBHOOK_URL` is a **list** (commas, spaces or newlines). One POST per event per
  URL, 10 s timeout.
- For an n8n URL containing `/webhook/`, the same body is also posted to `/webhook-test/`
  so a workflow can be rehearsed on live alerts. The test result is reported and **never**
  decides delivery, because it 404s whenever the editor is not listening. Override with
  `ALERT_WEBHOOK_TEST_URL` (positional list) or turn off with `ALERT_WEBHOOK_TEST=off`.
- `ALERT_WEBHOOK_SECRET` is sent as the `X-Alert-Token` header.
- Payload = every `AlertEvent` field, plus `subject`, `body`, `severityLabel`, `valueText`,
  `limitText`, `timeIst`.

### 8.7 Message format (`message.ts`), fixed so an n8n template never branches

```
subject: [WARNING] CPP-1 TG-1 — Main Steam Pressure low

Plant: CPP-1
Equipment: TG-1
Condition: Main Steam Pressure low
Severity: WARNING
Reading: 63.96 bar
Limit: 64 bar
Time: 03 Nov 2026 19:13 IST
```

The same seven lines every time. A missing figure prints `NA` and never disappears.

### 8.8 Alert history insight (`insight.ts`)

`INS_9b503b42192d` (`ALERT_INSIGHT_ID`). Row: `resultName: cpp-alert/<unit>/<ruleId>`,
`tags: [unit, asset, severity]`, `result: { ...event }`, `invocationTime: event.at`,
`metadata: { clientId: event.id, unit, asset, severity, ruleId, formId: 'cpp-alert', source: 'cpp-alert-watcher' }`.

### 8.9 Suppressions (`config/cpp_alert_suppressions.json`)

```json
{ "suppressed": [
  { "unit": "CPP1", "key": "param:tg1:ms_pressure", "reason": "…", "until": "2026-12-01" },
  { "unit": "ALL",  "key": "data:*", "reason": "…" }
] }
```

Ships empty. `key` matches exactly, or as a prefix if it ends in `*`. `until` expires the
entry. The file is re-read when its mtime changes, so no restart is needed. A malformed
file suppresses **nothing**. Suppression affects notifications only; the dashboard still
shows the row.

### 8.10 Staying alive

- `GET /health` on `ALERT_PORT`, else `PORT`, else 5151. It returns 503 when no tick has
  completed in three intervals. Point the platform's health check at it.
- `ALERT_HEARTBEAT_URL`: POSTed after every good tick (`{ at, openAlarms, outbox }`) so
  something outside can alarm on the watcher going quiet. The most dangerous alerting
  failure is a silent watcher, because it looks exactly like a healthy plant.

---

## 9. API

| Method & path | Purpose |
|---|---|
| `GET /api/cpp/settings?unit=` | Every editable field with value, unit, `approval`, `basis`, `source: 'default'|'edited'`, plus `source: { loaded, error, updatedAt, insight }` |
| `PUT /api/cpp/settings` | `{ unit, by, metrics?, bands?, plant?, turbineRatings?, feederCurves?, boilerRefs?, ladderBands?, fuelMix? }`. 400 with reasons on any invalid field |
| `GET /api/cpp/alerts?unit=` | `{ unit, defaults (resolved), shipped, rules: AlertRuleInfo[], counts: { total, canFire, muted, overridden, bandMissing, instrumentMissing, orphaned } }`. No historian read |
| `PUT /api/cpp/alerts/config` | `{ unit, by, defaults?, rules?, bands?, metricBands?, labBands? }`. Body limit 256 kB for bulk edits. Returns `{ ok, updatedAt, updatedBy, warning }` |
| `GET /api/cpp?unit=…` | The snapshot; `payload.alarms` is the live alarm list |

Bands typed on an alert row are written to **the same section** the settings drawer writes
(`bandsByLocation` for `param:`). There is one limit sheet, not two.

---

## 10. Frontend

### 10.1 Patterns shared by both drawers

- **Drafts are strings.** An input mid-typing is "6" on the way to "60". Parse once, on save.
- **Blank means inherit, never zero.** The placeholder shows the inherited value, and a
  chip (`This rule` / `Plant` / `Shipped`, or `edited` / `default`) shows where the current
  value comes from. Clearing a box sends `null`.
- Only changed keys are sent (`changed` set). Draft keys are namespaced, for example
  `m:<metric>`, `b:<loc>:<param>:min`, `def:<field>`, `rule:<ruleId>:<field>`,
  `band:<ruleId>:min`.
- The draft reloads when the drawer opens or the plant changes, so an edit left over from
  another plant is never saved against this one.
- A "Your name (optional)" box fills `by`, which becomes `updatedBy` and insight metadata.
- After save: re-seed from the server, dispatch `SETTINGS_SAVED_EVENT`, and show the
  server's `warning` if there is one.
- The deadband's mode and value boxes are **one setting**. Changing only the mode resends
  the existing value.

### 10.2 Alert config drawer

- Reuses the settings drawer's shell and CSS (`settingsdrawer.css` imported, never edited).
  Its own tweaks are scoped under `.al-drawer`.
- Pane **Plant defaults**: notifications on/off, repeat, on-delay, deadband + mode,
  notification floor, severity override.
- Pane **Rules** (~97 on CPP-1): groups start closed; group by asset / rule type / source /
  flat; sticky search; filters "only tuned", "only off", "only no limit yet"; a bulk toggle
  on each group heading. Columns: Rule, Band, Notify, Repeat, On-delay, Deadband. Lab rules
  label on-delay in shifts.

### 10.3 Alerts page

- Live rows come from `payload.alarms`, the same snapshot every screen reads, so this page
  costs the historian nothing and cannot disagree with Asset Health.
- The rule catalogue comes from `/api/cpp/alerts`, polled on the app refresh tick.
- **Muting never hides a row.** A muted rule shows quietly (`row-muted`) with an "off" pill.
- **No demo fixture.** An invented alert looks identical to a real one.

---

## 11. Known gaps in the CPP build (verified 12 Nov 2026)

These are not design choices. The UI or comments promise behaviour the code does not
deliver. When replicating, either implement them (the fix is outlined) or remove the
control from the UI. Do not copy the gap.

| # | Gap | Evidence | Effect | Fix |
|---|---|---|---|---|
| 1 | **The watcher never loads the shared settings.** | `refreshCppSettings()` is called only in `api/server.ts:755,761`. `alerts/watch/main.ts` never calls it, so `loadCppSettings()` in the watcher process returns the empty document forever. | The watcher evaluates against the **shipped baseline only**. Bands edited in either drawer, all `metric:` and `lab:` bands (none ship, so those rules can **never notify**), on-delay, deadband and severity pins all apply on screen but not to notifications. The drawer's "Saved — the watcher picks this up within two minutes" is untrue. | In `main.ts`, `await refreshCppSettings()` before the first tick and on a 120 s interval, as `server.ts` does. |
| 2 | **Mute is not enforced.** | `alarms.ts:659` sets `a.muted`; `watcher.ts` never reads it. | A rule switched off in the drawer still posts. Dormant until gap 1 is fixed, because the watcher sees no `enabled: false` today. | In `runTick`, skip notification for `a.muted` but still track the key in `open`, so un-muting does not fire a stale crossing. |
| 3 | **`cooldownMinutes` is not implemented.** | No runtime reference outside the config/validation files. | No reminders. The Alerts page "Notifying" column shows `every N` for a rule with a repeat interval, but it notifies once. | Store `lastNotifiedAt` per open key in `WatchState`; re-emit when `now − lastNotifiedAt ≥ cooldown`. |
| 4 | **Per-rule / plant `minSeverityToNotify` is not used.** | `deliver.ts` reads only the env `ALERT_WEBHOOK_MIN_SEVERITY`. | The drawer's notification floor has no effect. | In `sinksFor`, take the floor from `resolveAlertControls(event.unit, event.ruleId)`, with the env as the shipped value. |
| 5 | **Watcher-side on-delay is not implemented.** | The catalogue reports `onDelayAppliedBy: 'watcher'` for `data`/`stopped`/`nosteam`/`labstale`/`pm`; `watcher.ts` has no delay logic. | Those families post on the first tick they appear, whatever on-delay is set. | Track `firstSeenAt` per key; emit once `now − firstSeenAt ≥ onDelayMinutes`. |

Fix gap 1 first; it is the one that makes the others observable. Each fix needs a test in
`cppAlertWatcher.test.ts`. That file currently has no case for mute, cooldown, floor or
on-delay.

---

## 12. Replicating for a new division

Use `<DIV>` for the division code and `<UNIT>` for its plants or sections.

### 12.1 Decide first

- [ ] The list of units (`MANAGEMENT_PLANTS` equivalent) and the locations and parameters
      per unit.
- [ ] Which figures are settable and at what scope (per unit, per machine, per kind).
- [ ] Your rule families and their id patterns. Start with `param:` and `data:`; add others
      only with a data source behind them.
- [ ] Who receives the webhook (n8n workflow URLs) and at what severity floor.

### 12.2 Backend

1. **Baseline:** create `config/<div>_limits.json`. Every value has `unit`, `approval`, and
   a `basis` sentence. Leave a band out rather than guess one.
2. **Insights:** create **two new insights**, one for settings and one for alert history.
   Do not reuse the CPP ids. Set `resultName`s like `<div>/settings` and
   `<div>-alert/<unit>/<ruleId>`.
3. **Settings store:** copy `settingsStore.ts` and `settingsInsight.ts`. Rename the
   sections. Keep `coerce`, spread-first save, null-means-fallback, pruning,
   `settingsVersion`, keep-on-error, and the local-file-is-not-read rule.
4. **Limit accessors:** one `limitFor(unit, location, param)` that every screen **and** the
   alarm builder call. A row coloured against one limit and alarmed against another is the
   bug this prevents.
5. **Alarm builder:** write `<div>/alarms.ts` producing the `CppAlarm` shape, calling
   `engine.ts` for every banded family, applying `resolveAlertControls` (raiseAfter,
   hysteresis), then mute and severity pin over the whole list before sorting.
6. **Alert controls:** copy `alertConfig.ts` and `alertConfigPatch.ts`. Keep the shipped
   no-op defaults and the ceilings. Update `bypassesEngine` for your families.
7. **Catalogue:** write `<div>/alertRules.ts` mirroring your `alarms.ts` predicates
   exactly. Keep the orphan handling.
8. **Snapshot:** put `alarms` on the payload every screen already fetches.
9. **API:** `GET/PUT /api/<div>/settings`, `GET /api/<div>/alerts`,
   `PUT /api/<div>/alerts/config` with the 256 kB body limit. On every save call
   `invalidate…SnapshotCache()`.
10. **Watcher:** copy `alerts/watch/*`. Change: the alarm source (`fromSnapshot`), the plant
    list, the insight id and `resultName` prefix, the suppression file path, and the
    default `ALERT_STATE_DIR`. **Close the §11 gaps**, at minimum gap 1.
11. **`logbook/write.ts`:** reuse as is.

### 12.3 Frontend

1. Copy `useCppSettings.ts` + `CppSettingsDrawer.tsx` + `settingsdrawer.css`; replace the
   panes with your sections.
2. Copy `useCppAlerts.ts` + `CppAlertsConfigDrawer.tsx` + `CppAlerts.tsx` + `alerts.css`;
   replace `KIND_LABEL`, `SOURCE_LABEL`, `PLANT_LABEL` and the API paths. Remove any control
   whose backend behaviour you have not implemented (§11).
3. Wire the Alerts view and both drawers in `App.tsx`. Refetch the live snapshot on
   `SETTINGS_SAVED_EVENT`.

### 12.4 Environment

| Variable | Process | Purpose |
|---|---|---|
| `IOSENSE_BEARER` | both | PAT for insight read/write. Without it: baseline settings, no insight sink |
| `IOSENSE_BASE` / `IOSENSE_ORG` | both | default `https://connector.iosense.io` / `https://iosense.io` |
| `CPP_SETTINGS_INSIGHT_ID` | both | settings insight (rename per division) |
| `CPP_SETTINGS_FILE` | both | diagnostic mirror path |
| `DEPLOY_NAME` | API | recorded as `origin` on settings rows |
| `ALERT_WEBHOOK_URL` | watcher | receiver list |
| `ALERT_WEBHOOK_TEST_URL` / `ALERT_WEBHOOK_TEST=off` | watcher | rehearsal addresses |
| `ALERT_WEBHOOK_SECRET` | watcher | `X-Alert-Token` |
| `ALERT_WEBHOOK_MIN_SEVERITY` | watcher | `data` / `warning` (default) / `critical` |
| `ALERT_INSIGHT_ID` | watcher | alert history insight |
| `ALERT_INTERVAL_SECONDS` | watcher | default 60 |
| `ALERT_STATE_DIR` | watcher | persistent volume path |
| `ALERT_FLUSH_BUDGET_MS` | watcher | default 20000; 0 defers retries |
| `ALERT_PORT` / `PORT` | watcher | health port |
| `ALERT_HEARTBEAT_URL` | watcher | dead-man ping |

`backend/src/config.ts` loads `.env` from the **repo root**. There is no `backend/.env`.

### 12.5 Insight HTTP contract (from `logbook/write.ts`)

Write: `POST {IOSENSE_BASE}/api/account/bruce/insightResult/add`

```
Headers: Authorization: <PAT>   organisation: <IOSENSE_ORG>
         Content-Type: application/json   ngsw-bypass: true
Body:    { insightID, resultName, applicationType: "Insight", tags[], result{},
           metadata{ …, clientId }, invocationTime }
```

- Do **not** send `applicationID`. It is cast to a Mongo ObjectId and throws.
- `metadata` must be non-empty. Use `clientId` as the idempotency key.
- Check `success` in the response body; HTTP 200 alone does not mean the row was stored.

Read: `PUT {IOSENSE_BASE}/api/account/bruce/insightResult/fetch/paginated/<insightId>` with
body `{ insightID, pagination: { page, count } }`. Rows come back newest first; filter by
`resultName` on the client. Use 5,000 rows a page.

### 12.6 Go-live

1. Deploy with the overrides document empty. Confirm the dashboard and the alarm list are
   unchanged from before.
2. Start the watcher. The log should read
   `primed: adopted N standing condition(s) without announcing them`.
3. Point `ALERT_WEBHOOK_URL` at the n8n production URL with "Listen for test event" open,
   and watch rehearsal posts arrive.
4. Save one setting in each drawer from one box. Confirm it shows on a second box within
   120 s, and that a new row appears in the settings insight with the right `origin`.
5. Force a crossing (tighten one band), confirm one webhook post plus one insight row,
   then restore the band and confirm nothing is posted on recovery.
6. Check `GET /health` returns 200 and the heartbeat receiver is getting pings.
7. `npm --prefix backend run typecheck && npm --prefix backend test`, and
   `cd frontend && npx tsc --noEmit && npm run build`.
