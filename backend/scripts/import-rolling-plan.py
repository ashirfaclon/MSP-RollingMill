"""
One-off import of the monthly rolling plan from the plant's Excel tracker into the backend.

    python3 backend/scripts/import-rolling-plan.py Daily_Rolling_Tracker_Oct2026.xlsx 2026-10

Reads sheet "Daily Log" (B Date · C Shift · D Thickness mm · E Width mm · F MT · G Remarks)
and writes backend/src/modules/hsm/plan/rolling-plan-<month>.json. Rows without MT are
skipped. TEMPORARY: the plan-import feature will replace this file as the plan's source.
"""
import datetime as dt
import json
import pathlib
import sys

import openpyxl

src, month = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
ws = wb["Daily Log"]
rows = []
for r in range(4, ws.max_row + 1):
    date, shift, thick, width, mt, remark = (ws.cell(r, c).value for c in (2, 3, 4, 5, 6, 7))
    if mt in (None, ""):
        continue
    d = date.date().isoformat() if isinstance(date, (dt.date, dt.datetime)) else str(date)[:10]
    rows.append({
        "date": d, "shift": str(shift or "").strip(), "thicknessMm": thick, "widthMm": width,
        "mt": float(mt), "remarks": str(remark or "").strip(), "excelRow": r,
    })

out = pathlib.Path(__file__).resolve().parents[1] / "src" / "modules" / "hsm" / "plan" / f"rolling-plan-{month}.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({
    "month": month,
    "source": f"{pathlib.Path(src).name} · sheet Daily Log (static import — to be replaced by the plan-import feature)",
    "importedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    "rows": rows,
}, indent=1) + "\n")
print(f"{len(rows)} rows · {sum(x['mt'] for x in rows)} MT · {sorted({x['date'] for x in rows})[0] if rows else '-'} → {sorted({x['date'] for x in rows})[-1] if rows else '-'} → {out}")
