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

## Calls

| functionID | Method · endpoint | Used by | Purpose |
|---|---|---|---|
| `validateSSOToken` | `GET /api/retrieve-sso-token/{token}` | `server/logbook/client.ts` → `POST /api/logbook-sso` | Exchange the one-time SSO token from the app URL for a session (held in server memory only) |
| `findUserDevices` | `PUT /api/account/devices/1/1` | `server/logbook/client.ts` → `probeLogbook` | Session probe — proves the bearer is accepted; one device, nothing used from it |
| `fetchInsightResult` | `PUT /api/account/bruce/insightResult/fetch/paginated/{insightId}` | `backend/src/integrations/logbook/client.ts` → `fetchFormEntries` (power HSM/RMD/LSM, HSM electrical delays, RMD asset forms, LSM / RMS Production Sheets `lsm-production-sheet/production-sheet`, `rms-production-sheet/production-sheet` — prime pcs per shift for output per shift; start → end of each run for running hours) · `fetchLogbookWindow` (sources status) | One form's entries, read fresh on every request (shared 30 s). **Inactive until `IOSENSE_HSM_INSIGHT_ID` is set** |

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
