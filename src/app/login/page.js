'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Field, inputCls, btnPrimary, ErrorText } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      router.replace('/dashboard');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--color-indigo-950),_var(--color-zinc-950)_60%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-indigo-600 text-xl font-bold">H</div>
          <h1 className="text-xl font-semibold">HCM Lite</h1>
          <p className="mt-1 text-sm text-zinc-500">AI-assisted Human Capital Management</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/40">
          <Field label="Email">
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          </Field>
          <Field label="Password">
            <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </Field>
          <ErrorText>{err}</ErrorText>
          <button type="submit" className={`${btnPrimary} w-full justify-center`} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
