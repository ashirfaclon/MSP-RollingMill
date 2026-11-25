# Development log — MSP Rolling Mill dashboard

**Read this first in every new session, and add to it before the session ends.** It is the memory
of the project: what was built, what was decided and by whom, and what is still open. Newest entries
at the bottom of each section. `git log` has the detail of every change; this file has the why.

---

## 1. The project in short

Dashboards for MSP Steel, Raigarh — four rolling mills: **HSM** (hot strip mill), **RMD** (TMT bars),
**LSM** (light structure mill), **RMS** (rolling mill structure). Each mill has screens:
Visualization, Asset Health, Condition Analytics, Alerts. Built by Faclon on the IOsense platform.

- `backend/` — Fastify + TypeScript API (`npm run dev`, port 8521 locally; tests `npx vitest run`).
- `frontend/` — Next.js static site (`npx next dev -p 8520`; e2e `PW_PORT=8520 npx playwright test`).
- Data: ERP (Oracle, synced into `backend/data/*.json`), plant historian (Influx), IOsense logbook
  forms (insight `INS_353018753af1`), MID vibration forms. Every IOsense call is listed in `iosense.md`.
- The user explains things in plain words and wants answers in plain words (no jargon).

## 2. Standing rules (from the user — keep them)

- Real data only. No source → **NA**, never a sample figure. No health score anywhere.
- A KPI with no entry in the period shows the **last entry, dated**.
- Dashboard opens on the **previous plant day**. Plant days: HSM 08:00, RMD 09:00, LSM 09:00, RMS 09:30 IST.
- Plan gap = production − plan. Specific energy = power ÷ ERP production.
- Production plans are entered and edited **on the dashboard** (logbook Production Plan form).
- HSM has no ERP PM.
- Commit or push only when the user asks. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never delete a file that git does not track — move it to a backup instead (34 plant files were
  lost on 19 Nov 2026 this way).

## 3. History by phase (git log has every commit)

| When | What |
|---|---|
| 28 Sep – 7 Oct | HSM Visualization, live data (ERP, historian), separate backend, static frontend, IOsense SSO |
| 9 – 13 Oct | RMD, LSM, RMS wired from the ERP log sheets; stock by the plant's stock query; power; plans |
| 15 – 23 Oct | Asset Health for RMD, HSM, LSM, RMS from logbook forms; RMD Condition Analytics; mill MPS, chemistry |
| 26 – 31 Oct | Condition Analytics for all mills; MID vibration; ERP PM; CA inputs and plan popups saved to the logbook; process twins; last-entry rule; sample data removed |
| 6 Nov | Code audit (was in `docs/`, removed 19 Nov; still in git history at commit before `2523a55`) |
| 11 – 13 Nov | RMD issue-log points (section 4) |
| 19 Nov | Plant Settings screen (limits); Alerts page and alert settings (section 5); repo cleanup |

## 4. RMD issue log (from the plant, via the user) — status on 21 Nov 2026

Sources given: the issue log points, `Management Dash (1).xlsx` (which Zoho KPIs Faclon can give:
FACLON = YES / NO / Calculated) and `TMT_Online_and_Offline_.pdf` (the Zoho TMT dashboard, a
reference for the KPIs only — its data is to be ignored).

| # | Point | Status | Notes |
|---|---|---|---|
| 1 | **TPH** = Input (MT) ÷ adjusted running hours; adjusted = double-stand h + single-stand h ÷ 2; MILL_SINGLE_STAND from the ERP | **Done** 13 Nov (`d6168c0`) | Visualization and Condition Analytics. We read MILL_SINGLE_STAND as **minutes already inside ACTUAL_RUNNING_HRS** (from the data: 5–50 per entry), so adjusted = ACTUAL_RUNNING_HRS − MILL_SINGLE_STAND ÷ 120. **To confirm with the plant.** |
| 2 | **Mill mimic**: PR1 before FS, PR1 before CS, M/S → MPS, RPM | **Done** 11 Nov (`f2b9bb6`), labels 21 Nov | Line 1: PR1 → FS → PR2 → TB1 → TB2. Line 2: PR1 → CS → PR2 → TB1 → TB2 — line 2's rolls renamed 21 Nov from the tag names (PR pre / PR post / TB 1 / TB 2) to match line 1 and the plant's wording. |
| 3 | **Bearing graph** like the reference; remove stand-wise selection; all bearings in one graph | **Done** 11 Nov (`c452fb4`) | The per-stand selection is gone; the chart shows every stand. The **All / Roughing / Route** dropdown stays on purpose — that is what the plant wanted kept (the user, 21 Nov). |
| 4 | **Online / Offline switch** on the dashboard | **Done** 13 Nov (`40c1389`) | Top bar: Both / Online / Offline. Online = RO001, Offline = RO002 (TRAN_COLUMN_NAME1). Production, prime, input, losses, yield, TPH, power (ERP TOTAL_POWER_CONSUMPTION) per rolling. |
| 5 | **Online and Offline KPIs shown separately, like Zoho** | **Done for what the plant asked** 21 Nov | One rolling at a time with the switch. The plant then asked for **Rolling in Casting, Rolling in Delivery and Plant Efficiency** ("not added yet") — added 21 Nov as RMD headline cards from the ERP log sheet (section 4a). The other Zoho KPIs the ERP holds (availability, breakdown h, coal, yield excl. S/L …) are **not** to be added until the plant asks (the user, 21 Nov). |
| 6 | Fetch MILL_SINGLE_STAND; Online (RO001) / Offline (RO002) production with S-length and production only | **Done** 13 Nov | Prime + SL (PRODUCT_PRIME_SLENGTH_MT) and Prime (FINISH_PRODUCT_PRIME_MT) per rolling. |
| 7 | Production plan: "consider only the data available in the ERP and provide an option to edit it" | **Done** 13 Nov (`b55931f`) | Agreed with the plant (via the user): the plan is filled on our dashboard, separately for Online and Offline — not taken from the ERP. Actuals are ERP only. |

### 4a. Zoho KPIs the plant now wants (21 Nov 2026)

We had added only the Zoho KPIs already on our dashboard. The plant then said: "Rolling on Casting,
Delivery, and Efficiency KPIs have not been added yet" — so those Zoho KPIs are to be added.

Finding (read-only ERP query, 21 Nov): the RMD log sheet (ATTR_TRAN_DATA_BODY, USER_CODE FA-SKJ, per
entry, Online RO001 / Offline RO002) already holds them as filled fields, every entry since Sep 2026:
ROLLING_IN_TOTAL_PERCENTAGE, ROLLING_IN_DELIVERY_PRCNT, PLANT_EFFICIENCY, PLANT_PERFORMANCE,
PLANT_AVAILABILITY, CASTING_RATE_MTHRS, DELIVERY_RATE_MTHRS, ROLLING_RATE_MTHRS, MILL_TOTAL_BREAKDOWN_HRS
(and MILL_BKDN_IN_MIN_* by cause), COAL_CONSUMPTION_KGMT, YIELD_PERCENT_EXCL_SLENGTH / INCL_SHORTLENGTH,
PRODUCTION_TARGET, POWER_KWHMT, *_PERCENTAGE for each loss. So the "FACLON = NO" items in
Management Dash (1).xlsx mostly do have an ERP source.

Decided with the user (21 Nov 2026):
- **The ERP is the source of truth.** Zoho's PDF / sheet numbers are a reference for which KPIs to
  show, never for the figures (the plant: "Data you can ignore it"). So the ERP's own fields are used
  as they are, even where Zoho's numbers differ.
- **The production plan is NOT taken from the ERP** (PRODUCTION_TARGET is ignored for the plan): the
  plant types it on the dashboard, separately for Online and Offline — already built (`b55931f`).
- Rolling in Casting % = ROLLING_IN_TOTAL_PERCENTAGE (the only casting-related percentage field).

Built 21 Nov 2026: the ERP sync pulls ROLLING_IN_TOTAL_PERCENTAGE, ROLLING_IN_DELIVERY_PRCNT,
PLANT_EFFICIENCY, PRODUCTION_TARGET (`RMD_ROLLING_FIELDS`, `backend/src/integrations/erp/cache.ts`).
`/api/rmd/production` gives rollingInCastingPct, rollingInDeliveryPct, plantEfficiencyPct, targetMt per
period and rolling: the two rolling % are each entry's figure, over several entries averaged weighted by
INPUT_MT; efficiency = Σ Prime + SL ÷ Σ PRODUCTION_TARGET (one entry = the ERP's PLANT_EFFICIENCY).
RMD headline strip is now 12 cards, two rows of six; the three cards open one drill-down (per day / week /
month, bars, source and formula). Test: `frontend/src/tests/rmd-performance.e2e.spec.ts`.

## 5. Settings and alerts (replicating the CPP dashboard's system)

Guide: `SETTINGS_AND_ALERTS_REPLICATION.md` (from the CPP developer). Plan agreed with the user:

| Step | What | Status |
|---|---|---|
| 1 | Fix the shared IOsense login (audit S-01 / S-07) | **Deferred** by the user; needed before go-live |
| 2 | Settings screen: every limit editable, readings coloured by them | **Done** 19 Nov (`2d8c53a`) |
| 3 | Alerts page: limits crossed, data checks (not filled, typing slip, can't read) | **Done** 19 Nov (`119f13b`) |
| 4 | Alert settings (on/off, readings in a row, deadband, severity, messages from) | **Done** 19 Nov (`119f13b`); per-alert "repeat" dropped 21 Nov (the contact list's timings replace it) |
| 5 | Alert sender — its own deployment; memory of what was sent kept in IOsense | **Built 21 Nov, not committed, not deployed** (see below) |
| 6 | n8n webhook + recipients | Received 21 Nov: `SMS-ALERTS.md` (the Melt Shop's working system — escalation matrix of SMS / WhatsApp / email per level; payload with `smsTo` / `whatsappTo` / `emailTo`, subject, 7-line body) and the n8n URLs, path `msp/rmsalerts` (prod `/webhook/`, test `/webhook-test/`). Build to match that payload |
| 7–9 | Full tests, go-live one mill at a time (LSM / RMS first — fresh data), docs | Open |

**User's answers, 21 Nov:** the `rmsalerts` n8n workflow already exists (built like the SMS one); ONE
webhook for all four mills, each message names its **department** (HSM / RMD / LSM / RMS); **one contact
list per mill**; data checks are **never** sent.

**What was built 21 Nov (step 5 + the recipients part of 6):**
- Settings → new tab **Escalation matrix** (renamed from "Who is told" by the user, 21 Nov) (`frontend/src/components/settings/ContactSettings.tsx`): per mill, up to
  10 levels, each with "every N minutes" and SMS / WhatsApp / email (switch + comma list), and the switch
  **One message per crossing** (on by default = level 1 told once). Stored in the settings document under
  `alerts.<mill>.escalation`, saved whole through `POST /api/settings/:mill/alerts` (`escalation` in the
  body); checked by `backend/src/modules/alerts/escalation.ts` (phones normalised, a channel on with nobody refused).
- "Messages from" is critical or warning only; data checks never send (also enforced in the sender).
- The sender: `backend/src/modules/alerts/sender/` — `main.ts` (loop + health page), `decide.ts` (what is
  news), `message.ts` (SMS-ALERTS.md payload + `department`), `deliver.ts` (outbox, retries 1/2/4…30 min,
  gives up after 24 h), `webhook.ts` (X-Alert-Token, `/webhook-test/` rehearsal copy), `state.ts` (memory),
  `status.ts` (the Alerts page banner: running or not). It runs `millAlerts` itself (the same checker as the
  page) with the PAT — no dashboard login involved, so the S-01 shared-login problem doesn't silence it.
- Memory in IOsense, logbook insight: tag `rolling-mill-alerts/sender` (one row, updated in place, at least
  every 30 min) and `rolling-mill-alerts/sent` (one row per message sent = the alert history). Memory older
  than 6 h is not trusted (looks afresh quietly) so a long outage never floods old alerts.
- Run: `npm --prefix backend run alerts` (local) / `alerts:prod` (built, `dist/alert-sender.js`). Env in
  `backend/.env.example` (ALERT_*). **Run exactly one sender.**
- Tested: unit tests (`backend/test/unit/alert-sender.test.ts`, 18) + Playwright `alerts.e2e.spec.ts`; and a
  live run on real IOsense data with a local catcher instead of n8n and test memory tags: 5 real RMD oil-tank
  alerts sent once each (main + rehearsal, token attached), nothing repeated; after a restart it read its
  memory back (17 crossings) and sent nothing. Test rows deleted after.
- **Not done yet:** nothing posted to the real n8n URL; not committed; not deployed; no contacts entered;
  `ALERT_WEBHOOK_SECRET` must be agreed with whoever owns the n8n workflow.

Decisions: limits the plant didn't give are standard placeholders until the plant types its own (no
labels for this on screen any more: 23 Nov); everything lives in one IOsense document (tag
`rolling-mill-settings/settings`, newest row wins); data checks show on screen but send no message by
default. Code: `backend/src/config/limits.ts`, `backend/src/modules/settings`, `backend/src/modules/alerts`,
`frontend/src/components/settings`, `frontend/src/components/alerts`.

## 6. Known issues

- 44 Playwright tests fail (21 Nov) — old tests for UI that was since removed (audit T-01). Not rewritten yet; the RMD twin tests were brought up to date 21 Nov.
- The live electricity-meter (EMS) test fails: IOsense returns an empty meter list (since 19 Nov).
- `frontend/tools/mimic-render/render.cjs` has 4 lint errors (old helper script).
- GitHub token is stored in plain text in the git remote URL — the user should replace it.
- Branch `feature/hsm-condition-report` (local only, not on GitHub): an unmerged HSM monthly
  condition report (Excel download). The user said to leave it.

## 7. Session log

- **19 Nov 2026** — Settings screen; Alerts page and alert settings; one live save tested and reset
  for each; repo cleanup (Excel/zip/png files deleted for good, `reports/` and `docs/` removed).
- **21 Nov 2026** — Reviewed the RMD issue log against the code (section 4). Started this log. Added
  Rolling in Casting / Delivery / Plant Efficiency to RMD (ERP); line-2 mimic labels PR1 / PR2 / TB1 / TB2.
  Alerts paused until the RMD points are finished (the user). Next: back to alerts step 5.
  Committed `e8de662`. Then: a Full screen button, the last control at the right of the top bar
  (`frontend/src/components/shell/FullscreenButton.tsx`; Esc leaves it; hidden where unsupported).
  Themed scrollbars everywhere, dark and light (`--sb-thumb` tokens and one rule in `styles/theme.css`).
  Top bar: RMD Rolling (Both / Online / Offline) and the Asset Health drive group are dropdowns now, like
  Mill (one shared `components/shell/Picker.tsx`); the drive group sits in the row of controls (after
  Rolling, before Duration), not beside the title. On narrower screens the controls wrap under the title
  together, as one row. Test: `frontend/src/tests/topbar.e2e.spec.ts`.
  MSP Steel's logo in the sidebar (was an "MSP" text badge): the user's `frontend/public/msp-logo.png`
  (447 × 447, white background) cropped to its lettering as `msp-logo-wordmark.png`, on a white tile so
  the navy shows on the dark rail; smaller when the sidebar is collapsed.
  Later 21 Nov: the user gave `SMS-ALERTS.md` + the n8n `rmsalerts` URLs; built the alert sender and the
  Escalation matrix tab (section 5). Work on `main`, uncommitted (the HSM branch is untouched).
  Sender deployed by the user 21 Nov (`3318c69`), running and primed (17 standing alerts adopted quietly) but
  with **0 receivers**: `ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_SECRET` still to be set on its deployment.
  `a0c478f`: `alerts:prod` now builds first (the first deploy failed with MODULE_NOT_FOUND).
- **22 Nov 2026** — Live end-to-end test passed on RMD: n8n's Webhook node was GET and the live link 404'd
  (21 Nov's 14 messages were given up after 24 h); fixed by the user (POST, active). Oil-tank min 35 → 45 at
  18:02 UTC: 5 raised alerts delivered at 18:04, then L1 + L2 reminders every minute, all accepted
  (RMD: one message per crossing OFF, every 1 min — the user accepts the volume). Open: RMD phone number has
  no +91; HSM / LSM / RMS have no contacts; ALERT_WEBHOOK_SECRET not confirmed; the Alerts page should say per
  row whether a message was sent.
- **23 Nov 2026** — HSM shift setup checklist: the user asked for the shift's own start and end time.
  Two time boxes after Shift (`Shift start time`, `Shift end time`, HH:MM 24 h), filled with HSM's usual
  Day 08:00–20:00 / Night 20:00–08:00 until typed; the backend checks them (`checklist.store.ts`). The
  logbook form Shift Setup Checklist itself still needs these two fields added (spec for the logbook builder).
  The old checklist browser test was pointed at the panel-header buttons (moved 31 Oct). Committed 23 Nov.
- **23 Nov 2026** — Settings → Limits: the "Where it comes from" column (Plant / placeholder, basis) is gone;
  the dashboard is in UAT and those labels were not wanted. What is left is who changed a limit and when
  ("Set by … · date", Reset), shown under the limit's name only when it was changed. The table is just
  Limit / Min / Max. Committed 23 Nov.
- **23 Nov 2026** — Management Dash All.xlsx, LSM sheet, the 8 "Online" KPIs (read-only ERP query). The
  LSM log sheet (FA-LP-P) already holds 7 of them: PLANT_AVAILABILITY, PLANT_PERFORMANCE, PLANT_EFFICIENCY,
  ROLLING_PERCENTAGE_CASTING, ROLLING_PERCENTAGE_DELIVERY, YIELD_PERCENTAGE (prime = PRODUTION_MT ÷ INPUT_MT,
  same as our Mass yield), TOTAL_PROD_YEILD (prime + short length). No mill breakdown-hours field (only
  SMS_BREAKDOWN_HOURS, DELAY_HRS). The sheet's filter "P11P" is RMS's mark (division RS, L5P); every LSM
  entry is P6P (LS, L7P), so LSM has no Online / Offline split in the ERP.
  **Built (user: show them as plain LSM figures; rename Mass yield → Prime yield + add Yield with non-prime):**
  synced fields LSM_KPI_FIELDS (`cache.ts`); `lsm/production.service.ts` — one entry = the ERP's figure; several =
  weighted (availability & efficiency by run + delay h, performance by run h, rolling by billet input), so
  efficiency over a period still = availability × performance. LSM Visualization: a 6-card top row (Production,
  Prime yield, Yield with non-prime, Power, Specific energy, Finished stock) and a "Mill performance" row of five,
  one drawer (`view="performance"`). Checked 1–8 Oct by hand against the ERP rows. ERP rolling in delivery is 0 on
  13 Sep, 4 Oct and 14 Oct (-0001) though the mill ran — shown as the ERP has it (told the user). The old test
  "LSM / RMS visualization … every figure NA" in rolling-mill.spec.ts was already failing (RMS too); not fixed.
  Committed 23 Nov.
  Layout (same day): the user rejected the second row of five big cards. The five are now one slim band
  (`.rm-perf`, visualization.css) under the six headline cards: a title and five small clickable figures.
  LSM Breakdown (h) = Σ DELAY_HRS (the user, 23 Nov 2026); drawer column "Breakdown (h)".
  Then (same day) the band was dropped: LSM's twelve figures are one grid of six per row, as RMD's
  (`rm-strip--six`) — row 1 the headline figures, row 2 availability, performance, efficiency, rolling in
  casting / delivery, breakdown.
- **23 Nov 2026** — HSM.xlsx, "CRITICAL PARAMETER → VISUALIZATION" (7 rows), read-only ERP check. All on the
  HSM log sheet (MP/S1/PRLOG/L6P), split by head TRAN_COLUMN_NAME1 ST001 Online / ST002 Offline:
  TOTAL_CAST_QTY, PRODUCTION_MT, DELIVERY_QTY, PRIME_MT, ROLLING_PERCENTAGE_DELIVERY (= INPUT_MT ÷ DELIVERY_QTY),
  ROLLING_PERCENTAGE_CASTING (= INPUT_MT ÷ TOTAL_CAST_QTY), cold power = ST002 POWER_CONSUMPTION_IN_KWH (and
  _KWH_MT = kWh ÷ PRODUCTION_MT). Our HSM sync has no mode and none of cast / delivery / rolling % / power yet.
  Recent ST002 entries are all 1.25 MT in, 1.21 MT out, ~770 kWh (≈630 kWh/MT) — told the user.
  **Built (same day).** User's rules: the two rolling % are ONLINE only (Offline's 100 % is filler, never counted);
  the five existing HSM cards never change with the switch; Online = five + Online set, Offline = five + Offline
  set, Both = five + both; cold power as kWh and kWh/MT. Layout was left to me (see memory decide-ui-yourself):
  Both adds Online + Offline (12 cards, six per row); Online / Offline have 11, so Production spans two columns.
  Backend: LOG_FIELDS + TOTAL_CAST_QTY / DELIVERY_QTY / POWER_CONSUMPTION_IN_KWH, row `mode` (HSM_MODE_CODES),
  `hsm/rolling.service.ts`, GET /api/hsm/rolling?mode=. Rolling % = Σ INPUT ÷ Σ CAST (÷ Σ DELIVERY) over Online.
  Frontend: HsmRollingCards + HsmRollingDrawer, KpiStrip (six per row), the Rolling picker on HSM Visualization
  (shares `rmdMode`). Tests: hsm-rolling.test.ts (4), hsm-rolling.e2e.spec.ts (1–18 Nov, checked by hand).
  Old test "root redirects to HSM Visualization…" (rolling-mill.spec.ts): card list brought up to date, but it
  still fails further down on the mill mimic's zone buttons — stale from before today, not fixed. Committed 23 Nov.
- **23 Nov 2026 — end of day, all of the above committed and pushed to main.** Also in the commit: the plant's
  sheets (HSM.xlsx, Management Dash All.xlsx), the updated HSM Checklists Form Spec.xlsx and the sample screens
  (HSM Shift Timing - Sample Screens.html). Open:
  - LSM: rolling in delivery is 0 in the ERP on 13 Sep, 4 Oct, 14 Oct (-0001) though the mill ran — ask the plant.
  - HSM: recent Offline (ST002) entries identical every day (1.25 MT, ~770 kWh) — ask the plant before trusting cold power.
  - HSM ERP log sheet has no entries after 18 Nov.
  - LSM sheet: pump house form and bearing temperature & lubrication form not compared yet.
  - Old browser tests still failing from before today (rolling-mill.spec.ts: HSM home screen mill-mimic zones, HSM
    asset health, RMD visualization; ~12 LSM / RMS tests in wiring.e2e.spec.ts that expect removed panels).
  - Shift setup checklist: the logbook form itself still needs the two time fields (spec xlsx given to the user).

- **24 Nov 2026** — **Production by shift → "Production vs plan", whole day only, all four mills** (the user):
  a compliance KPI — the plant day's output against the day's target, compliance %, plan chip, Edit plan,
  running rate and plan gap. No Day / Night breakdown, no By shift / Whole day toggle, no flip card; the
  drill-downs show only the whole-day table. User's answers: the plant still types **Day + Night** targets in
  Edit plan (the panel shows their total); running rate and plan gap stay.
  **Backup of the shift-wise version: `archive/shift-breakdown/`** — ShiftBars.tsx, ShiftProduction.tsx (HSM),
  RmdShiftProduction.tsx (RMD / LSM / RMS), ShiftPlanDrawer.tsx, RmdPlanDrawer.tsx and the two test files as they
  were at commit `f1222fd`, with a README on how to restore (`git checkout f1222fd -- <files>`). Not built from
  there. Left live so a restore needs nothing else: the backend's per-shift figures (/api/hsm/plan `actualByShift`,
  shift-split.ts; /api/{rmd,lsm,rms}/plan `totals.shifts`) and the flip-card CSS (`.rm-flip*`).
  Tests: wiring.e2e.spec.ts (HSM / LSM / RMS production vs plan, running rate) and rolling-mill.spec.ts rewritten
  for whole day; the RMS test now uses the plan as saved (435.46 MT a day → 5,225.5 MT for 1–12 Oct).
  Still failing from before (not this change): rolling-mill.spec.ts "root redirects…" (mill mimic zones), "RMD
  visualization…" (card list); wiring "RMD: running rate opens its drill-down" (table header); LSM / RMS
  condition analytics. Committed 24 Nov.
- **24 Nov 2026** — Production vs plan redesigned (the user rejected the first cut: one thin bar in a tall empty
  box, compliance the smallest figure, a pointless "Whole day" label, two plan numbers unexplained, figures in
  four corners). Now built around compliance: the big headline % beside one thick bar with the target marked;
  under it a **daily compliance strip** (one column per day against a 100 % line; a one-day period shows the 7
  days up to it, the day outlined — `usePlanTrend.ts`); at the foot four equal cells: Actual, Target, Plan gap,
  Running rate. A line explains when the target (days with production entered) differs from the period's plan
  chip. No plan: compliance NA, empty track, "fill it in with Edit plan", no strip. Styles `.rm-pvp*`
  (visualization.css). Same tests pass; the 3 old failures unchanged. Committed 24 Nov.
  Note reworded in plain words (the user didn't follow "Target is for the days with production entered"):
  "23 Nov not entered in ERP yet — compared up to 22 Nov" (several: "21 Nov – 23 Nov …"; gaps in the middle:
  "N days not entered in ERP yet — compared over the days entered"). No "no plan" note while loading.
- **24 Nov 2026** — HSM Visualization, Rolling switch: **Online or Offline shows only that rolling's row of six**
  (Online: Production, Cast qty, Delivery, Prime qty, Rolling w.r.t. casting / delivery; Offline: Production, Cast
  qty, Delivery, Prime qty, Cold power, Cold power per tonne). The five headline cards (Production, Mass yield,
  Power, Specific energy, Finished stock) show only under Both. Panels below unchanged (the user). `KpiStrip.tsx`;
  the double-width first card (`.rm-strip--lead-wide`) is gone. hsm-rolling.e2e.spec.ts updated, passes.
  Committed 24 Nov.
- **24 Nov 2026** — **Numbers: up to 2 decimals everywhere, only as many as needed** (the user): 8,511.43, 92.3, 100,
  Plan 9,638.64 MT — nothing rounded to a whole number any more (plan chip, target, kWh included, the user).
  One rule in `lib/num.ts` (`decimals()`, `num()`, `fixed()`; `dp` above 2 still allowed — chemistry 0.075) and
  DrillChart `fmtNum`; the hand-rolled formatters (production card, sparkline, twin readings, CA costing, tank
  litres, HSM rolling cards) use it. Backend already rounds to 2 or finer. Old browser tests that expected the
  1-decimal text: some numbers updated in hsm-rolling / production / rolling-mill / wiring specs, not re-run.
  **All 58 failing browser tests are recorded in `frontend/src/tests/KNOWN_FAILURES.md`** (reason, expected vs
  shown) instead of being fixed now (the user). When something breaks: a failure not on that list is new.
  Fix a screen's listed tests when that screen is next worked on, and delete their rows.
- **24 Nov 2026** — RMD 22 Nov Online / Offline checked against the ERP: L4P26N22-0002 RO001 Online 316.85,
  -0001 RO002 Offline 140.39 — the dashboard matches the ERP; nothing swapped here (the user's other source
  may differ; the entries were last edited in the ERP on 23 Nov). User said ignore.
- **24 Nov 2026** — **RMD prime yield** (the user): FINISH_PRODUCT_PRIME_MT ÷ INPUT_MT × 100 (`primeYieldPct`,
  rmd/production.service.ts), follows the Rolling switch. Shown in the Mass yield card as a pair, Prime + SL |
  Prime, so the strip keeps two rows of six; the yield drill-down ("Yield · ERP log sheet") has both, per day.
  22 Nov: 451.08 ÷ 472.69 = 95.43 %. Committed 24 Nov.
- **24 Nov 2026** — **RMD Coal consumption** (the user): kg per MT of Prime + SL, **Offline tab only** (hidden under
  Both and Online). ERP: COAL_CONSUMPTION_KGMT and TOTAL_COAL_CONSUMPTION, filled on Offline (RO002) entries only
  (0 on Online); KGMT = TOTAL × 1000 ÷ PRODUCT_PRIME_SLENGTH_MT on all 58 Offline entries checked (Sep–Nov).
  Over several days: Σ coal ÷ Σ Prime + SL of the Offline entries (`coal()` in rmd/production.service.ts; an entry
  without TOTAL uses KGMT × Prime + SL). 21–22 Nov: 18.5 + 13.2 MT ÷ 338.02 = 93.78 kg/MT. Card after Specific
  energy, drill-down "Coal consumption · ERP log sheet". Under Offline the two Mill MPS cards share one (Mill 1 |
  Mill 2) so the strip stays two rows of six. Test rmd-coal.test.ts (4). Committed 24 Nov.
- **24 Nov 2026** — **HSM Production card: Influx = production in the working hours** from the Shift Setup Checklist
  (the user). Each entry's Shift start → end time is a window of its plant date (a time before 08:00 is the next
  calendar day; an end at or before the start is the next day). Day + Night entries: both windows added, the gap
  left out. A day with no checklist times: NA (not the full day). Counter ticks less noise, summed inside the
  windows (`hsm/working-hours.ts`; `PRODUCTION_WORKING_SPEC` — only the /api/hsm/production route reads the
  checklist; power, plan and running rate still use the full plant day). Card: ERP | Influx (working hours), the
  delta only when every day has both; "no shift times in the checklist" / "shift times on N of M days". Drill-down:
  Influx · working hours column and each day's hours ("Night 21:00–08:00"). Only 1 Nov has times so far: 189.71
  of the day's 193.04 MT. Tests working-hours.test.ts (6). Committed 24 Nov.
- **24 Nov 2026** — **LSM finished stock: paver blocks removed** (the user). "Other" held one item, PAVER BLOCK
  (9" × 5" × 4"), filed under division LS and held in pieces: 7,000 read as 7,000 MT, doubling LSM's stock
  (14,254.76 → 7,254.76 MT). Rule in `lsm/stock.service.ts` (LSM and RMS): an item whose name gives no section and
  nothing saying steel (MS, steel, angle, channel, beam, joist, round, flat, bar, TMT) is not finished stock; a steel
  item with no readable size still goes to Other. RMS, RMD and HSM checked: no such items. Test in lsm-stock.test.ts.
  The user asked that data oddities like this be caught while developing (memory: sanity-check-data). Committed 24 Nov.
- **25 Nov 2026** — **Production vs plan strip broke on long periods** (the user, angry: RMD Current Year drew 329
  day-bars at ~5 px each, ran out of the panel over Finished stock and made the whole page scroll sideways; never
  tested beyond 23 days). Fixed in `ShiftBars.tsx` (`stripBars`): by day up to 31 days, by week up to 183, by month
  beyond (never more than ~31 bars; a bar = Σ output ÷ Σ plan over its days with both); starts at the first bar with
  a plan (no empty stubs); title Daily / Weekly / Monthly compliance; CSS: bars share the width, min-width 0, the
  strip is clipped to the panel. The note now says what is compared whenever it is not the whole period:
  "Plan starts 1 Apr · 23 Nov – 24 Nov not entered in ERP yet — compared 1 Apr to 22 Nov", "Plan ends 31 Oct …",
  "Plan covers 1 Oct – 31 Oct …" (HSM: "has no counter data yet"). Checked on all four mills × 1 day, 8 days,
  month, quarter, year × 1920 and 1366 wide: no page overflow, strip inside the panel. Committed 25 Nov.

- **25 Nov 2026** — **LSM Breakdown: its own drill-down** (the user: no combined chart — "make separate for all",
  Breakdown first, then the others). The Breakdown card opens "Breakdown · ERP log sheet": a column chart of
  DELAY_HRS per day / week / month, stats Breakdown and Running hours, table Period | Breakdown (h) | Running (h)
  (`LsmProductionDrawer.tsx` view `breakdown`). The other five still share "Mill performance" — next: one each.
  Checked day / quarter / year at 1920 and 1366 (no overflow). The LSM KPI test's numbers moved to 2 decimals
  and it passes (removed from KNOWN_FAILURES.md). Committed 25 Nov.
- **25 Nov 2026** — **LSM: every performance KPI has its own drill-down** (the user). Availability, Performance,
  Efficiency, Rolling in casting and Rolling in delivery each open "<KPI> · ERP log sheet": one line, a 100 %
  reference, and in the table the figures it is worked out from (availability: running and breakdown hours;
  performance: running hours; efficiency: availability and performance; rolling: billet input), with its own source
  and formula (`LsmProductionDrawer.tsx`, views = the KPI keys; the shared "Mill performance" view is gone).
  Checked all six × day / quarter / year × 1920 / 1366: one series each, no overflow. LSM KPI test updated, passes.
  Committed 25 Nov.

- **25 Nov 2026** — **HSM operating figures from the ERP log sheet** (performance.xlsx "ISSUE LOG", the user). Defective =
  ROLLING_DEFECT_MT (the user), end cut ENDCUT_MT, strip finish end cut / reject REJECT_MT, miss-roll MISSROLL_MT,
  yield = production ÷ billet input (the ERP's YIELD_PERCENTAGE is a fraction on 210 of 275 entries, a % on the
  rest — not used), CCM bypass CCM_BY_PASSMT, HSM bypass HSM_BYPASS_MT (cast = input + the bypasses on all 275),
  breakdown DELAY_HRS (as LSM; SMS_BREAKDOWN_HOURS filled once). Dropped by the user: Strip Mill Power kWh and
  HSM Power kWh/MT. /api/hsm/logsheet takes `mode`; Material & operating balance follows the Rolling switch
  (stores check only under Both); under it four buttons — Defective, CCM bypass, HSM bypass, Breakdown — each its
  own drill-down (`LogMetricDrawer.tsx`). API checked against the ERP rows (Online Jun–Nov: defective 187.42,
  end cut 439.14, reject 74.08, miss-roll 115.96, CCM 1,081.45, HSM 1,899.16 MT, breakdown 74.73 h; Offline:
  bypasses and breakdown always 0). Screen check blocked: Influx (10.135.80.145) jammed again — not accepting
  connections, so the browser's connections to the backend sat waiting and nothing loaded. Committed 25 Nov. Screen check done after the Influx guard (below): 1 day / year × Online / Offline / Both × 1920 / 1366,
  no overflow, drill-downs open; fixed "NAMT" → NA, and billet / coil counts kept whole ("60,619.6 coils").
- **25 Nov 2026** — **Influx guard** (the user; Influx jammed twice in a day). Root cause on our side: every query
  built a new Influx client, so connections were never reused (hundreds per backend); identical queries ran once per
  screen; nothing capped how many ran; each waited 2–3 min while Influx was down, and the browser's few connections
  to the backend sat waiting on them, so even ERP figures stopped loading. Fixed in `integrations/influx.ts` (every
  Influx query goes through `collect`): one client and one keep-alive pool per server (≤ 6 sockets); ≤ 4 queries at
  a time per server, the rest queue and give up after 20 s; identical queries share one answer, in flight and for
  30 s; after 3 failures in a row the server is left alone for 30 s (queries fail at once — each screen shows its
  "historian unreachable" message — then one query tries again); no query waits more than 45 s. RMD mill speed: the
  latest reading from the period's last day only (was a scan of the whole period). Tests influx-guard.test.ts (3).
  Live: our backend held a steady 4 Influx connections while all four mills loaded on Current Year (was 109 in two
  minutes before); everything loaded. Not done: cancelling a query when the viewer leaves; pre-summarised data for
  long periods (the Influx owner); server-side query limits (the Influx owner — other apps on this server hold
  hundreds of connections too). Committed 25 Nov.

- **25 Nov 2026** — **HSM corrections** (the user, furious): (1) CCM bypass and HSM bypass were shown under Offline —
  the sheet marks them ONLINE: now only under Online and Both. (2) Breakdown was inside the panel while LSM has it as
  a card: now **its own card** in HSM's strip in every mode, own drill-down (LogMetricDrawer), out of the panel.
  To keep rows full, cold power's two cards are one (kWh | kWh/MT): Both 12 cards (6 + 6), Online 7 in one row
  (`rm-strip--seven`, figure scales with the screen so value + unit stay inside), Offline 6. Panel's operating
  figures are one compact line like Billets (Defective · CCM bypass · HSM bypass; Offline: Defective only).
  Plan-panel foot figures scale on narrow screens. Checked 1 day / year × 3 modes × 1920 / 1366: full rows, no
  figure outside its card, no overflow. hsm-rolling test updated, passes. A stray `}` in visualization.css gave a
  500 for a minute during this — fixed. Rule saved: memory kpi-consistency-ui. Committed and pushed 25 Nov.
- **25 Nov 2026** — **Shift Setup Checklist, end-to-end check** (the user): three test entries saved through the
  dashboard (2 Feb Day 07:15–15:45; 10 Nov Day 09:30–14:00 and Night 23:30–05:45, in-charge "TEST ENTRY - delete"),
  read back from the IOsense logbook with both shift times as typed. Working-hours Influx for 10 Nov: the dashboard
  showed both windows and 61.94 MT on the Production card; an independent Influx sum of Total_Production_Ton
  increases over 09:30–14:00 (0) and 23:30–05:45 across midnight (61.94) matched exactly. The three test entries
  were then deleted by ID; the logbook is back to its 4 real entries (1 Nov Night, 7 Nov Night, 18 Nov Day, 24 Nov
  Day) and 10 Nov is NA again. No code change.
- **25 Nov 2026** — **RMD Asset Health opens on drive group "All"** (the user; was Route). `RmdAssetHealth.tsx`.
  Checked day / month / year × 1920 / 1366: six cards, no overflow. Its browser test updated for the default, run hours
  87.75 h and the limits wording; still fails further on (an old drive-group button row) — kept in KNOWN_FAILURES.md.
- **25 Nov 2026** — **Settings → Alerts dropdowns showed a value twice** ("On, On, Off", "Warning, Critical, Warning"):
  the "follow the default" entry was labelled with the default's value. Now each value once; the default's value
  stands for "follow the default" and shows in grey while followed (like the grey standard values in the boxes),
  "Standard setting: …" on hover (`AlertSettings.tsx`, settings.css). "(default)" as text was tried and dropped — it
  was cut off in the narrow boxes. All 198 dropdowns on every screen, settings tab, Edit plan and checklist of all four
  mills scanned: no repeated entries. Not committed.
- **25 Nov 2026** — **LSM: the section rolled each day** (the user). The ERP's production receipts (PROD_TRAN, DIV 'LS',
  finished items 'F…', not cancelled) name the section of every item; Σ of the non-defective items = the log sheet's
  PRODUTION_MT on 229 of 234 days (Apr–Nov). Synced as `receipts` in erp-lsm-production.json; `sections` per period
  (by section, named as Finished stock by size via `sectionLabelOf`, largest first, defective left out). LSM
  Production drill-down: column "Section rolled" — one section: its name; several: each with its MT; more than 3
  (a week, a month): the 3 largest and "+N more", all on hover. Production stays exactly as the ERP has it (the user:
  "follow ERP as it is" — the 5 mismatching days are left as they are: 27 Apr, 16 May, 14 Oct saved twice; 8 Jun,
  21 Jun two different entries — for the plant to correct). Checked 1 day / 10 days / month / year × 1366 / 1920:
  nothing scrolls sideways. Test in lsm-production.test.ts. Not committed.
- **25 Nov 2026** — **HSM, RMD and RMS: the size / section rolled** (the user, after LSM). Same ERP source (PROD_TRAN
  finished receipts, `pullReceipts` in sync.ts); each receipt's voucher is the REF_VRNO of one log-sheet entry, which
  gives its rolling (HSM ST001 / ST002, RMD RO001 / RO002), so HSM and RMD follow the Rolling switch. Checked against
  the log sheet: HSM receipts = PRODUCTION_MT on every entry (166 Online, 109 Offline); RMD receipts (miss roll left
  out) = Prime on 226 of 281 entries — never Prime + SL, so RMD shows "Size rolled (of Prime)"; RMS = PRODUCTION_MT on
  231 of 233 days. Names as each mill's Finished stock by size (`stripLabelOf`, `barLabelOf`, sections). Shared cell
  `drill/SectionsCell.tsx`, shared sum `shared/sections.ts`. Where: HSM Both — Production card drill-down, column
  "Size rolled"; HSM Online / Offline — own table "Size rolled by period" (the main table is already wide); RMD —
  Production drill-down column; RMS — own table "Section rolled by period". Checked 1 day → year × 1366 / 1920: RMS and
  the new HSM table don't scroll sideways; HSM Online main table unchanged (its old 168 px). Unit test
  sections-rolled.test.ts; 247 backend tests pass. The LSM and RMS production browser tests had old 1-decimal figures —
  updated (RMS also loses the removed Order allocation line, gains a section check); both pass, taken off
  KNOWN_FAILURES.md. Not committed.
- **25 Nov 2026** — **LSM: CCM bypass and LSM bypass** (the user: "same as HSM"). ERP log sheet FA-LP-P fields
  `CCM_BY_PASS_MT`, `LSM_BY_PASS_MT` (already synced, not shown until now); filled on every entry since Apr; the ERP's
  own bypass % is of INPUT_MT on all 240 entries; TOTAL_CAST_QTY = INPUT_MT + CCM + LSM + END_CRACK_BY_PASS_CCM_MT
  bypass on every entry (end-crack left out, as on HSM). **Defective left out** (the user): LSM's log sheet has no
  defective field — every ERP form searched; only HSM (S1) and RMS (RS) have one. (Defective items received into
  stores exist in PROD_TRAN, ~0.5–0.9 % of rolled — offered, not wanted.) Shown as HSM's: a line under the Material
  balance (CCM bypass · LSM bypass), each opening its own drill-down (column chart, bypass beside billet input,
  source). No Online/Offline split on LSM, so always shown. Checked day / month / year × 1366 / 1920: matches the ERP
  (21 Nov 7.44 / 20.76; 1–23 Nov 199.18 / 321.24), no overflow, no console errors. LSM browser test extended
  (1–8 Oct 56.16 / 50.23), passes. Not committed.
- **26 Nov 2026** — **Foot of the Material & operating balance redone, all four mills** (the user: the two thin
  left-hugging lines — Billets, then the bypasses — were bad UI). Now one strip of equal tiles across the panel,
  label over figure like the KPI cards, hairline between tiles, each a button with a chevron to its drill-down:
  HSM Billets in · Coils out · Defective · CCM bypass · HSM bypass (Offline: no bypasses), LSM Billets in · CCM
  bypass · LSM bypass, RMD / RMS Billets in (a lone tile keeps a tile's width). Billets tiles open the balance
  drill-down. Shared `production/BalanceStats.tsx`; old `.rm-mb-pieces`, `.rmd-mb-pieces`, `.rm-mb-ops` styles
  removed. Checked 1 day / year × 4 mills × 1366 / 1920: no overflow, no console errors. Tests pointed at the new
  strip: hsm-rolling, LSM and RMS production pass; three others touching it fail earlier on old known failures
  (KNOWN_FAILURES.md). Not committed.
- **25 Nov 2026** — **ERP auto-sync switched on, every 15 min** (the user: RMS 24 Nov was in the ERP but not on the
  dashboard — nothing synced automatically; `ERP_SYNC_INTERVAL_MINUTES` was unset, default 0 = off, and no cron job
  existed for this project). Interval chosen for the mill supervisors: log sheets are filled ~2× a day per mill, so
  a shift entry shows within 15 min; a sync is ~22 s, read-only. Set `ERP_SYNC_INTERVAL_MINUTES=15` in
  `backend/.env` (machine-local, not in git — **set it again on any other server**). Uses the existing in-service
  scheduler (`backend/src/jobs/scheduler.ts`: child process, no overlap, 10-min kill, sync at boot then every
  interval); caches are swapped in whole and re-read by mtime, so no restart and no half-written data; a failed
  sync (ERP / VPN down) keeps the last good data. Tested at a 1-min interval (the user): syncs at 17:50:37, 17:51:37,
  17:52:37 IST, all ok (~21–22 s each); then set back to 15 and restarted — boot sync ok.
- **25 Nov 2026** — **Sync ERP button + each mill's last ERP fetch, top bar of every screen** (the user: fetch the
  ERP on demand, and show when it was last fetched). Asked first: anyone signed in may press it; one press syncs
  **all four mills**; **ERP PM split one file per mill** (`erp-pm-<mill>.json`) so a mill's data sits in its own
  files, ready for per-mill access later. Backend: `jobs/erp-sync-runner.ts` — the one run, shared by the schedule
  and the button (never two at once; a press while one runs joins it; a press within 60 s of the last run is
  refused 429 so the ERP cannot be hammered; the schedule ignores that rest); `GET /api/erp/sync` (running?, last
  attempt, each mill's last fetch = the OLDEST of its own files, so a part that failed shows the mill older, auto
  interval) and `POST /api/erp/sync` (202; 503 when the ERP is not configured). PM: `readErpPm(env, mill)` reads
  the mill's file, falling back to the old one-file `erp-pm.json` until the first per-mill sync (live, right
  after deploy). Checked the split against the old file: equipment, due dates, breakdowns, work orders equal for
  all four mills, no rows of another mill; the old file moved to the scratchpad backup. Frontend: `ErpSyncButton`
  (before Settings) — "Sync ERP" over this mill's time (`18:17 · 25 Nov`, IST), spinner + "Syncing…" while it
  runs, "Failed · <time>" in amber when the last run failed after this mill's fetch, a short refusal ("Wait a
  minute") with the reason in the tooltip; when any mill's fetch time moves (button, schedule or someone else),
  every open screen reloads (`reloadAllData`). Pinned to Reset's height so the row's centres stay level. Checked:
  4 mills + Alerts × 1366 / 1920, both themes — one row (RMD Asset Health, the busiest bar, included), no page
  scroll; a real press: Syncing… → 18:16 → 18:17, production reloaded, no console errors. Tests: unit
  erp-sync-state.test.ts (4), route tests (sign-in needed, state shape), topbar.e2e "Sync ERP" (mocked: failed run,
  refused press, one row); 288 backend unit tests pass, topbar e2e 3/3. A stray `backend/[object Object].tmp`
  (the old dev server ran a sync mid-edit) moved to the backup. Not committed.
