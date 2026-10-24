'use client';

import { Provider, useDispatch, useSelector } from 'react-redux';
import { makeStore, dismissToast } from '@/store/store';
import { useEffect } from 'react';

export default function StoreProvider({ children }) {
  return (
    <Provider store={makeStore()}>
      <ToastHost />
      {children}
    </Provider>
  );
}

function ToastHost() {
  const toasts = useSelector((s) => s.ui.toasts);
  const dispatch = useDispatch();
  useEffect(() => {
    if (toasts.length) {
      const t = setTimeout(() => dispatch(dismissToast(toasts[0].id)), 4200);
      return () => clearTimeout(t);
    }
  }, [toasts, dispatch]);

  if (!toasts.length) return null;
  const color = { success: 'border-emerald-500', error: 'border-rose-500', info: 'border-indigo-500' };
  return (
    <div className="fixed bottom-4 right-4 z-100 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-lg border-l-4 ${color[t.type] || color.info} bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-xl shadow-black/40`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
