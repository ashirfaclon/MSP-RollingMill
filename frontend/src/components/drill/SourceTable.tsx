/**
 * "Data source" table for a drill-down: each figure on the drawer, the ERP table and the
 * field(s) it is read from, and the filter applied — so anyone can find the same rows in
 * the ERP themselves.
 */
export interface SourceRow {
  figure: string;
  table: string;
  fields: string;
  filter?: string;
}

export default function SourceTable({ rows, label = 'ERP data source' }: { rows: SourceRow[]; label?: string }) {
  return (
    <>
      <h3 className="pd-h">{label}</h3>
      <div className="pd-table-wrap">
        <table className="grid pd-table pd-source" aria-label={label}>
          <thead><tr><th>Figure</th><th>ERP table</th><th>Field(s)</th><th>Filter / note</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.figure}>
                <td><b>{r.figure}</b></td>
                <td><code>{r.table}</code></td>
                <td><code>{r.fields}</code></td>
                <td className="pd-dim">{r.filter ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
