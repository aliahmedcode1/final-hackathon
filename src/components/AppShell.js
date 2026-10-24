'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '@/lib/api';
import { clearSession, pushToast } from '@/store/store';
import { Modal, Field, inputCls, btnPrimary, Badge } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦', roles: ['admin', 'hr', 'employee'] },
  { href: '/employees', label: 'Employees', icon: '👥', roles: ['admin', 'hr'] },
  { href: '/attendance', label: 'Attendance', icon: '🕒', roles: ['admin', 'hr', 'employee'] },
  { href: '/attendance/corrections', label: 'Corrections', icon: '↺', roles: ['admin', 'hr', 'employee'] },
  { href: '/leave', label: 'Leave', icon: '🌴', roles: ['admin', 'hr', 'employee'] },
  { href: '/payroll', label: 'Payroll', icon: '💰', roles: ['admin', 'hr', 'employee'] },
  { href: '/announcements', label: 'Announcements', icon: '📢', roles: ['admin', 'hr', 'employee'] },
  { href: '/settings', label: 'Settings', icon: '⚙', roles: ['admin', 'hr'] },
  { href: '/audit', label: 'Audit Log', icon: '🧾', roles: ['admin'] },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.session.user);
  const unread = useSelector((s) => s.session.user?.unread ?? 0);
  const [pwOpen, setPwOpen] = useState(false);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    dispatch(clearSession());
    router.replace('/login');
  };

  if (!user) return children;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold">H</div>
          <div>
            <div className="text-sm font-semibold leading-tight">HCM Lite</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Workforce OS</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + '/');
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active ? 'bg-indigo-600/20 text-indigo-300' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                <span className="w-4 text-center text-xs">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
          <Link
            href="/ai"
            className={`mt-2 flex items-center gap-3 rounded-lg border border-indigo-500/40 bg-gradient-to-r from-indigo-600/25 to-violet-600/10 px-3 py-2 text-sm text-indigo-200 hover:from-indigo-600/40 ${
              pathname.startsWith('/ai') ? 'ring-1 ring-indigo-500' : ''
            }`}
          >
            <span className="w-4 text-center text-xs">✦</span>
            AI Assistant
          </Link>
        </nav>
        <div className="border-t border-zinc-800/80 px-5 py-4 text-xs text-zinc-600">
          Saylani Hackathon · 2026
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-zinc-800/80 bg-zinc-950/80 px-6 py-3 backdrop-blur">
          <Link href="/notifications" className="relative rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" title="Notifications">
            🔔
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">{unread}</span>
            )}
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-300">{user.email}</span>
            <Badge value={user.role} />
          </div>
          <button onClick={() => setPwOpen(true)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800" title="Change password">
            Change PW
          </button>
          <button onClick={logout} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-rose-300">
            Logout
          </button>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dispatch = useDispatch();

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/auth/password', { method: 'PATCH', body: { current, next } });
      dispatch(pushToast({ type: 'success', message: 'Password changed' }));
      onClose();
      setCurrent('');
      setNext('');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password">
          <input type="password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password (min 8 chars)">
          <input type="password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
        </Field>
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={busy}>Update</button>
        </div>
      </form>
    </Modal>
  );
}
