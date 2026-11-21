'use client';

/**
 * Full screen (the user, 21 Nov 2026): the whole dashboard fills the screen, for a control-room
 * display. The last control of the top bar, with the other view controls (theme). Esc, or the button
 * again, leaves it. Not shown where the browser can't go full screen (e.g. Safari on iPhone).
 */
import { useSyncExternalStore } from 'react';

const subscribe = (on: () => void) => {
  document.addEventListener('fullscreenchange', on);
  return () => document.removeEventListener('fullscreenchange', on);
};
const isFull = () => document.fullscreenElement !== null;
const canFull = () => document.fullscreenEnabled;
const never = () => false;

export default function FullscreenButton() {
  const supported = useSyncExternalStore(subscribe, canFull, never);
  const full = useSyncExternalStore(subscribe, isFull, never);
  if (!supported) return null;

  const toggle = () => {
    // A refusal (the browser's policy) leaves the page as it was; nothing to tell.
    (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  };
  const label = full ? 'Exit full screen' : 'Full screen';
  return (
    <button type="button" className="tb-reset tb-icon" onClick={toggle} aria-label={label} aria-pressed={full} title={full ? 'Exit full screen (Esc)' : 'Full screen'}>
      {full ? <ExitGlyph /> : <EnterGlyph />}
    </button>
  );
}

/* Four corners pushed out — the usual full-screen sign; pulled in to leave it. */
function EnterGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  );
}

function ExitGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
    </svg>
  );
}
