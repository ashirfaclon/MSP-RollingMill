'use client';

/** Mill switch: the top bar's dropdown (Picker) over the four mills; keeps the screen where the other mill has it. */
import { useRouter } from 'next/navigation';
import { DEFAULT_SCREEN, MILLS, hasScreen, pathFor, type MillId, type ScreenId } from '@/config/navigation';
import Picker from './Picker';

const OPTIONS = MILLS.map((m) => ({ id: m.id, text: m.code }));

export default function MillPicker({ mill, screen }: { mill: MillId; screen: ScreenId }) {
  const router = useRouter();
  return (
    <Picker label="Mill" title="Rolling mill" options={OPTIONS} value={mill}
      // Keeps the screen when the other mill has it, else Visualization.
      onChoose={(next) => router.push(pathFor(next, hasScreen(next, screen) ? screen : DEFAULT_SCREEN))} />
  );
}
