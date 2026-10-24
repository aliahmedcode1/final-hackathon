import { store } from './store';
import { listDates, makeHolidaySet, isWorkingDate } from './dates';

// Leave business rules (M5): working-day counting, overlap + quota validation.

export async function leaveContext(employeeId) {
  const settings = await store.findOne('company_settings', []);
  const { rows: holidays } = await store.list('public_holidays', {});
  const holidaySet = makeHolidaySet(holidays);
  const { rows: requests } = await store.list('leave_requests', [['employee_id', 'eq', employeeId]]);
  return { settings, holidaySet, requests };
}

export function countLeaveDays(fromDate, toDate, settings, holidaySet) {
  return listDates(fromDate, toDate).filter((d) => isWorkingDate(d, settings, holidaySet)).length;
}

// Days must be > 0; from/to valid order.
export function validateRange(fromDate, toDate) {
  if (fromDate > toDate) return 'From date must be on or before to date';
  return null;
}

// Overlap against non-cancelled/rejected requests of the same employee.
export function findOverlap(requests, fromDate, toDate, ignoreId = null) {
  return requests.find(
    (r) =>
      r.id !== ignoreId &&
      !['cancelled', 'rejected'].includes(r.status) &&
      r.from_date <= toDate &&
      r.to_date >= fromDate
  );
}

// Quota check for paid types; unpaid is unlimited. `year` is the leave year.
export function checkQuota({ type, days, year, requests, quotas }) {
  if (type === 'unpaid') return null;
  const quota = quotas?.[type];
  if (quota === undefined || quota === null) return `Unknown leave type "${type}"`;
  const used = requests
    .filter((r) => r.id !== null && r.type === type && r.status === 'approved' && String(r.from_date).slice(0, 4) === String(year))
    .reduce((sum, r) => sum + (r.days || 0), 0);
  if (used + days > quota) {
    return `Quota exceeded: ${used} of ${quota} ${type} days already used, requested ${days}`;
  }
  return null;
}

export function balancesFor(requests, quotas, year) {
  const out = {};
  for (const type of ['annual', 'sick', 'casual']) {
    const used = requests
      .filter((r) => r.type === type && r.status === 'approved' && String(r.from_date).slice(0, 4) === String(year))
      .reduce((s, r) => s + (r.days || 0), 0);
    const pending = requests
      .filter((r) => r.type === type && r.status === 'pending' && String(r.from_date).slice(0, 4) === String(year))
      .reduce((s, r) => s + (r.days || 0), 0);
    out[type] = { quota: quotas?.[type] ?? 0, used, pending, remaining: (quotas?.[type] ?? 0) - used - pending };
  }
  const unpaidUsed = requests
    .filter((r) => r.type === 'unpaid' && r.status === 'approved' && String(r.from_date).slice(0, 4) === String(year))
    .reduce((s, r) => s + (r.days || 0), 0);
  out.unpaid = { quota: null, used: unpaidUsed, pending: 0, remaining: null };
  return out;
}
