'use client';

/**
 * Nothing of the app renders until the IOsense sign-in has succeeded (session.ts). Without
 * a sign-in token, with a used or expired one, or once a session ends, the reader sees why
 * and how to get back in — never the dashboard. The static HTML holds only this screen.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import { getState, startAuth, subscribe, type AuthState } from './session';
import './auth.css';

const IOSENSE_URL = process.env.NEXT_PUBLIC_IOSENSE_URL ?? 'https://iosense.io';
const CHECKING: AuthState = { status: 'checking' };

export default function AuthGate({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getState, () => CHECKING);
  useEffect(() => { void startAuth(); }, []);

  if (state.status === 'ok') return <>{children}</>;

  if (state.status === 'checking') {
    return (
      <main className="auth-screen" aria-busy="true">
        <div className="auth-card">
          <Icon id="shield-check" size={34} color="#4da3ff" />
          <h1 className="auth-title">Signing you in…</h1>
          <span className="skel skel--num" role="status" aria-label="Signing in" />
        </div>
      </main>
    );
  }

  const retry = state.reason === 'unavailable';
  return (
    <main className="auth-screen">
      <div className="auth-card" role="alert">
        <Icon id="shield-alert" size={34} color="#f5b54a" />
        <h1 className="auth-title">{state.reason === 'denied' ? 'No access' : 'Open from IOsense'}</h1>
        <p className="auth-text">{state.message}</p>
        {retry
          ? <button type="button" className="auth-btn" onClick={() => window.location.reload()}>Try again</button>
          : <a className="auth-btn" href={IOSENSE_URL}>Go to IOsense</a>}
      </div>
    </main>
  );
}
