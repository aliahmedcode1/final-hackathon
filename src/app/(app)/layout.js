'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '@/lib/api';
import { setSession } from '@/store/store';
import AppShell from '@/components/AppShell';
import { Spinner } from '@/components/ui';

export default function AppLayout({ children }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const loaded = useSelector((s) => s.session.loaded);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api('/auth/me');
        if (alive) dispatch(setSession(me));
      } catch {
        router.replace('/login');
      }
    })();
    return () => {
      alive = false;
    };
  }, [dispatch, router]);

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading workspace…" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
