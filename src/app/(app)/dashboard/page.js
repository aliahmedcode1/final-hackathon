'use client';

import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { api, fmtDate } from '@/lib/api';
import { pushToast } from '@/store/store';
import { PageHeader, Spinner, Field, inputCls, btnPrimary, btnGhost, EmptyState } from '@/components/ui';
import DataTable from '@/components/DataTable';

export default function DashboardPage() {
  const user = useSelector((s) => s.session.user);
  const isEmployee = user?.role === 'employee';

  return (
    <div>
      <PageHeader
        title={isEmployee ? 'My dashboard' : 'Company dashboard'}
        subtitle={isEmployee ? 'Your attendance, leave and payslip snapshot' : 'Live KPIs across the organization'}
      />
      {isEmployee ? <EmployeeDashboard /> : <CompanyDashboard role={user.role} />}
    </div>
  );
}

function KpiBar({ kpis }) {
  const items = [
    ['Attendance rate', kpis.attendance_rate !== null ? `${kpis.attendance_rate}%` : '—', 'text-emerald-400'],
    ['Late %', kpis.late_percentage !== null ? `${kpis.late_percentage}%` : '—', 'text-amber-400'],
    ['Absenteeism', kpis.absenteeism !== null ? `${kpis.absenteeism}%` : '—', 'text-rose-400'],
    ['Attendance records', kpis.worked_records, 'text-sky-400'],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value, color]) => (
        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
          <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function CompanyDashboard({ role }) {
  const [data, setData] = useState(null);
  const [aiSummary, setAiSummary] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => { api('/dashboard').then(setData).catch(() => setData({})); }, []);

  const askAi = async () => {
    setAiBusy(true);
    try {
      const res = await api('/ai/chat', { method: 'POST', body: { messages: [{ role: 'user', content: 'Give a short analytical summary of current company attendance, leave and payroll status.' }] } });
      setAiSummary(res.reply);
    } catch (e) {
      setAiSummary(`AI unavailable: ${e.message}`);
    } finally { setAiBusy(false); }
  };

  if (!data) return <Spinner />;

  const maxRate = 100;

  return (
    <div className="space-y-8">
      <KpiBar kpis={data.kpis || {}} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Headcount (active)</div>
          <div className="mt-2 text-2xl font-semibold text-indigo-300">{data.headcount?.active ?? '—'}</div>
          <div className="mt-1 text-xs text-zinc-500">of {data.headcount?.total ?? 0} ever registered</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Attrition (YTD)</div>
          <div className="mt-2 text-2xl font-semibold text-rose-400">{data.attrition !== null ? `${data.attrition}%` : '—'}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Pending leave requests</div>
          <div className="mt-2 text-2xl font-semibold text-amber-400">{data.pending_leaves}</div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">6-month attendance trend</h2>
        {(data.trend || []).length > 0 && (
          <div className="flex items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4" style={{ height: 160 }}>
            {data.trend.map((t) => (
              <div key={t.period} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${t.period}: ${t.attendance_rate ?? '—'}%`}>
                <span className="text-[10px] text-zinc-500">{t.attendance_rate !== null ? `${t.attendance_rate}%` : '—'}</span>
                <div className="w-full rounded-t-md bg-indigo-500/70" style={{ height: `${Math.max(4, ((t.attendance_rate || 0) / maxRate) * 100)}%` }} />
                <span className="text-[10px] text-zinc-600">{t.period.slice(5)}/{t.period.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">By department</h2>
        {(data.departments || []).length === 0 ? (
          <EmptyState title="No department data yet" />
        ) : (
          <DataTable
            rows={data.departments}
            empty="No data"
            columns={[
              { key: 'dept', label: 'Department', render: (r) => (r.dept === 'Unassigned' ? 'Unassigned' : <DeptName id={r.dept} />) },
              { key: 'attendance_rate', label: 'Attendance', render: (r) => r.attendance_rate !== null ? `${r.attendance_rate}%` : '—' },
              { key: 'late_pct', label: 'Late %', render: (r) => r.late_pct !== null ? `${r.late_pct}%` : '—' },
              { key: 'absenteeism', label: 'Absenteeism', render: (r) => r.absenteeism !== null ? `${r.absenteeism}%` : '—' },
              { key: 'present', label: 'P / L / H / A', render: (r) => `${r.present} / ${r.late} / ${r.half_day} / ${r.absent}` },
            ]}
          />
        )}
      </section>

      {role === 'admin' || role === 'hr' ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">✦ AI analytical summary</h2>
            <button className={btnGhost} onClick={askAi} disabled={aiBusy}>{aiBusy ? 'Thinking…' : 'Generate'}</button>
          </div>
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 text-sm text-zinc-300">
            {aiSummary ? (
              <>
                <span className="mb-2 inline-block rounded bg-indigo-600/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-indigo-200">AI-generated</span>
                <p className="whitespace-pre-wrap">{aiSummary}</p>
              </>
            ) : (
              <p className="text-zinc-500">Click Generate to get an AI overview of current company status.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DeptName({ id }) {
  const [name, setName] = useState('…');
  useEffect(() => {
    api('/org').then((org) => setName(org.departments.find((d) => d.id === id)?.name || 'Unassigned')).catch(() => setName('—'));
  }, [id]);
  return name;
}

function EmployeeDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/dashboard').then(setData).catch(() => setData({})); }, []);
  if (!data) return <Spinner />;
  const p = data.personal || {};

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Present days', p.present ?? 0, 'text-emerald-400'],
          ['Late days', p.late ?? 0, 'text-amber-400'],
          ['On leave', p.on_leave ?? 0, 'text-violet-400'],
          ['Absent days', p.absent ?? 0, 'text-rose-400'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
            <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-zinc-500">
        {data.pending_leaves > 0
          ? `You have ${data.pending_leaves} pending leave request${data.pending_leaves > 1 ? 's' : ''}.`
          : 'No pending leave requests.'}{' '}
        Expected working days this month: {p.expected_days ?? '—'}.
      </p>
    </div>
  );
}
