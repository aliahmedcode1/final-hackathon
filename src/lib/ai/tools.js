import { store } from '@/lib/store';
import { monthStr, monthBounds, todayStr, addDays } from '@/lib/dates';
import { loadOrgContext, expectedWorkingDates } from '@/lib/attendance-core';
import { balancesFor } from '@/lib/leave-core';

// AI tool registry (PRD §6). Each tool enforces the same RBAC as REST routes.
// Handlers receive ({ session, args }) and return plain JSON.

const monthRange = (period) => monthBounds(period || monthStr());

export const TOOLS = {
  get_headcount: {
    description: 'Employee headcount, optionally filtered by department and status.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'exited'] },
        department: { type: 'string' },
      },
    },
    roles: ['admin', 'hr', 'employee'],
    async run({ args = {} }) {
      const { rows } = await store.list('employees', {});
      let list = rows;
      if (args.status) list = list.filter((e) => e.status === args.status);
      if (args.department) {
        const { rows: deps } = await store.list('departments', {});
        const dep = deps.find((d) => d.name.toLowerCase().includes(args.department.toLowerCase()));
        list = dep ? list.filter((e) => e.department_id === dep.id) : [];
      }
      return { headcount: list.length, active: list.filter((e) => e.status === 'active').length, exited: list.filter((e) => e.status === 'exited').length };
    },
  },

  get_attendance_summary: {
    description: 'Attendance counts for a date or month. Admin/HR see company-wide; employees only their own.',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string' }, month: { type: 'string' } },
    },
    roles: ['admin', 'hr', 'employee'],
    async run({ session, args = {} }) {
      const scopeOwn = session.role === 'employee';
      if (args.date) {
        const where = [['date', 'eq', args.date]];
        if (scopeOwn) where.push(['employee_id', 'eq', session.employee_id]);
        const { rows } = await store.list('attendance', { where });
        return {
          date: args.date,
          present: rows.filter((r) => r.status === 'present').length,
          late: rows.filter((r) => r.status === 'late').length,
          half_day: rows.filter((r) => r.status === 'half_day').length,
          missing_checkout: rows.filter((r) => !r.check_out_at).length,
        };
      }
      const { from, to } = monthRange(args.month);
      const { settings, holidaySet } = await loadOrgContext();
      const where = [];
      if (scopeOwn) where.push(['employee_id', 'eq', session.employee_id]);
      const { rows: att } = await store.list('attendance', {});
      const inMonth = att.filter((r) => r.date >= from && r.date <= to && (!scopeOwn || r.employee_id === session.employee_id));
      const { rows: emps } = await store.list('employees', {});
      const relevant = scopeOwn ? emps.filter((e) => e.id === session.employee_id) : emps.filter((e) => e.status === 'active');
      let expected = 0;
      for (const e of relevant) {
        expected += expectedWorkingDates({ settings, holidaySet, from, to, joinDate: e.join_date, exitDate: e.exit_date }).length;
      }
      const attDates = new Set(inMonth.map((r) => `${r.employee_id}|${r.date}`));
      let onLeave = 0;
      const { rows: leaves } = await store.list('leave_requests', { where: [['status', 'eq', 'approved']] });
      for (const l of leaves.filter((l) => (!scopeOwn || l.employee_id === session.employee_id) && l.type !== 'unpaid' && l.from_date <= to && l.to_date >= from)) {
        let d = l.from_date < from ? from : l.from_date;
        const end = l.to_date > to ? to : l.to_date;
        while (d <= end) { if (d >= from && d <= to) onLeave++; d = addDays(d, 1); }
      }
      const absent = expected - attDates.size - onLeave;
      return {
        month: args.month || monthStr(),
        records: inMonth.length,
        present: inMonth.filter((r) => r.status === 'present').length,
        late: inMonth.filter((r) => r.status === 'late').length,
        half_day: inMonth.filter((r) => r.status === 'half_day').length,
        missing_checkout: inMonth.filter((r) => !r.check_out_at).length,
        expected_records: expected,
        on_leave_days: onLeave,
        absent_days: Math.max(0, absent),
        scoped_to: scopeOwn ? 'your own record' : 'whole company',
      };
    },
  },

  get_late_comers: {
    description: 'Employees who checked in late on a given date (default today). Admin/HR only.',
    parameters: { type: 'object', properties: { date: { type: 'string' } } },
    roles: ['admin', 'hr'],
    async run({ args = {} }) {
      const date = args.date || todayStr();
      const { rows } = await store.list('attendance', { where: [['date', 'eq', date], ['status', 'eq', 'late']] });
      const { rows: emps } = await store.list('employees', {});
      const map = Object.fromEntries(emps.map((e) => [e.id, `${e.first_name} ${e.last_name} (${e.code})`]));
      return { date, late_comers: rows.map((r) => ({ name: map[r.employee_id] || 'Unknown', check_in: r.check_in_at })) };
    },
  },

  get_leave_summary: {
    description: 'Leave request statistics for a month or overall. Admin/HR only.',
    parameters: {
      type: 'object',
      properties: { month: { type: 'string' }, status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] } },
    },
    roles: ['admin', 'hr'],
    async run({ args = {} }) {
      const { rows } = await store.list('leave_requests', {});
      let list = rows;
      if (args.month) list = list.filter((l) => l.from_date.slice(0, 7) <= args.month && l.to_date.slice(0, 7) >= args.month);
      if (args.status) list = list.filter((l) => l.status === args.status);
      const byStatus = {};
      const byType = {};
      for (const l of list) {
        byStatus[l.status] = (byStatus[l.status] || 0) + 1;
        byType[l.type] = (byType[l.type] || 0) + l.days;
      }
      return { total_requests: list.length, by_status: byStatus, days_by_type: byType };
    },
  },

  get_my_leave_balance: {
    description: 'Leave balances (annual/sick/casual/unpaid) for the calling user.',
    parameters: { type: 'object', properties: {} },
    roles: ['admin', 'hr', 'employee'],
    async run({ session }) {
      if (!session.employee_id) return { error: 'This account has no employee record' };
      const settings = await store.findOne('company_settings', []);
      const { rows } = await store.list('leave_requests', { where: [['employee_id', 'eq', session.employee_id]] });
      return { balances: balancesFor(rows, settings?.quotas, String(new Date().getFullYear())), year: new Date().getFullYear() };
    },
  },

  get_payroll_summary: {
    description: 'Payroll run totals for a period (YYYY-MM). Admin/HR only — salary data.',
    parameters: { type: 'object', properties: { period: { type: 'string' } } },
    roles: ['admin', 'hr'],
    async run({ args = {} }) {
      const { rows } = await store.list('payroll_runs', {});
      const list = args.period ? rows.filter((r) => r.period === args.period) : rows;
      return {
        runs: list.map((r) => ({ period: r.period, status: r.status, ...r.totals })),
        note: list.length ? undefined : 'No payroll runs yet.',
      };
    },
  },

  search_employees: {
    description: 'Search the employee directory by name, email or code. Salary fields are hidden from employees.',
    parameters: {
      type: 'object',
      properties: { q: { type: 'string' }, department: { type: 'string' } },
    },
    roles: ['admin', 'hr', 'employee'],
    async run({ session, args = {} }) {
      const { rows } = await store.list('employees', { order: { col: 'code' } });
      let list = rows;
      if (args.q) {
        const n = args.q.toLowerCase();
        list = list.filter((e) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(n) ||
          (e.email || '').toLowerCase().includes(n) ||
          (e.code || '').toLowerCase().includes(n));
      }
      if (args.department) {
        const { rows: deps } = await store.list('departments', {});
        const dep = deps.find((d) => d.name.toLowerCase().includes(args.department.toLowerCase()));
        list = dep ? list.filter((e) => e.department_id === dep.id) : [];
      }
      const { rows: deps } = await store.list('departments', {});
      const depMap = Object.fromEntries(deps.map((d) => [d.id, d.name]));
      const scopeOwn = session.role === 'employee';
      return {
        count: list.length,
        employees: list.slice(0, 20).map((e) => ({
          code: e.code,
          name: `${e.first_name} ${e.last_name}`,
          email: scopeOwn ? undefined : e.email,
          department: depMap[e.department_id] || null,
          designation: e.designation_id || null,
          status: e.status,
          ...(scopeOwn ? {} : { basic_salary: e.basic_salary }),
        })),
      };
    },
  },
};

// RBAC gate — mirrors REST permissions (FR-08.2).
export function toolAllowed(name, session) {
  const tool = TOOLS[name];
  if (!tool) return false;
  return tool.roles.includes(session.role);
}
