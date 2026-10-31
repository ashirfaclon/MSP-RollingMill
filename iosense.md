# IOsense API tracking

Resource and functionID calls made by this app, per CLAUDE.md.

## Status (2026-09-30)

HSM Visualization now reads live data for: Production and Mass yield cards, the mill
mimic, Material & operating balance, Production & dispatch by size, and open orders.
Every wired figure opens a drill-down drawer (chart with interactive legend + table + checks).
Sources are the ERP cache (log sheet, PROD_TRAN, SALE, SORD — `npm run sync:erp` in `backend/`) and the
plant historian (Influx). No wired KPI reads the IOsense logbook yet. The remaining cards
and panels still render the sample model (`hsmSample.ts`).

## API routes (served by `backend/`, proxied or called from `frontend/`) and the data behind them

| Route | Source | Figures |
|---|---|---|
| `GET /api/hsm/production` | ERP log sheet PRODUCTION_MT · Influx `HSM / Finishing Mill / General / Total_Production_Ton` | Production card, ERP vs counter |
| `GET /api/hsm/billets` | ERP log sheet INPUT_PCS · Influx `HSM / Finishing Mill / General / Dicharged_Billet` | Billets drawer, ERP vs counter |
| `GET /api/hsm/logsheet` | ERP log sheet (all LOG_FIELDS) · PROD_TRAN finished-strip receipts | Yield, mass balance, losses, quality split, stores check |
| `GET /api/hsm/sizes` | ERP PROD_TRAN receipts · SALE lines (finished-strip items) | Production & dispatch by size |
| `GET /api/hsm/orders` | ERP SORD (ORDER_HEAD/BODY, latest amendment) | Orders placed per period, open order book |
| `GET /api/hsm/live` | Influx `HSM / Roughing Mill, Finishing Mill / RM_0n, FM_0n` (On_Off, Motor_Current, Motor_RPM, Roll_Force_Ton) · `Rolling_Mill_Speed` · `Dicharged_Billet` | Mill mimic: billets today, stand groups |
| `GET /api/hsm/stands` | Same stand fields, 1-min+ means | Stands drawer trend |
| `POST /api/auth/sso` | IOsense functionID **validateSSOToken** (`GET /api/retrieve-sso-token/{token}`) | Sign-in: the portal's one-time `?token=` → app session; every other route requires it |
| `GET /api/hsm/running-rate` | Influx `HSM / Finishing Mill / General / Total_Production_Ton` + `Dicharged_Billet` (running hours: billets ≤ 10 min apart) · ERP log sheet PRODUCTION_MT, NET_RUNNING_HRS, DELAY_HRS | Running rate (Production by shift footer) and its drawer |
| `GET /api/hsm/mill-load` | Logbook form `electrical-hsm/mill-load-log-sheet` (stand-name, load-in-amp, dc-motor-de-temp, dc-motor-nde-temp) | HSM Asset Health: bearing temp, motor current, bearing trend |
| `GET /api/rmd/mill-speed` | Influx `TMT-RMD / CR Mill1/2 / General / MILL1_MPS, MILL2_MPS` (m/s) | RMD Visualization: Mill MPS card and its trend drawer |
| `GET /api/rmd/chemistry` | Logbook form `sms/ccm-lolipop-sample` (mill = RMD; furnace-number, ccm, c-18, mn-19, s-20, p-21, si-22) | RMD Visualization: Chemical composition card and its samples drawer |
| `GET /api/lsm/drive-temp` | Logbook form `lsm-mechanical/drive-temp` (drive-name; flywheel / reduction gearbox / pinion gearbox bearing DE, NDE °C; oil-level-inches; oil-pressure-kg-cm2) | LSM Asset Health: bearing temp, gearbox oil level and pressure, bearing trend |
| `GET /api/rms/drive-temp` | Logbook form `rms-mechanical/drive-temp` (Rolling Mill Structure (RMS) → RMS Mechanical → Drive Temp: drive-name; rg1 / rg2 input / output inside / outside °C; pinion top / center / bottom inside / outside °C; flywheel input / output °C; oil-temp; oil-pressure-level) | RMS Asset Health: bearing temp, gearbox oil temperature and pressure, bearing trend |
| `GET /api/lsm/mill-load` | Logbook form `electrical-logbook/mill-load-log-sheet` (date-and-time, time, section, billet-size, stand-<s>-pass-<p>-amp: stand 1 passes 1–4, stands 2–7 passes 5–10) | LSM Asset Health: motor current and its drill-down |
| `GET /api/mid/:mill` | Logbook forms `mid-logbook/vibration-reading` (date, division, unit — was mill —, machine, component, point, horizontal/vertical/axial-mm-s-rms, load-condition, status, inspector, remarks) and `mid-logbook/temperature-reading` (date, mill, equipment, load-during-monitoring-mw, design-temperature-c, max-temperature-recorded-c, phase, status, inspector, remarks), over MID's earlier Excel reports (`backend/src/modules/mid/mid-reports.json`) — a machine filed in the logbook for a date replaces its report rows of that date | Asset Health (all mills): vibration, its trend, last inspection, diagnosis, thermography, Remarks |
| (none — the forms' dropdowns) | Logbook form `mid-logbook/mid-master` (division, unit, machine, component, point; one entry per measuring point; filled by the plant; RM rows seeded from MID's vibration reports, 338 entries, 31 Oct 2026) | MID forms: Division → Unit → Machine → Component → Point dropdowns (cascade) |
| `POST /api/forms/plan/:mill` · `GET /api/forms/plan/:mill?month=` | Logbook forms `production-plan/{hsm,rmd,lsm,rms}-rolling-plan` — written only by the dashboard, one entry per date (latest per date wins); the only source of every mill's plan (the Excel plans were moved into these forms on 31 Oct 2026; a date with no entry has no plan); Shutdown = No / Day shift / Night shift / Yes | Visualization: Edit plan popup; Production by shift targets |
| `POST /api/forms/ca/:mill` · `GET /api/forms/ca/:mill?month=` | Logbook forms `ca-inputs/{hsm,rmd,lsm,rms}-ca-inputs` — written only by the dashboard, one entry per save (latest of a month wins) | Condition Analytics: Edit inputs popup |
| `GET /api/ca/:mill` | The month's CA inputs (logbook `ca-inputs/{mill}-ca-inputs`) with the mill's ERP production, running hours, power form kWh/MT and ERP billet input / mass yield, month by month | Condition Analytics (all mills): output opportunity, conversion cost, cost variance, yield material loss, output margin, matched-run and costing rows |
| `POST /api/forms/hsm/variance` · `POST /api/forms/hsm/setup` | Logbook forms `hsm-checklists/production-variance-checklist` (production figures filled by the server, as the Production card) and `hsm-checklists/shift-setup-checklist` | HSM Visualization: Checklists |
| `GET /api/pm/:mill` | ERP PM, read-only, cached by `npm run sync:erp` (`data/erp-pm.json`): `MSPV7ERP1.EQPT_ID_MAST` (equipment by division S1 / RM / LS / RS), `EQPT_PM_TRAN` TNATURE PMREM (PM reminders: due FROM_DATE, done ACTION_VRNO / ACTION_VRDATE) and WOPM (work orders), `EQPT_PM_LOG` TNATURE BKDN (breakdowns) — tables named by the plant, 28 Oct 2026 | Asset Health (all mills): PM on time, Next PM, Open work orders, PM completed on time, MTBF, MTTR, Open action |

## Calls

| functionID | Method · endpoint | Used by | Purpose |
|---|---|---|---|
| `validateSSOToken` | `GET /api/retrieve-sso-token/{token}` | `server/logbook/client.ts` → `POST /api/logbook-sso` | Exchange the one-time SSO token from the app URL for a session (held in server memory only) |
| `findUserDevices` | `PUT /api/account/devices/1/1` | `server/logbook/client.ts` → `probeLogbook` | Session probe — proves the bearer is accepted; one device, nothing used from it |
| `fetchInsightResult` | `PUT /api/account/bruce/insightResult/fetch/paginated/{insightId}` | `backend/src/integrations/logbook/client.ts` → `fetchFormEntries` (power HSM/RMD/LSM/RMS — RMS `rms-electrical-logbook/daily-power-consumption-record`, HSM electrical delays, RMD asset forms, HSM mill load `electrical-hsm/mill-load-log-sheet`, SMS lollipop samples `sms/ccm-lolipop-sample` (RMD chemistry), LSM drive temp `lsm-mechanical/drive-temp`, RMS drive temp `rms-mechanical/drive-temp`, LSM mill load `electrical-logbook/mill-load-log-sheet`, LSM / RMS Production Sheets `lsm-production-sheet/production-sheet`, `rms-production-sheet/production-sheet` — prime pcs per shift for output per shift; start → end of each run for running hours) · `fetchLogbookWindow` (sources status) | One form's entries, read fresh on every request (shared 30 s). **Inactive until `IOSENSE_HSM_INSIGHT_ID` is set** |
| `addInsightResult` | `POST /api/account/bruce/insightResult/add` | `backend/src/integrations/logbook/client.ts` → `saveFormEntries` (`/api/forms/*`) | One entry per call: `{insightID, resultName: tag, applicationType: 'Insight', tags: [tag], result, metadata: {formId, source: 'msp-steel-logbook', filledBy, dataSource: []}, invocationTime}` (applicationType is required; no applicationID — it is cast to an ObjectId); the form's read cache is cleared after |
| `updateInsightResult` | `PUT /api/account/bruce/insightResult/update/singleInsightResult` | `backend/src/integrations/logbook/client.ts` → `saveFormEntries` | A key already in the form (plan: date; CA inputs: month; variance: Date; setup: Date + Shift) is updated in place: `{mode: 'set', updatedFields: {_id, insightID, result, metadata}}` — one row per key, never a second |
| `deleteInsightResult` | `DELETE /api/account/bruce/insightResult/delete/{insightId}/{rowId}` | `saveFormEntries` (older rows of the same key) · `deleteFormEntry` | Removes duplicate rows of a key when it is saved |

All calls send `Authorization`, `organisation`, `ngsw-bypass: true`, `Content-Type: application/json`.

### fetchInsightResult — the filter that works (tested 16 Oct 2026)

```
body: { insightID, pagination: { page, count: 500 },
        filter: { tags: ["<form tag>"], startDate: ISO, endDate: ISO } }
```
- **`filter` (singular).** The documented `filters` (plural) is ignored: every entry of every form
  comes back (54,930 on 16 Oct 2026). Top-level `tags` / `startDate` are ignored too.
- **One tag per call.** Two tags return nothing.
- **Dates are the submission time** (`createdAt`), not a form's Date field — readers filter on the
  Date themselves after the read, and read submissions from a month before the period (late entries).
- A form read this way takes 0.06–0.6 s (largest: electrical-hsm/power-consumption, 412 entries).

## Resources

| Resource | ID | Notes |
|---|---|---|
| MSP logbook insight | `INS_353018753af1` | HSM forms found: quality-report-hsm/hsm-online-profile-check-inspection-report, electrical-hsm/electrical-delays, ccm/hsm. `ccm/entry-os` (Entry OS) exists but its 3 entries in 60 days are all for mill RMS — not usable for HSM billet length |
