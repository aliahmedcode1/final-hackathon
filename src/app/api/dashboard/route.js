import { store } from '@/lib/store';
import { withAuth, json } from '@/lib/auth';
import { monthStr, monthBounds, todayStr, addDays } from '@/lib/dates';
import { loadOrgContext, expectedWorkingDates } from '@/lib/attendance-core';
import { attendanceRate, latePercentage, absenteeismRate, attritionRate } from '@/lib/kpi';

// Role-scoped dashboard KPI payload (PRD 18) + AI widget text (PRD 20).

async function monthKpis(period) {
  const { settings, holidaySet } = await loadOrgContext();
  const { from, to } = monthBounds(period);
  const { rows: employees } = await store.list('employees', {});
  const active = employees.filter((e) => e.status === 'active');
  const { rows: att } = await store.list('attendance', {});
  const attInMonth = att.filter((r) => r.date >= from && r.date <= to && r.date <= todayStr());
  const { rows: leaves } = await store.list('leave_requests', {});

  const byDept = {};
  let totals = { present: 0, late: 0, missing: 0, half: 0, absent: 0, expected: 0, onLeave: 0 };

  for (const emp of active) {
    const deptName = emp.department_id || 'Unassigned';
    byDept[deptName] ||= { present: 0, late: 0, missing: 0, half: 0, absent: 0, expected: 0, onLeave: 0 };
    const expected = expectedWorkingDates({
      settings, holidaySet, from, to,
      joinDate: emp.join_date, exitDate: emp.exit_date,
    });
    const empAtt = attInMonth.filter((a) => a.employee_id === emp.id);
    const attDates = new Set(empAtt.map((a) => a.date));
    const onLeaveDates = new Set(
      leaves.filter((l) => l.employee_id === emp.id && l.status === 'approved' && l.type !== 'unpaid' && l.from_date <= to && l.to_date >= from)
        .flatMap((l) => { const ds = []; let d = l.from_date < from ? from : l.from_date; const end = l.to_date > to ? to : l.to_date; while (d <= end) { ds.push(d); d = addDays(d, 1); } return ds; })
    );
    const present = empAtt.filter((a) => a.status === 'present').length;
    const late = empAtt.filter((a) => a.status === 'late').length;
    const missing = empAtt.filter((a) => !a.check_out_at).length;
    const half = empAtt.filter((a) => a.status === 'half_day').length;
    const absent = expected.filter((d) => !attDates.has(d) && !onLeaveDates.has(d)).length;
    const onLeave = expected.filter((d) => onLeaveDates.has(d)).length;
    const expectedCount = expected.length;

    for (const bucket of [totals, byDept[deptName]]) {
      bucket.present += present; bucket.late += late; bucket.missing += missing;
      bucket.half += half; bucket.absent += absent; bucket.expected += expectedCount; bucket.onLeave += onLeave;
    }
  }

  const kpis = {
    attendance_rate: attendanceRate({ present: totals.present, late: totals.late, missingCheckout: totals.missing, halfDay: totals.half, onLeave: totals.onLeave, workingDays: totals.expected }),
    late_percentage: latePercentage(totals),
    absenteeism: absenteeismRate({ absent: totals.absent, expectedDays: totals.expected }),
    expected_days: totals.expected,
    worked_records: attInMonth.length,
  };

  const departments = Object.entries(byDept).map(([dept, t]) => ({
    dept,
    present: t.present, late: t.late, half_day: t.half, absent: t.absent,
    attendance_rate: attendanceRate({ present: t.present, late: t.late, missingCheckout: t.missing, halfDay: t.half, onLeave: t.onLeave, workingDays: t.expected }),
    late_pct: latePercentage(t),
    absenteeism: absenteeismRate({ absent: t.absent, expectedDays: t.expected }),
  }));

  return { period, kpis, departments };
}

export const GET = withAuth(null, async (req, ctx, session) => {
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || monthStr();
  const thisMonth = await monthKpis(period);
  const lastPeriod = monthStr(-1);
  const lastMonth = await monthKpis(lastPeriod);

  const { rows: employees } = await store.list('employees', {});
  const active = employees.filter((e) => e.status === 'active');
  const exitedYtd = employees.filter((e) => e.exit_date && e.exit_date.slice(0, 4) === String(new Date().getFullYear())).length;
  const headcount = { active: active.length, total: employees.length };
  const attrition = attritionRate({ exits: exitedYtd, avgHeadcount: Math.max(1, headcount.active + exitedYtd / 2) });

  const { rows: leaves } = await store.list('leave_requests', {});
  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;

  // Personal stats for employees
  let personal = null;
  if (session.role === 'employee' && session.employee_id) {
    const { rows: myAtt } = await store.list('attendance', { where: [['employee_id', 'eq', session.employee_id]] });
    const { settings, holidaySet } = await loadOrgContext();
    const { from, to } = monthBounds(period);
    const expected = expectedWorkingDates({ settings, holidaySet, from, to, joinDate: (employees.find((e) => e.id === session.employee_id))?.join_date });
    const mineInMonth = myAtt.filter((a) => a.date >= from && a.date <= to);
    const myLeaves = leaves.filter((l) => l.employee_id === session.employee_id && l.status === 'approved' && l.from_date <= to && l.to_date >= from);
    const onLeaveDays = myLeaves.reduce((s, l) => {
      let d = l.from_date < from ? from : l.from_date; const end = l.to_date > to ? to : l.to_date; let n = 0;
      while (d <= end) { if (expected.includes(d)) n++; d = addDays(d, 1); } return s + n;
    }, 0);
    const attDates = new Set(mineInMonth.map((a) => a.date));
    const absent = expected.filter((d) => !attDates.has(d) && d <= todayStr()).length - onLeaveDays;
    personal = {
      present: mineInMonth.filter((a) => a.status === 'present').length,
      late: mineInMonth.filter((a) => a.status === 'late').length,
      half_day: mineInMonth.filter((a) => a.status === 'half_day').length,
      on_leave: onLeaveDays,
      absent: Math.max(0, absent),
      expected_days: expected.length,
      pending_leaves: leaves.filter((l) => l.employee_id === session.employee_id && l.status === 'pending').length,
    };
  }

  // 6-month trend for charts (A/H)
  let trend = null;
  if (session.role !== 'employee') {
    trend = [];
    for (let i = 5; i >= 0; i--) {
      const p = monthStr(-i);
      const t = p === thisMonth.period ? thisMonth : p === lastPeriod ? lastMonth : await monthKpis(p);
      trend.push({ period: p, attendance_rate: t.kpis.attendance_rate, late_pct: t.kpis.late_percentage });
    }
  }

  return json({
    period,
    kpis: thisMonth.kpis,
    departments: thisMonth.departments,
    headcount,
    attrition,
    pending_leaves: pendingLeaves,
    personal,
    trend,
    today: todayStr(),
  });
});
