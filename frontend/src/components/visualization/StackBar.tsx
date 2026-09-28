import type { Series } from './KpiCard';

export interface StackPart { label: string; value: number; series: Series }

/**
 * One horizontal bar split into parts. `max` sets the full-track value, so bars in the
 * same list share a scale; left out, the parts fill the track.
 */
export default function StackBar(
  { parts, max, size = 'lg', label }:
  { parts: StackPart[]; max?: number; size?: 'lg' | 'sm'; label: string },
) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const scale = max ?? total;
  return (
    <span className={`rm-stack rm-stack--${size}`} role="img" aria-label={label}>
      {parts.map((p) => (
        <i
          key={p.label}
          className={`rm-stack-seg rm-tone--${p.series}`}
          style={{ width: `${scale > 0 ? (p.value / scale) * 100 : 0}%` }}
          title={`${p.label}: ${p.value} MT`}
        />
      ))}
    </span>
  );
}
