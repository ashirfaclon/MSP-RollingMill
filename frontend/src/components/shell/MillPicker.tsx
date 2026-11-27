'use client';

/**
 * Mill switch: the top bar's dropdown (Picker) over the mills this person may see (their IOsense role, the user,
 * 27 Nov 2026); keeps the screen where the other mill has it.
 */
import { useRouter } from 'next/navigation';
import { DEFAULT_SCREEN, MILLS, hasScreen, pathFor, type MillId, type ScreenId } from '@/config/navigation';
import { canSee } from '@/auth/session';
import Picker from './Picker';

export default function MillPicker({ mill, screen }: { mill: MillId; screen: ScreenId }) {
  const router = useRouter();
  const options = MILLS.filter((m) => canSee(m.id)).map((m) => ({ id: m.id, text: m.code }));
  return (
    <Picker label="Mill" title="Rolling mill" options={options} value={mill}
      // Keeps the screen when the other mill has it, else Visualization.
      onChoose={(next) => router.push(pathFor(next, hasScreen(next, screen) ? screen : DEFAULT_SCREEN))} />
  );
}
