import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { todayStr } from '@/lib/dates';
import { loadOrgContext, statusForCheckIn } from '@/lib/attendance-core';

// Attendance correction workflow (PRD 11): employee requests, HR decides, admin views.

export const GET = withAuth(null, async (req, ctx, session) => {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || '';
  const where = [];
  if (session.role === 'employee') where.push(['employee_id', 'eq', session.employee_id]);
  if (status) where.push(['status', 'eq', status]);

  const { rows } = await store.list('attendance_corrections', { where, order: { col: 'created_at', asc: false } });
  const employees = session.role === 'employee' ? [] : (await store.list('employees', {})).rows;
  const empMap = Object.fromEntries(employees.map((e) => [e.id, `${e.first_name} ${e.last_name} (${e.code})`]));
  return json({ rows: rows.map((r) => ({ ...r, employee_name: empMap[r.employee_id] || 'Unknown' })) });
});

const createSchema = z.object({
  attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  new_check_in: z.string().regex(/^\d{2}:\d{2}$/),
  new_check_out: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().min(3),
});

export const POST = withAuth(null, async (req, ctx, session) => {
  if (!session.employee_id) return fail(422, 'UNPROCESSABLE', 'This account has no employee record');
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid request', parsed.error.flatten().fieldErrors);
  const { attendance_date, new_check_in, new_check_out, reason } = parsed.data;

  if (attendance_date > todayStr()) return fail(422, 'UNPROCESSABLE', 'Cannot request a correction for a future date');
  if (new_check_out <= new_check_in) return fail(422, 'UNPROCESSABLE', 'Check-out time must be after check-in');

  const rec = await store.insert('attendance_corrections', {
    employee_id: session.employee_id,
    attendance_date,
    new_check_in,
    new_check_out,
    reason,
    status: 'pending',
  });
  await audit(session.email, 'correction.request', 'attendance_corrections', rec.id, { attendance_date });
  return json(rec, 201);
});

const decideSchema = z.object({
  id: z.string(),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().default(''),
});

export const PATCH = withAuth(['hr'], async (req, ctx, session) => {
  const parsed = decideSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload');
  const { id, decision, comment } = parsed.data;

  const corr = await store.get('attendance_corrections', id);
  if (!corr) return fail(404, 'NOT_FOUND', 'Correction not found');
  if (corr.status !== 'pending') return fail(409, 'CONFLICT', 'Already decided');

  if (decision === 'approved') {
    const existing = await store.findOne('attendance', [['employee_id', 'eq', corr.employee_id], ['date', 'eq', corr.attendance_date]]);
    const { settings } = await loadOrgContext();
    const inAt = new Date(`${corr.attendance_date}T${corr.new_check_in}:00`).toISOString();
    const outAt = new Date(`${corr.attendance_date}T${corr.new_check_out}:00`).toISOString();
    const worked = Math.round(((new Date(outAt) - new Date(inAt)) / 3600000) * 100) / 100;
    const status = worked < (settings?.halfday_hours || 5) ? 'half_day' : statusForCheckIn(inAt, settings);
    if (existing) {
      await store.update('attendance', existing.id, { check_in_at: inAt, check_out_at: outAt, worked_hours: worked, status });
    } else {
      await store.insert('attendance', {
        employee_id: corr.employee_id, date: corr.attendance_date,
        check_in_at: inAt, check_out_at: outAt, worked_hours: worked, status, method: 'web',
      });
    }
  }

  const updated = await store.update('attendance_corrections', id, {
    status: decision,
    reviewed_by: session.email,
    comment,
  });
  await audit(session.email, `correction.${decision}`, 'attendance_corrections', id, { comment });
  await notify(corr.employee_id, 'correction', `Attendance correction ${decision}`,
    `${corr.attendance_date}: ${decision}${comment ? ` — ${comment}` : ''}`, '/attendance/corrections');
  return json(updated);
});
