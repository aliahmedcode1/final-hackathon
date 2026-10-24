'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import { api, fmtPKR, fmtDate, fmtTime } from '@/lib/api';
import { PageHeader, Badge, Spinner, StatCard, inputCls, btnPrimary, ErrorText } from '@/components/ui';
import DataTable from '@/components/DataTable';

export default function EmployeeProfile() {
  const { id } = useParams();
  const user = useSelector((s) => s.session.user);
  const isHr = user?.role === 'hr';
  const isSelf = user?.employee_id === id;
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [editSalary, setEditSalary] = useState(false);
  const [salary, setSalary] = useState(0);

  useEffect(() => {
    api(`/employees/${id}`).then((d) => { setData(d); setSalary(d.employee.basic_salary || 0); }).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <ErrorText>{err}</ErrorText>;
  if (!data) return <Spinner />;

  const e = data.employee;
  const counts = data.recent_attendance.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});

  const saveSalary = async () => {
    try {
      await api(`/employees/${id}`, { method: 'PATCH', body: { basic_salary: salary } });
      setData((d) => ({ ...d, employee: { ...d.employee, basic_salary: salary } }));
      setEditSalary(false);
    } catch (e2) { setErr(e2.message); }
  };

  const saveSelf = async (patch) => {
    try {
      await api(`/employees/${id}`, { method: 'PATCH', body: patch });
      setData((d) => ({ ...d, employee: { ...d.employee, ...patch } }));
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <div>
      <PageHeader
        title={`${e.first_name} ${e.last_name}`}
        subtitle={`${e.code} · ${e.designation || 'No designation'} · ${e.department || 'No department'}`}
        actions={<Badge value={e.status} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Email" value={<span className="text-base">{e.email}</span>} />
        <StatCard label="Joined" value={fmtDate(e.join_date)} accent="text-zinc-200" />
        {user.role !== 'employee' && (
          <StatCard label="Basic salary" value={fmtPKR(e.basic_salary)} accent="text-emerald-400"
            hint={isHr && (editSalary ? undefined : 'click ✎ to configure')} />
        )}
        <StatCard label="Last 30 days" value={`${counts.present || 0}P · ${counts.late || 0}L · ${counts.half_day || 0}H`} accent="text-amber-400" />
      </div>

      {isHr && (
        <div className="mt-4 flex items-center gap-2">
          {editSalary ? (
            <>
              <input type="number" min="0" className={inputCls + ' !w-40'} value={salary} onChange={(ev) => setSalary(+ev.target.value)} />
              <button className={btnPrimary} onClick={saveSalary}>Save</button>
              <button className="text-xs text-zinc-500 hover:underline" onClick={() => setEditSalary(false)}>cancel</button>
            </>
          ) : (
            <button className="text-xs text-indigo-400 hover:underline" onClick={() => setEditSalary(true)}>✎ Configure salary structure</button>
          )}
        </div>
      )}

      {isSelf && (
        <div className="mt-4 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">My phone</span>
            <input className={inputCls} defaultValue={e.phone} onBlur={(ev) => ev.target.value !== e.phone && saveSelf({ phone: ev.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">My address</span>
            <input className={inputCls} defaultValue={e.address} onBlur={(ev) => ev.target.value !== e.address && saveSelf({ address: ev.target.value })} />
          </label>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Recent attendance</h2>
          <DataTable
            rows={data.recent_attendance}
            pageSize={8}
            empty="No attendance records yet"
            columns={[
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'check_in_at', label: 'In', render: (r) => fmtTime(r.check_in_at) },
              { key: 'check_out_at', label: 'Out', render: (r) => fmtTime(r.check_out_at) },
              { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
            ]}
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Leave history</h2>
          <DataTable
            rows={data.recent_leaves}
            pageSize={8}
            empty="No leave requests yet"
            columns={[
              { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
              { key: 'from_date', label: 'From', render: (r) => fmtDate(r.from_date) },
              { key: 'to_date', label: 'To', render: (r) => fmtDate(r.to_date) },
              { key: 'days', label: 'Days' },
              { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
            ]}
          />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Payslip history</h2>
        <DataTable
          rows={data.payslips}
          pageSize={6}
          empty="No payslips yet — they appear after payroll runs"
          columns={[
            { key: 'created_at', label: 'Generated', render: (r) => fmtDate(r.created_at) },
            { key: 'gross', label: 'Gross', render: (r) => fmtPKR(r.gross) },
            { key: 'deductions', label: 'Deductions', render: (r) => fmtPKR(r.deductions) },
            { key: 'tax', label: 'Tax', render: (r) => fmtPKR(r.tax) },
            { key: 'net', label: 'Net', render: (r) => <span className="text-emerald-400">{fmtPKR(r.net)}</span> },
          ]}
        />
      </section>
    </div>
  );
}
