'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSelector, useDispatch } from 'react-redux';
import { api, fmtPKR } from '@/lib/api';
import { pushToast } from '@/store/store';
import { PageHeader, Field, inputCls, btnPrimary, btnGhost, Badge, Spinner, Modal, ErrorText } from '@/components/ui';
import DataTable from '@/components/DataTable';

const SAMPLE_CSV = `first_name,last_name,email,phone,department,designation,join_date,basic_salary
Ayesha,Khan,ayesha@acme.com,0300-1234567,Engineering,Software Engineer,2026-01-05,80000
Bilal,Ahmad,bilal@acme.com,0301-7654321,Sales,Sales Executive,2026-02-01,50000`;

export default function EmployeesPage() {
  const user = useSelector((s) => s.session.user);
  const isHr = user?.role === 'hr';
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [org, setOrg] = useState({ departments: [], designations: [], holidays: [] });
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const dispatch = useDispatch();

  const load = useCallback(async () => {
    const res = await api('/employees', { query: { q, dept, status, page, pageSize: 10 } });
    setRows(res.rows);
    setTotal(res.total);
  }, [q, dept, status, page]);

  useEffect(() => { load().catch((e) => dispatch(pushToast({ type: 'error', message: e.message }))); }, [load, dispatch]);
  useEffect(() => { api('/org').then(setOrg).catch(() => {}); }, []);

  const pages = Math.max(1, Math.ceil(total / 10));

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${total} employee${total === 1 ? '' : 's'} on the roster`}
        actions={isHr && (
          <>
            <button className={btnGhost} onClick={() => setCsvOpen(true)}>CSV Import / Export</button>
            <button className={btnPrimary} onClick={() => setAddOpen(true)}>+ Add employee</button>
          </>
        )}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input className={inputCls + ' !w-64'} placeholder="Search name, email, code…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className={inputCls + ' !w-48'} value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}>
          <option value="">All departments</option>
          {org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className={inputCls + ' !w-40'} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="exited">Exited</option>
        </select>
      </div>

      {!rows ? <Spinner /> : (
        <DataTable
          empty="No employees match your filters"
          rows={rows}
          columns={[
            { key: 'code', label: 'Code' },
            {
              key: 'first_name', label: 'Name',
              render: (r) => <Link href={`/employees/${r.id}`} className="text-indigo-300 hover:underline">{r.first_name} {r.last_name}</Link>,
              sortValue: (r) => `${r.first_name} ${r.last_name}`,
            },
            { key: 'email', label: 'Email' },
            { key: 'department', label: 'Department', render: (r) => r.department || '—' },
            { key: 'designation', label: 'Designation', render: (r) => r.designation || '—' },
            ...(user.role !== 'employee' ? [{ key: 'basic_salary', label: 'Basic', render: (r) => fmtPKR(r.basic_salary) }] : []),
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]}
        />
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-1">
            <button className="rounded-md border border-zinc-800 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <button className="rounded-md border border-zinc-800 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}

      <AddEmployeeModal open={addOpen} onClose={() => setAddOpen(false)} org={org} onCreated={load} />
      <CsvModal open={csvOpen} onClose={() => setCsvOpen(false)} onDone={load} />
    </div>
  );
}

function AddEmployeeModal({ open, onClose, org, onCreated }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', address: '',
    department_id: '', designation_id: '', join_date: new Date().toISOString().slice(0, 10), basic_salary: 0,
  });
  const [created, setCreated] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await api('/employees', { method: 'POST', body: form });
      setCreated(res);
      onCreated();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  const close = () => { onClose(); setCreated(null); setForm((f) => ({ ...f, first_name: '', last_name: '', email: '' })); };

  return (
    <Modal open={open} onClose={close} title={created ? 'Employee created' : 'Register employee'} wide>
      {created ? (
        <div className="space-y-3 text-sm">
          <p><span className="text-indigo-300">{created.employee.code}</span> — {created.employee.first_name} {created.employee.last_name} added.</p>
          <p>Their login is <span className="text-indigo-300">{created.employee.email}</span> with temporary password:</p>
          <code className="block rounded-lg bg-zinc-950 p-3 text-center text-lg tracking-widest text-emerald-400">{created.temp_password}</code>
          <p className="text-xs text-zinc-500">Shown only once — they must change it at first login.</p>
          <button className={`${btnPrimary} w-full justify-center`} onClick={close}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="First name"><input className={inputCls} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required /></Field>
          <Field label="Last name"><input className={inputCls} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
          <Field label="Email (becomes login)"><input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
          <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Department">
            <select className={inputCls} value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
              <option value="">—</option>
              {org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Designation">
            <select className={inputCls} value={form.designation_id} onChange={(e) => set('designation_id', e.target.value)}>
              <option value="">—</option>
              {org.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Join date"><input type="date" className={inputCls} value={form.join_date} onChange={(e) => set('join_date', e.target.value)} required /></Field>
          <Field label="Basic salary (PKR)"><input type="number" min="0" className={inputCls} value={form.basic_salary} onChange={(e) => set('basic_salary', +e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
          <ErrorText>{err}</ErrorText>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className={btnGhost} onClick={close}>Cancel</button>
            <button className={btnPrimary} disabled={busy}>{busy ? 'Creating…' : 'Create employee + login'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CsvModal({ open, onClose, onDone }) {
  const dispatch = useDispatch();
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState(null);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (mode) => {
    setErr(''); setBusy(true);
    try {
      const res = await api('/employees/csv', { method: 'POST', body: { csv, mode } });
      setReport(res.report);
      setCreated(res.committed ? res.created : null);
      if (res.committed) { onDone(); dispatch(pushToast({ type: 'success', message: `Imported ${res.created.length} employees` })); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const download = async () => {
    const res = await fetch('/api/employees/csv');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'employees.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal open={open} onClose={() => { onClose(); setReport(null); setCreated(null); }} title="CSV bulk import" wide>
      <div className="space-y-4 text-sm">
        <p className="text-zinc-400">
          Header: <code className="rounded bg-zinc-950 px-1.5 py-0.5 text-xs">first_name,last_name,email,phone,department,designation,join_date,basic_salary</code>
        </p>
        <div className="flex gap-2">
          <button className="text-xs text-indigo-400 hover:underline" onClick={() => setCsv(SAMPLE_CSV)}>Insert sample CSV</button>
          <button className="text-xs text-indigo-400 hover:underline" onClick={download}>⬇ Export current directory</button>
        </div>
        <textarea className={inputCls + ' h-40 font-mono text-xs'} placeholder="Paste CSV content here…" value={csv} onChange={(e) => setCsv(e.target.value)} />

        {report && !report.header_ok && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            Header mismatch. Expected: <code>{report.header_expected}</code>
          </div>
        )}

        {report?.header_ok && (
          <div className="space-y-3">
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-400">✓ {report.valid_count} valid rows</span>
              <span className="text-rose-400">✗ {report.error_count} rows with errors</span>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-zinc-800 bg-zinc-900/70 text-left text-zinc-500"><th className="px-3 py-2">Line</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Errors</th></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.line} className={`border-b border-zinc-800/60 ${r.errors ? 'bg-rose-500/5' : ''}`}>
                      <td className="px-3 py-2 text-zinc-500">{r.line}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.data.first_name} {r.data.last_name} · {r.data.email}</td>
                      <td className="px-3 py-2 text-rose-400">{r.errors ? Object.entries(r.errors).map(([f, m]) => `${f}: ${m}`).join('; ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {created && (
          <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
            <p className="text-xs font-semibold text-emerald-300">Imported — temporary logins (shown once):</p>
            {created.map((c) => (
              <div key={c.code} className="flex items-center justify-between text-xs text-zinc-300">
                <span>{c.code} · {c.name} · {c.email}</span>
                <code className="text-emerald-400">{c.temp_password}</code>
              </div>
            ))}
          </div>
        )}

        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2">
          <button className={btnGhost} disabled={!csv || busy} onClick={() => run('dry')}>Dry run</button>
          <button className={btnPrimary} disabled={!csv || busy || (report?.header_ok && report.error_count > 0)} onClick={() => run('commit')}>
            Import {report?.header_ok && report.error_count > 0 ? '(fix errors first)' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
