'use client';

/**
 * Page frame: screen rail on the left, top bar and the scrolling main region on the right.
 * A mill this person may not see (a bookmark, a shared link) goes to their own mill, same screen where it has one
 * (the user, 27 Nov 2026); the backend refuses that mill's data anyway.
 */
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SCREEN, hasScreen, pathFor } from '@/config/navigation';
import { allowedMills, canSee } from '@/auth/session';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import type { MillId, ScreenId } from '@/config/navigation';
import './appshell.css';

export default function AppShell(
  { mill, screen, children }: { mill: MillId; screen: ScreenId; children: ReactNode },
) {
  const router = useRouter();
  const allowed = canSee(mill);
  useEffect(() => {
    if (allowed) return;
    const own = allowedMills()[0];
    if (own) router.replace(`${pathFor(own, hasScreen(own, screen) ? screen : DEFAULT_SCREEN)}${window.location.search}`);
  }, [allowed, mill, screen, router]);
  if (!allowed) return null;
  return (
    <div className="appshell">
      <Sidebar mill={mill} screen={screen} />
      <div className="app-col">
        <TopBar mill={mill} screen={screen} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
