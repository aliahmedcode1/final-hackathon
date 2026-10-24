import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { monthStr, monthBounds, workingDaysBetween, makeHolidaySet, todayStr } from '@/lib/dates';

// GET: 360° profile (PRD 07). Employees may only fetch their own profile.
export const GET = withAuth(null, async (req, ctx, session) => {
  const { id } = await ctx.params;
  if (session.role === 'employee' && session.employee_id !== id) {
    return fail(403, 'FORBIDDEN', 'Employees can only view their own profile');
  }
  const emp = await store.get('employees', id);
  if (!emp) return fail(404, 'NOT_FOUND', 'Employee not found');

  const [dept, desig, attendance, leaves, payslips, user] = await Promise.all([
    emp.department_id ? store.get('departments', emp.department_id) : null,
    emp.designation_id ? store.get('designations', emp.designation_id) : null,
    store.list('attendance', { where: [['employee_id', 'eq', id]], order: { col: 'date', asc: false }, limit: 31 }),
    store.list('leave_requests', { where: [['employee_id', 'eq', id]], order: { col: 'created_at', asc: false }, limit: 20 }),
    store.list('payslips', { where: [['employee_id', 'eq', id]], order: { col: 'created_at', asc: false }, limit: 12 }),
    store.findOne('users', [['employee_id', 'eq', id]]),
  ]);

  const settings = await store.findOne('company_settings', []);
  const { rows: holidays } = await store.list('public_holidays', {});
  const holidaySet = makeHolidaySet(holidays);
  const period = monthStr(-1); // last full month summary
  const { from, to } = monthBounds(period);
  const workingDays = workingDaysBetween(from, to, settings, holidaySet);

  return json({
    employee: {
      ...emp,
      department: dept?.name || null,
      designation: desig?.name || null,
      has_login: Boolean(user),
      ...(session.role === 'employee' ? { basic_salary: undefined } : {}),
    },
    recent_attendance: attendance.rows,
    recent_leaves: leaves.rows,
    payslips: session.role === 'employee' ? payslips.rows : payslips.rows,
    summary: { period, working_days: workingDays, today: todayStr() },
  });
});

const patchSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  department_id: z.string().nullable().optional(),
  designation_id: z.string().nullable().optional(),
  join_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  exit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'exited']).optional(),
  basic_salary: z.coerce.number().min(0).optional(),
});

// PATCH: HR edits everything; Employees only phone/address of their own record.
export const PATCH = withAuth(null, async (req, ctx, session) => {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload', parsed.error.flatten().fieldErrors);
  const patch = parsed.data;

  const emp = await store.get('employees', id);
  if (!emp) return fail(404, 'NOT_FOUND', 'Employee not found');

  if (session.role === 'employee') {
    if (session.employee_id !== id) return fail(403, 'FORBIDDEN', 'Employees can only edit their own record');
    const allowed = {};
    if (patch.phone !== undefined) allowed.phone = patch.phone;
    if (patch.address !== undefined) allowed.address = patch.address;
    if (Object.keys(allowed).length === 0) return fail(403, 'FORBIDDEN', 'You may only update phone and address');
    const updated = await store.update('employees', id, allowed);
    return json(updated);
  }
  if (session.role !== 'hr') return fail(403, 'FORBIDDEN', 'Requires role: hr');

  if (patch.exit_date || patch.status === 'exited') {
    patch.status = 'exited';
    patch.exit_date = patch.exit_date || todayStr();
    const user = await store.findOne('users', [['employee_id', 'eq', id]]);
    if (user) await store.update('users', user.id, { is_active: false });
  }
  const updated = await store.update('employees', id, patch);
  await audit(session.email, 'employee.update', 'employees', id, patch);
  return json(updated);
});
