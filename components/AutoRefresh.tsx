'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Silently re-fetches server data every `seconds` so live prices/news stay current. */
export default function AutoRefresh({ seconds = 120 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
