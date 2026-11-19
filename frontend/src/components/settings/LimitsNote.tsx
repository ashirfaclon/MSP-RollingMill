'use client';

/**
 * A drill-down's limits line: the limits its readings are coloured by, where each came from, and
 * "Edit in Settings", which opens the Settings screen at the first of them. One limit sheet — the
 * drill-downs show the limits, the Settings screen changes them.
 */
import type { LimitSetting } from '@/services/hsmApi';
import { limitText, openSettings } from '@/services/settings';
import './settings.css';

const SOURCE: Record<LimitSetting['source'], string> = {
  plant: 'plant\'s limit', placeholder: 'standard placeholder', edited: 'set on the dashboard', none: 'not set',
};

export default function LimitsNote({ limits }: { limits: (LimitSetting | null)[] }) {
  const ls = limits.filter((l): l is LimitSetting => l !== null);
  if (!ls.length) return null;
  return (
    <div className="set-note">
      <span className="rm-k">Limits</span>
      <ul>
        {ls.map((l) => <li key={l.id}><b>{l.label}</b> {limitText(l)} <span className="set-note-src">· {SOURCE[l.source]}</span></li>)}
      </ul>
      <button type="button" className="set-link" onClick={() => openSettings(ls[0].id)}>Edit in Settings</button>
    </div>
  );
}
