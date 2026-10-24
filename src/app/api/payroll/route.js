import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyEmployee } from '@/lib/notify';
import { monthStr, monthBounds, todayStr, addDays } from '@/lib/dates';
import { loadOrgContext, expectedWorkingDates } from '@/lib/attendance-core';
import { computePayslip } from '@/lib/payroll';

// GET: run list + payslips. Employees see only their own payslips.
export const GET = withAuth(null, async (req, ctx, session) => {
  const url = new URL(req.url);
  const runId = url.searchParams.get('run_id');

  if (session.role === 'employee') {
    if (!session.employee_id) return json({ runs: [], payslips: [], employees: [] });
    const { rows: mySlips } = await store.list('payslips', { where: [['employee_id', 'eq', session.employee_id]] });
    const runs = runId
      ? [await store.get('payroll_runs', runId)].filter(Boolean)
      : (await store.list('payroll_runs', { order: { col: 'period', asc: false } })).rows;
    const mySlipRunIds = new Set(mySlips.map((p) => p.run_id));
    return json({
      runs: runs.filter((r) => r.status === 'locked' || mySlipRunIds.has(r.id)),
      payslips: mySlips,
      employees: [],
    });
  }

  const runs = runId
    ? [await store.get('payroll_runs', runId)].filter(Boolean)
    : (await store.list('payroll_runs', { order: { col: 'period', asc: false } })).rows;
  const runIds = new Set(runs.map((r) => r.id));
  const allSlips = (await store.list('payslips', {})).rows.filter((p) => runIds.has(p.run_id));
  const { rows: employees } = await store.list('employees', { order: { col: 'code' } });
  const empMap = Object.fromEntries(employees.map((e) => [e.id, `${e.first_name} ${e.last_name} (${e.code})`]));

  return json({
    runs,
    payslips: allSlips.map((p) => ({ ...p, employee_name: empMap[p.employee_id] || 'Unknown' })),
    employees: employees.filter((e) => e.status === 'active').map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, basic_salary: e.basic_salary })),
  });
});

const createSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

// POST: generate/refresh a draft run for period (PRD 15). Locked periods are rejected.
export const POST = withAuth(['hr'], async (req, ctx, session) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'period (YYYY-MM) required');
  const { period } = parsed.data;

  const existing = await store.findOne('payroll_runs', [['period', 'eq', period]]);
  if (existing?.status === 'locked') {
    return fail(409, 'LOCKED', `Payroll for ${period} is finalized and locked`);
  }

  const { settings, holidaySet } = await loadOrgContext();
  const { from, to } = monthBounds(period);
  const { rows: employees } = await store.list('employees', { where: [['status', 'eq', 'active']] });
  if (!employees.length) return fail(422, 'UNPROCESSABLE', 'No active employees to pay');

  // Approved leave per employee covering the period.
  const { rows: allApprovedLeaves } = await store.list('leave_requests', { where: [['status', 'eq', 'approved']] });
  const leaves = allApprovedLeaves.filter((l) => l.from_date <= to && l.to_date >= from);

  // Attendance rows in the period.
  const attRows = (await store.list('attendance', {})).rows.filter((r) => r.date >= from && r.date <= to);
  const attByEmp = {};
  for (const a of attRows) (attByEmp[a.employee_id] ||= new Set()).add(a.date);

  const payslips = [];
  for (const emp of employees) {
    const expected = expectedWorkingDates({
      settings, holidaySet, from, to,
      joinDate: emp.join_date, exitDate: emp.exit_date,
    });
    const workingDays = expected.length;
    if (workingDays === 0) continue;

    const attended = attByEmp[emp.id] || new Set();
    const empLeaves = leaves.filter((l) => l.employee_id === emp.id);
    const leaveDaysByType = {};
    for (const l of empLeaves) {
      let d = l.from_date < from ? from : l.from_date;
      const end = l.to_date > to ? to : l.to_date;
      while (d <= end) {
        if (expected.includes(d)) (leaveDaysByType[l.type] ||= new Set()).add(d);
        d = addDays(d, 1);
      }
    }
    const onLeavePaid = new Set([
      ...(leaveDaysByType.annual || []), ...(leaveDaysByType.sick || []), ...(leaveDaysByType.casual || []),
    ]);
    const absentDays = expected.filter((d) => !attended.has(d) && !onLeavePaid.has(d)).length;
    const unpaidDays = (leaveDaysByType.unpaid || new Set()).size;

    const slip = computePayslip({
      basic: Number(emp.basic_salary || 0),
      workingDays,
      absentDays,
      unpaidDays,
    });
    payslips.push({ run_id: null, employee_id: emp.id, ...slip });
  }

  if (!payslips.length) return fail(422, 'UNPROCESSABLE', 'No payable employees in this period');

  const totals = {
    employees: payslips.length,
    gross: Math.round(payslips.reduce((s, p) => s + p.gross, 0)),
    deductions: Math.round(payslips.reduce((s, p) => s + p.deductions, 0)),
    tax: Math.round(payslips.reduce((s, p) => s + p.tax, 0)),
    net: Math.round(payslips.reduce((s, p) => s + p.net, 0)),
  };

  let run = existing;
  if (run) {
    await store.removeWhere('payslips', [['run_id', 'eq', run.id]]);
    run = await store.update('payroll_runs', run.id, { totals, created_by: session.email, created_at: new Date().toISOString() });
  } else {
    run = await store.insert('payroll_runs', { period, status: 'draft', totals, created_by: session.email });
  }
  await store.insert('payslips', payslips.map((p) => ({ ...p, run_id: run.id })));

  await audit(session.email, 'payroll.draft', 'payroll_runs', run.id, { period, ...totals });
  return json({ run, payslip_count: payslips.length, totals }, 201);
});
