'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { api, fmtDate } from '@/lib/api';
import { pushToast } from '@/store/store';
import { PageHeader, Badge, Spinner, Field, inputCls, btnPrimary, btnGhost, Modal, ErrorText } from '@/components/ui';
import DataTable from '@/components/DataTable';

export default function CorrectionsPage() {
  const user = useSelector((s) => s.session.user);
  const dispatch = useDispatch();
  const isEmployee = user?.role === 'employee';
  const isHr = user?.role === 'hr';
  const [rows, setRows] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/attendance/corrections', { query: { status: statusFilter } });
    setRows(res.rows);
  }, [statusFilter]);

  useEffect(() => { load().catch((e) => dispatch(pushToast({ type: 'error', message: e.message }))); }, [load, dispatch]);

  const decide = async (id, decision) => {
    const comment = window.prompt(decision === 'approved' ? 'Approval comment (optional):' : 'Rejection reason:');
    if (comment === null) return;
    try {
      await api('/attendance/corrections', { method: 'PATCH', body: { id, decision, comment } });
      dispatch(pushToast({ type: 'success', message: `Correction ${decision}` }));
      load();
    } catch (e) {
      dispatch(pushToast({ type: 'error', message: e.message }));
    }
  };

  return (
    <div>
      <PageHeader
        title="Attendance corrections"
        subtitle={isEmployee ? 'Your correction requests' : isHr ? 'Approve or reject correction requests' : 'All correction requests (view-only)'}
        actions={isEmployee && <button className={btnPrimary} onClick={() => setAddOpen(true)}>+ Request correction</button>}
      />

      <div className="mb-4">
        <select className={inputCls + ' !w-44'} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {!rows ? <Spinner /> : (
        <DataTable
          rows={rows}
          empty="No correction requests"
          columns={[
            ...(!isEmployee ? [{ key: 'employee_name', label: 'Employee' }] : []),
            { key: 'attendance_date', label: 'Date', render: (r) => fmtDate(r.attendance_date) },
            { key: 'new_check_in', label: 'New in' },
            { key: 'new_check_out', label: 'New out' },
            { key: 'reason', label: 'Reason', className: 'max-w-48 truncate' },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
            { key: 'comment', label: 'Comment', className: 'max-w-40 truncate' },
            ...(isHr ? [{
              key: 'actions', label: '',
              render: (r) => r.status === 'pending' ? (
                <span className="flex gap-2 text-xs">
                  <button className="text-emerald-400 hover:underline" onClick={() => decide(r.id, 'approved')}>Approve</button>
                  <button className="text-rose-400 hover:underline" onClick={() => decide(r.id, 'rejected')}>Reject</button>
                </span>
              ) : <span className="text-xs text-zinc-600">{r.reviewed_by || ''}</span>,
            }] : []),
          ]}
        />
      )}

      <RequestModal open={addOpen} onClose={() => setAddOpen(false)} onDone={load} />
    </div>
  );
}

function RequestModal({ open, onClose, onDone }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState({
    attendance_date: new Date().toISOString().slice(0, 10),
    new_check_in: '09:00', new_check_out: '18:00', reason: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api('/attendance/corrections', { method: 'POST', body: form });
      dispatch(pushToast({ type: 'success', message: 'Correction request submitted' }));
      onDone();
      onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request attendance correction">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Date"><input type="date" className={inputCls} value={form.attendance_date} onChange={(e) => setForm({ ...form, attendance_date: e.target.value })} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Correct check-in"><input type="time" className={inputCls} value={form.new_check_in} onChange={(e) => setForm({ ...form, new_check_in: e.target.value })} required /></Field>
          <Field label="Correct check-out"><input type="time" className={inputCls} value={form.new_check_out} onChange={(e) => setForm({ ...form, new_check_out: e.target.value })} required /></Field>
        </div>
        <Field label="Reason"><textarea className={inputCls + ' h-20'} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required minLength={3} /></Field>
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy}>Submit request</button>
        </div>
      </form>
    </Modal>
  );
}
