'use client';

/**
 * The foot of every mill's Material & operating balance: one strip of equal tiles across the panel's width —
 * billets in (coils out), then the operating figures (bypasses, defective) — label over figure, like the KPI
 * cards. A tile with a drill-down is a button with a chevron. Replaces the two thin left-hugging lines (the user,
 * 26 Nov 2026).
 */
import { fixed } from '@/lib/num';

export interface BalanceStat {
  key: string;
  label: string;
  value: number | null | undefined;
  unit: string;
  /** Pieces: whole numbers, never decimals. */
  whole?: boolean;
  loading?: boolean;
  /** Opens the figure's drill-down. */
  onOpen?: () => void;
  title?: string;
  /** A short warning under the figure, e.g. why it is NA. */
  note?: string;
  /** A % beside the figure, same size (the user, 27 Nov 2026: HSM Defective "12.31 MT · 7.96 %"). */
  pct?: number | null;
}

export default function BalanceStats({ items }: { items: BalanceStat[] }) {
  return (
    <div className="rm-mb-stats" role="group" aria-label="Billets and operating figures">
      <div className="rm-mb-stats-grid">
        {items.map((s) => {
          const na = s.value === null || s.value === undefined;
          const body = (
            <>
              <span className="rm-k">{s.label}</span>
              {s.loading
                ? <span className="skel skel--num" role="status" aria-label="Loading" />
                : <span className={`rm-mb-stat-v num ${na ? 'v-na' : ''}`}>
                    {na ? 'NA' : <>{s.whole ? Math.round(s.value!).toLocaleString('en-IN') : fixed(s.value)}<span className="rm-card-unit">{s.unit}</span></>}
                    {!na && s.pct !== null && s.pct !== undefined && (
                      <span className="rm-mb-stat-pct"><span className="rm-mb-stat-sep" aria-hidden>·</span>{fixed(s.pct, 2)}<span className="rm-card-unit">%</span></span>
                    )}
                  </span>}
              {s.note && !s.loading && <span className="rm-mb-stat-note v-warn">{s.note}</span>}
            </>
          );
          return s.onOpen
            ? <button key={s.key} type="button" className="rm-mb-stat rm-mb-stat--open" aria-haspopup="dialog" onClick={s.onOpen} title={s.title}>{body}<i className="rm-mb-stat-go" aria-hidden>›</i></button>
            : <div key={s.key} className="rm-mb-stat" title={s.title}>{body}</div>;
        })}
      </div>
    </div>
  );
}
