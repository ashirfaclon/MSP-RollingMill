import { millOf, screenOf, type MillId, type ScreenId } from '@/config/navigation';

/** Stand-in for a screen that has not been designed yet. */
export default function ScreenPlaceholder({ mill, screen }: { mill: MillId; screen: ScreenId }) {
  return (
    <p className="app-msg" data-testid="screen-placeholder">
      {millOf(mill).code} {screenOf(screen).label} dashboard is coming soon.
    </p>
  );
}
