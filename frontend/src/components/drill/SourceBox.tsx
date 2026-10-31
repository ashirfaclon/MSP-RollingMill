/**
 * Where a drill-down's figures come from, as boxes at its foot:
 *   DATA SOURCE — per system, what to look up: the ERP table(s), field and filter, or the
 *                 Influx tag and the filters it is published under;
 *   FORMULA     — for a figure that is calculated rather than read, the calculation.
 * Enough for anyone to find the same rows themselves; nothing more.
 */
export interface SourceSystem {
  /** 'ERP', 'Influx', 'Logbook', … */
  name: string;
  /** [what, value] — e.g. ['Table', 'ATTR_TRAN_DATA_HEAD'], ['Tag', 'Total_Production_Ton']. */
  rows: [string, string][];
}

export default function SourceBox({ sources, formula }: { sources?: SourceSystem[]; formula?: string[] }) {
  return (
    <div className="pd-src">
      {sources && sources.length > 0 && (
        <section aria-label="Data source">
          <h3 className="pd-src-title">Data source</h3>
          <div className="pd-src-box">
            {sources.map((s, i) => (
              <div key={`${i}-${s.name}`} className="pd-src-sys">
                <div className="pd-src-name">{s.name}</div>
                <dl>
                  {s.rows.map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}
      {formula && formula.length > 0 && (
        <section aria-label="Formula">
          <h3 className="pd-src-title">Formula</h3>
          <div className="pd-src-box pd-src-box--formula">
            {formula.map((l) => <div key={l} className="pd-src-line">{l}</div>)}
          </div>
        </section>
      )}
    </div>
  );
}
