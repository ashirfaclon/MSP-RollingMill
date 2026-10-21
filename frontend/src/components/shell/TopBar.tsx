'use client';

/**
 * Top bar: which mill and which screen you are on, and the controls that apply to every
 * screen — mill switch, duration window, theme. Brand block and segment controls follow
 * pellet-frontend's TopBar; the tabs moved to the sidebar.
 */
import DateRangePicker from './DateRangePicker';
import MillPicker from './MillPicker';
import { millOf, screenOf, type MillId, type ScreenId } from '@/config/navigation';
import { isDefaultFilter, resetFilters, setGlobalSel, useGlobalSel, type ThemeSel } from '@/state/globalSel';
import './topbar.css';

export default function TopBar({ mill, screen }: { mill: MillId; screen: ScreenId }) {
  const sel = useGlobalSel();
  const s = screenOf(screen);

  return (
    <header className="topbar">
      <div className="tb-brand">
        <div className="tb-mark tb-mark--mill">{millOf(mill).code}</div>
        <div className="tb-brand-text">
          <h1 className="tb-title">Rolling Mill <span className="tb-title-sep">/</span> {s.label}</h1>
        </div>
      </div>

      <div className="tb-right">
        {/* Mill switch — keeps the screen, changes the mill. */}
        <MillPicker mill={mill} screen={screen} />

        <DateRangePicker />
        {/* Back to the default filter (Today); disabled when already there. */}
        <button
          type="button"
          className="tb-reset"
          onClick={resetFilters}
          disabled={isDefaultFilter(sel)}
          title="Reset the filter to Today"
        >
          <ResetGlyph />
          Reset
        </button>

        <div className="tb-seg" role="group" aria-label="Appearance">
          {(['dark', 'light'] as ThemeSel[]).map((th) => (
            <button
              key={th}
              className={`tb-seg-btn tb-seg-btn--theme${sel.theme === th ? ' on' : ''}`}
              onClick={() => setGlobalSel({ theme: th })}
              title={th === 'dark' ? 'Dark — control room' : 'Light — daylight office'}
              aria-label={th === 'dark' ? 'Dark theme' : 'Light theme'}
              aria-pressed={sel.theme === th}
            >
              {th === 'dark' ? <MoonGlyph /> : <SunGlyph />}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/* Drawn rather than emoji, so the glyph takes the segment's colour on both themes. */
function ResetGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

function SunGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
