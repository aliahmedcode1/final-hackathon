import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { todayStr, monthBounds, addDays, workingDaysBetween, makeHolidaySet } from '@/lib/dates';
import { loadOrgContext, statusForCheckIn, expectedWorkingDates } from '@/lib/attendance-core';
import { haversineMeters } from '@/lib/geo';

// GET attendance:
//  ?date=YYYY-MM-DD → daily board (A/H: everyone; E: own)
//  ?month=YYYY-MM   → month calendar for one employee (?employee_id or own)
export const GET = withAuth(null, async (req, ctx, session) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const month = url.searchParams.get('month');
  const employeeId = url.searchParams.get('employee_id') || session.employee_id;

  if (session.role === 'employee' && employeeId !== session.employee_id) {
    return fail(403, 'FORBIDDEN', 'Employees can only view their own attendance');
  }

  const { settings, holidaySet } = await loadOrgContext();

  if (month) {
    const { from, to } = monthBounds(month);
    const emp = await store.get('employees', employeeId);
    if (!emp) return fail(404, 'NOT_FOUND', 'Employee not found');
    const { rows } = await store.list('attendance', {
      where: [['employee_id', 'eq', employeeId]],
      order: { col: 'date' },
    });
    const inMonth = rows.filter((r) => r.date >= from && r.date <= to);
    const expected = expectedWorkingDates({
      settings, holidaySet, from, to,
      joinDate: emp.join_date, exitDate: emp.exit_date,
    });
    const byDate = Object.fromEntries(inMonth.map((r) => [r.date, r]));
    const onLeave = new Set(
      (await store.list('leave_requests', { where: [['employee_id', 'eq', employeeId], ['status', 'eq', 'approved']] })).rows
        .filter((l) => l.from_date <= to && l.to_date >= from)
        .flatMap((l) => { const days = []; let d = l.from_date; while (d <= l.to_date) { days.push(d); d = addDays(d, 1); } return days; })
    );
    const days = expected.map((d) => {
      const rec = byDate[d];
      let status = 'absent';
      if (rec) status = rec.check_out_at ? rec.status : 'missing_checkout';
      else if (onLeave.has(d)) status = 'on_leave';
      else if (d > todayStr()) status = 'future';
      return { date: d, status, check_in_at: rec?.check_in_at, check_out_at: rec?.check_out_at };
    });
    // Include records on non-working days (e.g. weekend check-ins) so the
    // check-in card reflects them.
    const inDays = new Set(expected);
    for (const rec of inMonth) {
      if (!inDays.has(rec.date)) {
        days.push({
          date: rec.date,
          status: rec.check_out_at ? rec.status : 'missing_checkout',
          check_in_at: rec.check_in_at,
          check_out_at: rec.check_out_at,
        });
      }
    }
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    return json({ month, days, today: todayStr() });
  }

  // daily board
  const boardDate = date || todayStr();
  const { rows: employees } = await store.list('employees', session.role === 'employee' ? { where: [['id', 'eq', session.employee_id]] } : { order: { col: 'code' } });
  const { rows: att } = await store.list('attendance', { where: [['date', 'eq', boardDate]] });
  const attMap = Object.fromEntries(att.map((a) => [a.employee_id, a]));
  const isWorking = workingDaysBetween(boardDate, boardDate, settings, holidaySet) === 1;

  const board = employees.map((e) => {
    const rec = attMap[e.id];
    let status = 'absent';
    if (rec) status = rec.check_out_at ? rec.status : 'missing_checkout';
    return {
      employee_id: e.id,
      code: e.code,
      name: `${e.first_name} ${e.last_name}`,
      department_id: e.department_id,
      status,
      check_in_at: rec?.check_in_at || null,
      check_out_at: rec?.check_out_at || null,
      method: rec?.method || null,
    };
  });
  return json({ date: boardDate, is_working_day: isWorking, board });
});

const checkInSchema = z.object({
  method: z.enum(['web', 'camera']).default('web'),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  accuracy: z.coerce.number().optional(),
  face_count: z.coerce.number().int().optional(),
});

// POST: check-in. One record per employee/day → 409 on duplicate (FR-04.1).
// Camera flow: server re-verifies face count + GPS accuracy + geofence (FR-04.5).
export const POST = withAuth(null, async (req, ctx, session) => {
  if (!session.employee_id) return fail(422, 'UNPROCESSABLE', 'This account has no employee record');
  const parsed = checkInSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload');
  const { method, latitude, longitude, accuracy, face_count } = parsed.data;

  const { settings: s, holidaySet } = await loadOrgContext();

  const now = new Date().toISOString();
  const today = todayStr();

  if (await store.findOne('attendance', [['employee_id', 'eq', session.employee_id], ['date', 'eq', today]])) {
    return fail(409, 'CONFLICT', 'Already checked in today');
  }

  let distance = null;
  if (method === 'camera') {
    if (face_count === undefined || face_count !== 1) {
      return fail(422, 'UNPROCESSABLE', 'Face check failed — exactly one face must be detected in frame');
    }
    if (accuracy === undefined || accuracy > 100) {
      return fail(422, 'UNPROCESSABLE', 'GPS accuracy worse than 100 m — move to an open area');
    }
    distance = haversineMeters(latitude, longitude, s.latitude, s.longitude);
    if (distance > s.radius_m) {
      return fail(422, 'UNPROCESSABLE', `You are ${distance} m from the office — outside the ${s.radius_m} m geofence`);
    }
  }

  const status = statusForCheckIn(now, s);
  const rec = await store.insert('attendance', {
    employee_id: session.employee_id,
    date: today,
    check_in_at: now,
    status,
    method,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    distance_m: distance,
  });
  await audit(session.email, `attendance.check_in.${method}`, 'attendance', rec.id, { date: today, status, distance });
  return json(rec, 201);
});

export const dynamic = 'force-dynamic';
