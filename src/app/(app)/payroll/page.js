'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { api, fmtPKR, fmtDate } from '@/lib/api';
import { pushToast } from '@/store/store';
import { PageHeader, Badge, Spinner, Field, inputCls, btnPrimary, btnGhost, StatCard, EmptyState } from '@/components/ui';
import DataTable from '@/components/DataTable';
import PayslipPdf from '@/components/PayslipPdf';

export default function PayrollPage() {
  const user = useSelector((s) => s.session.user);
  const dispatch = useDispatch();
  const isEmployee = user?.role === 'employee';
  const isHr = user?.role === 'hr';
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(null);

  const load = useCallback(async (runId) => {
    const res = await api('/payroll', { query: runId ? { run_id: runId } : {} });
    setData(res);
    if (runId) setSelectedRun(runId);
  }, []);

  useEffect(() => { load().catch((e) => dispatch(pushToast({ type: 'error', message: e.message }))); }, [load, dispatch]);

  const run = useMemo(
    () => data?.runs.find((r) => r.id === (selectedRun || data.runs[0]?.id)) || null,
    [data, selectedRun]
  );
  const slips = useMemo(
    () => (data?.payslips || []).filter((p) => p.run_id === run?.id),
    [data, run]
  );

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api('/payroll', { method: 'POST', body: { period } });
      dispatch(pushToast({ type: 'success', message: `Draft ready — ${res.payslip_count} payslips, net ${fmtPKR(res.totals.net)}` }));
      await load(res.run.id);
    } catch (e) {
      dispatch(pushToast({ type: 'error', message: e.message }));
    } finally { setBusy(false); }
  };

  const finalize = async (runId) => {
    setConfirmFinal(null);
    try {
      await api('/payroll/finalize', { method: 'POST', body: { run_id: runId } });
      dispatch(pushToast({ type: 'success', message: 'Payroll finalized — month locked' }));
      load(runId);
    } catch (e) {
      dispatch(pushToast({ type: 'error', message: e.message }));
    }
  };

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle={isEmployee ? 'Your payslips' : 'Monthly runs: HR drafts, Admin finalizes to lock'}
      />

      {isEmployee ? (
        !data ? <Spinner /> : (
          <DataTable
            rows={data.payslips}
            empty="No payslips yet — available after a payroll run is finalized"
            columns={[
              { key: 'run', label: 'Period', render: (r) => data.runs.find((x) => x.id === r.run_id)?.period || '—' },
              { key: 'gross', label: 'Gross', render: (r) => fmtPKR(r.gross) },
              { key: 'deductions', label: 'Deductions', render: (r) => fmtPKR(r.deductions) },
              { key: 'tax', label: 'Tax', render: (r) => fmtPKR(r.tax) },
              { key: 'net', label: 'Net', render: (r) => <span className="font-semibold text-emerald-400">{fmtPKR(r.net)}</span> },
              { key: 'pdf', label: '', render: (r) => <PayslipPdf slip={r} run={{ period: data.runs.find((x) => x.id === r.run_id)?.period || '' }} company={user.company_name || ''} /> },
            ]}
          />
        )
      ) : (
        <>
          {isHr && (
            <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <Field label="Payroll period (month)">
                <input type="month" className={inputCls + ' !w-44'} value={period} onChange={(e) => setPeriod(e.target.value)} />
              </Field>
              <button className={btnPrimary} disabled={busy || !period} onClick={generate}>
                {busy ? 'Computing…' : 'Generate / refresh draft'}
              </button>
              <p className="text-xs text-zinc-500">Locked months cannot be regenerated.</p>
            </div>
          )}

          {!data ? <Spinner /> : (
            <>
              {data.runs.length === 0 ? (
                <EmptyState title="No payroll runs yet" hint="HR creates the first draft above." />
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {data.runs.map((r) => (
                      <button key={r.id} onClick={() => setSelectedRun(r.id)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${run?.id === r.id ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200' : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800/60'}`}>
                        {r.period} <Badge value={r.status} />
                      </button>
                    ))}
                  </div>

                  {run && (
                    <>
                      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard label="Employees" value={run.totals?.employees ?? '—'} />
                        <StatCard label="Gross" value={fmtPKR(run.totals?.gross)} accent="text-sky-400" />
                        <StatCard label="Deductions + Tax" value={fmtPKR((run.totals?.deductions || 0) + (run.totals?.tax || 0))} accent="text-amber-400" />
                        <StatCard label="Net payable" value={fmtPKR(run.totals?.net)} accent="text-emerald-400" />
                      </div>

                      {isAdmin && run.status === 'draft' && (
                        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                          <span>Finalizing permanently locks {run.period}.</span>
                          <button className={btnPrimary} onClick={() => setConfirmFinal(run.id)}>Finalize & lock</button>
                        </div>
                      )}

                      <DataTable
                        rows={slips}
                        empty="No payslips in this run"
                        columns={[
                          { key: 'employee_name', label: 'Employee' },
                          { key: 'basic', label: 'Basic', render: (r) => fmtPKR(r.basic) },
                          { key: 'gross', label: 'Gross (1.5×)', render: (r) => fmtPKR(r.gross) },
                          { key: 'absent_days', label: 'Absent', render: (r) => r.absent_days || '—' },
                          { key: 'unpaid_days', label: 'Unpaid', render: (r) => r.unpaid_days || '—' },
                          { key: 'deductions', label: 'Deductions', render: (r) => fmtPKR(r.deductions) },
                          { key: 'tax', label: 'Tax', render: (r) => fmtPKR(r.tax) },
                          { key: 'net', label: 'Net', render: (r) => <span className="font-semibold text-emerald-400">{fmtPKR(r.net)}</span> },
                          { key: 'pdf', label: '', render: (r) => <PayslipPdf slip={r} run={run} company={data.company_name || ''} /> },
                        ]}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {confirmFinal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold">Lock payroll permanently?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {fmtPKR(data.runs.find((r) => r.id === confirmFinal)?.totals?.net)} net for the month will be locked forever.
              No edits, no regeneration.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setConfirmFinal(null)}>Cancel</button>
              <button className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500" onClick={() => finalize(confirmFinal)}>
                Finalize & lock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
