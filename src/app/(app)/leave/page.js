'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { api, fmtDate } from '@/lib/api';
import { pushToast } from '@/store/store';
import { PageHeader, Badge, Spinner, Field, inputCls, btnPrimary, btnGhost, Modal, ErrorText, StatCard } from '@/components/ui';
import DataTable from '@/components/DataTable';

const TYPES = ['annual', 'sick', 'casual', 'unpaid'];

export default function LeavePage() {
  const user = useSelector((s) => s.session.user);
  const dispatch = useDispatch();
  const isEmployee = user?.role === 'employee';
  const isHr = user?.role === 'hr';
  const [data, setData] = useState(null);
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/leaves');
    setData(res);
  }, []);

  useEffect(() => { load().catch((e) => dispatch(pushToast({ type: 'error', message: e.message }))); }, [load, dispatch]);

  const decide = async (id, decision) => {
    const comment = window.prompt(decision === 'approved' ? 'Approval comment (optional):' : 'Rejection reason:');
    if (comment === null) return;
    try {
      await api('/leaves/decision', { method: 'PATCH', body: { id, decision, comment } });
      dispatch(pushToast({ type: 'success', message: `Leave ${decision}` }));
      load();
    } catch (e) {
      dispatch(pushToast({ type: 'error', message: e.message }));
    }
  };

  const cancel = async (id) => {
    if (!window.confirm('Cancel this pending request?')) return;
    try {
      await api('/leaves', { method: 'PATCH', body: { id, action: 'cancel' } });
      load();
    } catch (e) {
      dispatch(pushToast({ type: 'error', message: e.message }));
    }
  };

  const pending = (data?.rows || []).filter((r) => r.status === 'pending');

  return (
    <div>
      <PageHeader
        title="Leave"
        subtitle={isEmployee ? 'Apply for leave, track balances and history' : isHr ? 'Review pending requests and company leave overview' : 'Company leave overview'}
        actions={<button className={btnPrimary} onClick={() => setApplyOpen(true)}>+ Apply for leave</button>}
      />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((t) => {
            const b = data.balances[t];
            return (
              <StatCard
                key={t}
                label={`${t} leave`}
                value={b.quota === null ? `${b.used} used` : `${b.remaining} left`}
                hint={b.quota === null ? 'unlimited by policy' : `${b.used} used of ${b.quota}${b.pending ? ` · ${b.pending} pending` : ''}`}
                accent={b.quota !== null && b.remaining <= 0 ? 'text-rose-400' : 'text-indigo-300'}
              />
            );
          })}
        </div>
      )}

      {isHr && pending.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-300">{pending.length} pending request{pending.length > 1 ? 's' : ''}</h2>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/70 px-4 py-2 text-sm">
                <span>
                  <span className="text-indigo-300">{r.employee_name || 'Employee'}</span> · <span className="capitalize">{r.type}</span> · {fmtDate(r.from_date)} → {fmtDate(r.to_date)} ({r.days}d)
                  {r.reason && <span className="block text-xs text-zinc-500">“{r.reason}”</span>}
                </span>
                <span className="flex gap-2 text-xs">
                  <button className="text-emerald-400 hover:underline" onClick={() => decide(r.id, 'approved')}>Approve</button>
                  <button className="text-rose-400 hover:underline" onClick={() => decide(r.id, 'rejected')}>Reject</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!data ? <Spinner /> : (
        <DataTable
          rows={data.rows}
          empty="No leave requests yet"
          columns={[
            ...(!isEmployee ? [{ key: 'employee_name', label: 'Employee' }] : []),
            { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
            { key: 'from_date', label: 'From', render: (r) => fmtDate(r.from_date) },
            { key: 'to_date', label: 'To', render: (r) => fmtDate(r.to_date) },
            { key: 'days', label: 'Days' },
            { key: 'reason', label: 'Reason', className: 'max-w-40 truncate' },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
            { key: 'comment', label: 'HR comment', className: 'max-w-40 truncate' },
            ...(isEmployee ? [{
              key: 'actions', label: '',
              render: (r) => r.status === 'pending' ? (
                <button className="text-xs text-rose-400 hover:underline" onClick={() => cancel(r.id)}>Cancel</button>
              ) : null,
            }] : []),
          ]}
        />
      )}

      <ApplyModal open={applyOpen} onClose={() => setApplyOpen(false)} onDone={load} />
    </div>
  );
}

function ApplyModal({ open, onClose, onDone }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState(() => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return { type: 'annual', from_date: tomorrow, to_date: tomorrow, reason: '' };
  });
  const [smartText, setSmartText] = useState('');
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartHint, setSmartHint] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const smartParse = async () => {
    if (!smartText.trim()) return;
    setSmartBusy(true); setSmartHint('');
    try {
      const res = await api('/leaves/smart', { method: 'POST', body: { text: smartText } });
      setForm((f) => ({ ...f, ...res.form }));
      setSmartHint(res.parsed
        ? `✦ Pre-filled from your text — review and submit below.`
        : `✦ ${res.message}`);
    } catch (e) {
      setSmartHint(e.message);
    } finally {
      setSmartBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api('/leaves', { method: 'POST', body: form });
      dispatch(pushToast({ type: 'success', message: 'Leave request submitted' }));
      onDone();
      onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Apply for leave" wide>
      <div className="mb-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
        <div className="flex gap-2">
          <input className={inputCls + ' flex-1'} placeholder='✦ Smart leave: "Need next Mon and Tue off for wedding"'
            value={smartText} onChange={(e) => setSmartText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), smartParse())} />
          <button className={btnGhost} onClick={smartParse} disabled={smartBusy || !smartText.trim()}>
            {smartBusy ? '…' : 'Parse'}
          </button>
        </div>
        {smartHint && <p className="mt-2 text-xs text-indigo-300">{smartHint}</p>}
      </div>

      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Leave type">
          <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </Field>
        <div />
        <Field label="From"><input type="date" className={inputCls} value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} required /></Field>
        <Field label="To"><input type="date" className={inputCls} value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} required /></Field>
        <div className="sm:col-span-2">
          <Field label="Reason"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </div>
        <div className="sm:col-span-2">
          <ErrorText>{err}</ErrorText>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
            <button className={btnPrimary} disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
