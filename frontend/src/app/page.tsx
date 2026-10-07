'use client';

/**
 * `/` opens the default screen. A client-side replace, not a server redirect, so the query
 * string survives — IOsense opens the app as `/?token=…` and the sign-in must still see it.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_MILL, DEFAULT_SCREEN, pathFor } from '@/config/navigation';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`${pathFor(DEFAULT_MILL, DEFAULT_SCREEN)}${window.location.search}${window.location.hash}`);
  }, [router]);
  return null;
}
