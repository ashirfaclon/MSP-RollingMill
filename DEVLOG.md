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

Decisions: limits the plant didn't give are **standard placeholders** (labelled so, with their basis)
until the plant types its own; everything lives in one IOsense document (tag
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
