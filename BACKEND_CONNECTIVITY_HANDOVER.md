# Backend Connectivity Handover — InfluxDB, ERP, Logbook

**Audience:** a backend engineer wiring the same three data sources into a different
dashboard project. This documents the integration layer as shipped in `backend/`: how
each source is reached, why it is reached that way, and what fails how.

---

## 0. The architecture rule everything else follows

**The backend computes every KPI; the frontend only renders.** One typed snapshot object
crosses the wire (`backend/src/types.ts`, mirrored to the frontend). No KPI math happens
in the browser — the browser never fills a gap it was handed.

The corollary is the honesty contract, and it is what makes these integrations shaped the
way they are:

```
status 'ready'       genuinely measured                → Live badge
status 'partial'     derived from measured values only → Calc badge
status 'unreliable'  real tag, frozen or saturated     → Check badge
status 'awaiting'    value is null                     → NA
```

**No source is ever substituted.** When a system is unreachable, its client returns
*empty series* and `connection: 'down'`, and every value downstream reads NA with a
client-facing reason. There is no mock fallback anywhere in this layer. Adding one is the
single change that would break the whole product promise.

Client-facing strings are centralised in `backend/src/kpi/sources.ts` (`SRC` and `NEED`)
so that no implementation jargon — "InfluxDB", "VPN", "AppSheet", "Oracle" — can leak into
the UI. Port that file's discipline, not necessarily its strings.

---

## 1. Source map

| Source | What it holds | Transport | Client |
|---|---|---|---|
| **Process historian** | DCS process tags (flows, temps, pressures, speeds) | InfluxDB v2 over the plant VPN | `influx/client.ts` (pellet), `cpp/client.ts` (power plant) |
| **Electrical EMS** | per-equipment electrical load | a **separate** InfluxDB | `cpp/emsClient.ts` |
| **ERP (Lighthouse, Oracle)** | fixed-asset register, preventive-maintenance plan + results | `oracledb` thick mode, **read-only**, offline sync → JSON cache | `cpp/syncErpAssets.ts`, `cpp/syncErpPm.ts` → `cpp/erpAssets.ts`, `cpp/erpPm.ts` |
| **IOsense lab logbook** | AppSheet QC/lab forms, served as a Bruce "insight" | HTTPS REST, Bearer JWT | `logbook/client.ts` → `quality/provider.ts` |
| **Sensor explorer** | the full published field catalogue (not just KPI tags) | same historian | `influx/explorer.ts` |

Runtime cache/state lives in `backend/data/` — **gitignored**, survives restarts.

---

## 2. Environment

`backend/src/config.ts` loads the repo-root `.env` via dotenv and exposes a typed `Env`.
`opt()` treats empty strings as `null`, so a blank variable is "not configured", never `""`.

```bash
# --- Process historian (InfluxDB v2, over the plant VPN) ---
INFLUX_URL=                 # http://10.x.x.x:8086
INFLUX_ORG=
INFLUX_BUCKET=
INFLUX_TOKEN=
INFLUX_USER=                # v1 fallback: leave TOKEN empty, set user+password
INFLUX_PASSWORD=

# --- Electrical EMS (a DIFFERENT InfluxDB) ---
EMS_INFLUX_URL=
EMS_INFLUX_ORG=
EMS_INFLUX_BUCKET=          # defaults to "EMS Data"
EMS_INFLUX_TOKEN=

# --- ERP (Oracle) · READ-ONLY ---
ERP_DSN=                    # host:port/service_name
ERP_USER=
ERP_PASSWORD=
ERP_ORACLE_CLIENT_DIR=      # e.g. /opt/oracle/instantclient_23_26  (thick mode required)
ERP_CACHE_PATH=backend/data/erp-pellet.json

# --- IOsense lab logbook ---
IOSENSE_BEARER=             # "Bearer <PAT>" — dev seed only, never commit a real value
IOSENSE_BASE=https://connector.iosense.io
IOSENSE_APPSERVER=https://appserver.iosense.io
IOSENSE_ORG=https://iosense.io

# --- App ---
PORT=5127
POLL_INTERVAL_SECONDS=60
```

> **Why the EMS has its own variable namespace.** It is a different instrument with a
> different schema. Sharing `INFLUX_*` would let one mis-set variable silently query the
> wrong server and return a plausible number from somewhere else. Keep separate namespaces
> per physical system — this is the cheapest correctness guarantee in the file.

The Vite dev server reads `PORT` out of the **same** `.env` rather than hardcoding it
(`pellet-frontend/vite.config.ts`). Two checkouts on one machine otherwise proxy into each
other's backend, and that fails silently: unknown routes 404 and the dashboard just reads NA.

---

## 3. InfluxDB — the process historian

### 3.1 The coordinate model

A reading is identified by **measurement + `Unit` tag + `Group` tag + `_field`**. A tag
definition (`cpp/tags.ts`) is the single place that binds a business name to those
coordinates:

```ts
export interface CppTagDef {
  key: string;          // internal, stable
  tag: string;          // client-facing name (shown in the drawer)
  label: string;
  measurement: string;
  unitTag: string;
  group?: string;       // see the warning below
  field: string;
  unit: string;         // engineering unit AFTER scale
  scale: number;        // multiplier onto the raw reading
  ratedMw: number | null;
  mapped: boolean;      // false ⇒ never produces a value
  pending?: boolean;    // declared by the plant, not yet seen in the historian
}
```

> **`Group` is not optional in spirit.** A field name is *not* an identifier on this
> historian: `MainSteamFlow` is published by AFBC, TG3_18, WHRB3 **and** WHRB4 on the same
> `Unit`. Matching on measurement + Unit + field pulled all four into one series — 1124
> points where the boiler alone has 281 — and averaged three boilers and a turbine
> together. Every def carries its Group so this cannot happen to a tag added later.

> **`scale` documents disagreement between a tag's name and its reality.** TG#2's field is
> `..._KWLOAD_...` but the plant publishes megawatts, and the readings agree (~10 MW on a
> 12 MW machine). So `scale: 1` and the *name* is what's wrong. Record that in the def, not
> in a comment somewhere else.

> **`mapped: false` is the honesty switch.** An unmapped tag is never queried and never
> produces a value, so a KPI that depends on it stays visibly NA instead of acquiring a
> plausible-looking number from a guessed field.

### 3.2 Query construction

Flux is built as a string with a hand-rolled escaper:
```ts
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
```
All identifiers come from checked-in tag definitions, never from user input.

**Use OR-chains, not `contains()`.** Measured on this server, `contains()` is too slow.
The pellet client batches `r._field == "x" or r._field == "y" …`:

```
BATCH = 20 fields per query, PARALLEL = 4 queries at a time
```
Measured: 11 queries × 2-parallel = 0.29 s over 6 rounds; 7 × 4-parallel = 0.16 s over 2 —
byte-identical results (29,884 rows both ways). 6-parallel is faster but leaves no headroom
on a shared server. **Re-measure on your server rather than copying these numbers.**

The CPP client groups by *measurement* instead, with a per-def
`(Unit == … and Group == … and _field == …)` OR-chain, and demultiplexes rows back with a
`` `${Unit} | ${Group} | ${field}` `` composite key (falling back to Unit+field for defs
that declare no Group).

### 3.3 Bucket width — one rule, two constraints

```ts
function bucketSeconds(fromMs, toMs) {
  const spanS = Math.max(60, (toMs - fromMs) / 1000);
  return Math.max(60, Math.ceil(spanS / 500 / 60) * 60);   // ~500 points/series
}
```
The **500-point cap** keeps payloads and render cost bounded. The **60 s floor** is not
cosmetic: the KPI spec defines 1-minute accumulation, and the shortcut `Σ(rate / 60)` is
only equivalent to `Σ(rate × Δt)` when Δt really is one minute. It also puts tags published
on different cadences (~20 s and ~12 s) onto a shared time base so they can be summed.

Use the same rule across every client so a chart from source A and a chart from source B
over the same window have the same resolution.

### 3.4 Three read shapes — pick deliberately

| Function | Aggregation | Use for |
|---|---|---|
| `fetchCppWindow` | `aggregateWindow(every: Ns, fn: mean)` | trends and window averages |
| `fetchCppLatest` | `last()`, **unaggregated** | "what is the instrument reading right now" |
| `fetchCppRaw` | no aggregation at all | **energy integration** |

Each exists for a reason you will hit too:

- **`mean`, not `last`, for windows.** These are power readings being averaged; a bucket's
  mean is its energy-correct representative. `last` would make the window average depend on
  where bucket boundaries happen to fall.
- **`latest` must not be a bucket.** Bucket width scales with the window, so on a 7-day view
  the newest bucket is a 20-minute average. A *current reading* must not change meaning
  because somebody widened the date picker. It is bounded by the window, not by "now", so a
  historical view shows the last point of that period rather than leaking today's reading
  into yesterday.
- **`raw` because an average cannot be integrated.** The interval each reading stood for is
  exactly what bucketing discards. Measured cost: a shift ≈ 7,300 points across four tags in
  ~50 ms; thirty days ≈ 690,000 points in ~1.7 s. Cheap enough that approximating the
  integral to save bytes is not worth the error. (Raw reads use a 300 s client timeout vs
  60 s for windowed ones.)

### 3.5 `leadInMs` — carry-forward across the window boundary

`leadInMs` extends the **query**, not the window: it pulls the last readings from *before*
the window opens so a tag whose feed paused earlier can still be carried into it. Without
it, a turbine that stopped publishing ten minutes before a shift began is absent from that
shift entirely, and the plant appears to have lost its output at the shift boundary.
Rounded to whole buckets so the in-window grid is unchanged.

### 3.6 Failure behaviour

```ts
if (!env.influxUrl || !env.influxBucket || (!env.influxToken && !env.influxUser))
  return { connection: 'down', message: 'Plant historian connection not yet configured', series: empty };
try { … } catch { return { connection: 'down', message: 'Plant historian unreachable', series: empty }; }
```
Two distinct messages — *not configured* and *unreachable* — because they need different
actions from whoever reads the screen. `empty` is pre-populated with an entry per requested
key, so downstream code never has to null-check the map itself.

### 3.7 The EMS variant

Different shape, hence a separate client rather than a flag:

- ONE measurement, `ems_power`; everything keyed on an equipment `name` tag; load in field
  `value`.
- Reads are **raw** (they feed integration). ~1,440 points/feeder/day — cheap.
- Filter is `r.data_type == "equipment"` **as well as** the names. The EMS writes three
  levels into the same measurement — per-equipment rows, per-section rollups and a plant
  summary — and the rollups reuse field names. Without this filter a future section row
  named like a feeder is silently added to the auxiliary total, double-counting it against
  its own members.
- Real-world caveat the payload carries explicitly: several EMS aux meters read a flat zero
  while their machines run, so the total is **low** and anything derived from it is an upper
  bound. That is surfaced as `understated: true` + a `reason` string, not hidden.

### 3.8 The explorer

`influx/explorer.ts` serves the **full** published field catalogue (229 fields on P2, 109
on P1) — not just the ~160 KPI tags — because the point of an explorer is to reach signals
no card uses. Known fields inherit their proper label and engineering unit; unknown ones
show the historian's own name. Catalogue cached server-side 30 min; series capped at 8
fields per request using the same 500-point aggregation rule.

---

## 4. ERP (Oracle) — read-only, synced offline

### 4.1 The pattern: never query the ERP from a request

Two CLI scripts pull from Oracle into JSON caches; **the API process only reads files.**

```
npm --prefix backend run sync:erp-assets   → backend/data/erp-cpp-register.json
npm --prefix backend run sync:erp-pm       → backend/data/erp-cpp-pm.json
```

Three properties this buys, all worth keeping:
1. A page load can never put load on the production ERP.
2. A missing Oracle Instant Client cannot take the API down.
3. **Raw rows are cached, not derived results** — so changing a classification or grading
   rule takes effect without going back to the ERP.

### 4.2 Read-only by construction

```ts
oracledb.initOracleClient({ libDir: ERP_ORACLE_CLIENT_DIR });  // thick mode required:
                                                               // old password verifier
const conn = await oracledb.getConnection({ user, password, connectString: ERP_DSN });
conn.callTimeout = 90_000;
await conn.execute('SET TRANSACTION READ ONLY');
// … SELECTs only …
await conn.close();   // in a finally block
```
Scope every query to the entities/divisions you are entitled to read and say so in a
comment. Here: `MP` (MSP Steel & Power) and `MS` (MSP Sponge Iron, Raigarh); `MK` is a
different plant and is never read.

### 4.3 Cache reads are mtime-gated

```ts
let cached: { mtimeMs: number; data: T } | null = null;
function readCache() {
  try {
    const { mtimeMs } = statSync(CACHE);
    if (cached?.mtimeMs !== mtimeMs) cached = { mtimeMs, data: JSON.parse(readFileSync(CACHE, 'utf8')) };
    return cached.data;
  } catch { return null; }   // never synced → null, and the UI says so
}
```
Re-parse only when the sync rewrites the file. A missing cache is a **stated** state
(`"The ERP asset register has not been synced yet."`), not a crash.

### 4.4 Asset register — `ASSET_MAST`

```sql
SELECT entity_code, div_code, asset_code, asset_name, asset_detail, asset_group,
       TO_CHAR(startup_date,'YYYY-MM-DD') startup, disposal_flag
  FROM MSPV7ERP1.ASSET_MAST
 WHERE (entity_code = :e0 AND div_code = :d0) OR …
```

Two facts about this table decided the whole counting model, and equivalent facts will be
true of any fixed-asset register:

1. **Rows are capitalisation entries, not machines.** One plant carries "TG SET &
   ACCESSORIES" 18 times for a one-turbine plant — the machine booked in stages. Nothing in
   the ERP tells two of them apart. So **one asset = one distinct name per division**, and
   the record count behind it is kept and shown.
2. **It is an accounting ledger**, so it also books buildings, furniture, computers, cabling
   and loose steel plate. Those are listed but **not counted** — a health dashboard's asset
   total is equipment — and each carries the reason why.

Classification is an ordered `[RegExp, area | {reason}]` list where **order is the logic**:
exclusions first; electrical before turbine/auxiliary; balance-of-plant before boiler;
`BOILER FEED PUMP` before the boiler rule. Rules are tried on the **head** of the name
(the part before ` FOR ` / ` WITH ` / ` IN `) because that is where the ERP puts what the
asset *is*. Unrecognised names fall through to `other` rather than being dropped — new
equipment is likelier than furniture, and it must stay visible.

Also recorded, because it constrains what you can build: `EQPT_ID_MAST.ASSET_CODE` is empty
on every row, so the register **cannot** be joined to equipment records or historian tags.

### 4.5 Preventive maintenance — `EQPT_PM_TRAN`

Same table serves two roles:

- **PLAN** — `TRANTYPE = PREVENTIVE_SCH`, `FLAG = 'F'`: one row per equipment × job × due
  date, generated years ahead. **Its `REMARK` is the job template's text copied onto every
  future instance — it is NOT a result** and must not be read as one.
- **RESULT** — same table, `FLAG` null, no due date: one row per job logged, dated `VRDATE`,
  with a free-text `REMARK`.

> **There is no link between a plan row and the result that satisfies it**, and no
> structured pass/fail anywhere (`FAULT_CODE` never filled; `NORMS_ACCEPTANCE` on 1 job in
> 1,785). So three judgements are made in code, each stated on the screen:
>
> | Judgement | Rule |
> |---|---|
> | **DONE** | a result for the same equipment+job, from 3 days before the due date to 30 days after (or until the next due date, if sooner). *Date proximity **is** the link.* |
> | **MISSED** | a due job with no such result, once the due date is 7 days behind (grace — a weekly job done two days late is late, not missed) |
> | **OKAY** | `classifyRemark()` reads the free text; an unrecognised remark is treated as okay **and listed for review** rather than silently turning a machine Critical |

`classifyRemark` was built from 66,000 real remarks. Findings match **first** and only on
explicit negative phrasing ("to be checked", "not ok", "found leakage"), because a third
kind of remark exists: the job's own description pasted back as the result ("Check coupling
pin bush condition, if req replaced"). A looser pattern turned every such machine Critical.
`"ISOLATED"` is okay — it answers a permit step, not the machine's condition.

Sync window: `AHEAD_DAYS = 60`, `BACK_DAYS = 180`.

**If you port one thing from this section, port the habit:** when an ERP does not record a
relationship, reconstruct it explicitly, name the reconstruction, bound it with stated
tolerances, and show the user that it is a reconstruction.

---

## 5. Lab logbook (IOsense Bruce insight)

`backend/src/logbook/client.ts`. AppSheet lab/QC forms surfaced as an IOsense "insight".

### 5.1 Auth — the token never reaches the browser's storage or disk

```
IOsense portal  →  app URL ?token=<one-time SSO token>
frontend        →  strips it from the address bar (history.replaceState)
                →  POST /api/logbook-sso { token }
backend         →  GET {BASE}/api/retrieve-sso-token/{token}
                →  Bearer JWT held IN PROCESS MEMORY only
```

- The SSO token is single-use and expires ~60 s after minting, so it must not survive in
  browser history, a shared link or a screenshot — hence the immediate `replaceState`.
- `IOSENSE_BEARER` may seed a session for development. A **PAT never expires** and is what
  a server-side poller needs; an SSO session dies with the process.
- With no valid session every logbook-derived KPI is NA. No substitution.
- A new exchange **clears the cache** — data fetched under an old session is not reused.
- A `401` (or an error mentioning session/auth/token) **drops the bearer** so the UI can ask
  for a fresh one instead of silently serving stale data forever.

Required headers on every call: `Authorization`, `organisation: <IOSENSE_ORG>`,
`ngsw-bypass: true`, `Content-Type: application/json`.

### 5.2 Fetch

```
PUT {BASE}/api/account/bruce/insightResult/fetch/paginated/{insight_id}
body: { insightID, pagination: { page, count: 500 },
        filters: { startDate: ISO, endDate: ISO } }
```
Date filtering is pushed **down to the API**. Paginated at 500, capped at 20 pages. Rows
named `__accessControl` / `browser-write-test` are bookkeeping, never lab entries.

### 5.3 Caching — containment lookup + stale-while-revalidate

This is the part most worth copying; a naive cache here produced a visible periodic stall.

- **Window rounding.** On a live window `toMs` is "now" and moves every request, so an
  exact-match key never hit and every poll paid a ~1 s round trip. Windows are rounded
  outward to a `CACHE_MS` (5 min) grid. The end is rounded up by **two** steps, not one —
  with a single step the entry stops exactly at the boundary the clock is about to cross,
  so containment fails and one poll every five minutes blocked on a full ~2 s fetch.
  Reaching a step beyond "now" costs nothing: the API cannot return rows that don't exist yet.
- **Lookup by containment, not equality.** A cached window that fully covers the request
  answers it. Returning a superset is safe because the caller derives each sample's own
  timestamp and slices to its own range.
- **Stale-while-revalidate.** `CACHE_MS = 5 min` fresh; up to `STALE_MS = 30 min` an entry
  is served immediately while a refresh runs behind the request (`force = true` stops the
  refresh recursing). Lab forms are submitted hourly at best, so a five-minute-old set is
  not meaningfully different from a fresh one.
- **Serviceable entries.** An entry whose end falls short by up to `2 × CACHE_MS` is still
  served while revalidating. The only thing it lacks is the newest tail. The *start* must
  still be covered — a short window cannot answer for a longer history.
- **In-flight dedupe.** Concurrent callers asking for overlapping ranges (the snapshot asks
  for the wide window and the previous shift at the same moment) share one request.
- Ring buffer of 8 entries.

### 5.4 Field mapping — `config/logbook_mapping.json`

**No field key is ever guessed.** Every form and column is resolved through this file; an
unmapped form or field yields no samples, so the dependent KPI stays NA with its true reason.

```ts
interface FormMap {
  appsheet_form: string;
  slug: string | null;
  sample_time_field: string | null;   // or "date+time" / "date+shift"
  division_field?: string | null;     // which line this row belongs to
  fields: Record<string, string | null>;
  row_filter?: { field?: string; in?: string[] };
}
```

Populate it from the live feed, not from documentation:
- `GET /api/logbook?discover=1&days=N` — real field keys per form with fill rates and a sample.
- `GET /api/logbook/profile?form=X&days=N&by=Y` — distinct values for text fields,
  min/median/max for numeric ones, optionally grouped. Discovery alone is not enough to
  decide a mapping: telling South African coal from washed coal needs the GCV *distribution*
  per coal type, not one example row.

### 5.5 Timestamps — the subtle one

Entry time lags sampling by hours, so it must **never** be used as sample time unsuspectingly.
`rowTime()` handles three modes and flags the rest:

| `sample_time_field` | Behaviour | `entryTimed` |
|---|---|---|
| `"date+time"` | compose `date` + `time` in plant local time (IST `+05:30`) | `false` |
| `"date+time"`, time blank | date only | **`true`** — a date without a clock cannot place a sample in a shift |
| `"date+shift"` | anchor to that shift's start hour (A 06, B 14, C 22) | `true` |
| a named field | `Date.parse` it | `false` |
| *(fallback)* | `invocationTime` / `createdAt` — the submission time | **always `true`** |

`date+shift` exists because some forms log an hour *range* ("12:00PM-02:00 PM"), which is
not a timestamp. Falling back to date-only put the entry at midnight, dropping it into
shift C regardless of the shift it belonged to.

The `entryTimedFields` list travels with the payload so the UI can say which figures are
entry-timed.

### 5.6 Helpers you will need equivalents of

- `divisionMatches(row, field, want)` — every lab form carries **both** production lines; an
  unfiltered read silently mixes them. Normalises whitespace/case ("P 1" → `P1`).
- `rowFilterMatches(row, filter)` — one form carrying several materials in one table (all
  coal types in one `gcv` column), selected by value rather than by a distinct field.
- `num(v)` — coerces to a finite number or `null`. **Blanks stay blank.** Never `Number("")
  === 0`.

### 5.7 The quality layer on top

`quality/provider.ts` turns logbook rows into ~25 typed `LabSample[]` feeds, and adds two
things worth replicating:

- **`carry`** — the last sample at or before the window end, *even if taken before the
  window started*. Lab forms arrive a few times a shift, so a short or quiet window
  legitimately contains none. **Point-in-time reads use it; aggregates deliberately do not**
  — a compliance percentage must be computed over the samples actually in the window.
- **`recent7d`** — several QC columns are recorded once a day, so a single shift contains
  none and a chart would be empty. The 7-day lookback is already pulled for carry-forward,
  so it is handed to the UI rather than fetched twice.
- `mappedFields` drives an honest status message about what is actually resolved.

---

## 6. API surface

Express on `PORT` (default 5127). `cors()` global; `express.json({ limit: '16kb' })`
mounted **after** the read routes, before the write ones. In production the same process
serves the built SPA (`express.static` + an SPA fallback that excludes `/api`).

| Route | Purpose |
|---|---|
| `GET /api/production-snapshot` | full snapshot; `?view=supervisor\|management\|asset` scopes the **response** (~60 % smaller) while still computing all three from one shared, window-cached fetch |
| `GET /api/live` | the poll-often route: each KPI-strip value **plus every input that produced it**, with per-input status, reason and last-seen time — small enough to poll at 30 s, complete enough to verify a number from the browser without re-implementing its formula |
| `GET /api/cpp` | power-plant snapshot; `?detail=1` adds per-boiler steam series (~57 KB) the default poll omits |
| `GET /api/cpp/assets` | ERP asset register (cache read; never opens Oracle) |
| `GET /api/cpp/health` | asset health, ERP PM + historian overlay |
| `GET /api/cpp/management` | executive roll-up |
| `GET /api/cpp/asset-kpis` · `GET /api/cpp/tg-params` | per-asset detail |
| `GET /api/cpp/settings` · `PUT /api/cpp/settings` | plant-editable limits (§7) |
| `GET /api/kpi-history?key=` | one KPI's series |
| `GET /api/sensors` · `GET /api/sensor-series?fields=a,b,c` | raw explorer (≤8 fields) |
| `POST /api/logbook-sso` | exchange the one-time SSO token |
| `GET /api/logbook` | session + form counts; `?discover=1`, `?days=N` |
| `GET /api/logbook/profile?form=` | per-field value distribution |
| `POST /api/maintenance-action` · `GET /api/maintenance-action/log` | acknowledgements |
| `GET /api/config` | `{ poll_interval_seconds }` |
| `GET /api/health` | liveness |

All query-range parsing goes through one `parseRange(q)` returning
`{ fromMs?, toMs?, shift?, unit?, period? }`. `period` carries the **preset** as well as the
window, because the window alone loses intent: "Current Week" on a Tuesday resolves to a
1.3-day span indistinguishable from any other, and the two deserve different baselines.

Every handler is `try/catch` → `500 { error: '<code>', message }`. Named error codes, not
raw stack traces.

---

## 7. Plant-editable settings — the two-layer pattern

`cpp/settingsStore.ts`, worth copying wherever limits are "approved by the plant":

1. `config/cpp_limits.json` **ships with the app and is never written.** Every value carries
   its own `approval` and `basis` saying where it came from. A redeploy always restores a
   known set of limits.
2. `backend/data/cpp-settings.json` holds **only what a person changed**, layered over that
   baseline. An untouched limit keeps tracking the shipped figure rather than being frozen
   at whatever it happened to be the day someone opened the drawer.

One file on one server, so it is shared by construction: whoever edits a limit, everyone
looking at that plant judges against it from their next poll. Two supervisors working to
different limits on the same machine is worse than no limits at all. There is no per-user
state to reconcile.

Every payload says `source: 'plant' | 'shipped'` (or `'default' | 'edited'`) so a screen can
show which numbers the plant has actually signed off.

The config loader also supports **per-unit deep-merge overrides** (`configForUnit`), where
the distinction between `undefined` and `null` is load-bearing:

> `undefined` means "not overridden"; **`null` means "explicitly cleared"**. A limit the
> plant has not approved for line P1 is written as `null`, and the grading helpers return no
> verdict when a limit is null. Treating null as absent would silently reinstate P2's number
> and grade P1 against a limit nobody approved for it — the exact failure this layer exists
> to prevent.

---

## 8. Frontend consumption

- **`api/base.ts`** resolves the API origin in order: `?api=https://host` in the URL
  (persisted to `localStorage`; `?api=` clears it) → `VITE_API_BASE` baked at build time →
  `''` (same origin). Needed because a static/CSR deploy with no `/api` behind it returns
  `index.html` and `JSON.parse` dies on `"<!doctype"`. The fetch hooks check
  `content-type` and **name that real problem** instead of surfacing "Unexpected token '<'".
- **`useSnapshot`** — poll interval from `/api/config`, fetched **once per page** and shared
  as a promise, so two plants can't drift into different refresh rates. Monotonic request id
  so a slow older request can't overwrite a newer view. A refresh **keeps the previous
  numbers on screen** — a control-room screen that blanks on one dropped request is worse
  than one showing a reading with its age stated — except across a demo↔live mode change,
  where stale demo figures badged as Live would be a lie.
- **`useCppLive`** — 30 s poll, `unit` guarded by a ref so a late response for the previous
  plant is discarded rather than painted under the new plant's heading. Also listens for
  `SETTINGS_SAVED_EVENT`: a saved limit changes what the payload *judges*, so the screen
  re-reads immediately rather than showing the old verdict until the next poll.
- **`useLogbookSession`** — runs once on mount: take `?token=` from the URL, exchange it,
  then report status; `onConnected` lets the caller refetch and light up lab-dependent KPIs
  without a page reload.

---

## 9. Security & operational notes

- **ERP is read-only by construction** — `SET TRANSACTION READ ONLY`, SELECTs only, run
  from a CLI outside the API process, scoped to named entities/divisions.
- **The lab Bearer JWT lives in process memory only.** Never written to disk, never sent to
  the browser. `.env` is gitignored; `.env.example` carries only shapes.
- **No plant data leaves the site.** Chart exports rasterise in the browser
  (`fallbackToExportServer: false`); nothing is POSTed to an external export service.
- Oracle **thick mode** (`initOracleClient`) is mandatory — the ERP uses a password verifier
  the thin driver cannot speak. Instant Client must be installed wherever the sync runs
  (not where the API runs).
- The historian is reached over a Pritunl/OpenVPN tunnel. Only the sync/API host needs it.
- `backend/data/` is gitignored runtime state and **survives a restart, not a re-clone**.
  Schedule both ERP syncs (cron) or the register ages silently.

---

## 10. Porting checklist

1. **Copy `config.ts`'s shape first** — typed `Env`, `opt()` returning `null` for blanks,
   one namespace per physical system.
2. **Write the tag-definition module before any client.** One entry per physical
   measurement, named by the machine; `mapped` and `scale` from day one.
3. **Clone the Influx client per instrument, not per plant.** Two systems with different
   schemas get two clients; two plants on one schema share one.
4. **Set the bucket rule once** (point cap + floor) and use it in every client, including
   the explorer.
5. **Decide `mean` / `last` / `raw` per consumer**, and comment the choice at the call site.
6. **Never query the ERP from a request.** Sync script → raw-row JSON cache → mtime-gated
   pure reader.
7. **Build the logbook mapping from `?discover=1` + `/profile`**, never from documentation.
8. **Implement the cache before you implement the feature** — containment lookup,
   stale-while-revalidate, in-flight dedupe. Retro-fitting it is how the periodic stall got
   shipped in the first place.
9. **Put every client-facing string in one module** so no implementation jargon leaks.
10. **Test the degraded paths first.** Every client must have a unit test for
    "not configured" and "unreachable" that asserts *empty series*, not an exception and not
    a substituted value. Existing examples: `backend/test/` — 34 suites, run with
    `npm --prefix backend test` (vitest).

### Known constraints inherited from these sources

- The ERP asset register cannot be joined to equipment records or historian tags
  (`EQPT_ID_MAST.ASSET_CODE` is empty on every row).
- ERP PM results carry no reference to the plan row they satisfy; the match is date
  proximity and is the weakest joint in the chain.
- Several EMS auxiliary meters read a flat zero while their machines run, so auxiliary
  totals are a lower bound and anything derived from them is an upper bound.
- Some lab forms carry no sample clock time; those samples are entry-timed and flagged.
