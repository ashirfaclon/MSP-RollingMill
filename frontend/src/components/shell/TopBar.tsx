'use client';

/**
 * Top bar: which mill and which screen you are on, and the controls that apply to every
 * screen — mill switch, duration window, the mill's Settings (limits), theme, full screen. Brand block and
 * segment controls follow pellet-frontend's TopBar; the tabs moved to the sidebar.
 */
import { useEffect, useState } from 'react';
import DateRangePicker from './DateRangePicker';
import SettingsDrawer from '@/components/settings/SettingsDrawer';
import { OPEN_SETTINGS_EVENT, type OpenSettings } from '@/services/settings';
import MillPicker from './MillPicker';
import Picker from './Picker';
import FullscreenButton from './FullscreenButton';
import { millOf, screenOf, type MillId, type ScreenId } from '@/config/navigation';
import { RMD_MODE_LABELS, isDefaultFilter, resetFilters, setGlobalSel, useGlobalSel, type RmdModeSel, type ThemeSel } from '@/state/globalSel';
import { HEADER_SLOT_ID } from './HeaderSlot';
import './topbar.css';

export default function TopBar({ mill, screen }: { mill: MillId; screen: ScreenId }) {
  const sel = useGlobalSel();
  const s = screenOf(screen);
  // The Settings screen: from the button, a drill-down's "Edit limits" (at that limit), or the Alerts page (at that alert).
  const [settings, setSettings] = useState<OpenSettings | null>(null);
  // The Alerts page is about now: no period, no rolling.
  const dated = screen !== 'alerts';
  useEffect(() => {
    const open = (e: Event) => setSettings((e as CustomEvent<OpenSettings>).detail);
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

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

        {/* RMD: the ERP figures for Online, Offline or both rollings (the user, 13 Nov 2026) — a dropdown
            like the Mill beside it (the user, 21 Nov 2026). */}
        {/* HSM: the same switch for the Visualization's log-sheet KPIs (the user, 23 Nov 2026). */}
        {((mill === 'rmd' && dated) || (mill === 'hsm' && screen === 'visualization')) && (
          <Picker label="Rolling" title="Rolling" value={sel.rmdMode} onChoose={(m) => setGlobalSel({ rmdMode: m })}
            options={(['all', 'online', 'offline'] as RmdModeSel[]).map((m) => ({ id: m, text: RMD_MODE_LABELS[m] }))} />
        )}

        {/* The screen's own controls (HSM / RMD Asset Health: the drive group), filled through HeaderSlot —
            in this row with the other dropdowns, not on a line of their own (the user, 21 Nov 2026). */}
        <div id={HEADER_SLOT_ID} className="tb-slot" />

        {dated && <DateRangePicker />}
        {/* Back to the default filter (Today); disabled when already there. */}
        {dated && (
          <button
            type="button"
            className="tb-reset"
            onClick={resetFilters}
            disabled={isDefaultFilter(sel)}
            title="Reset the filters"
          >
            <ResetGlyph />
            Reset
          </button>
        )}

        <button type="button" className="tb-reset tb-settings" onClick={() => setSettings({ tab: screen === 'alerts' ? 'alerts' : 'limits', focus: null })} title="The limits this mill's readings are judged by, and when its alerts notify">
          <GearGlyph />
          Settings
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

        {/* Full screen: the last view control, at the far right (the user, 21 Nov 2026). */}
        <FullscreenButton />
      </div>
      {/* Mounted only while open, and anew per mill: a draft never outlives the drawer or crosses mills. */}
      {settings && <SettingsDrawer key={mill} mill={mill} tab={settings.tab} focusId={settings.focus} onClose={() => setSettings(null)} />}
    </header>
  );
}

function GearGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
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
