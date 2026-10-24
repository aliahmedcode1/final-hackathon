'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Field, inputCls, btnPrimary, ErrorText } from '@/components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SetupPage() {
  const router = useRouter();
  const [company, setCompany] = useState({
    name: '', address: '', start_time: '09:00', grace_minutes: 15,
    weekend_days: [0, 6], latitude: 24.8607, longitude: 67.0011, radius_m: 200,
  });
  const [admin, setAdmin] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/setup/status').then(({ needsSetup }) => {
      if (!needsSetup) router.replace('/login');
    }).catch(() => {});
  }, [router]);

  const toggleDay = (d) =>
    setCompany((c) => ({
      ...c,
      weekend_days: c.weekend_days.includes(d) ? c.weekend_days.filter((x) => x !== d) : [...c.weekend_days, d],
    }));

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCompany((c) => ({ ...c, latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) })),
      () => setErr('Could not read your location')
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/auth/setup', { method: 'POST', body: { company, admin } });
      router.replace('/dashboard');
    } catch (e2) {
      setErr(e2.message + (e2.details ? ` (${JSON.stringify(e2.details).slice(0, 200)})` : ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--color-indigo-950),_var(--color-zinc-950)_60%)] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-indigo-600 text-xl font-bold">H</div>
          <h1 className="text-2xl font-semibold">First-run setup</h1>
          <p className="mt-1 text-sm text-zinc-500">Configure your company and create the System Admin. This screen disappears afterwards.</p>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-400">Company profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <input className={inputCls} value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} required minLength={2} />
            </Field>
            <Field label="Address">
              <input className={inputCls} value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
            </Field>
            <Field label="Office start time">
              <input type="time" className={inputCls} value={company.start_time} onChange={(e) => setCompany({ ...company, start_time: e.target.value })} required />
            </Field>
            <Field label="Grace period (minutes)">
              <input type="number" min="0" max="240" className={inputCls} value={company.grace_minutes} onChange={(e) => setCompany({ ...company, grace_minutes: +e.target.value })} required />
            </Field>
          </div>
          <Field label="Weekend days">
            <div className="flex gap-2">
              {DAYS.map((d, i) => (
                <button type="button" key={d} onClick={() => toggleDay(i)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${company.weekend_days.includes(i) ? 'border-indigo-500 bg-indigo-600/30 text-indigo-200' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Office latitude">
              <input type="number" step="any" className={inputCls} value={company.latitude} onChange={(e) => setCompany({ ...company, latitude: +e.target.value })} required />
            </Field>
            <Field label="Office longitude">
              <input type="number" step="any" className={inputCls} value={company.longitude} onChange={(e) => setCompany({ ...company, longitude: +e.target.value })} required />
            </Field>
            <Field label="Geofence radius (m)">
              <input type="number" min="30" max="10000" className={inputCls} value={company.radius_m} onChange={(e) => setCompany({ ...company, radius_m: +e.target.value })} required />
            </Field>
          </div>
          <button type="button" onClick={useMyLocation} className="text-xs text-indigo-400 hover:underline">📍 Use my current location as office coordinates</button>

          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-indigo-400">Administrator account</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin email">
              <input type="email" className={inputCls} value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} required />
            </Field>
            <Field label="Admin password (min 8 chars)">
              <input type="password" className={inputCls} value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} required minLength={8} />
            </Field>
          </div>

          <ErrorText>{err}</ErrorText>
          <button type="submit" className={`${btnPrimary} w-full justify-center`} disabled={busy}>
            {busy ? 'Creating…' : 'Create admin & start'}
          </button>
        </form>
      </div>
    </div>
  );
}
