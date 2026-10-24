'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import Link from 'next/link';
import { api, fmtTime } from '@/lib/api';
import { PageHeader, Badge, Spinner, inputCls, btnGhost, EmptyState } from '@/components/ui';
import DataTable from '@/components/DataTable';
import CheckInCard from '@/components/CheckInCard';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AttendancePage() {
  const user = useSelector((s) => s.session.user);
  const isEmployee = user?.role === 'employee';
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [board, setBoard] = useState(null);
  const [empFilter, setEmpFilter] = useState('');
  const [calendar, setCalendar] = useState(null);
  const [calMonth, setCalMonth] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() + 1 });
  const [myRecord, setMyRecord] = useState(null);
  const [deptCounts, setDeptCounts] = useState([]);

  const loadBoard = useCallback(async () => {
    const res = await api('/attendance', { query: { date } });
    setBoard(res);
  }, [date]);

  useEffect(() => { loadBoard().catch(() => setBoard({ board: [] })); }, [loadBoard]);

  // Employee: own record for check-in card
  useEffect(() => {
    if (!isEmployee || !user.employee_id) return;
    api('/attendance', { query: { month: date.slice(0, 7), employee_id: user.employee_id } })
      .then((res) => {
        const rec = res.days.find((d) => d.date === date);
        setMyRecord(rec && rec.check_in_at ? { ...rec, check_out_at: rec.check_out_at } : null);
      })
      .catch(() => {});
  }, [isEmployee, user, date, board]);

  // HR/Admin: per-department counts for the selected day
  useEffect(() => {
    if (isEmployee || !board) return;
    api('/org').then((org) => {
      const counts = org.departments.map((d) => {
        const inDept = board.board.filter((b) => b.department_id === d.id);
        return { name: d.name, present: inDept.filter((b) => ['present', 'late', 'missing_checkout'].includes(b.status)).length, total: inDept.length };
      });
      setDeptCounts(counts);
    }).catch(() => {});
  }, [isEmployee, board]);

  const loadCalendar = useCallback(async () => {
    const empId = isEmployee ? user.employee_id : empFilter;
    if (!empId) { setCalendar(null); return; }
    const res = await api('/attendance', { query: { month: `${calMonth.y}-${String(calMonth.m).padStart(2, '0')}`, employee_id: empId } });
    setCalendar(res);
  }, [calMonth, empFilter, isEmployee, user]);

  useEffect(() => { loadCalendar().catch(() => {}); }, [loadCalendar]);

  const statusColor = {
    present: 'bg-emerald-500/70', late: 'bg-amber-500/70', half_day: 'bg-orange-500/70',
    missing_checkout: 'bg-sky-500/70', absent: 'bg-rose-500/60', on_leave: 'bg-violet-500/60',
    future: 'bg-zinc-800', weekend: 'bg-zinc-800', holiday: 'bg-violet-900/60',
  };

  const shiftMonth = (delta) => {
    setCalMonth(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  };

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={isEmployee ? 'Your check-in/out, calendar and history' : 'Daily board, per-department view and monthly calendars'}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          {isEmployee ? (
            <CheckInCard todayRecord={myRecord} onChanged={loadBoard} />
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-300">Department snapshot</h3>
              {deptCounts.length === 0 && <p className="text-xs text-zinc-600">No departments configured.</p>}
              {deptCounts.map((d) => (
                <div key={d.name} className="mb-2 flex items-center justify-between">
                  <span className="text-zinc-400">{d.name}</span>
                  <span className="text-xs text-zinc-300">{d.present}/{d.total} in</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-300">{MONTHS[calMonth.m - 1]} {calMonth.y}</h3>
              <div className="flex gap-1">
                <button className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs" onClick={() => shiftMonth(-1)}>‹</button>
                <button className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs" onClick={() => shiftMonth(1)}>›</button>
              </div>
            </div>
            {!isEmployee && (
              <select className={inputCls + ' mb-3'} value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
                <option value="">Select employee to view calendar…</option>
                {(board?.board || []).map((b) => <option key={b.employee_id} value={b.employee_id}>{b.name}</option>)}
              </select>
            )}
            {calendar ? (
              <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="text-zinc-600">{d}</div>)}
                {Array.from({ length: new Date(calMonth.y, calMonth.m - 1, 1).getDay() }).map((_, i) => <div key={`b${i}`} />)}
                {calendar.days.map((d) => (
                  <div key={d.date} title={`${d.date}: ${d.status.replace('_', ' ')}`}
                    className={`grid aspect-square place-items-center rounded-md text-[10px] text-white/90 ${statusColor[d.status] || 'bg-zinc-800'}`}>
                    {Number(d.date.slice(-2))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">{isEmployee ? 'Loading…' : 'Pick an employee'}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-zinc-500">
              {[['present', 'bg-emerald-500/70'], ['late', 'bg-amber-500/70'], ['half_day', 'bg-orange-500/70'], ['absent', 'bg-rose-500/60'], ['on_leave', 'bg-violet-500/60'], ['missing_checkout', 'bg-sky-500/70']].map(([k, c]) => (
                <span key={k} className="flex items-center gap-1"><span className={`size-2 rounded-sm ${c}`} />{k.replace('_', ' ')}</span>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input type="date" className={inputCls + ' !w-44'} value={date} onChange={(e) => setDate(e.target.value)} />
            <button className={btnGhost} onClick={() => setDate(new Date().toISOString().slice(0, 10))}>Today</button>
            {board && !board.is_working_day && <Badge value="non-working day" />}
          </div>

          {!board ? <Spinner /> : (
            <DataTable
              rows={board.board}
              empty="No employees registered yet"
              columns={[
                { key: 'code', label: 'Code' },
                { key: 'name', label: 'Employee', render: (r) => (isEmployee ? r.name : <Link href={`/employees/${r.employee_id}`} className="text-indigo-300 hover:underline">{r.name}</Link>) },
                { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
                { key: 'check_in_at', label: 'In', render: (r) => fmtTime(r.check_in_at) },
                { key: 'check_out_at', label: 'Out', render: (r) => fmtTime(r.check_out_at) },
                { key: 'method', label: 'Method', render: (r) => (r.method ? (r.method === 'camera' ? '📷 camera' : 'web') : '—') },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
