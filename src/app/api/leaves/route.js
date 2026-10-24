import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { leaveContext, countLeaveDays, validateRange, findOverlap, checkQuota, balancesFor } from '@/lib/leave-core';

// GET: leave history (own; HR/Admin all) + ?employee_id=balance or ?balance=1
export const GET = withAuth(null, async (req, ctx, session) => {
  const url = new URL(req.url);
  const employeeId = url.searchParams.get('employee_id') || session.employee_id;
  if (session.role === 'employee' && employeeId !== session.employee_id) {
    return fail(403, 'FORBIDDEN', 'Employees can only view their own leave');
  }
  const { settings, requests } = await leaveContext(employeeId);
  const year = url.searchParams.get('year') || String(new Date().getFullYear());
  const balances = balancesFor(requests, settings?.quotas, year);
  const { rows: employees } = session.role === 'employee' ? { rows: [] } : await store.list('employees', {});
  const empMap = Object.fromEntries(employees.map((e) => [e.id, `${e.first_name} ${e.last_name} (${e.code})`]));
  return json({
    balances,
    rows: requests
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((r) => ({ ...r, employee_name: empMap[r.employee_id] || null })),
  });
});

const applySchema = z.object({
  employee_id: z.string().optional(), // HR may apply on behalf of an employee
  type: z.enum(['annual', 'sick', 'casual', 'unpaid']),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().default(''),
});

// POST: apply. 422 on overlap or quota overflow; days exclude weekends+holidays (FR-05.1/2).
export const POST = withAuth(null, async (req, ctx, session) => {
  const parsed = applySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid leave request', parsed.error.flatten().fieldErrors);
  const body = parsed.data;

  let employeeId = session.employee_id;
  if (body.employee_id && body.employee_id !== session.employee_id) {
    if (session.role !== 'hr' && session.role !== 'admin') return fail(403, 'FORBIDDEN', 'Only HR can apply for others');
    employeeId = body.employee_id;
  }
  if (!employeeId) return fail(422, 'UNPROCESSABLE', 'This account has no employee record');

  const rangeErr = validateRange(body.from_date, body.to_date);
  if (rangeErr) return fail(422, 'UNPROCESSABLE', rangeErr);

  const { settings, holidaySet, requests } = await leaveContext(employeeId);
  const days = countLeaveDays(body.from_date, body.to_date, settings, holidaySet);
  if (days <= 0) return fail(422, 'UNPROCESSABLE', 'The selected range contains no working days');

  if (findOverlap(requests, body.from_date, body.to_date)) {
    return fail(422, 'UNPROCESSABLE', 'Dates overlap an existing leave request');
  }
  const quotaErr = checkQuota({
    type: body.type, days,
    year: body.from_date.slice(0, 4),
    requests, quotas: settings?.quotas,
  });
  if (quotaErr) return fail(422, 'UNPROCESSABLE', quotaErr);

  const rec = await store.insert('leave_requests', {
    employee_id: employeeId,
    type: body.type,
    from_date: body.from_date,
    to_date: body.to_date,
    days,
    reason: body.reason,
    status: 'pending',
  });
  await audit(session.email, 'leave.apply', 'leave_requests', rec.id, { type: body.type, days });
  return json(rec, 201);
});

const patchSchema = z.object({ id: z.string(), action: z.enum(['cancel']) });

// PATCH: employee cancels their own pending request.
export const PATCH = withAuth(null, async (req, ctx, session) => {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload');
  const { id } = parsed.data;

  const rec = await store.get('leave_requests', id);
  if (!rec) return fail(404, 'NOT_FOUND', 'Leave request not found');
  if (session.role === 'employee' && rec.employee_id !== session.employee_id) {
    return fail(403, 'FORBIDDEN', 'You can only cancel your own requests');
  }
  if (rec.status !== 'pending') return fail(409, 'CONFLICT', 'Only pending requests can be cancelled');

  const updated = await store.update('leave_requests', id, { status: 'cancelled' });
  await audit(session.email, 'leave.cancel', 'leave_requests', id, {});
  return json(updated);
});
