import { redirect } from 'next/navigation';
import { DEFAULT_MILL, DEFAULT_SCREEN, pathFor } from '@/config/navigation';

export default function Home() {
  redirect(pathFor(DEFAULT_MILL, DEFAULT_SCREEN));
}
