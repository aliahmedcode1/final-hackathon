import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { todayStr } from '@/lib/dates';
import { loadOrgContext, statusForCheckIn } from '@/lib/attendance-core';

// POST: check-out for today's record. Re-evaluates half-day threshold (FR-04.2).
export const POST = withAuth(null, async (req, ctx, session) => {
  if (!session.employee_id) return fail(422, 'UNPROCESSABLE', 'This account has no employee record');

  const today = todayStr();
  const rec = await store.findOne('attendance', [['employee_id', 'eq', session.employee_id], ['date', 'eq', today]]);
  if (!rec) return fail(404, 'NOT_FOUND', 'No check-in found for today');
  if (rec.check_out_at) return fail(409, 'CONFLICT', 'Already checked out today');

  const now = new Date().toISOString();
  const workedHours = Math.round(((new Date(now) - new Date(rec.check_in_at)) / 3600000) * 100) / 100;
  const { settings } = await loadOrgContext();
  const status = workedHours < (settings.halfday_hours || 5) ? 'half_day' : rec.status;

  const updated = await store.update('attendance', rec.id, { check_out_at: now, worked_hours: workedHours, status });
  await audit(session.email, 'attendance.check_out', 'attendance', rec.id, { worked_hours: workedHours, status });
  return json(updated);
});
