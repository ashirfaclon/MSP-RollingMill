'use client';

/**
 * What was rolled in a period, as a table cell — every mill's production drill-down (the user, 25 Nov 2026): one
 * section or size — its name; several — each with its MT, largest first; more than SECTIONS_SHOWN (a week, a month)
 * — the largest few and "+N more", the full list on hover. Names as each mill's Finished stock by size.
 */
import { Fragment } from 'react';
import { fmtNum } from './DrillChart';

/** A week or month can roll a dozen sections: the largest few are shown, the rest as "+N more" (all on hover). */
const SECTIONS_SHOWN = 3;
const f = (v: number) => fmtNum(v, 2);

export default function SectionsCell({ sections }: { sections: { label: string; mt: number }[] | undefined }) {
  const s = sections ?? [];
  if (!s.length) return <td className="pd-dim">—</td>;
  if (s.length === 1) return <td className="lsm-sec"><span className="lsm-sec-i">{s[0].label}</span></td>;
  const rest = s.length - SECTIONS_SHOWN;
  return (
    <td className="lsm-sec" title={rest > 0 ? s.map((p) => `${p.label} ${f(p.mt)} MT`).join('\n') : undefined}>
      {/* Each item stays on one line; the line may break between items (at the separators). */}
      {s.slice(0, SECTIONS_SHOWN).map((p, i) => (
        <Fragment key={p.label}>{i > 0 && <span className="pd-dim"> · </span>}<span className="lsm-sec-i">{p.label} <span className="pd-dim num">{f(p.mt)} MT</span></span></Fragment>
      ))}
      {rest > 0 && <><span className="pd-dim"> · </span><span className="lsm-sec-i pd-dim">+{rest} more</span></>}
    </td>
  );
}
