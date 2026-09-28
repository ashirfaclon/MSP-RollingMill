'use client';

/**
 * Left rail: the three screens of the selected mill. Switching screen keeps the mill.
 * Collapses to an icon strip; the state lives on <html data-sidebar> so CSS does the work
 * and a reload comes back the way it was left.
 */
import Link from 'next/link';
import Icon from '@/components/Icon';
import { SCREENS, millOf, pathFor, type MillId, type ScreenId } from '@/config/navigation';
import { setGlobalSel, useGlobalSel } from '@/state/globalSel';
import './sidebar.css';

export default function Sidebar({ mill, screen }: { mill: MillId; screen: ScreenId }) {
  const collapsed = useGlobalSel().sidebar === 'collapsed';
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="tb-mark">MSP</div>
        <div className="sb-brand-text">
          <div className="sb-title">MSP Steel</div>
          <div className="sb-sub">Rolling Mill · {millOf(mill).code}</div>
        </div>
      </div>

      <nav className="sb-nav" aria-label="Dashboard screens">
        <div className="sb-label">Dashboards</div>
        {SCREENS.map((s) => {
          const on = s.id === screen;
          return (
            <Link
              key={s.id}
              href={pathFor(mill, s.id)}
              className={`sb-item${on ? ' on' : ''}`}
              aria-current={on ? 'page' : undefined}
              title={s.label}
            >
              <span className="sb-ico"><Icon id={s.icon} size={18} color="currentColor" /></span>
              <span className="sb-text">
                <b>{s.label}</b>
                <small>{s.sub}</small>
              </span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        className="sb-toggle"
        onClick={() => setGlobalSel({ sidebar: collapsed ? 'expanded' : 'collapsed' })}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg className="sb-toggle-ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sb-toggle-text">Collapse</span>
      </button>
    </aside>
  );
}
