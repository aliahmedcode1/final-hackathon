import { store } from './store';
import { todayStr, makeHolidaySet, isWorkingDate, weekdayOf } from './dates';

// Shared helpers for attendance/leave/payroll server logic.

export async function loadOrgContext() {
  const settings = await store.findOne('company_settings', []);
  const { rows: holidays } = await store.list('public_holidays', {});
  return { settings, holidaySet: makeHolidaySet(holidays) };
}

// Derive check-in status from settings (start time + grace).
export function statusForCheckIn(checkInAt, settings) {
  const [sh, sm] = (settings.start_time || '09:00').split(':').map(Number);
  const d = new Date(checkInAt);
  const minutesIn = d.getHours() * 60 + d.getMinutes();
  const startPlusGrace = sh * 60 + sm + (settings.grace_minutes || 0);
  return minutesIn > startPlusGrace ? 'late' : 'present';
}

// List of expected working dates (cap at today when capToday).
export function expectedWorkingDates({ settings, holidaySet, from, to, capToday = true, joinDate, exitDate }) {
  const today = todayStr();
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 1000) {
    if ((!capToday || cur <= today) && isWorkingDate(cur, settings, holidaySet)) {
      if (!joinDate || cur >= String(joinDate).slice(0, 10)) {
        if (!exitDate || cur <= String(exitDate).slice(0, 10)) out.push(cur);
      }
    }
    cur = shiftDay(cur);
  }
  return out;
}

function shiftDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function weekdayName(dateStr) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayOf(dateStr)];
}
