'use client';

/**
 * The drill-down frame every KPI opens: a drawer, not a modal (design handover §8), so the
 * number that was clicked stays in view while it is checked. Esc, the overlay and × close
 * it; focus moves in on open and back to the card on close.
 *
 * The body shows a skeleton only before the first answer; later refreshes keep the last
 * figures on screen, dimmed while they are for other parameters.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '@/components/production/production-drawer.css';

export default function DrillDrawer(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub: string;
  controls?: ReactNode;
  /** Nothing to show yet. */
  loading: boolean;
  /** The figures shown are for other parameters — a newer request is on its way. */
  stale?: boolean;
  error: string | null;
  hasData: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const { open, onClose } = props;
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pd-root">
      <div className="pd-overlay" onClick={onClose} aria-hidden />
      <aside className="pd-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="pd-head">
          <div>
            <h2 id={titleId} className="pd-title">{props.title}</h2>
            <div className="pd-sub">{props.sub}</div>
          </div>
          <button ref={closeBtn} type="button" className="pd-close" onClick={onClose} aria-label={`Close ${props.title}`}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>

        {props.controls && <div className="pd-controls">{props.controls}</div>}

        <div className={`pd-body${props.stale ? ' pd-body--stale' : ''}`} aria-busy={props.loading || props.stale}>
          {props.error && <p className="pd-error" role="alert">{props.error}{props.hasData ? ' — showing the last figures received.' : ''}</p>}
          {props.loading && !props.hasData ? (
            <div className="pd-loading">
              <span className="skel skel--block" style={{ height: 300 }} />
              <span className="skel skel--block" style={{ height: 160 }} />
            </div>
          ) : props.hasData ? props.children : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

/** A segmented toggle — one of several options, each a pressed/unpressed button. */
export function Seg<T extends string>(props: {
  label: string;
  value: T;
  options: { id: T; label: string; title?: string; disabled?: boolean }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="tb-seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`tb-seg-btn pd-seg${props.value === o.id ? ' on' : ''}`}
          aria-pressed={props.value === o.id}
          disabled={o.disabled}
          title={o.title}
          onClick={() => props.onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A row of headline tiles above the chart. */
export function Stats({ items }: { items: { label: string; value: string; unit?: string; tone?: string; title?: string }[] }) {
  return (
    <dl className="pd-stats">
      {items.map((s) => (
        <div key={s.label} title={s.title}>
          <dt className="rm-k">{s.label}</dt>
          <dd className={`num ${s.tone ?? 'v-val'}`}>{s.value}{s.unit ? <> <small>{s.unit}</small></> : null}</dd>
        </div>
      ))}
    </dl>
  );
}
