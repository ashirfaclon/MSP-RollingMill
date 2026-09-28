/**
 * Page frame: screen rail on the left, top bar and the scrolling main region on the right.
 */
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import type { MillId, ScreenId } from '@/config/navigation';
import './appshell.css';

export default function AppShell(
  { mill, screen, children }: { mill: MillId; screen: ScreenId; children: ReactNode },
) {
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
