"""
MID vibration reports (Excel, as MID sends them) → the two MID logbook form shapes, so the dashboard
can show MID data before the forms go live (the user, 27 Oct 2026). See "MID Logbook Form Spec.xlsx":
  readings    Form 1 VIBRATION READING — one per machine, component and point: H / V / A (mm/s RMS);
  conditions  Form 2 MACHINE CONDITION — one per machine: MID's status and remark.
Only what the report holds is written: a reading typed as a date / time (an Excel slip, e.g. 4.01 →
"04:01") is skipped and listed under "skipped". Field and machine names follow the form spec.

Run (needs xlrd and openpyxl):
  python import-mid-reports.py <report> <mill> <YYYY-MM-DD> [<report> <mill> <date> …] > ../src/modules/mid/mid-reports.json
"""
import json, os, re, shutil, sys, tempfile

COMPONENTS = [('COOLING', 'Cooling blower'), ('FLYWHEEL', 'Flywheel'), ('GEAR', 'Gearbox'), ('PUMP', 'Pump'), ('MOTOR', 'Motor')]


def rows_of(path):
    """Each row as [(value, kind)], kind n = number, d = date/time, s = text."""
    with open(path, 'rb') as fh:
        zipped = fh.read(2) == b'PK'
    if zipped:
        import openpyxl
        p = path
        if not path.lower().endswith('.xlsx'):
            p = os.path.join(tempfile.mkdtemp(), 'copy.xlsx')
            shutil.copy(path, p)
        ws = openpyxl.load_workbook(p, data_only=True).worksheets[0]
        def kind(c):
            v = c.value
            if isinstance(v, bool):
                return 's'
            if isinstance(v, (int, float)):
                return 'n'
            return 'd' if getattr(c, 'is_date', False) or type(v).__name__ in ('time', 'datetime') else 's'
        return [[(c.value, kind(c)) for c in row] for row in ws.iter_rows()]
    import xlrd
    s = xlrd.open_workbook(path).sheet_by_index(0)
    k = {xlrd.XL_CELL_NUMBER: 'n', xlrd.XL_CELL_DATE: 'd', xlrd.XL_CELL_TEXT: 's'}
    return [[(s.cell_value(r, c), k.get(s.cell_type(r, c), '-')) for c in range(s.ncols)] for r in range(s.nrows)]


def text(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()


def machine_name(v):
    # As the form spec's machine list: "SLP MOTOR NO. 1 (1125 KW)" → "SLP MOTOR NO. 1"; the LSM report's
    # "COLD SHERE 01" → "COLD SHEAR 01", "MILL PUMP NO.03" / "NO 4" → "MILL PUMP NO. 3" / "NO. 4".
    name = re.sub(r'\s*\(.*?\)\s*$', '', text(v)).upper()
    name = name.replace('COLD SHERE', 'COLD SHEAR')
    return re.sub(r'^MILL PUMP NO\.?\s*0*(\d+)$', r'MILL PUMP NO. \1', name)


def status_of(v):
    s = re.sub(r'[^a-z]', '', text(v).lower())
    return {'good': 'Good', 'acceptable': 'Acceptable', 'unacceptable': 'Un-acceptable'}.get(s)


def component_of(label):
    up = label.upper()
    return next((name for key, name in COMPONENTS if key in up), 'Other') if label else 'Other'


def parse(path, mill, date):
    rows = rows_of(path)
    # The H column is the one under "Velocity …" headed H / Horz. on the row below.
    h_col = next(j for r in rows for j, (v, _) in enumerate(r) if text(v).upper() in ('H', 'HORZ.'))
    point_col, status_col, remark_col = h_col - 1, h_col + 3, h_col + 4
    part_col = point_col - 1 if point_col >= 3 else None
    readings, conditions, skipped = [], [], []
    machine = part = None
    for r in rows:
        cell = lambda j: r[j] if j < len(r) else (None, '-')
        first, second = cell(0), cell(1)
        if first[1] == 'n' and text(second[0]):
            machine, part = machine_name(second[0]), None
            st = status_of(cell(status_col)[0])
            if st:
                conditions.append({'date': date, 'mill': mill, 'machine': machine, 'status': st, 'diagnosis': text(cell(remark_col)[0]) or None})
        if part_col is not None and text(cell(part_col)[0]):
            part = text(cell(part_col)[0]).upper()
        point = text(cell(point_col)[0]).upper()
        if not machine or not re.fullmatch(r'B\d+', point):
            continue
        vals = {}
        for name, j in (('horizontal', h_col), ('vertical', h_col + 1), ('axial', h_col + 2)):
            v, k = cell(j)
            if k == 'n':
                vals[name] = round(float(v), 2)
            else:
                vals[name] = None
                if v not in (None, ''):
                    skipped.append({'mill': mill, 'date': date, 'machine': machine, 'point': point, 'field': name, 'raw': str(v)})
        readings.append({'date': date, 'mill': mill, 'machine': machine, 'part': part, 'component': component_of(part or ''),
                         'point': point, **vals, 'loadCondition': 'No-load'})
    return readings, conditions, skipped


def main(args):
    out = {'source': [], 'readings': [], 'conditions': [], 'skipped': []}
    for i in range(0, len(args), 3):
        path, mill, date = args[i:i + 3]
        rd, cd, sk = parse(path, mill, date)
        out['source'].append({'file': os.path.basename(path), 'mill': mill, 'date': date, 'readings': len(rd), 'machines': len(cd)})
        out['readings'] += rd
        out['conditions'] += cd
        out['skipped'] += sk
    json.dump(out, sys.stdout, indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1:])
