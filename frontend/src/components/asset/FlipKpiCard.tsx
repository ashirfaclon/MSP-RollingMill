'use client';

/**
 * A KPI card with two views and a switch: the card turns over (a 180° turn, as Production by shift)
 * to the other view (the user, 28 Oct 2026 — Gearbox oil: RMD level / temperature, LSM level /
 * pressure). The switch sits beside the card, not in it — the card is a button that opens its
 * drill-down. The face turned away is inert: not focusable, not read, not clickable.
 */
import { useState, type ComponentProps } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import { Seg } from '@/components/drill/DrillDrawer';

type CardProps = ComponentProps<typeof KpiCard>;
export interface FlipFace<T extends string> {
  id: T;
  /** The switch's label for this view. */
  label: string;
  title: string;
  card: Pick<CardProps, 'value' | 'unit' | 'tone' | 'loading' | 'noEntries'>;
}

export default function FlipKpiCard<T extends string>({ label, series, faces, onOpen, openLabel }: {
  label: string;
  series: CardProps['series'];
  faces: [FlipFace<T>, FlipFace<T>];
  onOpen?: () => void;
  openLabel?: string;
}) {
  const [view, setView] = useState<T>(faces[0].id);
  return (
    <div className={`ah-card-switch${view === faces[1].id ? ' is-flipped' : ''}`}>
      <div className="ah-flip-inner">
        {faces.map((f, i) => {
          const hidden = f.id !== view;
          return (
            <div key={f.id} className={`ah-flip-face${i ? ' ah-flip-face--back' : ''}`} aria-hidden={hidden} inert={hidden}>
              <KpiCard label={label} note="" series={series} {...f.card} {...(onOpen ? { onOpen, openLabel } : {})} />
            </div>
          );
        })}
      </div>
      <Seg label={`${label} view`} value={view} onChange={setView} options={faces.map((f) => ({ id: f.id, label: f.label, title: f.title }))} />
    </div>
  );
}
