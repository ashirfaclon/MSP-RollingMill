import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AppShell from '@/components/shell/AppShell';
import HsmVisualization from '@/components/visualization/HsmVisualization';
import HsmDataModel from '@/components/datamodel/HsmDataModel';
import RmdVisualization from '@/components/rmd/RmdVisualization';
import PendingMillVisualization from '@/components/mills/PendingMillVisualization';
import ScreenPlaceholder from '@/components/ScreenPlaceholder';
import { MILLS, SCREENS, isMill, isScreen, millOf, screenOf, type MillId, type ScreenId } from '@/config/navigation';

/** Screens that exist so far; everything else shows a placeholder. */
function screenFor(mill: MillId, screen: ScreenId) {
  if (mill === 'hsm' && screen === 'visualization') return <HsmVisualization />;
  if (mill === 'hsm' && screen === 'data-model') return <HsmDataModel />;
  if (mill === 'rmd' && screen === 'visualization') return <RmdVisualization />;
  // LSM and RMS: the same screen, every figure NA until their sources are confirmed.
  if ((mill === 'lsm' || mill === 'rms') && screen === 'visualization') return <PendingMillVisualization mill={mill} />;
  return <ScreenPlaceholder mill={mill} screen={screen} />;
}

/** Every mill × screen is known up front, so all of them are prerendered. */
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
    <AppShell mill={mill} screen={screen}>{screenFor(mill, screen)}</AppShell>
  );
}
