# Backup: Production by shift (shift-wise breakdown)

On 24 Nov 2026 the user made "Production by shift" a whole-day compliance KPI on all four mills
(HSM, RMD, LSM, RMS): actual against target for the whole plant day, no Day / Night split.
These are the files as they were before that change (commit `f1222fd`), kept in case the shift
breakdown is wanted back. They are not built or run from here.

| File | What it did |
|---|---|
| `frontend/src/components/visualization/ShiftBars.tsx` | The shared panel: By shift / Whole day toggle, a flip card with one bar per shift and one for the whole day |
| `frontend/src/components/visualization/ShiftProduction.tsx` | HSM: Day 08–20 / Night 20–08 output from the Influx counter, against each shift's plan |
| `frontend/src/components/rmd/RmdShiftProduction.tsx` | RMD, LSM, RMS: output per shift (LSM / RMS: the ERP day split by the logbook's prime pieces per shift; RMD: none) |
| `frontend/src/components/drill/ShiftPlanDrawer.tsx` | HSM drill-down: per-shift table and chart, and the whole-day view |
| `frontend/src/components/rmd/RmdPlanDrawer.tsx` | RMD / LSM / RMS drill-down: per-shift and whole-day views |

Unchanged and still live (the shift breakdown needs nothing else to come back):

- The backend still works out output per shift: `/api/hsm/plan` (`actualByShift`, `backend/src/modules/hsm/shift-split.ts`)
  and `/api/{rmd,lsm,rms}/plan` (`totals.shifts`).
- Edit plan still takes a Day and a Night target per date (the user, 24 Nov 2026); the dashboard shows their total.

## To restore

Copy the five files back over the live ones, from this folder or from git:

```sh
git checkout f1222fd -- \
  frontend/src/components/visualization/ShiftBars.tsx \
  frontend/src/components/visualization/ShiftProduction.tsx \
  frontend/src/components/rmd/RmdShiftProduction.tsx \
  frontend/src/components/drill/ShiftPlanDrawer.tsx \
  frontend/src/components/rmd/RmdPlanDrawer.tsx
```

Then bring back the browser-test checks for the By shift view (see DEVLOG.md, 24 Nov 2026).
