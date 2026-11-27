'use client';

/**
 * `/` opens the default screen. A client-side replace, not a server redirect, so the query
 * string survives — IOsense opens the app as `/?token=…` and the sign-in must still see it.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_MILL, DEFAULT_SCREEN, pathFor } from '@/config/navigation';
import { allowedMills } from '@/auth/session';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    // Their own mill first: an RMD user lands on RMD (the user, 27 Nov 2026).
    const mill = allowedMills()[0] ?? DEFAULT_MILL;
    router.replace(`${pathFor(mill, DEFAULT_SCREEN)}${window.location.search}${window.location.hash}`);
  }, [router]);
  return null;
}
