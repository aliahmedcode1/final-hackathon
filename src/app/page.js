'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const me = await api('/auth/me');
        router.replace('/dashboard');
      } catch {
        try {
          const { needsSetup } = await api('/setup/status');
          router.replace(needsSetup ? '/setup' : '/login');
        } catch {
          router.replace('/login');
        }
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-zinc-500">Loading HCM Lite…</div>
    </div>
  );
}
