'use client';

import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { api, fmtDate } from '@/lib/api';
import { setSettings, pushToast } from '@/store/store';
import { PageHeader, Field, inputCls, btnPrimary, btnGhost, Badge, ErrorText, Modal } from '@/components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const emptySettings = {
  name: '', address: '', start_time: '09:00', grace_minutes: 15, halfday_hours: 5,
  weekend_days: [0, 6], latitude: 24.8607, longitude: 67.0011, radius_m: 200,
  quotas: { annual: 14, sick: 8, casual: 10 },
};

export default function SettingsPage() {
  const user = useSelector((s) => s.session.user);
  const [tab, setTab] = useState('company');
  const tabs = [
    { key: 'company', label: 'Company', roles: ['admin', 'hr'] },
    { key: 'org', label: 'Departments & Holidays', roles: ['admin', 'hr'] },
    { key: 'users', label: 'User Accounts', roles: ['admin'] },
  ].filter((t) => t.roles.includes(user?.role));

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company rules govern attendance, leave and payroll across the system." />
      <div className="mb-6 flex gap-1 border-b border-zinc-800">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t.key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'company' && <CompanyTab />}
      {tab === 'org' && <OrgTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

function CompanyTab() {
  const dispatch = useDispatch();
  const settings = useSelector((s) => s.session.settings);
  const user = useSelector((s) => s.session.user);
  const isAdmin = user?.role === 'admin';
  const [form, setForm] = useState(settings || emptySettings);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [testDist, setTestDist] = useState(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  if (!settings) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDay = (d) =>
    set('weekend_days', form.weekend_days.includes(d) ? form.weekend_days.filter((x) => x !== d) : [...form.weekend_days, d]);

  const checkGeofence = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
        const dLat = toRad(pos.coords.latitude - form.latitude);
        const dLon = toRad(pos.coords.longitude - form.longitude);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(form.latitude)) * Math.cos(toRad(pos.coords.latitude)) * Math.sin(dLon / 2) ** 2;
        const dist = Math.round(2 * R * Math.asin(Math.sqrt(a)));
        setTestDist(`You are ${dist} m from the office (allowed ${form.radius_m} m) — ${dist <= form.radius_m ? 'INSIDE ✓' : 'OUTSIDE ✗'}`);
      },
      () => setTestDist('Could not read location')
    );
  };

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const updated = await api('/settings', { method: 'PUT', body: form });
      dispatch(setSettings(updated));
      dispatch(pushToast({ type: 'success', message: 'Settings saved' }));
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="max-w-3xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name"><input className={inputCls} disabled={!isAdmin} value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label="Address"><input className={inputCls} disabled={!isAdmin} value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Office start time"><input type="time" className={inputCls} disabled={!isAdmin} value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
        <Field label="Grace period (min)"><input type="number" min="0" max="240" className={inputCls} disabled={!isAdmin} value={form.grace_minutes} onChange={(e) => set('grace_minutes', +e.target.value)} /></Field>
        <Field label="Half-day threshold (worked hours)"><input type="number" min="1" max="12" step="0.5" className={inputCls} disabled={!isAdmin} value={form.halfday_hours} onChange={(e) => set('halfday_hours', +e.target.value)} /></Field>
        <div className="flex items-end"><button type="button" onClick={checkGeofence} className={btnGhost}>📍 Test my distance</button></div>
      </div>
      {testDist && <p className="text-sm text-indigo-300">{testDist}</p>}

      <Field label="Weekend days">
        <div className="flex gap-2">
          {DAYS.map((d, i) => (
            <button type="button" key={d} disabled={!isAdmin} onClick={() => toggleDay(i)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${form.weekend_days.includes(i) ? 'border-indigo-500 bg-indigo-600/30 text-indigo-200' : 'border-zinc-700 text-zinc-400'}`}>{d}</button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Latitude"><input type="number" step="any" className={inputCls} disabled={!isAdmin} value={form.latitude} onChange={(e) => set('latitude', +e.target.value)} /></Field>
        <Field label="Longitude"><input type="number" step="any" className={inputCls} disabled={!isAdmin} value={form.longitude} onChange={(e) => set('longitude', +e.target.value)} /></Field>
        <Field label="Geofence radius (m)"><input type="number" min="30" className={inputCls} disabled={!isAdmin} value={form.radius_m} onChange={(e) => set('radius_m', +e.target.value)} /></Field>
      </div>

      <div className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 sm:col-span-3">Annual leave quotas (days)</h3>
        {['annual', 'sick', 'casual'].map((k) => (
          <Field key={k} label={k}>
            <input type="number" min="0" className={inputCls} disabled={!isAdmin} value={form.quotas?.[k] ?? 0}
              onChange={(e) => set('quotas', { ...form.quotas, [k]: +e.target.value })} />
          </Field>
        ))}
        <p className="text-xs text-zinc-600 sm:col-span-3">Unpaid leave is unlimited by policy.</p>
      </div>

      <ErrorText>{err}</ErrorText>
      {isAdmin && <button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>}
      {!isAdmin && <p className="text-xs text-zinc-500">View-only — only the Admin can change company settings.</p>}
    </form>
  );
}

function OrgSection({ title, items, isAdmin, addControl, delType, onRemove }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-300">{title}</h3>
      <div className="mb-3 flex flex-wrap gap-1">
        {items.length === 0 && <span className="text-xs text-zinc-600">None yet</span>}
        {items.map((it) => (
          <span key={it.id} className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">
            {it.name}{it.date ? ` · ${fmtDate(it.date)}` : ''}
            {isAdmin && <button className="text-rose-400 hover:text-rose-300" onClick={() => onRemove(delType, it.id)}>✕</button>}
          </span>
        ))}
      </div>
      {addControl}
    </div>
  );
}

function OrgTab() {
  const user = useSelector((s) => s.session.user);
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [holiday, setHoliday] = useState({ name: '', date: '' });
  const [err, setErr] = useState('');
  const dispatch = useDispatch();

  const load = () => api('/org').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const add = async (type, body) => {
    setErr('');
    try {
      await api('/org', { method: 'POST', body: { type, ...body } });
      dispatch(pushToast({ type: 'success', message: `${type} added` }));
      setName(''); setHoliday({ name: '', date: '' });
      load();
    } catch (e) { setErr(e.message); }
  };
  const remove = async (type, id) => {
    try {
      await api(`/org?type=${type}&id=${id}`, { method: 'DELETE' });
      load();
    } catch (e) { setErr(e.message); }
  };

  if (!data) return null;

  const simpleAdd = (type) => (
    <div className="flex gap-2">
      <input className={inputCls + ' !w-auto flex-1'} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className={btnGhost} onClick={() => add(type, { name })}>Add</button>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <ErrorText>{err}</ErrorText>
      <OrgSection title="Departments" items={data.departments} isAdmin={isAdmin} delType="department"
        onRemove={remove}
        addControl={isAdmin ? simpleAdd('department') : null} />
      <OrgSection title="Designations" items={data.designations} isAdmin={isAdmin} delType="designation"
        onRemove={remove}
        addControl={isAdmin ? simpleAdd('designation') : null} />
      <OrgSection title="Public holidays" items={data.holidays} isAdmin={isAdmin} delType="holiday"
        onRemove={remove}
        addControl={isAdmin ? (
          <div className="flex gap-2">
            <input type="date" className={inputCls + ' !w-auto'} value={holiday.date} onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))} />
            <input className={inputCls + ' !w-auto flex-1'} placeholder="e.g. Independence Day" value={holiday.name} onChange={(e) => setHoliday((h) => ({ ...h, name: e.target.value }))} />
            <button className={btnGhost} onClick={() => add('holiday', holiday)}>Add</button>
          </div>
        ) : null} />
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState(null);
  const [err, setErr] = useState('');
  const dispatch = useDispatch();

  const load = () => api('/users').then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const act = async (id, action) => {
    try {
      const res = await api('/users', { method: 'PATCH', body: { id, action } });
      if (action === 'reset') setCreated({ email: users.find((u) => u.id === id)?.email, temp_password: res.temp_password });
      dispatch(pushToast({ type: 'success', message: action === 'reset' ? 'Password reset — share the temp password' : `User ${action}d` }));
      load();
    } catch (e) { setErr(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await api('/users', { method: 'POST', body: { email, password: password || undefined, role: 'hr' } });
      setCreated({ email: res.email, temp_password: res.temp_password });
      setAddOpen(false); setEmail(''); setPassword('');
      load();
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setAddOpen(true)}>+ Create HR login</button>
      </div>
      <ErrorText>{err}</ErrorText>
      {users && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 bg-zinc-900/70 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3"><Badge value={u.role} /></td>
                  <td className="px-4 py-3">{u.is_active ? '✅ active' : '⛔ deactivated'}</td>
                  <td className="px-4 py-3 text-zinc-500">{fmtDate(u.created_at)}</td>
                  <td className="space-x-2 px-4 py-3 text-xs">
                    <button className="text-indigo-400 hover:underline" onClick={() => act(u.id, 'reset')}>Reset PW</button>
                    <button className={u.is_active ? 'text-rose-400 hover:underline' : 'text-emerald-400 hover:underline'} onClick={() => act(u.id, u.is_active ? 'deactivate' : 'activate')}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create HR login">
        <form onSubmit={create} className="space-y-4">
          <Field label="Email"><input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password (leave blank for a temp password)" hint="Temp passwords must be changed at first login.">
            <input type="text" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
          </Field>
          <button className={`${btnPrimary} w-full justify-center`} disabled={!email}>Create</button>
        </form>
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title="Temporary password">
        {created && (
          <div className="space-y-3 text-sm">
            <p>Share this one-time password with <span className="text-indigo-300">{created.email}</span>:</p>
            <code className="block rounded-lg bg-zinc-950 p-3 text-center text-lg tracking-widest text-emerald-400">{created.temp_password}</code>
            <p className="text-xs text-zinc-500">It will not be shown again.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
