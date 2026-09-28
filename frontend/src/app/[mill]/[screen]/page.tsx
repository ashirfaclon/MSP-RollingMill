import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AppShell from '@/components/shell/AppShell';
import HsmVisualization from '@/components/visualization/HsmVisualization';
import ScreenPlaceholder from '@/components/ScreenPlaceholder';
import { MILLS, SCREENS, isMill, isScreen, millOf, screenOf } from '@/config/navigation';

/** Every mill × screen is known up front, so all twelve are prerendered. */
export const dynamicParams = false;

export function generateStaticParams() {
  return MILLS.flatMap((m) => SCREENS.map((s) => ({ mill: m.id, screen: s.id })));
}

export async function generateMetadata(props: PageProps<'/[mill]/[screen]'>): Promise<Metadata> {
  const { mill, screen } = await props.params;
  if (!isMill(mill) || !isScreen(screen)) return {};
  return { title: `${millOf(mill).code} · ${screenOf(screen).label} — MSP Rolling Mill` };
}

export default async function Page(props: PageProps<'/[mill]/[screen]'>) {
  const { mill, screen } = await props.params;
  if (!isMill(mill) || !isScreen(screen)) notFound();

  return (
    <AppShell mill={mill} screen={screen}>
      {mill === 'hsm' && screen === 'visualization'
        ? <HsmVisualization />
        : <ScreenPlaceholder mill={mill} screen={screen} />}
    </AppShell>
  );
}
